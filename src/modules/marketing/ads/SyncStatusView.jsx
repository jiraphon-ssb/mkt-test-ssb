/* สถานะ Sync (รื้อใหม่ 17 ก.ย.) — ตอบคำถามเดียว: ข้อมูลแต่ละแหล่งมาครบ สด เชื่อถือได้ไหม และต้องแก้อะไร
   โครง: สรุปบนสุด → เรื่องที่ควรดู → ตารางแหล่งข้อมูล (แหล่งละแถว) → แท็บรายละเอียด (บัญชี Meta · ยอดขาย · สิทธิ์และคีย์ · ประวัติ)
   โหลดแยกทีละส่วน — ส่วนไหนยังไม่มาขึ้น "กำลังตรวจ…" ห้ามสรุปว่า "ยังไม่มี" จากค่าเก่า (บั๊กหน้าเดิมบน production)
   logic อยู่ใน syncOverview.js (มีเทส) · ไฟล์นี้ประกอบหน้าและสั่งงานเท่านั้น */
import { fmtNum } from "../dash/charts/theme.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, Clock3, Database, Download, Image as ImageIcon, Info,
  KeyRound, LoaderCircle, Radar, ReceiptText, RefreshCw, Scale, Settings2, ShoppingBag,
} from "lucide-react";
import { useAuth } from "../../../foundation/auth/AuthContext.jsx";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { useApp } from "../useMkt.jsx";
import { Pagination } from "../ui/Pagination.jsx";
import { scrollToList } from "../ui/pagination.js";
import { usePagination } from "../ui/usePagination.js";
import { cronHealth, normalizeCronTicks, normalizeSyncRuns, syncAccountRows } from "./adsDataHealth.js";
import { ADS_PROVIDERS } from "./adsConnectorContract.js";
import { applyConnectionResult, applyCoverage, applyReconciliation, latestReconcileByConnection, runSyncJobs, syncCreativesFor } from "./adsConnectionSync.js";
import { missingDaysOf, planSyncJobs } from "../../../../supabase/functions/_shared/adsBackfill.js";
import { todayInTimeZone } from "../../../../supabase/functions/_shared/metaInsights.js";
import { monthsBackStart } from "../../../../supabase/functions/_shared/salesInventory.js";
import { adsErrorText } from "./adsSyncMessages.js";
import { loadPilotFacts } from "./useAdsData.js";
import { AccessPanel, CoverageTable, CreativeRunsPanel, GoalMatrix, InventoryList, SalesCheckResult } from "./SalesSyncPanels.jsx";
import { SALES_BRAND_IDS, jkSourceRow, JK_BRAND_ID, backfillRanges, goalGaps, latestBy } from "./syncSources.js";
import { ago, creativeSourceRow, historyTimeline, metaSourceRow, nextSyncAt, salesSourceRow, syncIssues, syncVerdict } from "./syncOverview.js";
import "./adsWorkspace.css";
import "./syncStatus.css";

const when = (value) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const clock = (value) => value ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

const TABS = [["meta", "บัญชี Meta"], ["sales", "ยอดขาย"], ["access", "สิทธิ์และคีย์"], ["history", "ประวัติ"]];
const LEVEL = { bad: "ต้องแก้", warn: "เตือน", wait: "รอคนอื่น" };
const STATE_ICON = { ok: CheckCircle2, bad: AlertTriangle, warn: AlertTriangle, waiting: Clock3, muted: Clock3, loading: LoaderCircle };
const SOURCE_ICON = { meta: Database, creative: ImageIcon, sales: ReceiptText };
const HISTORY_FILTERS = [["all", "ทั้งหมด"], ["meta", "Meta"], ["sales", "ยอดขาย"], ["creatives", "Creative"], ["cron", "รอบอัตโนมัติ"]];

/** โหลดข้อมูลหลายชุดแยกกัน — ชุดไหนเสร็จขึ้นก่อน · โหลดซ้ำเก็บข้อมูลเดิมไว้ระหว่างรอ (ไม่กระพริบเป็นค่าว่าง) */
function useResources(loaders) {
  const [state, setState] = useState({});
  const generation = useRef(0);
  const latest = useRef(loaders);
  latest.current = loaders;
  const reload = useCallback(() => {
    const gen = ++generation.current;
    for (const [key, load] of Object.entries(latest.current)) {
      setState((s) => ({ ...s, [key]: { data: s[key]?.data, settled: s[key]?.settled ?? false, loading: true, error: null } }));
      Promise.resolve(load ? load() : null)
        .then((data) => { if (gen === generation.current) setState((s) => ({ ...s, [key]: { data, settled: true, loading: false, error: null } })); })
        .catch((error) => { if (gen === generation.current) setState((s) => ({ ...s, [key]: { data: s[key]?.data, settled: true, loading: false, error } })); });
    }
  }, []);
  return [state, reload];
}

