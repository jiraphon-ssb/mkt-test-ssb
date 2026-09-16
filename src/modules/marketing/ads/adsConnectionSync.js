/* หน้าตั้งค่า ↔ Edge Function ads-connections: เลือก mapping ที่ต้องส่ง และใส่ผลกลับเข้า settings.ads_control */
import { OAUTH_SCOPES } from "./metaCreativeContract.js";

export function enabledMetaMappings(config = {}) {
  return Object.fromEntries(Object.entries(config.mappings?.meta ?? {})
    .filter(([, row]) => row?.enabled && String(row.accountId ?? "").trim()));
}

export function applyConnectionResult(config = {}, result = {}) {
  const meta = { ...(config.mappings?.meta ?? {}) };
  const disabled = new Set(result.disabled ?? []);
  for (const [brandId, row] of Object.entries(meta)) {
    if (row?.connectionId && disabled.has(row.connectionId)) {
      const { connectionId: _drop, ...rest } = row;
      meta[brandId] = { ...rest, oauthStatus: undefined };
    }
  }
  for (const connection of result.connections ?? []) {
    const row = meta[connection.brand_id];
    if (!row || String(row.accountId ?? "").trim() !== connection.external_account_id) continue;
    meta[connection.brand_id] = {
      ...row, connectionId: connection.id, oauthStatus: connection.status === "expired" ? "expired" : "connected",   // error = sync พังแต่ OAuth ยังใช้ได้ (ดู lastErrorCode)
      lastSuccessAt: connection.last_success_at ?? null, lastErrorCode: connection.last_error_code ?? null, connectionError: null,
    };
  }
  for (const error of result.errors ?? []) {
    if (meta[error.brandId]) meta[error.brandId] = { ...meta[error.brandId], connectionError: error.code };
  }
  return { ...config, mappings: { ...(config.mappings ?? {}), meta } };
}

/** ดึงข้อมูลทีละบัญชี (Edge Function รันครั้งละบัญชี · กันชน rate limit ของ Meta) — บัญชีที่พังไม่หยุดคิว */
export async function runSyncQueue(connectionIds, sync, onProgress = () => {}) {
  const results = [];
  for (const connectionId of connectionIds) {
    try {
      const data = await sync(connectionId);
      results.push({ connectionId, ok: true, rowsWritten: Number(data?.rowsWritten) || 0, mode: data?.mode ?? null, code: null });
    } catch (error) {
      results.push({ connectionId, ok: false, rowsWritten: 0, mode: null, code: error?.code ?? error?.message ?? "SYNC_FAILED" });
    }
    onProgress(results.length, connectionIds.length);
  }
  return results;
}

/** run โหมด reconcile ล่าสุดของแต่ละ connection → Map(connectionId → summary) */
export function latestReconcileByConnection(runs = []) {
  const latest = new Map();
  for (const run of runs) {
    if (run?.mode !== "reconcile" || run.summary?.kind !== "reconcile") continue;
    const id = run.connection_id ?? run.connectionId;
    const current = latest.get(id);
    if (!current || String(run.started_at ?? "") > String(current._startedAt ?? "")) {
      latest.set(id, { ...run.summary, _startedAt: run.started_at ?? null });
    }
  }
  return latest;
}

/** ใส่ผลตรวจยอดเข้า mapping (โครงเดียวกับที่ reconciliationRows/adsDataHealth อ่าน: reconciliation.windows[w].localSpend/remoteSpend) */
export function applyReconciliation(config = {}, latest = new Map()) {
  if (!latest.size) return config;
  const meta = { ...(config.mappings?.meta ?? {}) };
  for (const [brandId, row] of Object.entries(meta)) {
    const summary = row?.connectionId ? latest.get(row.connectionId) : null;
    if (!summary) continue;
    meta[brandId] = { ...row, reconciliation: {
      status: summary.passed ? "passed" : "failed",
      checkedAt: summary.checkedAt ?? summary._startedAt ?? null,
      tolerance: summary.tolerance ?? null,
      windows: summary.windows ?? {},
    } };
  }
  return { ...config, mappings: { ...(config.mappings ?? {}), meta } };
}

