/* แนวโน้มรายสัปดาห์ — จำนวนงาน (แท่ง) + ER (เส้น) · Chart.js mixed bar+line */
import { ChartBox, ChartLegend } from "./charts/ChartBox.jsx";
import { CHART_H, SERIES, baseOpts, chartColor, fmtCompact, fmtPct } from "./charts/theme.js";

export function TrendSection({ series }) {
  const withData = series.filter((p) => p.produced > 0);

  if (withData.length === 0) {
    return <div className="empty-row">ยังไม่มีงานที่วัดผลแล้วในช่วงนี้</div>;
  }
  // 1-2 จุดวาดเส้นแล้วดูพัง — โชว์เป็นตัวเลขแทน
  if (withData.length < 3) {
    return (
      <div className="dash-mini">
        {withData.map((p) => (
          <div className="dash-mini-item" key={p.week.start}>
            <span className="dash-mini-label">{p.week.label}</span>
            <span className="mono">{p.produced} ชิ้น · ER {fmtPct(p.er)}</span>
          </div>
        ))}
        <div className="tile-note">ข้อมูลยังน้อยเกินกว่าจะวาดกราฟ</div>
      </div>
    );
  }

  const ink = chartColor.ink();
  const labels = series.map((p) => p.week.label);
  const reachByLabel = Object.fromEntries(series.map((p) => [p.week.label, p.reach]));

  const data = {
    labels,
    datasets: [
      {
        type: "bar",
        label: "งานที่วัดผล",
        data: series.map((p) => p.produced),
        backgroundColor: SERIES.blue,
        borderColor: SERIES.blue,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 26,
        yAxisID: "y",
        order: 2,
      },
      {
        type: "line",
        label: "ER (%)",
        data: series.map((p) => (p.er == null ? null : +(p.er * 100).toFixed(2))),
        borderColor: SERIES.green,
        backgroundColor: SERIES.green,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
        tension: 0.35,
        spanGaps: true,
        yAxisID: "y1",
        order: 1,
      },
    ],
  };

  const options = baseOpts({
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0, color: chartColor.inkFaint(), font: { size: 11 } }, grid: { color: chartColor.line() } },
      y1: {
        position: "right",
        beginAtZero: true,
        grid: { display: false },
        border: { display: false },
        ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => `${v}%` },
      },
    },
    plugins: {
      tooltip: {
        ...baseOpts().plugins.tooltip,
        callbacks: {
          title: (items) => {
            const l = items[0]?.label;
            const reach = reachByLabel[l];
            return `สัปดาห์ ${l}${reach ? ` · reach ${fmtCompact(reach)}` : ""}`;
          },
          label: (it) =>
            it.dataset.type === "bar"
              ? ` งานที่วัดผล ${it.parsed.y} ชิ้น`
              : ` ER ${it.parsed.y}%`,
        },
      },
    },
  });

  return (
    <>
      <ChartLegend items={[
        { label: "งานที่วัดผล", color: SERIES.blue },
        { label: "ER (%)", color: ink, line: true },
      ]} />
      <ChartBox type="bar" data={data} options={options} height={CHART_H - 20} ariaLabel="แนวโน้มรายสัปดาห์" />
    </>
  );
}
