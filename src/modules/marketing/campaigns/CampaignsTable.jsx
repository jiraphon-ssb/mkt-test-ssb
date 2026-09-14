import { useEffect, useMemo, useState } from "react";
import { SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../adsCampaigns.js";
import { PlatformIcon, platformMeta } from "../ads/PlatformIcon.jsx";
import { ChartBox } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, dayLabel, fmtCompact, fmtInt, fmtMoney, fmtPct, lineSeries, SERIES } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";
import { X } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);
const STATUS = { active: "กำลังรัน", paused: "พักอยู่", unknown: "ไม่ระบุสถานะ" };
const SORTS = [
  ["spend", "desc", "ค่าแอดมากสุด"], ["spend", "asc", "ค่าแอดน้อยสุด"],
  ["leads", "desc", "ผลลัพธ์มากสุด"], ["cpl", "asc", "CPL ต่ำสุด"],
  ["roas", "desc", "ROAS สูงสุด"], ["name", "asc", "ชื่อ A–Z"],
];
const TREND_METRICS = [["spend", "ค่าแอด"], ["leads", "ผลลัพธ์"], ["cpl", "CPL"], ["roas", "ROAS"]];

function DecisionBadge({ d }) {
  return <span className={`ads-badge ads-badge--${d.tone}`} title={`${d.why} → ${d.next}`}>{d.label}</span>;
}

