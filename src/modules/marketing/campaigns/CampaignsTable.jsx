import { useEffect, useMemo, useRef, useState } from "react";
import { Dot } from "../creatives/CreativeViewer.jsx";
import { campaignDeliveryOf } from "../creatives/creativeStatus.js";
import { SAVED_VIEWS, applyView, openKeyFor, sortCampaigns } from "../adsCampaigns.js";
import { PlatformIcon, platformMeta } from "../ads/PlatformIcon.jsx";
import { ChartBox } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, dayLabel, fmtCompact, fmtInt, fmtMoney, fmtPct, lineSeries, SERIES, fmtNum } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";

const fmtRoas = (x) => (x == null ? "—" : `${fmtNum(x, 2)}×`);
const SORTS = [
  ["spend", "desc", "ค่าแอดมากสุด"], ["spend", "asc", "ค่าแอดน้อยสุด"],
  ["leads", "desc", "ผลลัพธ์มากสุด"], ["cpl", "asc", "CPL ต่ำสุด"],
  ["roas", "desc", "ROAS (Meta) สูงสุด"], ["name", "asc", "ชื่อ A–Z"],
];
const TREND_METRICS = [["spend", "ค่าแอด"], ["leads", "ผลลัพธ์"], ["cpl", "CPL"], ["roas", "ROAS (Meta)"]];

function DecisionBadge({ d }) {
  return <span className={`ads-badge ads-badge--${d.tone}`} title={`${d.why} → ${d.next}`}>{d.label}</span>;
}

function Delta({ row, compareLabel }) {
  const value = row.delta.spend;
  if (value == null) return null;   // ไม่มีช่วงเทียบ (แคมเปญใหม่) = ไม่ขึ้น "เทียบไม่ได้" ซ้ำทุกแถว (26 ก.ย.)
  return <small className={`cp-delta ${value > 0 ? "up" : value < 0 ? "down" : ""}`}>ค่าแอด {value > 0 ? "▲" : value < 0 ? "▼" : "•"}{fmtNum(Math.abs(value), 2)}% <span>เทียบ{compareLabel}</span></small>;
}

function BudgetPace({ row }) {
  if (row.budget == null) return <span className="cp-no-value">ยังไม่ตั้งงบ</span>;
  if (row.monthSpend == null) return <div className="cp-budget-stack"><b className="mono">{fmtMoney(row.budget)}</b><small className="ads-muted">ไม่มีข้อมูลเดือนนี้</small></div>;
  const fast = row.pace.used > row.pace.expected + 0.1;
  return <div className="cp-budget-stack">
    <div><b className="mono">{fmtMoney(row.monthSpend)}</b><small> / {fmtMoney(row.budget)}</small></div>
    <div className="cp-pace-line"><div className="ads-brand-bar" role="img" aria-label={`ใช้ไป ${fmtPct(row.pace.used, 0)} ของงบ · ควรถึง ${fmtPct(row.pace.expected, 0)}`}><i style={{ width: `${Math.min(100, Math.round(row.pace.used * 100))}%`, background: fast ? "var(--warn)" : "var(--ok)" }} /><span className="ads-brand-bar-tick" style={{ left: `${Math.round(row.pace.expected * 100)}%` }} /></div><small className={fast ? "amber" : "ads-muted"}>{fmtPct(row.pace.used, 0)}</small></div>
  </div>;
}

/* CPL เทียบค่าเฉลี่ยแบรนด์ (อาร์ตเคาะ 26 ก.ย.) — เกณฑ์เดียวกับ campaignDecision: ≥ 1.5 เท่า แพง · ≤ 0.8 เท่า ถูก */
/* คำเดียว หน่วยเดียวทุกระดับ (ทดสอบแบบผู้ใช้จริง 27 ก.ย.: เดิม "แพงกว่า 1.92 เท่า" · "สูงกว่า 21.37%" · "ถูกกว่า 45.12%" สลับหน่วยกลางคอลัมน์
   และ "1.92 เท่า" อ่านได้สองแบบ) — สีบอกระดับ (≥ 1.5 แดง · ≤ 0.8 เขียว) */
