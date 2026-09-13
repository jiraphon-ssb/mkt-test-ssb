import { useState } from "react";
import { ChartBox } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtCompact, fmtMoney, fmtPct, SERIES } from "../dash/charts/theme.js";

const METRICS = [["spend", "ค่าแอด", "money"], ["leads", "ผลลัพธ์", "int"], ["cpl", "CPL", "money"], ["roas", "ROAS", "roas"]];
const fmt = (kind, v) => (v == null ? "—" : kind === "money" ? fmtMoney(v) : kind === "roas" ? `${v.toFixed(1)}x` : String(Math.round(v)));

export function CampaignDetail({ row, compareLabel }) {
  const [metric, setMetric] = useState("spend");
  const [, label, kind] = METRICS.find((m) => m[0] === metric);
  const data = row.series[metric];
  const fatigued = row.creatives.filter((c) => c.fatigue);
  return <div className="cp-detail-body">
    <div className="cp-detail-primary">
      <section className="cp-trend" aria-label="แนวโน้มรายวัน">
        <header><div><h4>แนวโน้มรายวัน</h4><p>ดูว่าผลงานเริ่มเปลี่ยนตรงวันไหน</p></div><div className="cp-metric-tabs" role="tablist" aria-label="เลือกตัวชี้วัด">{METRICS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={metric === k} className={metric === k ? "active" : ""} onClick={() => setMetric(k)}>{l}</button>)}</div></header>
        <ChartBox type="line" height={190} ariaLabel={`${label} รายวันของ ${row.name}`}
          data={{ labels: row.series.days.map((d) => Number(d.slice(-2))), datasets: [{ label, data, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.10)", borderWidth: 2, tension: .25, pointRadius: 2, spanGaps: false, fill: true }] }}
          options={baseOpts({ scales: { y: { grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => (kind === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v)) } } }, plugins: { tooltip: { callbacks: { title: (i) => `วันที่ ${i[0]?.label}`, label: (c) => `${label} ${fmt(kind, c.parsed.y)}` } } } })} />
      </section>

      <aside className={`cp-next cp-next--${row.decision.tone}`} aria-label="ข้อเสนอแนะ">
        <span>ข้อเสนอแนะ</span><h4>{row.decision.label}</h4><p>{row.decision.why}</p><div><b>ทำต่อ</b><p>{row.decision.next}</p></div>
        <small>เทียบ{compareLabel}</small>
        <dl><div><dt>ค่าแอด</dt><dd>{row.delta.spend == null ? "—" : `${row.delta.spend >= 0 ? "+" : ""}${row.delta.spend.toFixed(0)}%`}</dd></div><div><dt>ผลลัพธ์</dt><dd>{row.delta.leads == null ? "—" : `${row.delta.leads >= 0 ? "+" : ""}${row.delta.leads.toFixed(0)}%`}</dd></div><div><dt>CPL</dt><dd>{row.delta.cpl == null ? "—" : `${row.delta.cpl >= 0 ? "+" : ""}${row.delta.cpl.toFixed(0)}%`}</dd></div></dl>
      </aside>
    </div>

    <section className="cp-creative-section" aria-label="ครีเอทีฟ">
      <header><div><h4>ครีเอทีฟ</h4><p>{row.creatives.length} ชิ้นในแคมเปญ</p></div>{fatigued.length > 0 && <span className="ads-badge ads-badge--amber">เสี่ยงล้า {fatigued.length}</span>}</header>
      {row.creatives.length ? <div className="cp-creatives">{row.creatives.map((c) => <article key={c.key}><div><b>{c.creative}</b><span className={`ads-badge ads-badge--${c.tone}`}>{c.action}</span></div><dl><div><dt>ค่าแอด</dt><dd>{fmtMoney(c.spend)}</dd></div><div><dt>CTR</dt><dd>{c.ctr != null ? fmtPct(c.ctr, 2) : "—"}</dd></div><div><dt>ความถี่</dt><dd>{c.frequency != null ? `${c.frequency.toFixed(1)}x` : "—"}</dd></div></dl><p>{c.why}</p></article>)}</div> : <p className="cp-no-value">ไม่มีข้อมูลครีเอทีฟ</p>}
    </section>

    <details className="cp-lineage"><summary>ที่มาและวิธีคำนวณ</summary><ul>
      <li>ข้อมูลจำลองจากการ์ดรายวัน · รันมา {row.days} วันในช่วง</li>
      <li>ROAS = รายได้ที่แพลตฟอร์ม attribute ให้แคมเปญ ÷ ค่าแอด จึงไม่ใช่ยอดขายจริงจาก CRM</li>
      <li>งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน {row.budget == null ? "(ยังไม่ตั้ง)" : ""}</li>
      <li>จังหวะ = ค่าแอดสะสมตั้งแต่วันที่ 1 ถึงวันนี้ ÷ งบเดือน เทียบสัดส่วนวันที่ผ่านไป</li>
      <li>ข้อเสนอแนะใช้กฎกลาง เป้าแบรนด์ และข้อมูลขั้นต่ำ 3 วัน / 5 ผลลัพธ์</li>
    </ul></details>
  </div>;
}
