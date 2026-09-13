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
