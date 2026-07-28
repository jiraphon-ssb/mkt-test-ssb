/* Funnel + เวลาต่อขั้น — จาก status_history จริง (ไม่ใช่ค่าประมาณ)
   ตอบคำถาม "งานตกหล่นตรงไหน" และ "ขั้นไหนกินเวลา"
   Chart.js horizontal bar + วันเฉลี่ยพิมพ์ท้ายแท่งด้วย custom plugin */
import { STAGE_META } from "../mktEngine.js";
import { ChartBox } from "./charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtDays, token } from "./charts/theme.js";

const H = 230;

/** พิมพ์ "x.x วัน" ต่อท้ายแท่ง — Chart.js ไม่มี LabelList เหมือน recharts */
const dayLabelPlugin = (labels) => ({
  id: "dayLabel",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.fillStyle = chartColor.inkFaint();
    ctx.textBaseline = "middle";
    meta.data.forEach((bar, i) => {
      const text = labels[i];
      if (text) ctx.fillText(text, bar.x + 8, bar.y);
    });
    ctx.restore();
  },
});

export function FunnelSection({ flows, cycle }) {
  const rows = flows.map((f) => {
    const meta = STAGE_META[f.status];
    // STAGE_META.color เป็น "var(--x)" — canvas ต้องใช้ค่าจริง
    const varName = meta.color.replace(/^var\(|\)$/g, "");
    return {
      name: meta.name,
      owner: meta.owner,
      entered: f.entered,
      avgDays: f.avgDays,
      medianDays: f.medianDays,
      fill: token(varName, chartColor.inkFaint()),
    };
  });

  const has = rows.some((r) => r.entered > 0);
  if (!has) return <div className="empty-row">ยังไม่มีการเดินการ์ดในช่วงนี้</div>;

  const data = {
    labels: rows.map((r) => r.name),
    datasets: [{
      data: rows.map((r) => r.entered),
      backgroundColor: rows.map((r) => r.fill),
      borderRadius: 5,
      maxBarThickness: 24,
    }],
  };

  const options = baseOpts({
    indexAxis: "y",
    layout: { padding: { right: 58 } },   // เผื่อที่ให้ตัวเลขวันท้ายแท่ง
    scales: {
      x: { display: false, grid: { display: false } },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: chartColor.inkSoft(), font: { size: 12, family: "'Noto Sans Thai', sans-serif" } },
      },
    },
    plugins: {
      tooltip: {
        ...baseOpts().plugins.tooltip,
        callbacks: {
          title: (items) => `ขั้น ${items[0]?.label ?? ""}`,
          label: (it) => {
            const r = rows[it.dataIndex];
            return [` ${r.entered} ใบ · เฉลี่ย ${fmtDays(r.avgDays)}`, ` เจ้าของขั้น ${r.owner}`];
          },
        },
      },
    },
  });

  return (
    <>
      <div className="dash-cycle">
        <div className="big-metric">
          <span className="n mono">{cycle.avgDays == null ? "—" : cycle.avgDays.toFixed(1)}</span>
          <span className="u">วันเฉลี่ย ไอเดีย → โพสต์</span>
        </div>
        <div className="dash-cycle-side">
          <div className="mono">มัธยฐาน {fmtDays(cycle.medianDays)}</div>
          <div className="tile-note">{cycle.n} ชิ้น</div>
        </div>
      </div>

      <ChartBox
        type="bar"
        data={data}
        options={options}
        height={H}
        ariaLabel="จำนวนการ์ดที่เข้าแต่ละขั้น"
        plugins={[dayLabelPlugin(rows.map((r) => (r.avgDays == null ? "" : `${r.avgDays.toFixed(1)} วัน`)))]}
      />
    </>
  );
}