function StateChip({ state, label }) {
  const Icon = STATE_ICON[state] ?? Clock3;
  return <span className={`sy-chip ${state}`}><Icon size={13} aria-hidden="true" className={state === "loading" ? "spin" : undefined} />{label}</span>;
}

function Skeleton({ lines = 1, wide = false }) {
  return <span className="sy-skel-group" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} className={`sy-skel${wide ? " wide" : ""}`} />)}</span>;
}

/** แถวแหล่งข้อมูล — แหล่งละแถว ตอบ 3 อย่างเหมือนกัน: สถานะ · สดแค่ไหน · ครบแค่ไหน */
function SourceRow({ row, onOpen }) {
  const Icon = SOURCE_ICON[row.icon] ?? Database;
  const loading = row.state === "loading";
  return <div className="sy-src" role="row">
    <div role="cell" className="sy-src-name"><Icon size={17} aria-hidden="true" /><span><b>{row.name}</b>{row.sub && <small>{row.sub}</small>}</span></div>
    <div role="cell"><StateChip state={row.state} label={row.stateLabel} /></div>
    <div role="cell" className="sy-src-fact" data-label="สดแค่ไหน">{loading ? <Skeleton lines={2} /> : row.fresh ? <><b>{row.fresh.text}</b>{row.fresh.sub && <small>{row.fresh.sub}</small>}</> : <b>—</b>}</div>
    <div role="cell" className="sy-src-fact" data-label="ครบแค่ไหน">{loading ? <Skeleton lines={2} /> : row.complete ? <><b>{row.complete.text}</b>{row.complete.sub && <small>{row.complete.sub}</small>}</> : <small>{row.hint ?? "—"}</small>}</div>
    <div role="cell" className="sy-src-go">{onOpen && <button type="button" onClick={onOpen} aria-label={`ดูรายละเอียด ${row.name}`}>รายละเอียด <ArrowRight size={13} aria-hidden="true" /></button>}</div>
  </div>;
}

/** แถวบัญชี Meta ในแท็บ */
function AccountRow({ row }) {
  const state = row.state === "healthy" ? "ok" : row.state === "error" || row.state === "missing" ? "bad" : row.state === "stale" || row.state === "syncing" ? "warn" : "waiting";
  return <div className="sy-acct" role="row">
    <div role="cell" className="sy-acct-name"><b>{row.brand}</b><small>{row.provider} · {row.accountId}</small></div>
    <div role="cell"><StateChip state={state} label={row.label} /></div>
    <div role="cell" data-label="ดึงล่าสุด"><b>{row.lastSuccessAt ? when(row.lastSuccessAt) : "ยังไม่เคยสำเร็จ"}</b><small>{row.ageHours == null ? "—" : `${fmtNum(row.ageHours, 2)} ชม.ก่อน`}</small></div>
    <div role="cell" data-label="วันที่ขาด"><b>{row.missingDays ? `${row.missingDays} วัน` : row.connected ? "ไม่มี" : "—"}</b><small>{row.errorCode ? adsErrorText(row.errorCode, row.errorCode) : row.creativeEnabled ? "รวม Creative" : "สถิติเท่านั้น"}</small></div>
    <div role="cell" data-label="ตรวจยอดกับ Meta"><b>{row.reconciliation?.ready ? "ผ่าน 7 และ 30 วัน" : "ยังไม่ผ่าน"}</b></div>
  </div>;
}

const HISTORY_SIZES = [20, 50];
const TZ = "Asia/Bangkok";
const dayKey = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const dayHead = (value) => new Intl.DateTimeFormat("th-TH", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
const hhmm = (value) => new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
const TONE_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: AlertTriangle, muted: Clock3 };
const KIND_ICON = { meta: Database, sales: ShoppingBag, inventory: Radar, creatives: ImageIcon, cron: Clock3 };

