import { ADS_PROVIDERS, DEFAULT_SOURCE_CONFIG, validateAdsConnection } from "./adsConnectorContract.js";

const HOURS = 3_600_000;
const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

const reportStatus = (row, tolerance) => {
  if (row.reconciliation?.status === "passed") return true;
  const windows = row.reconciliation?.windows;
  if (!windows) return false;
  return ["7d", "30d"].every((window) => {
    const report = windows[window];
    const local = Number(report?.localSpend), remote = Number(report?.remoteSpend);
    if (!Number.isFinite(local) || !Number.isFinite(remote)) return false;
    if (remote === 0) return local === 0;
    return Math.abs(local - remote) / Math.abs(remote) * 100 <= tolerance;
  });
};

export function sourceHealth(source, config = {}, rules = {}, now = new Date()) {
  const sourceDefaults = { ...DEFAULT_SOURCE_CONFIG, ...(config.sources?.[source.id] ?? {}) };
  const mappings = Object.values(config.mappings?.[source.id] ?? {}).filter((row) => row?.enabled).map((row) => ({ ...sourceDefaults, ...row }));
  const configured = mappings.filter((row) => validateAdsConnection(source.id, row).ok);
  const connected = configured.filter((row) => row.connectionId && row.oauthStatus === "connected");
  const errors = connected.filter((row) => row.lastErrorCode);
  const syncing = connected.filter((row) => ["backfill", "syncing"].includes(row.syncStatus));
  const gaps = connected.filter((row) => Number(row.missingDays) > 0 || row.coverageStatus === "incomplete");
  const latest = connected.map((row) => validDate(row.lastSuccessAt)).filter(Boolean).sort((a, b) => b - a)[0] ?? null;
  const ageHours = latest ? Math.max(0, (new Date(now).getTime() - latest.getTime()) / HOURS) : null;
  const missingAfter = Number(rules.missingDataHours ?? 12);
  const staleAfter = Number(rules.staleHours ?? 6);
  let state = "mock", label = "ข้อมูลจำลอง", detail = "ยังไม่ได้เชื่อมบัญชีจริง";
  if (configured.length && !connected.length) { state = "waiting"; label = "รอเชื่อมบัญชี"; detail = `${configured.length} mapping พร้อม · ยังไม่มี OAuth`; }
  if (connected.length) { state = "missing"; label = "ยังไม่มีข้อมูล"; detail = "เชื่อมแล้ว แต่ยังไม่เคย sync สำเร็จ"; }
  if (syncing.length) { state = "syncing"; label = "กำลังดึงข้อมูล"; detail = syncing.some((row) => row.syncStatus === "backfill") ? "กำลังดึงข้อมูลย้อนหลัง" : "กำลังอัปเดตข้อมูลล่าสุด"; }
  if (latest) { state = ageHours > missingAfter ? "missing" : ageHours > staleAfter ? "stale" : "healthy"; label = state === "healthy" ? "ข้อมูลปกติ" : state === "stale" ? "ข้อมูลล่าช้า" : "ข้อมูลขาด"; detail = `อัปเดตล่าสุด ${Math.round(ageHours * 10) / 10} ชม.ก่อน`; }
  if (gaps.length) { state = "missing"; label = "ข้อมูลไม่ครบ"; detail = `${gaps.length} บัญชีมีช่วงวันที่ขาด`; }
  if (errors.length) { state = "error"; label = "ดึงข้อมูลไม่สำเร็จ"; detail = `${errors.length} บัญชีมีข้อผิดพลาด`; }
  const tolerance = Number(rules.reconciliationTolerance ?? 1);
  const reconciled = connected.length > 0 && connected.every((row) => reportStatus(row, tolerance));
  return { provider: source.id, name: source.name, state, label, detail, configured: configured.length, connected: connected.length, latestAt: latest?.toISOString() ?? null, reconciled, goLive: state === "healthy" && reconciled };
}