const STOP_ACCOUNT_CODES = new Set(["META_TOKEN_INVALID", "META_PERMISSION", "AUTHORIZATION_NOT_READY", "CONNECTION_NOT_READY", "CONNECTION_NOT_FOUND"]);

/** คิวดึงยอดแบบแบ่งก้อน (planSyncJobs) · ทีละก้อนตามลำดับ · บัญชีที่ token/สิทธิ์เสียข้ามก้อนที่เหลือ */
export async function runSyncJobs(jobs = [], sync, onProgress = () => {}) {
  const byConnection = {};
  const stopped = new Set();
  let done = 0, failed = 0;
  for (const job of jobs) {
    const summary = byConnection[job.connectionId] ??= { jobs: 0, ok: 0, failed: 0, rowsWritten: 0, firstError: null };
    summary.jobs += 1;
    if (stopped.has(job.connectionId)) {
      summary.failed += 1; failed += 1;
    } else {
      try {
        const data = await sync(job.connectionId, job.mode, { from: job.from, to: job.to });
        summary.ok += 1;
        summary.rowsWritten += Number(data?.rowsWritten) || 0;
      } catch (error) {
        const code = error?.code ?? error?.message ?? "SYNC_FAILED";
        summary.failed += 1; failed += 1;
        summary.firstError ??= code;
        if (STOP_ACCOUNT_CODES.has(code)) stopped.add(job.connectionId);
      }
    }
    done += 1;
    onProgress(done, jobs.length);
  }
  return { byConnection, failed, total: jobs.length };
}

/** จำนวนวันที่ขาด (missingDaysOf) → mapping.missingDays ให้ syncAccountRows/adsDataHealth ใช้ */
export function applyCoverage(config = {}, missingByConnection = new Map()) {
  if (!missingByConnection.size) return config;
  const meta = { ...(config.mappings?.meta ?? {}) };
  for (const [brandId, row] of Object.entries(meta)) {
    if (row?.connectionId && missingByConnection.has(row.connectionId)) meta[brandId] = { ...row, missingDays: missingByConnection.get(row.connectionId) };
  }
  return { ...config, mappings: { ...(config.mappings ?? {}), meta } };
}

/** ดึง creative ของบัญชีหนึ่งจนครบ (Edge Function คืน nextCursor) · ไม่ throw — คืนผลที่ได้ + รหัส error
    postEnriched = ภาพจากโพสต์จริง · needsReconnect = สิทธิ์อ่านเพจยังไม่มี (ต้องเชื่อม Meta ใหม่) */
export async function syncCreativesFor(connectionId, call, maxRounds = 10) {
  let cursor = null, saved = 0, rounds = 0, postEnriched = 0, needsReconnect = false;
  while (rounds < maxRounds) {
    rounds += 1;
    try {
      const data = await call(connectionId, cursor);
      saved += Number(data?.saved) || 0;
      postEnriched += Number(data?.postMedia?.enriched) || 0;
      needsReconnect ||= data?.postMedia?.reason === "NEEDS_RECONNECT";
      if (data?.nextCursor == null) break;
      cursor = data.nextCursor;
    } catch (error) {
      return { saved, rounds, postEnriched, needsReconnect, error: error?.code ?? error?.message ?? "CREATIVE_SYNC_FAILED" };
    }
  }
  return { saved, rounds, postEnriched, needsReconnect, error: null };
}

/** มีการเชื่อม Meta ที่ยังไม่มีสิทธิ์อ่านเพจ → ภาพโฆษณาแบบบูสต์โพสต์ยังเป็นรูปโปรไฟล์เพจ ต้องเชื่อมใหม่ */
export function needsPostScopeReconnect(authorizations = []) {
  // เทียบกับสิทธิ์ที่ระบบขอจริงทั้งชุด — เพิ่ม scope ใหม่ทีหลังแล้ว token เก่าจะไม่มี ต้องเตือนให้เชื่อมใหม่เอง
  return authorizations.some((item) => item?.status === "connected" && OAUTH_SCOPES.some((scope) => !(item.scopes ?? []).includes(scope)));
}
