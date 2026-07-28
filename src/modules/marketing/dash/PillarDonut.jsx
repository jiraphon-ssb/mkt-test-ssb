/* สัดส่วนงานตาม pillar — โดนัท + legend มีตัวเลข (Chart.js doughnut) */
import { PILLAR_LABEL } from "../mktEngine.js";
import { ChartBox } from "./charts/ChartBox.jsx";
import { SERIES, baseOpts, fmtPct } from "./charts/theme.js";

const H = 190;
/** สีชุดข้อมูลของแพลตฟอร์ม (Visual.jsx const C) — pillar เดียวกันได้สีเดียวกันทั้งแอพ */
const fillOf = (i) => [SERIES.blue, SERIES.green, SERIES.orange, SERIES.gold][i % 4];

export function PillarDonut({ rows }) {
  if (rows.length === 0) return <div className="empty-row">ยังไม่มีงานที่วัดผลในช่วงนี้</div>;

  const total = rows.reduce((a, r) => a + r.n, 0);
  const items = rows.map((r, i) => ({
    name: PILLAR_LABEL[r.key] ?? r.key,
    value: r.n,
    er: r.er,
    fill: fillOf(i),
  }));

  const data = {
    labels: items.map((d) => d.name),
    datasets: [{
      data: items.map((d) => d.value),
      backgroundColor: items.map((d) => d.fill),
      borderWidth: 0,
      spacing: 2,
      hoverOffset: 4,
    }],
  };

  const options = baseOpts({
    cutout: "64%",
    scales: { x: { display: false }, y: { display: false } },   // โดนัทไม่มีแกน
    plugins: {
      tooltip: {
        ...baseOpts().plugins.tooltip,
        callbacks: {
          label: (it) => {
            const d = items[it.dataIndex];
            const share = Math.round((d.value / total) * 100);
            return ` ${d.value} ชิ้น · ${share}%${d.er == null ? "" : ` · ER ${fmtPct(d.er)}`}`;
          },
        },
      },
    },
  });

  return (
    <div className="pd-wrap">
      <ChartBox type="doughnut" data={data} options={options} height={H} ariaLabel="สัดส่วนงานตาม pillar" />

      <div className="pd-legend">
        {items.map((d) => (
          <div className="pd-row" key={d.name}>
            <i style={{ background: d.fill }} />
            <span className="pd-name">{d.name}</span>
            <span className="pd-n mono">{d.value} ชิ้น</span>
            <span className="pd-share mono">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