export function adsDataHealth(config = {}, now = new Date()) {
  const rules = config.rules ?? {};
  const sources = ADS_PROVIDERS.map((source) => sourceHealth(source, config, rules, now));
  const active = sources.filter((source) => source.configured || source.connected);
  const severity = { error: 6, missing: 5, stale: 4, syncing: 3, waiting: 2, mock: 1, healthy: 0 };
  const primary = active.reduce((current, source) => severity[source.state] > severity[current.state] ? source : current, active[0] ?? sources[0]);
  const freshButUnverified = active.length > 0 && active.every((source) => source.state === "healthy") && active.some((source) => !source.reconciled);
  return {
    state: freshButUnverified ? "unverified" : active.length ? primary.state : "mock",
    label: freshButUnverified ? "รอตรวจยอด" : active.length ? primary.label : "ข้อมูลจำลอง",
    detail: freshButUnverified ? "ข้อมูลล่าสุดปกติ · ยังไม่ผ่านการตรวจยอด 7 และ 30 วัน" : active.length ? primary.detail : "ยังไม่มีบัญชีโฆษณาที่เชื่อม API",
    sources,
    goLive: active.length > 0 && active.every((source) => source.goLive),
  };
}

export function reconciliationRows(config = {}, brands = []) {
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  const tolerance = Number(config.rules?.reconciliationTolerance ?? 1);
  return ADS_PROVIDERS.flatMap((source) => Object.entries(config.mappings?.[source.id] ?? {})
    .filter(([, row]) => row?.enabled)
    .map(([brandId, row]) => {
      const normalized = { ...DEFAULT_SOURCE_CONFIG, ...(config.sources?.[source.id] ?? {}), ...row };
      const checks = ["7d", "30d"].map((window) => {
        const report = row.reconciliation?.windows?.[window] ?? null;
        if (!report) return { window, status: "pending", local: null, remote: null, diffPct: null };
        const local = Number(report.localSpend), remote = Number(report.remoteSpend);
        const diffPct = Number.isFinite(local) && Number.isFinite(remote) ? (remote === 0 ? (local === 0 ? 0 : null) : Math.abs(local - remote) / Math.abs(remote) * 100) : null;
        return { window, local, remote, diffPct, status: diffPct != null && diffPct <= tolerance ? "passed" : "failed" };
      });
      const mappingValid = validateAdsConnection(source.id, normalized).ok;
      const connected = Boolean(mappingValid && row.connectionId && row.oauthStatus === "connected");
      return { key: `${source.id}:${brandId}`, provider: source.name, brand: brandNames.get(brandId) ?? brandId, accountId: row.accountId || "—", mappingValid, connected, checks, ready: connected && checks.every((check) => check.status === "passed") };
    }));
}

export function syncAccountRows(config = {}, brands = [], now = new Date()) {
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  return ADS_PROVIDERS.flatMap((source) => Object.entries(config.mappings?.[source.id] ?? {})
    .filter(([, row]) => row?.enabled)
    .map(([brandId, row]) => {
      const normalized = { ...DEFAULT_SOURCE_CONFIG, ...(config.sources?.[source.id] ?? {}), ...row };
      const valid = validateAdsConnection(source.id, normalized);
      const connected = Boolean(valid.ok && row.connectionId && row.oauthStatus === "connected");
      const lastSuccess = validDate(row.lastSuccessAt);
      const ageHours = lastSuccess ? Math.max(0, (new Date(now).getTime() - lastSuccess.getTime()) / HOURS) : null;
      let state = "waiting", label = valid.ok ? "รอเชื่อม OAuth" : "Mapping ไม่ครบ";
      if (connected) { state = "missing"; label = "รอ Sync ครั้งแรก"; }
      if (connected && row.syncStatus === "backfill") { state = "syncing"; label = "กำลังดึงย้อนหลัง"; }
      else if (connected && row.syncStatus === "syncing") { state = "syncing"; label = "กำลัง Sync"; }
      else if (connected && lastSuccess) { state = ageHours > Number(config.rules?.missingDataHours ?? 12) ? "missing" : ageHours > Number(config.rules?.staleHours ?? 6) ? "stale" : "healthy"; label = state === "healthy" ? "ข้อมูลล่าสุดปกติ" : state === "stale" ? "ข้อมูลล่าช้า" : "ข้อมูลขาด"; }
      if (connected && (Number(row.missingDays) > 0 || row.coverageStatus === "incomplete")) { state = "missing"; label = "ช่วงวันที่ไม่ครบ"; }
      if (connected && row.lastErrorCode) { state = "error"; label = "Sync ไม่สำเร็จ"; }
      return {
        key: `${source.id}:${brandId}`, providerId: source.id, provider: source.name, color: source.color,
        brandId, brand: brandNames.get(brandId) ?? brandId, accountId: row.accountId || "—",
        connectionId: row.connectionId ?? null, valid: valid.ok, errors: valid.errors, connected,
        state, label, lastSuccessAt: lastSuccess?.toISOString() ?? null, ageHours,
        missingDays: Math.max(0, Number(row.missingDays) || 0), errorCode: row.lastErrorCode ?? null,
        creativeEnabled: source.id === "meta" && Boolean(row.creativeSyncEnabled ?? true),
        reconciliation: reconciliationRows(config, brands).find((item) => item.key === `${source.id}:${brandId}`),
      };
    }));
}