function Delta({ row, compareLabel }) {
  const value = row.delta.spend;
  if (value == null) return <small className="cp-delta ads-muted">เทียบไม่ได้</small>;
  return <small className={`cp-delta ${value > 0 ? "up" : value < 0 ? "down" : ""}`}>ค่าแอด {value > 0 ? "▲" : value < 0 ? "▼" : "•"}{Math.abs(value).toFixed(0)}% <span>เทียบ{compareLabel}</span></small>;
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

export function CampaignsTable({ rows, compareLabel, renderDetail, scopeEmpty, revenueLabel }) {
  const [view, setView] = useState("all");
  const [sortValue, setSortValue] = useState("spend:desc");
  const [columnView, setColumnView] = useState("decision");
  const [trendMetric, setTrendMetric] = useState("spend");
  const [openKey, setOpenKey] = useState(null);
  const [sortKey, sortDir] = sortValue.split(":");
  const shown = useMemo(() => sortCampaigns(applyView(rows, view), sortKey, sortDir), [rows, view, sortKey, sortDir]);
  const totals = useMemo(() => campaignTotals(shown), [shown]);
  const counts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((s) => [s.key, applyView(rows, s.key).length])), [rows]);
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
  const emptyText = scopeEmpty ? "ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้" : rows.length === 0 ? "ไม่พบแคมเปญตามตัวกรองนี้" : "ไม่มีแคมเปญในกลุ่มนี้";
  const selected = rows.find((row) => row.key === openKey) ?? null;
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
  const focus = [
    { key: "scale", label: "เพิ่มงบได้", hint: "ผลงานผ่านเกณฑ์", tone: "ok" },
    { key: "gate", label: "งบติดขัด", hint: "ผลดีแต่งบไม่พอ", tone: "warn" },
    { key: "fix", label: "ผลเริ่มตก", hint: "ควรตรวจงาน", tone: "bad" },
    { key: "wait", label: "รอข้อมูล", hint: "ยังสรุปไม่ได้", tone: "muted" },
  ];

  return <section className={`cp-workspace cp-view--${columnView}`}>
    <div className="cp-focus">
      <div className="cp-focus-intro"><span>วันนี้ต้องดู</span><strong>{counts.scale + counts.gate + counts.fix}</strong><small>รายการที่ตัดสินใจได้</small></div>
      {focus.map((item) => <button type="button" key={item.key} className={`cp-focus-card cp-focus--${item.tone} ${view === item.key ? "active" : ""}`} onClick={() => setView(view === item.key ? "all" : item.key)}><span>{item.label}</span><strong className="mono">{counts[item.key]}</strong><small>{item.key === "wait" && counts.wait ? `ส่วนใหญ่ต้องรออย่างน้อย ${Math.max(0, 3 - Math.min(...rows.filter((r) => r.decision.tag === "wait").map((r) => r.days)))} วัน` : item.hint}</small></button>)}
    </div>
    <div className="cp-summary" aria-label="สรุปแคมเปญตามตัวกรอง">
      <article className="cp-summary-main"><span>ค่าแอด</span><strong className="mono">{fmtMoney(totals.spend)}</strong><small>{totals.count} แคมเปญ · งบที่ตั้ง {totals.budget != null ? fmtMoney(totals.budget) : "—"}</small>{totals.budget != null && totals.budgetRows < totals.count && <em>{totals.budgetRows}/{totals.count} แคมเปญมีงบ</em>}</article>
      <article><span>ผลลัพธ์</span><strong className="mono">{fmtInt(totals.leads)}</strong><small>CPL {totals.cpl != null ? fmtMoney(totals.cpl) : "—"}</small></article>
      <article><span>{revenueLabel}</span><strong className="mono">{fmtMoney(totals.revenue)}</strong><small>ROAS แพลตฟอร์ม {fmtRoas(totals.roas)} · %Ads {totals.pctAds != null ? fmtPct(totals.pctAds, 1) : "—"}</small></article>
    </div>

    <div className="cp-list-head">
      <div><h2>รายการแคมเปญ</h2><span>{shown.length} รายการ</span></div>
      <div className="cp-list-tools"><div className="cp-column-view" role="group" aria-label="ชุดข้อมูล"><button type="button" className={columnView === "decision" ? "active" : ""} aria-pressed={columnView === "decision"} onClick={() => setColumnView("decision")}>งานวันนี้</button><button type="button" className={columnView === "analysis" ? "active" : ""} aria-pressed={columnView === "analysis"} onClick={() => setColumnView("analysis")}>ตัวเลขละเอียด</button></div><Dropdown label="เรียง" align="end" options={SORTS.map(([key, dir, label]) => [`${key}:${dir}`, label])} value={sortValue} onChange={setSortValue} /></div>
    </div>
    <div className="cp-views" role="tablist" aria-label="กลุ่มการตัดสินใจ">
      {SAVED_VIEWS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={view === s.key} className={view === s.key ? "active" : ""} onClick={() => setView(s.key)}><span>{s.label}</span><b className="mono">{counts[s.key]}</b></button>)}
    </div>

    {shown.length > 0 && <details className="cp-overview-trend"><summary>ดูแนวโน้มรวมของ {shown.length} แคมเปญ</summary><div><header><div className="cp-metric-tabs" role="tablist" aria-label="ตัวชี้วัดกราฟรวม">{TREND_METRICS.map(([key, label]) => <button type="button" role="tab" aria-selected={trendMetric === key} className={trendMetric === key ? "active" : ""} key={key} onClick={() => setTrendMetric(key)}>{label}</button>)}</div><span>รายวัน · ตามช่วงที่เลือก</span></header><ChartBox type="line" height={190} ariaLabel={`แนวโน้ม${TREND_METRICS.find(([key]) => key === trendMetric)?.[1]}รวม`} data={{ labels: trend.days.map(dayLabel), datasets: [{ label: TREND_METRICS.find(([key]) => key === trendMetric)?.[1], data: trend.values, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.10)", fill: true, ...lineSeries(trend.days.length) }] }} options={baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } }, y: { beginAtZero: true, grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => trendMetric === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v) } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? "—" : trendMetric === "roas" ? `${c.parsed.y.toFixed(1)}x` : trendMetric === "leads" ? fmtInt(c.parsed.y) : fmtMoney(c.parsed.y)}` } } } })} /></div></details>}

    {shown.length === 0 ? <div className="cp-empty"><b>{emptyText}</b><span>ลองเปลี่ยนช่วงเวลา แบรนด์ ช่องทาง หรือกลุ่มการตัดสินใจ</span></div> : <div className="cp-campaign-list">
      <div className="cp-list-labels" aria-hidden="true"><span>แคมเปญ</span><span>ค่าแอด</span><span>ผลลัพธ์</span><span>ประสิทธิภาพ</span><span>งบเดือน / จังหวะ</span><span>ควรทำต่อ</span><span /></div>
      {shown.map((row) => {
        const open = openKey === row.key;
        const meta = platformMeta(row.platform);
        return <article key={row.key} className={`cp-campaign ${open ? "open" : ""}`} style={{ "--platform": meta.color }}>
          <div className="cp-campaign-row">
            <div className="cp-campaign-name"><PlatformIcon channel={row.platform} size={18} /><div><h3>{row.name}</h3><p>{row.brand} · {row.platform} · {row.objective ?? "ไม่ระบุเป้าหมาย"} · {STATUS[row.status]}</p></div></div>
            <div className="cp-metric" data-label="ค่าแอด"><b className="mono">{fmtMoney(row.spend)}</b><small>{row.spendShare != null ? `${fmtPct(row.spendShare, 0)} ของรายการ` : "—"}</small><Delta row={row} compareLabel={compareLabel} /></div>
            <div className="cp-metric" data-label="ผลลัพธ์"><b className="mono">{fmtInt(row.leads)}</b><small>CPL {row.cpl != null ? fmtMoney(row.cpl) : "—"}</small></div>
            <div className="cp-metric cp-efficiency" data-label="ประสิทธิภาพ"><b className="mono">{fmtRoas(row.roas)}</b><small>CTR {row.ctr != null ? fmtPct(row.ctr, 2) : "—"} · ความถี่ {row.frequency != null ? `${row.frequency.toFixed(1)}x` : "—"}</small></div>
            <div className="cp-metric cp-budget" data-label="งบเดือน / จังหวะ"><BudgetPace row={row} /></div>
            <div className="cp-decision" data-label="ควรทำต่อ"><DecisionBadge d={row.decision} /><small>{row.decision.why}</small></div>
            <button type="button" className="cp-expand" aria-expanded={open} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด ${row.name}`} onClick={() => setOpenKey((key) => key === row.key ? null : row.key)}><Icon name="chevron" size={14} /></button>
          </div>
        </article>;
      })}
    </div>}
    {selected && <><button type="button" className="cp-drawer-backdrop" aria-label="ปิดรายละเอียด" onClick={() => setOpenKey(null)} /><aside className="cp-drawer" aria-label={`รายละเอียด ${selected.name}`}><header><div><span>{selected.brand} · {selected.platform}</span><h2>{selected.name}</h2></div><button type="button" aria-label="ปิดรายละเอียด" onClick={() => setOpenKey(null)}><X size={18} /></button></header><div className="cp-drawer-content">{renderDetail(selected)}</div></aside></>}
  </section>;
}
