import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Database, Download, RefreshCw, Scale, Settings2 } from "lucide-react";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { useApp } from "../useMkt.jsx";
import { adsDataHealth, normalizeSyncRuns, syncAccountRows } from "./adsDataHealth.js";
import { ADS_PROVIDERS } from "./adsConnectorContract.js";
import { applyConnectionResult, applyCoverage, applyReconciliation, latestReconcileByConnection, runSyncJobs, syncCreativesFor } from "./adsConnectionSync.js";
import { missingDaysOf, planSyncJobs } from "../../../../supabase/functions/_shared/adsBackfill.js";
import { todayInTimeZone } from "../../../../supabase/functions/_shared/metaInsights.js";
import { adsErrorText } from "./adsSyncMessages.js";
import { loadPilotFacts } from "./useAdsData.js";
import "./adsWorkspace.css";
import "./syncStatus.css";

const when = (value) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "ยังไม่เคยสำเร็จ";
const stateIcon = (state) => state === "healthy" ? CheckCircle2 : state === "error" || state === "missing" ? AlertTriangle : Clock3;

function SourceSummary({ source, rowCount }) {
  return <article className={`sy-source sy-${source.state}`}><header><i style={{ background: source.color }} /><span>{source.name}</span><b>{source.label}</b></header><strong>{source.connected}<small> / {source.configured} บัญชีเชื่อมแล้ว</small></strong><p>{source.detail}</p><footer><span>{rowCount} mapping เปิดใช้</span><span>{source.reconciled ? "ตรวจยอดผ่าน" : "ยังไม่ผ่านตรวจยอด"}</span></footer></article>;
}

function AccountRow({ row }) {
  const StateIcon = stateIcon(row.state);
  return <div className="sy-account-row"><div className="sy-account"><i style={{ background: row.color }} /><span><strong>{row.brand}</strong><small>{row.provider} · {row.accountId}</small></span></div><span className={`sy-state sy-${row.state}`}><StateIcon size={13} />{row.label}</span><div><strong>{when(row.lastSuccessAt)}</strong><small>{row.ageHours == null ? "—" : `${row.ageHours.toFixed(1)} ชม.ก่อน`}</small></div><div><strong>{row.missingDays ? `${row.missingDays} วัน` : row.connected ? "ไม่พบช่องว่าง" : "—"}</strong><small>วันที่ขาด</small></div><div><strong>{row.reconciliation?.ready ? "ผ่าน 7 และ 30 วัน" : "ยังไม่ผ่าน"}</strong><small>{row.errorCode ? `Error: ${row.errorCode}` : row.creativeEnabled ? "รวม Creative" : "สถิติเท่านั้น"}</small></div><Link to="/mkt/ads?panel=settings&tab=reconcile">ตรวจสอบ <ArrowRight size={13} /></Link></div>;
}

function RunTable({ runs, accounts }) {
  const names = new Map(accounts.map((row) => [row.connectionId, `${row.brand} · ${row.provider}`]));
  return <section className="sy-panel"><header><div><h2>ประวัติการ Sync</h2><p>หลักฐานการดึงข้อมูลล่าสุดจาก backend</p></div></header>{runs.length ? <div className="sy-run-table"><div className="sy-run-row head"><span>บัญชี</span><span>เริ่ม</span><span>โหมด</span><span>เขียนข้อมูล</span><span>ผล</span></div>{runs.slice(0, 20).map((run) => <div className="sy-run-row" key={run.id}><span>{names.get(run.connectionId) ?? run.connectionId ?? "ไม่ทราบบัญชี"}</span><span>{when(run.startedAt)}</span><span>{run.mode === "backfill" ? "ย้อนหลัง" : run.mode === "reconcile" ? "ตรวจยอด" : "ล่าสุด"}</span><span>{run.mode === "reconcile" ? "—" : `${run.rowsWritten.toLocaleString("th-TH")} แถว`}</span><span className={`sy-run-${run.status}`}>{run.errorCode ? `${run.status} · ${run.errorCode}` : run.status}</span></div>)}</div> : <div className="sy-empty"><Database size={25} /><strong>ยังไม่มีประวัติจาก backend</strong><span>ประวัติจะเริ่มแสดงหลังเชื่อม OAuth และ Sync ครั้งแรก</span></div>}</section>;
}