/** ประวัติรอบ: จัดกลุ่มตามวัน (เวลาไทย) · หน้าละ 20 · เปลี่ยนตัวกรองกลับหน้า 1 */
export function HistoryList({ items, filter, onFilter }) {
  const top = useRef(null);
  const pager = usePagination(items, { storageKey: "ssb.sync.historyPageSize", sizes: HISTORY_SIZES, defaultSize: 20, resetKey: filter });
  // โหลดมาจำนวนจำกัด (ไม่ใช่ทั้ง 90 วัน) — บอกให้รู้ว่าเริ่มตั้งแต่เมื่อไร ไม่งั้นดูเหมือนมีแค่นั้น
  const oldest = items.length ? items[items.length - 1].at : null;
  const groups = [];
  for (const item of pager.pageItems) {
    const key = item.at ? dayKey(item.at) : "unknown";
    if (groups.at(-1)?.key !== key) groups.push({ key, at: item.at, items: [] });
    groups.at(-1).items.push(item);
  }
  return <div className="sy-history" ref={top}>
    <div className="sy-filter" role="group" aria-label="กรองประวัติ">{HISTORY_FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => onFilter(key)}>{label}</button>)}</div>
    <p className="sy-note">ตัวตั้งเวลาเรียกทุกชั่วโมงนาทีที่ 7 · ตรวจยอดและดึงยอดขายวันละครั้งหลัง 9 โมง · รอบที่ไม่มีงานไม่แสดง{oldest ? ` · แสดงตั้งแต่ ${new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(oldest))} (ระบบเก็บไว้ 90 วัน)` : ""}</p>
    {items.length ? <>
      {groups.map((group) => <section className="sy-day" key={group.key}>
        <h4>{group.at ? dayHead(group.at) : "ไม่ทราบวัน"}</h4>
        <ol className="sy-timeline">{group.items.map((item) => {
          const KindIcon = KIND_ICON[item.kind] ?? Clock3;
          const ToneIcon = TONE_ICON[item.tone] ?? Clock3;
          return <li key={item.id}>
            <time dateTime={item.at}>{item.at ? hhmm(item.at) : "—"}</time>
            <KindIcon size={15} aria-hidden="true" className="sy-tl-kind" />
            <span className="sy-tl-main"><b>{item.title}</b>{item.detail && <small>{item.detail}</small>}</span>
            <span className="sy-tl-who">{item.auto ? "อัตโนมัติ" : "กดเอง"}</span>
            <span className={`sy-chip ${item.tone}`}><ToneIcon size={12} aria-hidden="true" />{item.statusLabel}</span>
          </li>;
        })}</ol>
      </section>)}
      <Pagination pager={pager} sizes={HISTORY_SIZES} unit="รายการ" label="แบ่งหน้าประวัติ" onChange={() => scrollToList(top)} />
    </> : <div className="sy-empty"><Clock3 size={22} aria-hidden="true" /><strong>ยังไม่มีประวัติในหมวดนี้</strong></div>}
  </div>;
}

