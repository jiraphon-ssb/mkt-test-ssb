import { useMemo, useState } from "react";
import { SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../adsCampaigns.js";
import { PlatformIcon, platformMeta } from "../ads/PlatformIcon.jsx";
import { fmtInt, fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);
const STATUS = { active: "กำลังรัน", paused: "พักอยู่", unknown: "ไม่ระบุสถานะ" };
const SORTS = [
  ["spend", "desc", "ค่าแอดมากสุด"], ["spend", "asc", "ค่าแอดน้อยสุด"],
  ["leads", "desc", "ผลลัพธ์มากสุด"], ["cpl", "asc", "CPL ต่ำสุด"],
  ["roas", "desc", "ROAS สูงสุด"], ["name", "asc", "ชื่อ A–Z"],
];

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

export function CampaignsTable({ rows, compareLabel, renderDetail, scopeEmpty }) {
  const [view, setView] = useState("all");
  const [sortValue, setSortValue] = useState("spend:desc");
  const [openKey, setOpenKey] = useState(null);
  const [sortKey, sortDir] = sortValue.split(":");
  const shown = useMemo(() => sortCampaigns(applyView(rows, view), sortKey, sortDir), [rows, view, sortKey, sortDir]);
  const totals = useMemo(() => campaignTotals(shown), [shown]);
  const counts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((s) => [s.key, applyView(rows, s.key).length])), [rows]);
  const emptyText = scopeEmpty ? "ไม่มีข้อมูลแคมเปญในช่วงเวลาหรือช่องทางนี้" : rows.length === 0 ? "ไม่พบแคมเปญตามตัวกรองนี้" : "ไม่มีแคมเปญในกลุ่มนี้";

  return <section className="cp-workspace">
    <div className="cp-summary" aria-label="สรุปแคมเปญตามตัวกรอง">
      <article className="cp-summary-main"><span>ค่าแอด</span><strong className="mono">{fmtMoney(totals.spend)}</strong><small>{totals.count} แคมเปญ · งบที่ตั้ง {totals.budget != null ? fmtMoney(totals.budget) : "—"}</small>{totals.budget != null && totals.budgetRows < totals.count && <em>{totals.budgetRows}/{totals.count} แคมเปญมีงบ</em>}</article>
      <article><span>ผลลัพธ์</span><strong className="mono">{fmtInt(totals.leads)}</strong><small>CPL {totals.cpl != null ? fmtMoney(totals.cpl) : "—"}</small></article>
      <article><span>ROAS แพลตฟอร์ม</span><strong className="mono">{fmtRoas(totals.roas)}</strong><small>%Ads {totals.pctAds != null ? fmtPct(totals.pctAds, 1) : "—"}</small></article>
      <article className={totals.reviewSpend > 0 ? "cp-summary-alert" : ""}><span>งบที่ต้องทบทวน</span><strong className="mono">{fmtMoney(totals.reviewSpend)}</strong><small>รอข้อมูล {totals.waiting} แคมเปญ</small></article>
    </div>

    <div className="cp-list-head">
      <div><h2>รายการแคมเปญ</h2><span>{shown.length} รายการ</span></div>
      <label className="cp-sort-select"><span>เรียง</span><select value={sortValue} onChange={(e) => setSortValue(e.target.value)}>{SORTS.map(([key, dir, label]) => <option key={`${key}:${dir}`} value={`${key}:${dir}`}>{label}</option>)}</select></label>
    </div>
    <div className="cp-views" role="tablist" aria-label="กลุ่มการตัดสินใจ">
      {SAVED_VIEWS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={view === s.key} className={view === s.key ? "active" : ""} onClick={() => setView(s.key)}><span>{s.label}</span><b className="mono">{counts[s.key]}</b></button>)}
    </div>

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
            <div className="cp-metric" data-label="ประสิทธิภาพ"><b className="mono">{fmtRoas(row.roas)}</b><small>CTR {row.ctr != null ? fmtPct(row.ctr, 2) : "—"} · ความถี่ {row.frequency != null ? `${row.frequency.toFixed(1)}x` : "—"}</small></div>
            <div className="cp-metric cp-budget" data-label="งบเดือน / จังหวะ"><BudgetPace row={row} /></div>
            <div className="cp-decision" data-label="ควรทำต่อ"><DecisionBadge d={row.decision} /><small>{row.decision.why}</small></div>
            <button type="button" className="cp-expand" aria-expanded={open} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด ${row.name}`} onClick={() => setOpenKey((key) => key === row.key ? null : row.key)}><Icon name="chevron" size={14} /></button>
          </div>
          {open && <div className="cp-detail">{renderDetail(row)}</div>}
        </article>;
      })}
    </div>}
  </section>;
}