export function SyncStatusView() {
  const { data, toast } = useApp();
  const { user, demo } = useAuth();
  const canSync = !demo && user?.role === "team_lead";
  /* สถานะ connection จริงจากฐาน (last_success_at / last_error_code) ทับ mapping ใน settings — ไม่บันทึกกลับ ใช้แสดงผลเท่านั้น */
  const [dbConnections, setDbConnections] = useState(null);
  const [reconRuns, setReconRuns] = useState([]);
  const [coverageRuns, setCoverageRuns] = useState([]);
  const saved = data.settings?.ads_control;
  const config = useMemo(() => {
    const merged = dbConnections ? applyConnectionResult(saved ?? {}, { connections: dbConnections }) : (saved ?? {});
    // ช่องว่างวันที่จากประวัติ run จริง (ไม่นับ 3 วันล่าสุดที่ยอดยังขยับ)
    const missing = new Map((dbConnections ?? []).map((c) => [c.id, missingDaysOf(coverageRuns.filter((r) => r.connection_id === c.id), todayInTimeZone(new Date(), c.timezone), c.config?.backfillDays)]));
    return applyReconciliation(applyCoverage(merged, missing), latestReconcileByConnection(reconRuns));
  }, [saved, dbConnections, reconRuns, coverageRuns]);
  const [syncing, setSyncing] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const brands = useMemo(() => (data.brands ?? []).filter((brand) => brand.active !== false), [data.brands]);
  const accounts = useMemo(() => syncAccountRows(config, brands), [config, brands]);
  const health = useMemo(() => adsDataHealth(config), [config]);
  const [remoteRuns, setRemoteRuns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const connected = accounts.some((row) => row.connected);
  const refresh = async () => {
    setLoading(true);
    try {
      const [runsFromDb, connections, recons, coverage] = await Promise.all([
        apiClient.ads.recentSyncs(20), canSync ? apiClient.ads.connections() : Promise.resolve(null),
        apiClient.ads.reconciliations().catch(() => []), canSync ? apiClient.ads.syncCoverage().catch(() => []) : Promise.resolve([]),
      ]);
      setRemoteRuns(normalizeSyncRuns(runsFromDb));
      setReconRuns(recons ?? []);
      setCoverageRuns(coverage ?? []);
      if (connections) setDbConnections(connections.filter((c) => c.provider === "meta"));
    }
    catch { setRemoteRuns(normalizeSyncRuns(data.ad_sync_runs ?? config.syncRuns ?? [])); }
    finally { setCheckedAt(new Date().toISOString()); setLoading(false); }
  };
  const syncable = accounts.filter((row) => row.providerId === "meta" && row.connectionId && row.connected);
  const reconcileNow = async () => {
    if (reconciling) return;
    setReconciling(true);
    try {
      const { results } = await apiClient.ads.reconcile();
      const passed = results.filter((item) => item.ok && item.summary?.passed).length;
      const failed = results.filter((item) => !item.ok || !item.summary?.passed);
      toast?.(failed.length ? `ตรวจยอดแล้ว · ผ่าน ${passed}/${results.length} บัญชี${failed[0].code ? ` · ${adsErrorText(failed[0].code, "บางบัญชีตรวจไม่ได้")}` : " · ยอดบางบัญชีไม่ตรง ดูรายละเอียดด้านล่าง"}` : `ตรวจยอดผ่านทั้ง ${passed} บัญชี`, failed.length ? "bad" : "ok");
      await refresh();
    } catch (error) {
      toast?.(adsErrorText(error, "ตรวจยอดไม่สำเร็จ"), "bad");
    } finally {
      setReconciling(false);
    }
  };
  /* ดึงยอด: หาช่องว่างวันที่จากประวัติ run → แบ่งก้อน ≤10 วัน (กันเพดาน 546) → ดึง Creative ต่อ → โหลดยอดใหม่ */
  const syncNow = async () => {
    if (!syncable.length || syncing) return;
    setSyncing({ phase: "plan", done: 0, total: 0 });
    try {
      const ids = new Set(syncable.map((row) => row.connectionId));
      const [connections, coverage] = await Promise.all([apiClient.ads.connections(), apiClient.ads.syncCoverage()]);
      const targets = connections.filter((c) => ids.has(c.id));
      const jobs = planSyncJobs({ connections: targets, runs: coverage, todayOf: (tz) => todayInTimeZone(new Date(), tz) });
      const result = await runSyncJobs(jobs, (id, mode, range) => apiClient.ads.sync(id, mode, range), (done, total) => setSyncing({ phase: "facts", done, total }));
      const okAccounts = Object.entries(result.byConnection).filter(([, s]) => s.ok > 0).map(([id]) => id);
      let creatives = 0, creativeError = null, postEnriched = 0, needsReconnect = false;
      for (const [index, id] of okAccounts.entries()) {
        setSyncing({ phase: "creatives", done: index, total: okAccounts.length });
        const out = await syncCreativesFor(id, (connectionId, cursor) => apiClient.ads.syncCreatives(connectionId, cursor));
        creatives += out.saved;
        postEnriched += out.postEnriched;
        needsReconnect ||= out.needsReconnect;
        creativeError ??= out.error;
      }
      const rows = Object.values(result.byConnection).reduce((n, s) => n + s.rowsWritten, 0);
      const firstError = Object.values(result.byConnection).find((s) => s.firstError)?.firstError;
      toast?.(result.failed
        ? `ดึงสำเร็จ ${result.total - result.failed}/${result.total} ช่วง · ${adsErrorText(firstError, "บางช่วงดึงไม่สำเร็จ")} · กดดึงอีกครั้งจะเติมเฉพาะช่วงที่ขาด`
        : `ดึงข้อมูลแล้ว ${result.total} ช่วง · ${rows.toLocaleString("th-TH")} แถว · Creative ${creatives.toLocaleString("th-TH")} ชิ้น (ภาพจากโพสต์ ${postEnriched.toLocaleString("th-TH")})${creativeError ? ` · ${adsErrorText(creativeError, "ดึง Creative ไม่ครบ")}` : ""}${needsReconnect ? " · เชื่อม Meta ใหม่ในหน้าตั้งค่าเพื่อให้โฆษณาแบบบูสต์โพสต์แสดงภาพจริง" : ""}`,
      result.failed ? "bad" : "ok");
    } catch (error) {
      toast?.(adsErrorText(error, "ดึงข้อมูลไม่สำเร็จ"), "bad");
    } finally {
      setSyncing(null);
      await Promise.all([refresh(), loadPilotFacts({ force: true })]);
    }
  };
  useEffect(() => { if (connected || canSync) refresh(); else setRemoteRuns(normalizeSyncRuns(data.ad_sync_runs ?? config.syncRuns ?? [])); }, [connected, canSync]); // eslint-disable-line react-hooks/exhaustive-deps
  const runs = remoteRuns ?? normalizeSyncRuns(data.ad_sync_runs ?? config.syncRuns ?? []);
  const ready = accounts.filter((row) => row.reconciliation?.ready).length;
  const problems = accounts.filter((row) => ["error", "missing", "stale"].includes(row.state)).length;
  return <main className="aw sy">
    <header className="sy-header"><div><h1>สถานะ Sync</h1><p>ดูว่าข้อมูลมาครบ สดพอ และตรงกับต้นทางหรือยัง</p></div><div><span className={`acc-health-pill ${health.state}`}>{health.label}</span><button type="button" onClick={refresh} disabled={loading || !(connected || canSync)}><RefreshCw size={14} className={loading ? "spin" : ""} />{loading ? "กำลังตรวจ" : "ตรวจใหม่"}</button>{canSync && <button type="button" onClick={reconcileNow} disabled={!syncable.length || reconciling || Boolean(syncing)} aria-busy={reconciling} title="เทียบค่าแอด 7 และ 30 วัน (จบเมื่อวาน) กับ Meta"><Scale size={14} className={reconciling ? "spin" : ""} />{reconciling ? "กำลังตรวจยอด" : "ตรวจยอด"}</button>}{canSync && <button type="button" className="sy-sync-now" onClick={syncNow} disabled={!syncable.length || Boolean(syncing)} aria-busy={Boolean(syncing)} title={syncable.length ? "เติมช่วงวันที่ขาดทีละ 10 วัน + 3 วันล่าสุด แล้วดึง Creative" : "ต้องเชื่อม OAuth และบันทึก mapping Meta ก่อน"}><Download size={14} className={syncing ? "spin" : ""} />{syncing ? syncing.phase === "plan" ? "กำลังวางแผน…" : syncing.phase === "creatives" ? `กำลังดึง Creative ${syncing.done + 1}/${syncing.total}` : `กำลังดึง ${syncing.done}/${syncing.total} ช่วง` : "ดึงข้อมูลตอนนี้"}</button>}<Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div></header>
    <section className="sy-kpis"><div><span>Mapping เปิดใช้</span><b>{accounts.length}</b><small>{accounts.filter((row) => row.connected).length} เชื่อม OAuth แล้ว</small></div><div><span>พร้อมเปิดใช้</span><b>{ready}</b><small>ผ่านตรวจยอด 7 และ 30 วัน</small></div><div className={problems ? "bad" : ""}><span>ต้องแก้</span><b>{problems}</b><small>ข้อมูลขาด ล่าช้า หรือ Sync ผิดพลาด</small></div><div><span>ตรวจสถานะล่าสุด</span><b className="sy-time">{checkedAt ? when(checkedAt) : "ยังไม่ได้ตรวจ backend"}</b><small>หน้านี้ไม่สร้างสถานะสำเร็จจำลอง</small></div></section>
    <section className="sy-sources">{ADS_PROVIDERS.map((provider) => { const source = health.sources.find((item) => item.provider === provider.id); return <SourceSummary key={provider.id} source={{ ...source, color: provider.color }} rowCount={accounts.filter((row) => row.providerId === provider.id).length} />; })}</section>
    <section className="sy-panel"><header><div><h2>บัญชีที่ต้องดู</h2><p>เรียงจากสถานะที่ต้องแก้ก่อน</p></div><Link to="/mkt/ads?panel=settings&tab=sources">จัดการบัญชี <ArrowRight size={13} /></Link></header>{accounts.length ? <div className="sy-accounts"><div className="sy-account-row head"><span>บัญชี</span><span>สถานะ</span><span>Sync ล่าสุด</span><span>ช่องว่าง</span><span>ตรวจยอด / Creative</span><span /></div>{[...accounts].sort((a, b) => ({ error: 5, missing: 4, stale: 3, waiting: 2, syncing: 1, healthy: 0 }[b.state] - ({ error: 5, missing: 4, stale: 3, waiting: 2, syncing: 1, healthy: 0 }[a.state]))).map((row) => <AccountRow key={row.key} row={row} />)}</div> : <div className="sy-empty"><Database size={25} /><strong>ยังไม่มีบัญชีที่เปิดใช้</strong><span>เพิ่ม Account ID และเปิด “เตรียมดึง” ในหน้าตั้งค่าก่อน</span><Link to="/mkt/ads?panel=settings&tab=sources">ไปตั้งค่าบัญชี</Link></div>}</section>
    <RunTable runs={runs} accounts={accounts} />
  </main>;
}