export function cplCompare(ratio) {
  if (ratio == null) return null;
  if (ratio === 1) return { text: "เท่าค่าเฉลี่ย", tone: "" };
  const tone = ratio >= 1.5 ? "bad" : ratio <= 0.8 ? "good" : "";
  return ratio > 1 ? { text: `แพงกว่าเฉลี่ย ${fmtPct(ratio - 1)}`, tone } : { text: `ถูกกว่าเฉลี่ย ${fmtPct(1 - ratio)}`, tone };
}

/* CTR ลิงก์ + ความถี่ — คอลัมน์เดียวกันทั้งมุมแคมเปญและกลุ่มเป้าหมาย */
function ReachCell({ r }) {
  return <div className="cp-metric" data-label="CTR ลิงก์ · ความถี่"><b className="mono">{r.linkCtr != null ? fmtPct(r.linkCtr) : "—"}</b><small>ความถี่ {r.frequency != null ? `${fmtNum(r.frequency, 2)}×` : "—"}</small></div>;
}

/* แถวกลุ่มเป้าหมาย: ตัวเลขรวมข้ามแคมเปญที่ใช้ชุดโฆษณาชื่อเดียวกัน · กางดูแคมเปญข้างใน · กดชื่อแคมเปญ = เปิดแผงแคมเปญนั้น */
function AudienceRow({ a, open, onToggle, onCampaign }) {
  const meta = platformMeta(a.platform);
  const cmp = cplCompare(a.cplRatio);
  const d = a.decision;
  return <article className={`cp-campaign ${open ? "open" : ""}`} style={{ "--platform": meta.color }}>
    <div className="cp-campaign-row" onClick={onToggle}>
      <div className="cp-campaign-name"><PlatformIcon channel={a.platform} size={18} /><div><h3 title={a.name}>{a.name}</h3><p>{a.brand} · {a.platform} · {a.campaigns.length} แคมเปญ</p></div></div>
      <div className="cp-metric" data-label="ค่าแอด"><b className="mono">{fmtMoney(a.spend)}</b>{a.spendShare != null && <><span className="cp-share" aria-hidden="true"><i style={{ width: `${Math.min(100, a.spendShare * 100)}%` }} /></span><small>{fmtPct(a.spendShare)} ของค่าแอดทั้งหมด</small></>}</div>
      <div className="cp-metric" data-label="ผลลัพธ์"><b className="mono">{fmtInt(a.leads)}</b></div>
      <div className="cp-metric" data-label="CPL" title={a.brandCpl != null ? `CPL เฉลี่ย ${a.brand} ${fmtMoney(a.brandCpl)}` : undefined}><b className="mono">{a.cpl != null ? fmtMoney(a.cpl) : "—"}</b>{cmp && <small className={`cp-cmp ${cmp.tone}`}>{cmp.text}</small>}</div>
      <ReachCell r={a} />
      <div className="cp-decision" data-label="ควรทำต่อ">{d.tag === "watch" ? <span className="cp-decision-quiet" title={d.why}>ปกติ</span> : <><DecisionBadge d={d} /><small title={d.basis === "average" ? d.next : d.why}>{d.basis === "average" ? d.next : d.why}</small></>}</div>
      <button type="button" className="cp-expand" aria-expanded={open} aria-label={`${open ? "ซ่อน" : "ดู"}แคมเปญใน ${a.name}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}><Icon name="chevron" size={14} /></button>
    </div>
    {open && <ul className="cp-aud-list">{a.campaigns.map((c) => <li key={c.name}>
      <button type="button" title={c.name} onClick={() => onCampaign(c.name)}>{c.name}</button>
      <span className="mono">{fmtMoney(c.spend)}</span><span className="mono">CPL {c.cpl != null ? fmtMoney(c.cpl) : "—"}</span>
    </li>)}</ul>}
  </article>;
}

import { Pagination } from "../ui/Pagination.jsx";
import { scrollToList } from "../ui/pagination.js";
import { usePagination } from "../ui/usePagination.js";
import { useDialogFocus } from "../ui/useDialogFocus.js";

const PAGE_SIZES = [10, 20, 50];

export function CampaignsTable({ rows, audiences = [], loading = false, loadError = false, onRetry, compareLabel, renderDetail, scopeEmpty, initialOpenName = "", onOpenHandled, loadErrorText = null }) {
  const [view, setView] = useState("all");
  const [sortValue, setSortValue] = useState("spend:desc");
  /* มุมมอง (สเปก 2026-09-26): แคมเปญ | กลุ่มเป้าหมาย (ชุดโฆษณาที่ใช้ซ้ำข้ามแคมเปญ) — แทนปุ่มงานวันนี้/ตัวเลขละเอียด */
  const [mode, setMode] = useState("campaign");
  const [openAudience, setOpenAudience] = useState(null);
  const base = mode === "audience" ? audiences : rows;
  const [trendMetric, setTrendMetric] = useState("spend");
  const [openKey, setOpenKey] = useState(() => openKeyFor(rows, initialOpenName));
  /* เปิดตามลิงก์ ?open= — ข้อมูลอาจมาช้ากว่าหน้า (โหลดจริง) จึงรอเจอแถวก่อน
     จำชื่อที่เปิดแล้ว ไม่ใช่แค่ "เคยเปิด" → ลิงก์ใหม่จากหน้าต่างครีเอทีฟเปิดได้ทุกครั้ง (ชุด B ข้อ 17) */
  const handledOpen = useRef(openKeyFor(rows, initialOpenName) ? initialOpenName : "");
  useEffect(() => {
    if (!initialOpenName) { handledOpen.current = ""; return; }   // ลิงก์ถูกล้างแล้ว — ชื่อเดิมกลับมาอีกครั้งต้องเปิดได้
    if (handledOpen.current === initialOpenName) return;
    const key = openKeyFor(rows, initialOpenName);
    if (key) { handledOpen.current = initialOpenName; setMode("campaign"); setOpenKey(key); }
  }, [rows, initialOpenName]);
  const [sortKey, sortDir] = sortValue.split(":");
  const shown = useMemo(() => sortCampaigns(applyView(base, view), sortKey, sortDir), [base, view, sortKey, sortDir]);
  /* แบ่งหน้าเฉพาะรายการ · กราฟ/จำนวนในแท็บยังนับทุกแคมเปญที่กรองแล้ว · ตัวกรอง/กลุ่ม/การเรียงเปลี่ยน → หน้า 1 */
  const listTop = useRef(null);
  const pager = usePagination(shown, { storageKey: "ssb.campaigns.pageSize", sizes: PAGE_SIZES, defaultSize: 20, resetKey: shown });   // shown เปลี่ยนเมื่อตัวกรอง กลุ่ม หรือการเรียงเปลี่ยนเท่านั้น (useMemo)
  const counts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((s) => [s.key, applyView(base, s.key).length])), [base]);
  const trend = useMemo(() => {
    const days = [...new Set(shown.flatMap((r) => r.series?.days ?? []))].sort();
    const point = (row, key, day) => { const i = row.series?.days?.indexOf(day) ?? -1; return i >= 0 ? row.series?.[key]?.[i] : null; };
    const values = days.map((day) => {
      // วันที่ทุกแคมเปญไม่มีข้อมูล (เช่น วันนี้ที่ยังไม่ sync) = null ให้กราฟเว้นช่อง ไม่ใช่ 0 ที่ดูเหมือนยอดตกฮวบ
      if (trendMetric === "spend" || trendMetric === "leads") { const vals = shown.map((r) => point(r, trendMetric, day)); return vals.every((v) => v == null) ? null : vals.reduce((n, v) => n + (v ?? 0), 0); }
      if (shown.every((r) => point(r, "spend", day) == null)) return null;
      const spend = shown.reduce((n, r) => n + (point(r, "spend", day) ?? 0), 0);
      const leads = shown.reduce((n, r) => n + (point(r, "leads", day) ?? 0), 0);
      if (trendMetric === "cpl") return leads > 0 ? spend / leads : null;
      const revenue = shown.reduce((n, r) => n + (point(r, "roas", day) ?? 0) * (point(r, "spend", day) ?? 0), 0);
      return spend > 0 ? revenue / spend : null;
    });
    return { days, values };
  }, [shown, trendMetric]);
  /* คอลัมน์ตามข้อมูลที่มีจริง: งบขึ้นเมื่อมีแถวที่ตั้งงบ · CTR ลิงก์ · ความถี่ แสดงตลอด (สเปก 2026-09-26) */
  const hasBudget = mode === "campaign" && shown.some((r) => r.budget != null);
  const unit = mode === "audience" ? "กลุ่มเป้าหมาย" : "แคมเปญ";
  const columns = [
    /* ความกว้างขั้นต่ำรวมต้องพอดีจอ 1024 (ชุด B ข้อ 4) — เดิมรวม ~1,124px ปุ่มเปิดแผงหลุดขอบ */
    ["name", unit, "minmax(180px,1.7fr)"], ["spend", "ค่าแอด", "minmax(104px,.8fr)"], ["leads", "ผลลัพธ์", "minmax(56px,.4fr)"],
    ["cpl", "CPL เทียบเฉลี่ยแบรนด์", "minmax(120px,.85fr)"], ["reach", "CTR ลิงก์ · ความถี่", "minmax(96px,.7fr)"],
    ...(hasBudget ? [["budget", "งบเดือน / จังหวะ", "minmax(130px,.85fr)"]] : []),
    ["decision", "ควรทำต่อ", "minmax(130px,.95fr)"], ["expand", "", "32px"],
  ];
  const emptyText = scopeEmpty ? "ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้" : rows.length === 0 ? "ไม่พบแคมเปญตามตัวกรองนี้" : `ไม่มี${unit}ในกลุ่มนี้`;
  const openCampaign = (brandId, name) => { const hit = rows.find((r) => r.brandId === brandId && r.name === name); if (hit) { setMode("campaign"); setView("all"); setOpenKey(hit.key); } };
  const selected = rows.find((row) => row.key === openKey) ?? null;
  /* แผงเป็น dialog จริง (ชุด B ข้อ 16): focus เข้าแผง · Tab วน · Esc ปิด · ปิดแล้วคืน focus */
  const drawerRef = useRef(null), drawerClose = useRef(null);
  /* ปิดแผงที่เปิดจากลิงก์ = ล้าง open ออกจากลิงก์ด้วย — ไม่งั้นรีโหลดแล้วแผงเด้งเอง และลิงก์เดิมครั้งถัดไปเงียบ (ทดสอบละเอียด 27 ก.ย.) */
  const closeDrawer = () => { setOpenKey(null); if (initialOpenName) onOpenHandled?.(); };
  useDialogFocus(Boolean(selected), drawerRef, closeDrawer, drawerClose);
  useEffect(() => {
    if (!selected) return undefined;
    const scrollY = window.scrollY;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, [selected]);
  return <section className={`cp-workspace cp-view--${mode}`}>
    <div className="cp-list-head">
      <div><h2>{mode === "audience" ? "กลุ่มเป้าหมาย" : "รายการแคมเปญ"}</h2>{!loading && !loadError && <span>{shown.length} รายการ</span>}</div>
      <div className="cp-list-tools"><div className="cp-column-view" role="group" aria-label="มุมมอง">{[["campaign", "แคมเปญ"], ["audience", "กลุ่มเป้าหมาย"]].map(([k, l]) => <button key={k} type="button" className={mode === k ? "active" : ""} aria-pressed={mode === k} onClick={() => { setMode(k); setView("all"); }}>{l}</button>)}</div><Dropdown label="เรียง" align="end" options={SORTS.map(([key, dir, label]) => [`${key}:${dir}`, label])} value={sortValue} onChange={setSortValue} /></div>
    </div>
    {/* กำลังโหลด (สเปก 2026-09-26): ห้ามบอกว่าไม่มีข้อมูลระหว่างรอ */}
    {loadError ? <div className="cp-empty cp-load-failed" role="alert"><b>โหลดตัวเลขไม่สำเร็จ{loadErrorText ? ` · ${loadErrorText}` : ""}</b><span>ยังแสดงแคมเปญไม่ได้ ไม่ได้แปลว่าช่วงนี้ไม่มีแคมเปญ</span><button type="button" onClick={() => onRetry?.()}>ลองใหม่</button></div>
    : loading ? <div className="cp-empty" role="status"><b>กำลังโหลดแคมเปญ…</b><span>ดึงตัวเลขจริงจาก Meta และระบบขาย</span></div> : <>
    <div className="cp-views" role="tablist" aria-label="กลุ่มการตัดสินใจ">
      {SAVED_VIEWS.filter((s) => s.key === "all" || counts[s.key] > 0 || view === s.key).map((s) => <button key={s.key} type="button" role="tab" aria-selected={view === s.key} className={view === s.key ? "active" : ""} onClick={() => setView(view === s.key ? "all" : s.key)}><span>{s.label}</span><b className="mono">{counts[s.key]}</b></button>)}
    </div>

    {mode === "campaign" && shown.length > 0 && <details className="cp-overview-trend"><summary>ดูแนวโน้มรวมของ {shown.length} แคมเปญ</summary><div><header><div className="cp-metric-tabs" role="tablist" aria-label="ตัวชี้วัดกราฟรวม">{TREND_METRICS.map(([key, label]) => <button type="button" role="tab" aria-selected={trendMetric === key} className={trendMetric === key ? "active" : ""} key={key} onClick={() => setTrendMetric(key)}>{label}</button>)}</div><span>รายวัน · ตามช่วงที่เลือก</span></header><ChartBox type="line" height={190} ariaLabel={`แนวโน้ม${TREND_METRICS.find(([key]) => key === trendMetric)?.[1]}รวม`} data={{ labels: trend.days.map(dayLabel), datasets: [{ label: TREND_METRICS.find(([key]) => key === trendMetric)?.[1], data: trend.values, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.10)", fill: true, ...lineSeries(trend.days.length) }] }} options={baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true, grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => trendMetric === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v) } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? "—" : trendMetric === "roas" ? `${fmtNum(c.parsed.y, 2)}×` : trendMetric === "leads" ? fmtInt(c.parsed.y) : fmtMoney(c.parsed.y)}` } } } })} /></div></details>}

    <div ref={listTop} />
    {shown.length === 0 ? <div className="cp-empty"><b>{emptyText}</b><span>ลองเปลี่ยนช่วงเวลา แบรนด์ ช่องทาง หรือกลุ่มการตัดสินใจ</span></div> : <div className="cp-campaign-list" style={{ "--cp-cols": columns.map(([, , w]) => w).join(" ") }}>
      <div className="cp-list-labels" aria-hidden="true">{columns.map(([key, label]) => <span key={key}>{label}</span>)}</div>
      {mode === "audience" ? pager.pageItems.map((a) => <AudienceRow key={a.key} a={a} open={openAudience === a.key} onToggle={() => setOpenAudience((k) => k === a.key ? null : a.key)} onCampaign={(name) => openCampaign(a.brandId, name)} />)
      : pager.pageItems.map((row) => {
        const open = openKey === row.key;
        const meta = platformMeta(row.platform);
        const delivery = campaignDeliveryOf(row);
        const cmp = cplCompare(row.cplRatio);
        const d = row.decision;
        return <article key={row.key} className={`cp-campaign ${open ? "open" : ""}`} style={{ "--platform": meta.color }}>
          {/* กดที่ไหนในแถวก็เปิดแผงได้ (ชุด B ข้อ 4) · ปุ่มท้ายแถวไว้ให้คีย์บอร์ด */}
          <div className="cp-campaign-row" onClick={() => setOpenKey((key) => key === row.key ? null : row.key)}>
            <div className="cp-campaign-name"><PlatformIcon channel={row.platform} size={18} /><div><h3 title={row.name}>{row.name}</h3>
              {/* ขึ้นเฉพาะที่รู้จริง — ไม่มีเป้าหมาย/สถานะ = ไม่ขึ้นป้าย "ไม่ระบุ/ไม่ทราบ" ซ้ำทุกแถว */}
              <p>{[row.brand, row.platform, row.objective, row.days > 0 ? `รันมา ${row.days} วัน` : null].filter(Boolean).join(" · ")}{delivery.key !== "unknown" && <> · <Dot status={delivery} /></>}</p>
              {/* ROAS ที่ Meta เห็น: แคมเปญทักแชท Meta ไม่เห็นยอดขาย (0.0x) จึงขึ้นเฉพาะที่ได้คืนอย่างน้อยเท่าค่าแอด · ดูครบในตัวเลขละเอียด */}
              {row.roas != null && row.roas >= 1 && <p className="cp-meta-roas">Meta เห็นยอดขาย · ROAS {fmtRoas(row.roas)}</p>}</div></div>
            <div className="cp-metric" data-label="ค่าแอด"><b className="mono">{fmtMoney(row.spend)}</b>{row.spendShare != null && <><span className="cp-share" aria-hidden="true"><i style={{ width: `${Math.min(100, row.spendShare * 100)}%` }} /></span><small>{fmtPct(row.spendShare)} ของค่าแอดทั้งหมด</small></>}<Delta row={row} compareLabel={compareLabel} /></div>
            <div className="cp-metric" data-label="ผลลัพธ์"><b className="mono">{fmtInt(row.leads)}</b></div>
            <div className="cp-metric" data-label="CPL" title={row.brandCpl != null ? `CPL เฉลี่ย ${row.brand} ${fmtMoney(row.brandCpl)}` : undefined}><b className="mono">{row.cpl != null ? fmtMoney(row.cpl) : "—"}</b>{cmp && <small className={`cp-cmp ${cmp.tone}`}>{cmp.text}</small>}</div>
            <ReachCell r={row} />
            {hasBudget && <div className="cp-metric cp-budget" data-label="งบเดือน / จังหวะ"><BudgetPace row={row} /></div>}
            {/* ป้ายเฉพาะข้อยกเว้น — "ติดตาม" คือไม่มีอะไรต้องทำ จึงเว้นว่าง · ป้ายจากค่าเฉลี่ยบอกสิ่งที่ควรทำ (ตัวเลขอยู่ในช่อง CPL แล้ว) */}
            <div className="cp-decision" data-label="ควรทำต่อ">{d.tag === "watch" ? <span className="cp-decision-quiet" title={d.why}>ปกติ</span> : <><DecisionBadge d={d} /><small title={d.basis === "average" ? d.next : d.why}>{d.basis === "average" ? d.next : d.why}</small></>}</div>
            <button type="button" className="cp-expand" aria-haspopup="dialog" aria-label={`ดูรายละเอียด ${row.name}`} onClick={(e) => { e.stopPropagation(); setOpenKey((key) => key === row.key ? null : row.key); }}><Icon name="chevron" size={14} /></button>
          </div>
        </article>;
      })}
    </div>}
    {shown.length > 0 && <Pagination pager={pager} sizes={PAGE_SIZES} unit={unit} label={`แบ่งหน้า${unit}`} onChange={() => scrollToList(listTop)} />}
    </>}
    {selected && <><button type="button" className="cp-drawer-backdrop" tabIndex={-1} aria-hidden="true" onClick={closeDrawer} /><aside ref={drawerRef} className="cp-drawer" role="dialog" aria-modal="true" aria-label={`รายละเอียด ${selected.name}`}>{(() => {
      /* หัวแผงรื้อ 26 ก.ย.: สถานะแคมเปญ + ‹ n/N › ตามลำดับที่เห็นในตาราง (ภาษาเดียวกับหน้าต่างครีเอทีฟ) */
      const list = shown.some((r) => r.key === selected.key) ? shown : rows;
      const at = list.findIndex((r) => r.key === selected.key);
      const delivery = campaignDeliveryOf(selected);
      return <header className="cd-head">
        <div className="cd-head-text"><span>{[selected.brand, selected.platform, selected.objective].filter(Boolean).join(" · ")}</span><h2>{selected.name}</h2>
          {/* ไม่รู้สถานะ = ไม่ขึ้นป้าย (ป้าย "ไม่ทราบสถานะ" ตัวใหญ่ไม่บอกอะไร — อาร์ต 26 ก.ย.) */}
          {delivery.key !== "unknown" && <span className={`cv-pill cv-pill--${delivery.tone}`}><i aria-hidden="true" />แคมเปญ{delivery.label}</span>}</div>
        <div className="cv-nav">
          <div className="cv-stepper">
            <button type="button" aria-label="แคมเปญก่อนหน้า" disabled={at <= 0} onClick={() => setOpenKey(list[at - 1].key)}><ChevronLeft size={16} /></button>
            <span>{at + 1} / {list.length}</span>
            <button type="button" aria-label="แคมเปญถัดไป" disabled={at >= list.length - 1} onClick={() => setOpenKey(list[at + 1].key)}><ChevronRight size={16} /></button>
          </div>
          <button ref={drawerClose} type="button" className="cv-close" aria-label="ปิดรายละเอียด" onClick={closeDrawer}><X size={16} /></button>
        </div>
      </header>;
    })()}<div className="cp-drawer-content">{renderDetail(selected)}</div></aside></>}
  </section>;
}