export function SyncStatusView() {
  const { data, toast } = useApp();
  const { user, demo } = useAuth();
  const canSync = !demo && user?.role === "team_lead";
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get("tab")) ? params.get("tab") : "meta";
  const setTab = (key) => setParams((p) => { const next = new URLSearchParams(p); next.set("tab", key); return next; }, { replace: true });
  const [historyFilter, setHistoryFilter] = useState("all");
  const today = todayInTimeZone(new Date(), "Asia/Bangkok");
  const salesSince = monthsBackStart(today, 3);
  const brands = useMemo(() => (data.brands ?? []).filter((brand) => brand.active !== false), [data.brands]);

  const [res, reload] = useResources({
    syncRuns: () => apiClient.ads.recentSyncs(300),
    // สถานะบัญชีจริงอ่านได้ทุกคนที่ล็อกอิน (RLS read authenticated) — ถ้ากั้นเฉพาะหัวหน้าทีม คนอื่นจะเห็นค่าเก่าในหน้าตั้งค่า
    connections: !demo ? () => apiClient.ads.connections() : null,
    recons: () => apiClient.ads.reconciliations(),
    coverage: !demo ? () => apiClient.ads.syncCoverage() : null,
    ticks: () => apiClient.ads.cronTicks(300),
    pipes: () => apiClient.ads.pipelineRuns({ limit: 200 }),
    // หน้านี้ต้องเห็นยอด JUNTAKARN (source 'tmk') ด้วย ไม่งั้นแถว JK บอก "รอเชื่อมแหล่งข้อมูล" ทั้งที่ข้อมูลเข้าฐานแล้ว
    facts: () => apiClient.ads.businessFacts({ from: salesSince, to: today, sources: ["crm", "tmk"] }),
    goals: () => apiClient.ads.salesGoals(`${today.slice(0, 7)}-01`),
    oauth: () => apiClient.ads.oauthStatus(),
  });
  useEffect(() => { reload(); }, [reload, canSync, demo]);
  const ready = (...keys) => keys.every((key) => res[key]?.settled);
  const dataOf = (key, fallback) => res[key]?.data ?? fallback;
  const anyLoading = Object.values(res).some((item) => item.loading) || Object.keys(res).length === 0;

  /* สถานะบัญชีจริงจากฐานทับ mapping ใน settings (แสดงผลเท่านั้น ไม่บันทึกกลับ) */
  const saved = data.settings?.ads_control;
  const dbConnections = useMemo(() => (res.connections?.data ?? null)?.filter((c) => c.provider === "meta") ?? null, [res.connections?.data]);
  const config = useMemo(() => {
    const merged = dbConnections ? applyConnectionResult(saved ?? {}, { connections: dbConnections }) : (saved ?? {});
    const coverageRuns = res.coverage?.data ?? [];
    const missing = new Map((dbConnections ?? []).map((c) => [c.id, missingDaysOf(coverageRuns.filter((r) => r.connection_id === c.id), todayInTimeZone(new Date(), c.timezone), c.config?.backfillDays)]));
    return applyReconciliation(applyCoverage(merged, missing), latestReconcileByConnection(res.recons?.data ?? []));
  }, [saved, dbConnections, res.coverage?.data, res.recons?.data]);
  const accounts = useMemo(() => syncAccountRows(config, brands), [config, brands]);
  const metaAccounts = accounts.filter((row) => row.providerId === "meta");
  const ticks = useMemo(() => normalizeCronTicks(dataOf("ticks", [])), [res.ticks?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const syncRuns = useMemo(() => normalizeSyncRuns(dataOf("syncRuns", [])), [res.syncRuns?.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const pipes = dataOf("pipes", []);
  const facts = dataOf("facts", []);
  const goals = dataOf("goals", []);
  const authorizations = res.oauth?.data?.authorizations ?? [];
  const now = Date.now();

  const rows = {
    meta: metaSourceRow({ accounts: metaAccounts, ready: ready("connections", "coverage", "recons"), everyHours: config.sources?.meta?.syncEveryHours ?? null, now }),
    creatives: creativeSourceRow({ runs: pipes, accounts: metaAccounts, ready: ready("pipes", "connections"), now }),
    sales: salesSourceRow({ runs: pipes, facts, ready: ready("pipes", "facts"), today, now }),
  };
  // โหลดส่วนไหนไม่สำเร็จ = บอกที่แถวนั้น ไม่ปล่อยให้ดูเหมือนไม่มีข้อมูล
  const failedLoad = (keys, row) => keys.some((key) => res[key]?.error && res[key]?.data == null) ? { ...row, state: "bad", stateLabel: "โหลดสถานะไม่สำเร็จ", hint: "กดตรวจใหม่", fresh: null, complete: null } : row;
  rows.meta = failedLoad(["connections", "recons"], rows.meta);
  rows.creatives = failedLoad(["pipes"], rows.creatives);
  rows.sales = failedLoad(["pipes", "facts"], rows.sales);
  const cron = res.ticks?.settled && !res.ticks?.error ? cronHealth(ticks) : null;
  const issues = syncIssues({
    rows, cron, now,
    authorizations: { ready: ready("oauth") && !res.oauth?.error, items: authorizations },
    goals: {
      ready: ready("goals") && !res.goals?.error,
      missingByBrand: brands.filter((brand) => SALES_BRAND_IDS.includes(brand.id)).map((brand) => ({ name: brand.name, missing: goalGaps(goals.find((goal) => goal.brand_id === brand.id) ?? null).missing })),
    },
  });
  const verdict = syncVerdict({ loading: anyLoading, issues });
  const lastData = [rows.meta.state !== "loading" ? metaAccounts.map((row) => row.lastSuccessAt).filter(Boolean).sort().at(-1) : null, pipes.filter((run) => run.pipeline === "sales" && run.status !== "failed").map((run) => run.started_at).sort().at(-1)].filter(Boolean).sort().at(-1);
  // บัญชีที่ดึงนานสุดถึงคิวก่อน — ใช้บอกเวลาดึงค่าแอดรอบถัดไปจริง (tick ที่ไม่มีงานไม่นับ)
  const oldestMetaSync = metaAccounts.filter((row) => row.connected).map((row) => row.lastSuccessAt).filter(Boolean).sort()[0] ?? null;
  const unusedProviders = ADS_PROVIDERS.filter((provider) => provider.id !== "meta" && !accounts.some((row) => row.providerId === provider.id)).map((provider) => provider.name);
  /* JUNTAKARN อ่านจากระบบ TMK Operation — มีแถวของตัวเองที่บอกนิยามที่ต่าง (ไม่ปนกับแบรนด์ที่ยังไม่มีแหล่ง) */
  const jk = jkSourceRow(facts, { today, runs: pipes });
  const jkBrand = brands.find((brand) => brand.id === JK_BRAND_ID) ?? null;
  const waitingBrands = brands.filter((brand) => !SALES_BRAND_IDS.includes(brand.id) && brand.id !== JK_BRAND_ID);
  const timeline = useMemo(() => historyTimeline({ ticks, syncRuns, pipelineRuns: pipes, accounts: metaAccounts, kind: historyFilter, limit: 1000 }), [ticks, syncRuns, pipes, metaAccounts, historyFilter]);

  /* ── งานที่สั่งได้ (หัวหน้าทีม) ── */
  const [syncing, setSyncing] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [salesBusy, setSalesBusy] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const menuRef = useRef(null);
  const closeMenu = () => { if (menuRef.current) menuRef.current.open = false; };
  // เมนูแบบ details ไม่ปิดเองเมื่อคลิกข้างนอก / กด Esc — ปิดให้ แล้วคืนโฟกัสที่ปุ่มเมนู
  useEffect(() => {
    const onDown = (event) => { if (menuRef.current?.open && !menuRef.current.contains(event.target)) closeMenu(); };
    const onKey = (event) => { if (event.key === "Escape" && menuRef.current?.open) { closeMenu(); menuRef.current.querySelector("summary")?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);
  const syncable = metaAccounts.filter((row) => row.connectionId && row.connected);
  const busy = Boolean(syncing) || reconciling || Boolean(salesBusy);

  const reconcileNow = async () => {
    closeMenu();
    if (reconciling) return;
    setReconciling(true);
    try {
      const { results } = await apiClient.ads.reconcile();
      const passed = results.filter((item) => item.ok && item.summary?.passed).length;
      const failed = results.filter((item) => !item.ok || !item.summary?.passed);
      toast?.(failed.length ? `ตรวจยอดแล้ว · ผ่าน ${passed}/${results.length} บัญชี${failed[0].code ? ` · ${adsErrorText(failed[0].code, "บางบัญชีตรวจไม่ได้")}` : " · ยอดบางบัญชีไม่ตรง ดูแท็บบัญชี Meta"}` : `ตรวจยอดผ่านทั้ง ${passed} บัญชี`, failed.length ? "bad" : "ok");
    } catch (error) {
      toast?.(adsErrorText(error, "ตรวจยอดไม่สำเร็จ"), "bad");
    } finally {
      setReconciling(false);
      reload();
    }
  };
  const salesAction = async (kind, run) => {
    closeMenu();
    if (salesBusy) return;
    setSalesBusy(kind);
    try { await run(); }
    catch (error) { toast?.(adsErrorText(error, "ทำรายการกับระบบขายไม่สำเร็จ"), "bad"); }
    finally { setSalesBusy(null); reload(); }
  };
  const checkSales = () => salesAction("check", async () => { setCheckResult(await apiClient.ads.salesCheck()); setTab("sales"); });
  const surveySales = () => salesAction("inventory", async () => { await apiClient.ads.salesInventory(); toast?.("สำรวจแหล่งข้อมูลของระบบขายแล้ว", "ok"); });
  const syncSales = () => salesAction("sync", async () => {
    const out = await apiClient.ads.salesSync();
    const jkNote = out.jk?.error ? ` · ${adsErrorText(out.jk.error, "ยอด JUNTAKARN ไม่เข้า")}` : out.jk?.written ? ` · JUNTAKARN ${out.jk.written.toLocaleString("th-TH")} วัน` : "";
    toast?.(`ดึงยอดขายแล้ว ${out.written?.toLocaleString("th-TH") ?? 0} วัน×แบรนด์${out.goals?.error ? ` · ${adsErrorText(out.goals.error, "เป้าไม่เข้า")}` : ""}${jkNote}`, out.goals?.error || out.jk?.error ? "bad" : "ok");
    await loadPilotFacts({ force: true });
  });
  /* ดึงย้อนหลังทีละเดือน — function รับครั้งละ ≤93 วัน · พังเดือนไหนบอกเดือนนั้น เดือนที่สำเร็จแล้วไม่เสีย */
  const backfillSales = () => salesAction("backfill", async () => {
    const ranges = backfillRanges(salesSince, today);
    const failed = [];
    for (const [index, range] of ranges.entries()) {
      setSalesBusy(`backfill:${index + 1}/${ranges.length}`);
      try { await apiClient.ads.salesSync(range); } catch (error) { failed.push(`${range.from.slice(0, 7)} (${adsErrorText(error, "ไม่สำเร็จ")})`); }
    }
    toast?.(failed.length ? `ดึงย้อนหลังสำเร็จ ${ranges.length - failed.length}/${ranges.length} เดือน · ไม่สำเร็จ: ${failed.join(", ")}` : `ดึงย้อนหลังครบ ${ranges.length} เดือน`, failed.length ? "bad" : "ok");
    await loadPilotFacts({ force: true });
  });
  /* ดึงค่าแอด: หาช่องว่างวันที่จากประวัติ run → แบ่งก้อน ≤10 วัน (กันเพดาน 546) → ดึง Creative ต่อ → โหลดยอดใหม่ */
  const syncNow = async () => {
    closeMenu();
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
      const written = Object.values(result.byConnection).reduce((n, s) => n + s.rowsWritten, 0);
      const firstError = Object.values(result.byConnection).find((s) => s.firstError)?.firstError;
      toast?.(result.failed
        ? `ดึงสำเร็จ ${result.total - result.failed}/${result.total} ช่วง · ${adsErrorText(firstError, "บางช่วงดึงไม่สำเร็จ")} · กดดึงอีกครั้งจะเติมเฉพาะช่วงที่ขาด`
        : `ดึงข้อมูลแล้ว ${result.total} ช่วง · ${written.toLocaleString("th-TH")} แถว · Creative ${creatives.toLocaleString("th-TH")} ชิ้น (ภาพจากโพสต์ ${postEnriched.toLocaleString("th-TH")})${creativeError ? ` · ${adsErrorText(creativeError, "ดึง Creative ไม่ครบ")}` : ""}${needsReconnect ? " · เชื่อม Meta ใหม่ในหน้าตั้งค่าเพื่อให้โฆษณาแบบบูสต์โพสต์แสดงภาพจริง" : ""}`,
      result.failed ? "bad" : "ok");
    } catch (error) {
      toast?.(adsErrorText(error, "ดึงข้อมูลไม่สำเร็จ"), "bad");
    } finally {
      setSyncing(null);
      reload();
      loadPilotFacts({ force: true });
    }
  };

  const progress = syncing ? syncing.phase === "plan" ? "กำลังวางแผนช่วงที่ต้องดึง…" : syncing.phase === "creatives" ? `กำลังดึง Creative ${syncing.done + 1}/${syncing.total} บัญชี…` : `กำลังดึงค่าแอด ${syncing.done}/${syncing.total} ช่วง…`
    : reconciling ? "กำลังตรวจยอดกับ Meta…" : salesBusy ? String(salesBusy).startsWith("backfill") ? `กำลังดึงยอดขายย้อนหลัง ${salesBusy.replace("backfill:", "")} เดือน…` : { check: "กำลังตรวจการเชื่อมต่อระบบขาย…", inventory: "กำลังสำรวจแหล่งข้อมูล…", sync: "กำลังดึงยอดขาย…" }[salesBusy] : null;

  /* ปุ่มของแต่ละเรื่องที่ควรดู */
  const issueAction = (issue) => {
    if (issue.source === "meta" && canSync) return <button type="button" onClick={syncNow} disabled={busy || !syncable.length}>ดึงข้อมูลตอนนี้</button>;
    if (issue.source === "sales" && canSync) return <button type="button" onClick={syncSales} disabled={busy}>ดึงยอดขายตอนนี้</button>;
    if (issue.key === "token") return <Link to="/mkt/ads?panel=settings&tab=sources">ไปเชื่อม Meta</Link>;
    const target = issue.tab ?? (issue.source === "sales" ? "sales" : issue.source ? "meta" : null);
    return target ? <button type="button" onClick={() => setTab(target)}>ดูรายละเอียด</button> : null;
  };
  const VerdictIcon = { ok: CheckCircle2, bad: AlertTriangle, warn: Info, loading: LoaderCircle }[verdict.state];

  return <main className="aw sy">
    <section className="sy-top" aria-label="สรุปสถานะข้อมูล">
      <header className="sy-head">
        <div><h1>สถานะ Sync</h1><p>ข้อมูลแต่ละแหล่งมาครบ สด และเชื่อถือได้ไหม</p></div>
        <div className="sy-head-actions">
          <button type="button" className="sy-btn" onClick={reload} disabled={anyLoading} aria-busy={anyLoading}><RefreshCw size={14} className={anyLoading ? "spin" : ""} aria-hidden="true" />{anyLoading ? "กำลังตรวจ…" : "ตรวจใหม่"}</button>
          {canSync && <button type="button" className="sy-btn primary" onClick={syncNow} disabled={busy || !syncable.length} aria-busy={Boolean(syncing)} title={syncable.length ? "เติมช่วงวันที่ขาด + 3 วันล่าสุด แล้วดึง Creative" : "ต้องเชื่อม Meta และผูกบัญชีก่อน"}><Download size={14} aria-hidden="true" />ดึงข้อมูลตอนนี้</button>}
          {canSync && <details className="sy-menu" ref={menuRef}>
            <summary className="sy-btn" aria-label="งานอื่น"><span>งานอื่น</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="sy-menu-list" role="menu">
              <button type="button" role="menuitem" onClick={reconcileNow} disabled={busy || !syncable.length}><Scale size={14} aria-hidden="true" />ตรวจยอดกับ Meta</button>
              <button type="button" role="menuitem" onClick={syncSales} disabled={busy}><ShoppingBag size={14} aria-hidden="true" />ดึงยอดขายตอนนี้</button>
              <button type="button" role="menuitem" onClick={backfillSales} disabled={busy}><CalendarClock size={14} aria-hidden="true" />ดึงยอดขายย้อนหลัง 3 เดือน</button>
              <button type="button" role="menuitem" onClick={checkSales} disabled={busy}><KeyRound size={14} aria-hidden="true" />ตรวจการเชื่อมต่อระบบขาย</button>
              <button type="button" role="menuitem" onClick={surveySales} disabled={busy}><Radar size={14} aria-hidden="true" />สำรวจแหล่งข้อมูลระบบขาย</button>
            </div>
          </details>}
          <Link className="sy-btn ghost" to="/mkt/ads?panel=settings"><Settings2 size={14} aria-hidden="true" />ตั้งค่า</Link>
        </div>
      </header>
      <div className={`sy-verdict ${verdict.state}`} role="status" aria-live="polite">
        <VerdictIcon size={22} aria-hidden="true" className={verdict.state === "loading" ? "spin" : undefined} />
        <div>
          <strong>{verdict.title}</strong>
          <span>{progress ?? <>ข้อมูลล่าสุด {lastData ? `${clock(lastData)} (${ago(lastData, now)})` : "—"} · ดึงค่าแอดรอบถัดไปราว {clock(nextSyncAt(oldestMetaSync, config.sources?.meta?.syncEveryHours ?? 6, now))}</>}</span>
        </div>
      </div>
      {issues.length > 0 && <ul className="sy-issues" aria-label="เรื่องที่ควรดู">{issues.map((issue) => <li key={issue.key} className={issue.level}>
        <span className={`sy-level ${issue.level}`}>{LEVEL[issue.level]}</span>
        <span className="sy-issue-text"><b>{issue.text}</b>{issue.hint && <small>{issue.hint}</small>}</span>
        <span className="sy-issue-act">{issueAction(issue)}</span>
      </li>)}</ul>}
    </section>

    <section className="sy-card" aria-labelledby="sy-sources-title">
      <header className="sy-card-head"><h2 id="sy-sources-title">แหล่งข้อมูล</h2></header>
      <div className="sy-src-table" role="table" aria-label="สถานะแหล่งข้อมูล">
        <div className="sy-src head" role="row"><span role="columnheader">แหล่ง</span><span role="columnheader">สถานะ</span><span role="columnheader">สดแค่ไหน</span><span role="columnheader">ครบแค่ไหน</span><span role="columnheader"><span className="sr-only">รายละเอียด</span></span></div>
        <SourceRow row={rows.meta} onOpen={() => setTab("meta")} />
        <SourceRow row={rows.creatives} onOpen={() => setTab("meta")} />
        <SourceRow row={rows.sales} onOpen={() => setTab("sales")} />
        {jkBrand && <SourceRow row={{
          key: jkBrand.id, name: `ยอดขาย ${jkBrand.name}`, sub: "ระบบ TMK", icon: "sales",
          state: jk.state === "ok" ? "ok" : jk.state === "stale" ? "warn" : jk.state === "error" ? "bad" : "waiting",
          stateLabel: jk.state === "ok" ? "ปกติ" : jk.state === "stale" ? "ล่าช้า" : jk.state === "error" ? "ดึงไม่สำเร็จ" : "รอเชื่อมแหล่งข้อมูล",
          fresh: jk.fresh ? { text: `ล่าสุด ${jk.fresh}`, sub: "วันละครั้ง" } : { text: "—", sub: "ค่าแอด Meta ยังดึงตามปกติ" },
          // รอบล่าสุดของเฟส JK ล้ม = ช่อง "ครบแค่ไหน" ต้องบอกเหตุผลไทย ไม่ใช่โชว์นิยามเหมือนไม่มีอะไรเกิดขึ้น
          complete: jk.error
            ? { text: "ยอดรอบล่าสุดไม่เข้า", sub: adsErrorText(jk.error, "ดึงยอด JUNTAKARN ไม่สำเร็จ") }
            : { text: "นิยามต่างจากแบรนด์อื่น", sub: jk.detail },
        }} />}
        {waitingBrands.map((brand) => <SourceRow key={brand.id} row={{ key: brand.id, name: `ยอดขาย ${brand.name}`, icon: "sales", state: "waiting", stateLabel: "รอเชื่อมแหล่งข้อมูล", fresh: null, complete: null, hint: "ค่าแอด Meta ยังดึงตามปกติ" }} />)}
      </div>
      {unusedProviders.length > 0 && <p className="sy-note">ยังไม่ใช้: {unusedProviders.join(" · ")}</p>}
    </section>

    <section className="sy-card" aria-label="รายละเอียด">
      <div className="sy-tabs" role="tablist" aria-label="รายละเอียดแต่ละเรื่อง" onKeyDown={(e) => {
        const i = TABS.findIndex(([key]) => key === tab);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length][0]; setTab(next); document.getElementById(`sy-tab-${next}`)?.focus(); }
      }}>
        {TABS.map(([key, label]) => <button type="button" key={key} id={`sy-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`sy-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <div className="sy-tabpanel" role="tabpanel" id={`sy-panel-${tab}`} aria-labelledby={`sy-tab-${tab}`}>
        {tab === "meta" && (rows.meta.state === "loading" ? <Skeleton lines={4} wide /> : <>
          {metaAccounts.length ? <div className="sy-acct-table" role="table" aria-label="บัญชี Meta">
            <div className="sy-acct head" role="row"><span role="columnheader">บัญชี</span><span role="columnheader">สถานะ</span><span role="columnheader">ดึงล่าสุด</span><span role="columnheader">วันที่ขาด</span><span role="columnheader">ตรวจยอดกับ Meta</span></div>
            {[...metaAccounts].sort((a, b) => ({ error: 5, missing: 4, stale: 3, waiting: 2, syncing: 1, healthy: 0 }[b.state] - { error: 5, missing: 4, stale: 3, waiting: 2, syncing: 1, healthy: 0 }[a.state])).map((row) => <AccountRow key={row.key} row={row} />)}
          </div> : <div className="sy-empty"><Database size={22} aria-hidden="true" /><strong>ยังไม่มีบัญชี Meta ที่เปิดใช้</strong><Link to="/mkt/ads?panel=settings&tab=sources">ไปตั้งค่าบัญชี</Link></div>}
          <CreativeRunsPanel latestByConnection={latestBy(pipes.filter((run) => run.pipeline === "creatives"), (run) => run.connection_id)} accounts={metaAccounts} />
        </>)}
        {tab === "sales" && (!ready("facts", "goals", "pipes") ? <Skeleton lines={5} wide /> : <div className="sy-sales-tab">
          <SalesCheckResult result={checkResult} />
          <h3 className="sy-sub">เป้าเดือนนี้</h3>
          <GoalMatrix brands={brands} goals={goals} />
          <h3 className="sy-sub">ความครบของข้อมูล</h3>
          <CoverageTable facts={facts} brands={brands} today={today} from={facts.reduce((min, fact) => (!min || fact.fact_date < min ? fact.fact_date : min), null) ?? salesSince} to={today} />
          <h3 className="sy-sub">แหล่งอื่นในระบบขาย</h3>
          <InventoryList run={pipes.find((run) => run.pipeline === "inventory") ?? null} />
        </div>)}
        {tab === "access" && (!ready("oauth", "pipes") ? <Skeleton lines={3} wide /> : <AccessPanel authorizations={authorizations} salesRun={pipes.find((run) => run.pipeline === "sales") ?? null} />)}
        {tab === "history" && (!ready("ticks", "syncRuns", "pipes") ? <Skeleton lines={6} wide /> : <HistoryList items={timeline} filter={historyFilter} onFilter={setHistoryFilter} />)}
      </div>
    </section>
  </main>;
}
