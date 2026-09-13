import { useMemo, useState } from "react";
import { SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../adsCampaigns.js";
import { PlatformIcon, platformMeta } from "../ads/PlatformIcon.jsx";
import { fmtInt, fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);
const COLS = [
  ["name", "แคมเปญ"], ["spend", "ค่าแอด"], ["budget", "งบ / จังหวะ"], ["leads", "ผลลัพธ์"], ["cpl", "CPL"],
  ["roas", "ROAS (attr)"], ["ctr", "CTR"], ["frequency", "ความถี่"], ["delta", "เทียบก่อน"], ["decision", "ตัดสินใจ"],
];
const STATUS = { active: "กำลังรัน", paused: "หยุดชั่วคราว", unknown: "ไม่ระบุ" };

/** ป้ายตัดสินใจ: คำคู่สี + tooltip เหตุผล */
function DecisionBadge({ d }) {
  return <span className={`ads-badge ads-badge--${d.tone}`} title={`${d.why} → ${d.next}`}>{d.label}</span>;
}

export function CampaignsTable({ rows, compareLabel, renderDetail, scopeEmpty }) {
  const [view, setView] = useState("all");
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [openKey, setOpenKey] = useState(null);
  const shown = useMemo(() => sortCampaigns(applyView(rows, view), sortKey, sortDir), [rows, view, sortKey, sortDir]);
  const totals = useMemo(() => campaignTotals(shown), [shown]);
  const counts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((s) => [s.key, applyView(rows, s.key).length])), [rows]);
  const emptyText = scopeEmpty
    ? "ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้"
    : rows.length === 0
      ? "ไม่พบแคมเปญตามแบรนด์หรือคำค้นนี้"
      : "ไม่มีแคมเปญในมุมมองนี้";
  const sortBy = (key) => { if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("desc"); } };

  return <section className="aw-panel cp-table-panel">
    <div className="cp-totals" aria-label="ยอดรวมของทุกแถวที่กรอง">
      <div><span>แคมเปญ</span><b className="mono">{totals.count}</b></div>
      <div><span>ค่าแอด / งบ</span><b className="mono">{fmtMoney(totals.spend)}<small> / {totals.budget != null ? fmtMoney(totals.budget) : "—"}</small></b>
        {totals.budget != null && totals.budgetRows < totals.count && <small className="ads-muted">· {totals.budgetRows}/{totals.count} แคมเปญมีงบ</small>}</div>
      <div><span>ผลลัพธ์</span><b className="mono">{fmtInt(totals.leads)}</b></div>
      <div><span>CPL</span><b className="mono">{totals.cpl != null ? fmtMoney(totals.cpl) : "—"}</b></div>
      <div><span>ROAS (attr)</span><b className="mono">{fmtRoas(totals.roas)}</b></div>
      <div><span>%Ads</span><b className="mono">{totals.pctAds != null ? fmtPct(totals.pctAds, 1) : "—"}</b></div>
      <div className="cp-totals-review"><span>เงินในรายการที่ต้องตรวจแก้/หยุด</span><b className="mono ads-over">{fmtMoney(totals.reviewSpend)}</b><small>· รอข้อมูล {totals.waiting}</small></div>
    </div>
    <div className="ads-seg cp-views" role="tablist" aria-label="มุมมองที่บันทึกไว้">
      {SAVED_VIEWS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={view === s.key} className={`ads-seg-btn ${view === s.key ? "active" : ""}`} onClick={() => setView(s.key)}>{s.label} <span className="mono">{counts[s.key]}</span></button>)}
    </div>
    {shown.length === 0 ? <div className="empty-row">{emptyText}</div> : (
      <div className="ads-table-wrap">
        <table className="ads-decision-table cp-table">
          <caption className="ads-sr-only">แคมเปญตามตัวกรอง — เรียงตาม {COLS.find((c) => c[0] === sortKey)?.[1]}</caption>
          <thead><tr>{COLS.map(([key, label]) => <th key={key} scope="col" aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
            {["delta", "decision"].includes(key) ? label : <button type="button" className="cp-sort" onClick={() => sortBy(key)}>{label}{sortKey === key && <Icon name="chevron" size={11} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none" }} />}</button>}
          </th>)}<th scope="col"><span className="ads-sr-only">รายละเอียด</span></th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const open = openKey === r.key; const meta = platformMeta(r.platform);
              return <FragmentRow key={r.key} r={r} open={open} meta={meta} compareLabel={compareLabel} onToggle={() => setOpenKey((k) => (k === r.key ? null : r.key))} renderDetail={renderDetail} />;
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>;
}

function FragmentRow({ r, open, meta, compareLabel, onToggle, renderDetail }) {
  const d = r.delta;
  const deltaTxt = d.spend == null ? "เทียบไม่ได้" : `ค่าแอด ${d.spend >= 0 ? "▲" : "▼"}${Math.abs(d.spend).toFixed(0)}% · CPL ${d.cpl == null ? "—" : `${d.cpl >= 0 ? "▲" : "▼"}${Math.abs(d.cpl).toFixed(0)}%`}`;
  return <>
    <tr className={`cp-camp ${open ? "open" : ""}`}>
      <th scope="row" data-label="แคมเปญ" style={{ boxShadow: `inset 3px 0 0 ${meta.color}` }}>
        <div className="cp-name"><PlatformIcon channel={r.platform} size={14} /><b>{r.name}</b></div>
        <small className="ads-muted">{r.brand} · {r.platform} · {r.objective ?? "—"} · {STATUS[r.status]}</small>
      </th>
      <td data-label="ค่าแอด" className="mono num"><b>{fmtMoney(r.spend)}</b><small className="ads-muted"> {r.spendShare != null ? fmtPct(r.spendShare, 0) : ""}</small></td>
      <td data-label="งบ / จังหวะ" className="cp-budget">{r.budget == null ? <span className="ads-muted">ไม่มีงบแคมเปญ</span> : r.monthSpend == null ? <>
        <span className="mono">{fmtMoney(r.budget)}</span>
        <small className="ads-muted cp-budget-missing">ไม่มีข้อมูลค่าแอดเดือนนี้</small>
      </> : <>
        <span className="mono">{fmtMoney(r.budget)} <small className="ads-muted">{fmtPct(r.pace.used, 0)}</small></span>
        <div className="ads-brand-bar" role="img" aria-label={`ใช้ไป ${fmtPct(r.pace.used, 0)} ของงบ · ควรถึง ${fmtPct(r.pace.expected, 0)}`}><i style={{ width: `${Math.min(100, Math.round(r.pace.used * 100))}%`, background: r.pace.used > r.pace.expected + 0.1 ? "var(--warn)" : "var(--ok)" }} /><span className="ads-brand-bar-tick" style={{ left: `${Math.round(r.pace.expected * 100)}%` }} /></div>
      </>}</td>
      <td data-label="ผลลัพธ์" className="mono num">{fmtInt(r.leads)}</td>
      <td data-label="CPL" className="mono num">{r.cpl != null ? fmtMoney(r.cpl) : "—"}</td>
      <td data-label="ROAS (attr)" className="mono num">{fmtRoas(r.roas)}</td>
      <td data-label="CTR" className="mono num">{r.ctr != null ? fmtPct(r.ctr, 2) : "—"}</td>
      <td data-label="ความถี่" className="mono num">{r.frequency != null ? `${r.frequency.toFixed(1)}x` : "—"}</td>
      <td data-label={`เทียบ${compareLabel}`} className="cp-delta">{deltaTxt}</td>
      <td data-label="ตัดสินใจ"><DecisionBadge d={r.decision} /></td>
      <td className="ads-lg-more"><button type="button" className="ads-lg-expand" aria-expanded={open} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด ${r.name}`} onClick={onToggle}><Icon name="chevron" size={12} /></button></td>
    </tr>
    {open && <tr className="cp-detail"><td colSpan={COLS.length + 1}>{renderDetail(r)}</td></tr>}
  </>;
}