export function normalizeSyncRuns(runs = []) {
  return [...runs].filter(Boolean).map((run) => ({
    id: run.id ?? `${run.connection_id ?? "unknown"}:${run.started_at ?? "unknown"}`,
    connectionId: run.connection_id ?? run.connectionId ?? null,
    status: run.status ?? "unknown",
    mode: run.mode ?? "incremental",
    startedAt: run.started_at ?? run.startedAt ?? null,
    finishedAt: run.finished_at ?? run.finishedAt ?? null,
    rowsRead: Number(run.rows_read ?? run.rowsRead) || 0,
    rowsWritten: Number(run.rows_written ?? run.rowsWritten) || 0,
    errorCode: run.error_code ?? run.errorCode ?? null,
    // ไม่มีคนสั่ง = ตัวดึงอัตโนมัติ (ads-cron ไม่ผูก user กับ run)
    auto: (run.triggered_by ?? run.triggeredBy ?? null) === null,
  })).sort((a, b) => new Date(b.startedAt ?? 0) - new Date(a.startedAt ?? 0));
}

/* ── ประวัติตัวดึงอัตโนมัติ (ad_cron_ticks) ── */
const CRON_STALE_MS = 2 * 3_600_000;
const STUCK_TICK_MS = 10 * 60_000;   // Edge Function ถูกตัดก่อน 10 นาทีเสมอ — ค้างเกินนี้คือ crash   // cron ตั้งไว้ทุกชั่วโมง เงียบเกิน 2 ชั่วโมง = มีอะไรผิด

export function normalizeCronTicks(ticks = []) {
  return [...(ticks ?? [])].filter(Boolean).map((tick) => {
    const startedAt = tick.started_at ?? tick.startedAt ?? null;
    const finishedAt = tick.finished_at ?? tick.finishedAt ?? null;
    const span = Date.parse(finishedAt ?? "") - Date.parse(startedAt ?? "");
    return {
      id: tick.id ?? `${startedAt ?? "unknown"}`,
      startedAt, finishedAt,
      durationMs: Number.isFinite(span) ? span : null,
      source: tick.source ?? "pg_cron",
      auto: (tick.source ?? "pg_cron") === "pg_cron",
      status: tick.status ?? "unknown",
      planned: Number(tick.planned) || 0,
      synced: Number(tick.synced) || 0,
      reconciled: Number(tick.reconciled) || 0,
      failed: Number(tick.failed) || 0,
      rowsWritten: Number(tick.rows_written ?? tick.rowsWritten) || 0,
      syncEveryHours: Number(tick.sync_every_hours ?? tick.syncEveryHours) || null,
      errorCode: tick.error_code ?? tick.errorCode ?? null,
    };
  }).sort((a, b) => new Date(b.startedAt ?? 0) - new Date(a.startedAt ?? 0));
}

/** ตัวดึงอัตโนมัติยังวิ่งอยู่ไหม — ดูจากรอบล่าสุด ไม่ใช่จากค่าที่ตั้งไว้ */
export function cronHealth(ticks = [], now = Date.now()) {
  const latest = [...(ticks ?? [])].filter(Boolean).sort((a, b) => new Date(b.startedAt ?? 0) - new Date(a.startedAt ?? 0))[0];
  if (!latest) return { state: "idle", label: "ยังไม่เริ่มทำงาน", at: null };
  const at = latest.startedAt ?? null;
  const age = now - Date.parse(at ?? "");
  if (latest.status === "failed") return { state: "error", label: "รอบล่าสุดไม่สำเร็จ", at };
  // ค้างสถานะ "กำลังทำงาน" นานเกินกว่าที่ Edge Function จะรันได้ = ตายกลางทาง ไม่ใช่กำลังทำงานอยู่จริง
  if (latest.status === "running" && Number.isFinite(age) && age > STUCK_TICK_MS) return { state: "error", label: "รอบล่าสุดค้างกลางทาง", at };
  if (!Number.isFinite(age) || age > CRON_STALE_MS) return { state: "stale", label: "เงียบเกินกำหนด", at };
  return { state: "healthy", label: "ทำงานปกติ", at };
}
