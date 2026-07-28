/* งาน ads — งบ/CPL รายสัปดาห์ + รายใบ (เฉพาะการ์ด track project ที่กรอก spend)
   Chart.js: แท่ง = งบ (แกนซ้าย) · เส้น = CPL (แกนขวา) */
import { useState } from "react";
import { adsRollup } from "../mktAnalytics.js";
import { ChartBox, ChartLegend } from "./charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtCompact, fmtInt, fmtMoney } from "./charts/theme.js";
import { brandOf } from "../mktParts.jsx";
export function AdsSection({ data, rows, spend, leads, cpl, weeks, allCards, }) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) {
    return <div className="empty-row">ยังไม่มีงานที่กรอกงบในช่วงนี้</div>;
  }
  const weekly = weeks.map((w) => {
    const a = adsRollup(allCards, w);
    return { label: w.label, spend: a.spend, cpl: a.cpl == null ? null : Math.round(a.cpl), leads: a.leads };
  });
  const shown = showAll ? rows : rows.slice(0, 5);
  return (<>
   <div className="dash-metrics3">
    <div className="big-metric"><span className="n mono">{fmtMoney(spend)}</span><span className="u">งบรวม</span></div>
    <div className="big-metric"><span className="n mono">{fmtInt(leads)}</span><span className="u">lead ที่ได้</span></div>
    <div className="big-metric"><span className="n mono">{cpl == null ? "—" : fmtMoney(cpl)}</span><span className="u">CPL เฉลี่ย</span></div>
   </div>

   {weekly.filter((w) => w.spend > 0).length >= 2 && (() => {
     const violet = chartColor.violet();
     const ink = chartColor.ink();
     const chartData = {
      labels: weekly.map((w) => w.label),
      datasets: [
       {
        type: "bar", label: "งบ (บาท)", data: weekly.map((w) => w.spend),
        backgroundColor: violet, borderRadius: 4, maxBarThickness: 26, yAxisID: "y", order: 2,
       },
       {
        type: "line", label: "CPL (บาท)", data: weekly.map((w) => w.cpl),
        borderColor: ink, backgroundColor: ink, borderWidth: 2, pointRadius: 2.5,
        tension: 0.35, spanGaps: true, yAxisID: "y1", order: 1,
       },
      ],
     };
     const opts = baseOpts({
      scales: {
       y: { beginAtZero: true, grid: { color: chartColor.line() }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => fmtCompact(v) } },
       y1: { position: "right", beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => fmtCompact(v) } },
      },
      plugins: {
       tooltip: {
        ...baseOpts().plugins.tooltip,
        callbacks: {
         title: (items) => `สัปดาห์ ${items[0]?.label ?? ""}`,
         label: (it) => (it.parsed.y == null ? null
          : it.dataset.type === "bar" ? ` งบ ${fmtMoney(it.parsed.y)}` : ` CPL ${fmtMoney(it.parsed.y)}`),
        },
       },
      },
     });
     return (<>
      <ChartLegend items={[{ label: "งบ (บาท)", color: violet }, { label: "CPL (บาท)", color: ink, line: true }]}/>
      <ChartBox type="bar" data={chartData} options={opts} height={186} ariaLabel="งบและ CPL รายสัปดาห์"/>
     </>);
    })()}

   <table className="dash-table">
    <thead>
     <tr><th>งาน</th><th>Brand</th><th>งบ</th><th>Lead</th><th>CPL</th></tr>
    </thead>
    <tbody>
     {shown.map((r) => {
      const brand = brandOf(data, r.card.brand_id);
      return (<tr key={r.card.id}>
        <td className="ellip">{r.card.title}</td>
        <td><span className="dot" style={{ background: brand.color }}/> {brand.name}</td>
        <td className="mono">{fmtMoney(r.spend)}</td>
        <td className="mono">{fmtInt(r.leads)}</td>
        <td className="mono">{r.cpl == null ? "—" : fmtMoney(r.cpl)}</td>
       </tr>);
    })}
    </tbody>
   </table>
   {rows.length > 5 && (<button className="dash-more" onClick={() => setShowAll(!showAll)}>
     {showAll ? "ย่อรายการ" : `ดูทั้งหมด ${rows.length} ชิ้น`}
    </button>)}
  </>);
}
