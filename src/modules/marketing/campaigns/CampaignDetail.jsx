import { useState } from "react";
import { ChartBox, ChartLegend } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtCompact, fmtMoney, fmtPct, SERIES } from "../dash/charts/theme.js";

const METRICS = [["spend", "ค่าแอด", "money"], ["leads", "ผลลัพธ์", "int"], ["cpl", "CPL", "money"], ["roas", "ROAS (attr)", "roas"]];
const fmt = (kind, v) => (v == null ? "—" : kind === "money" ? fmtMoney(v) : kind === "roas" ? `${v.toFixed(1)}x` : String(Math.round(v)));

export function CampaignDetail({ row, compareLabel }) {
  const [metric, setMetric] = useState("spend");
  const [, label, kind] = METRICS.find((m) => m[0] === metric);
  const data = row.series[metric];
  const fatigued = row.creatives.filter((c) => c.fatigue);
  return <div className="cp-detail-grid">
    <section aria-label="กราฟรายวัน">
      <div className="cp-detail-head"><h4>รายวัน</h4>
        <div className="ads-seg" role="tablist" aria-label="เลือกตัวชี้วัด">{METRICS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={metric === k} className={`ads-seg-btn ${metric === k ? "active" : ""}`} onClick={() => setMetric(k)}>{l}</button>)}</div>
        <ChartLegend style={{ margin: 0 }} items={[{ label: "ช่วงนี้", color: SERIES.blue, line: true }]} />
      </div>
      <ChartBox type="line" height={180} ariaLabel={`${label} รายวันของ ${row.name}`}
        data={{ labels: row.series.days.map((d) => Number(d.slice(-2))), datasets: [{ label, data, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.12)", borderWidth: 2, tension: .25, pointRadius: 2, spanGaps: false, fill: true }] }}
        options={baseOpts({ scales: { y: { grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => (kind === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v)) } } },
          plugins: { tooltip: { callbacks: { title: (i) => `วันที่ ${i[0]?.label}`, label: (c) => `${label} ${fmt(kind, c.parsed.y)}` } } } })} />
      <details className="ads-chart-table"><summary>ดูเป็นตาราง (เข้าถึงด้วยคีย์บอร์ด)</summary>
        <div className="ads-table-wrap"><table className="ads-decision-table"><caption className="ads-sr-only">{label} รายวัน</caption>
          <thead><tr><th scope="col">วันที่</th><th scope="col">{label}</th></tr></thead>
          <tbody>{row.series.days.map((d, i) => <tr key={d}><th scope="row">{Number(d.slice(-2))}</th><td className="mono">{fmt(kind, data[i])}</td></tr>)}</tbody>
        </table></div></details>
    </section>
    <section aria-label="ครีเอทีฟ">
      <h4>ครีเอทีฟ {row.creatives.length} ชิ้น{fatigued.length ? <span className="ads-badge ads-badge--amber">เสี่ยงล้า {fatigued.length}</span> : null}</h4>
      <ul className="cp-creatives">{row.creatives.map((c) => <li key={c.key}>
        <div><b>{c.creative}</b><span className={`ads-badge ads-badge--${c.tone}`}>{c.action}</span></div>
        <small className="mono">{fmtMoney(c.spend)} · CTR {c.ctr != null ? fmtPct(c.ctr, 2) : "—"} · ความถี่ {c.frequency != null ? `${c.frequency.toFixed(1)}x` : "—"}{c.ctrDrop != null ? ` · CTR ครึ่งหลัง ${c.ctrDrop >= 0 ? "ตก" : "ขึ้น"} ${fmtPct(Math.abs(c.ctrDrop), 0)}` : ""}</small>
        <small className="ads-muted">{c.why}</small>
      </li>)}</ul>
    </section>
    <section aria-label="ข้อค้นพบและที่มา">
      <h4>ข้อค้นพบ</h4>
      <p className="cp-finding"><span className={`ads-badge ads-badge--${row.decision.tone}`}>{row.decision.label}</span> {row.decision.why}</p>
      <p className="cp-finding"><b>ควรทำต่อ:</b> {row.decision.next}</p>
      <p className="cp-finding ads-muted">เทียบ{compareLabel}: ค่าแอด {row.delta.spend == null ? "—" : `${row.delta.spend.toFixed(0)}%`} · ผลลัพธ์ {row.delta.leads == null ? "—" : `${row.delta.leads.toFixed(0)}%`} · CPL {row.delta.cpl == null ? "—" : `${row.delta.cpl.toFixed(0)}%`}</p>
      <h4>ที่มาของตัวเลข</h4>
      <ul className="cp-source ads-muted">
        <li>ข้อมูลจำลอง (การ์ด <code>ma_*</code> รายวัน) · รันมา {row.days} วันในช่วง</li>
        <li>ROAS (attr) = revenue ที่แพลตฟอร์ม attribute ให้แคมเปญ ÷ ค่าแอด — ไม่ใช่ยอดขายจริงจาก CRM</li>
        <li>งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน {row.budget == null ? "(ยังไม่ตั้ง)" : ""} · จังหวะ = ค่าแอดสะสมตั้งแต่วันที่ 1 ถึงวันนี้ ÷ งบเดือน เทียบสัดส่วนวันที่ผ่านไป</li>
        <li>ป้ายตัดสินใจ: กฎกลาง (ACTION_RULES) + เป้าแบรนด์จากหน้าตั้งค่า · ขั้นต่ำ 3 วัน / 5 ผลลัพธ์</li>
      </ul>
    </section>
  </div>;
}
