/* เจาะราย brand / pillar / channel / คน — แท็บเดียว 4 มิติ กันหน้ายาวเกิน
   กราฟทั้งหมดเป็น Chart.js (charting lib เดียวของแพลตฟอร์ม) */
import { useState } from "react";
import { MODE_LABEL, PILLAR_LABEL } from "../mktEngine.js";
import { ChartBox } from "./charts/ChartBox.jsx";
import { CHART_H, baseOpts, chartColor, fmtCompact, fmtInt, fmtPct } from "./charts/theme.js";
import { profileOf } from "../mktParts.jsx";

/** สีวนสำหรับ pillar — ใช้ token เดิมของระบบ ไม่เพิ่มสีใหม่ */
const pillarFill = (i) => [chartColor.accent, chartColor.ta, chartColor.ok, chartColor.violet][i % 4]();

const KIND_LABEL = { single: "ภาพเดี่ยว (AW)", album: "ชุดภาพ (Album)", video: "คลิป (Video)" };

const TABS = [
  { id: "brand", label: "ราย Brand" },
  { id: "pillar", label: "ราย Pillar" },
  { id: "channel", label: "ช่องทาง" },
  { id: "kind", label: "ชนิดงาน" },
  { id: "owner", label: "รายคน" },
];

/** เส้นประ "ค่าเฉลี่ยทีม" — Chart.js ไม่มี ReferenceLine เหมือน recharts จึงวาดเอง */
const teamLinePlugin = (value, label) => ({
  id: "teamLine",
  afterDatasetsDraw(chart) {
    if (value == null) return;
    const y = chart.scales.y?.getPixelForValue(value);
    if (y == null || Number.isNaN(y)) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = chartColor.inkFaint();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "10px 'Noto Sans Thai', sans-serif";
    ctx.fillStyle = chartColor.inkFaint();
    ctx.textAlign = "right";
    ctx.fillText(label, chartArea.right - 2, y - 4);
    ctx.restore();
  },
});

export function BreakdownSection({
  data, brandRows, pillarRows, channelRows, ownerRows, kindRows = [], weeks, brandSeries, teamER, showOwnerTab = true,
}) {
  const [tab, setTab] = useState("brand");
  const tabs = TABS.filter((t) => (t.id !== "owner" || showOwnerTab) && (t.id !== "kind" || kindRows.length > 0));
  // ถ้า role เปลี่ยนขณะค้างที่แท็บที่ถูกซ่อน ให้เด้งกลับแท็บแรก
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "brand";

  const brandName = (id) => data.brands.find((b) => b.id === id)?.name ?? id;
  const brandColor = (id) => data.brands.find((b) => b.id === id)?.color ?? chartColor.inkFaint();
  const erPct = (r) => (r.er == null ? null : +(r.er * 100).toFixed(2));
  const teamLine = teamER == null ? null : +(teamER * 100).toFixed(2);

  /** option ของกราฟแท่ง ER (แกน y เป็น %) */
  const erBarOpts = (rows, labelOf) => baseOpts({
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: chartColor.line() },
        ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => `${v}%` },
      },
      x: { grid: { display: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11, family: "'Noto Sans Thai', sans-serif" } } },
    },
    plugins: {
      tooltip: {
        ...baseOpts().plugins.tooltip,
        callbacks: {
          title: (items) => labelOf(items[0]?.dataIndex ?? 0),
          label: (it) => {
            const r = rows[it.dataIndex];
            return ` ER ${fmtPct(r.er)} · งาน ${r.n} ชิ้น`;
          },
        },
      },
    },
  });

  return (
    <>
      <div className="dash-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={activeTab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Brand ---------- */}
      {activeTab === "brand" && (brandRows.length === 0 ? <div className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</div> : (
        <>
          <ChartBox
            type="bar"
            height={200}
            ariaLabel="ER ต่อแบรนด์"
            data={{
              labels: brandRows.map((r) => brandName(r.key)),
              datasets: [{
                data: brandRows.map(erPct),
                backgroundColor: brandRows.map((r) => brandColor(r.key)),
                borderRadius: 5,
                maxBarThickness: 54,
              }],
            }}
            options={erBarOpts(brandRows, (i) => brandName(brandRows[i].key))}
            plugins={teamLine == null ? undefined : [teamLinePlugin(teamLine, `ค่าเฉลี่ยทีม ${teamLine}%`)]}
          />

          <table className="dash-table">
            <thead>
              <tr><th>Brand</th><th>โหมด</th><th>งาน</th><th>Reach</th><th>ER</th><th>Leads</th><th>ป้ายผล</th></tr>
            </thead>
            <tbody>
              {brandRows.map((r) => (
                <tr key={r.key}>
                  <td><span className="dot" style={{ background: brandColor(r.key) }} /> {brandName(r.key)}</td>
                  <td className="dim">{MODE_LABEL[data.brands.find((b) => b.id === r.key)?.mode ?? "maintain"]}</td>
                  <td className="mono">{r.n}</td>
                  <td className="mono">{fmtCompact(r.reach)}</td>
                  <td className="mono">{fmtPct(r.er)}</td>
                  <td className="mono">{fmtInt(r.leads)}</td>
                  <td className="labels">
                    {r.labels.green > 0 && <span className="lb green">{r.labels.green}</span>}
                    {r.labels.yellow > 0 && <span className="lb yellow">{r.labels.yellow}</span>}
                    {r.labels.red > 0 && <span className="lb red">{r.labels.red}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {weeks.length >= 3 && (
            <>
              <div className="dash-subhead">ER รายสัปดาห์แยกแบรนด์</div>
              <ChartBox
                type="line"
                height={CHART_H}
                ariaLabel="ER รายสัปดาห์แยกแบรนด์"
                data={{
                  labels: weeks.map((w) => w.label),
                  datasets: [...brandSeries.entries()].map(([bid, pts]) => ({
                    label: brandName(bid),
                    data: pts.map((p) => (p.er == null ? null : +(p.er * 100).toFixed(2))),
                    borderColor: brandColor(bid),
                    backgroundColor: brandColor(bid),
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.35,
                    spanGaps: true,
                  })),
                }}
                options={baseOpts({
                  scales: {
                    y: { beginAtZero: true, grid: { color: chartColor.line() }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => `${v}%` } },
                  },
                  plugins: {
                    tooltip: {
                      ...baseOpts().plugins.tooltip,
                      callbacks: {
                        title: (items) => `สัปดาห์ ${items[0]?.label ?? ""}`,
                        label: (it) => (it.parsed.y == null ? null : ` ${it.dataset.label} ${it.parsed.y}%`),
                      },
                    },
                  },
                })}
              />
            </>
          )}
        </>
      ))}

      {/* ---------- Pillar ---------- */}
      {activeTab === "pillar" && (pillarRows.length === 0 ? <div className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</div> : (
        <div className="dash-2col">
          <div>
            <div className="dash-subhead">สัดส่วนจำนวนงาน</div>
            <ChartBox
              type="doughnut"
              height={220}
              ariaLabel="สัดส่วนจำนวนงานตาม pillar"
              data={{
                labels: pillarRows.map((r) => PILLAR_LABEL[r.key] ?? r.key),
                datasets: [{
                  data: pillarRows.map((r) => r.n),
                  backgroundColor: pillarRows.map((_, i) => pillarFill(i)),
                  borderWidth: 0,
                  spacing: 2,
                }],
              }}
              options={baseOpts({
                cutout: "60%",
                scales: {},
                plugins: {
                  tooltip: {
                    ...baseOpts().plugins.tooltip,
                    callbacks: { label: (it) => ` ${it.parsed} ชิ้น` },
                  },
                },
              })}
            />
          </div>
          <div>
            <div className="dash-subhead">ER ต่อ pillar</div>
            <ChartBox
              type="bar"
              height={220}
              ariaLabel="ER ต่อ pillar"
              data={{
                labels: pillarRows.map((r) => PILLAR_LABEL[r.key] ?? r.key),
                datasets: [{
                  data: pillarRows.map(erPct),
                  backgroundColor: pillarRows.map((_, i) => pillarFill(i)),
                  borderRadius: 5,
                  maxBarThickness: 48,
                }],
              }}
              options={erBarOpts(pillarRows, (i) => PILLAR_LABEL[pillarRows[i].key] ?? pillarRows[i].key)}
              plugins={teamLine == null ? undefined : [teamLinePlugin(teamLine, `ทีม ${teamLine}%`)]}
            />
          </div>
        </div>
      ))}

      {/* ---------- Channel ---------- */}
      {activeTab === "channel" && (channelRows.length === 0 ? <div className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</div> : (
        <ChartBox
          type="bar"
          height={Math.max(180, channelRows.length * 42)}
          ariaLabel="ER ต่อช่องทาง"
          data={{
            labels: channelRows.map((r) => r.key),
            datasets: [{
              data: channelRows.map(erPct),
              backgroundColor: chartColor.ta(),
              borderRadius: 5,
              maxBarThickness: 22,
            }],
          }}
          options={baseOpts({
            indexAxis: "y",
            layout: { padding: { right: 44 } },
            scales: {
              x: { display: false, grid: { display: false } },
              y: { grid: { display: false }, border: { display: false }, ticks: { color: chartColor.inkSoft(), font: { size: 12, family: "'Noto Sans Thai', sans-serif" } } },
            },
            plugins: {
              tooltip: {
                ...baseOpts().plugins.tooltip,
                callbacks: {
                  title: (items) => items[0]?.label ?? "",
                  label: (it) => {
                    const r = channelRows[it.dataIndex];
                    return ` ER ${fmtPct(r.er)} · งาน ${r.n} ชิ้น`;
                  },
                },
              },
            },
          })}
        />
      ))}

      {/* ---------- ชนิดงาน: ภาพเดี่ยว / ชุดภาพ / คลิป ----------
          ตอบคำถามเดียวที่คนวางแผนถามจริง — ลงแรงทำคลิปแล้วได้ผลต่างจากภาพนิ่งไหม */}
      {activeTab === "kind" && (kindRows.length === 0 ? <div className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</div> : (
        <table className="dash-table">
          <thead>
            <tr><th>ชนิดงาน</th><th>งาน</th><th>Reach</th><th>ER</th><th>Leads</th></tr>
          </thead>
          <tbody>
            {kindRows.map((r) => (
              <tr key={r.key}>
                <td>{KIND_LABEL[r.key] ?? r.key}</td>
                <td className="mono">{r.n}</td>
                <td className="mono">{fmtCompact(r.reach)}</td>
                <td className="mono">{fmtPct(r.er)}</td>
                <td className="mono">{fmtInt(r.leads)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {/* ---------- รายคน ---------- */}
      {activeTab === "owner" && (ownerRows.length === 0 ? <div className="empty-row">ยังไม่มีข้อมูลในช่วงนี้</div> : (
        <table className="dash-table">
          <thead>
            <tr><th>ผู้ดูแล</th><th>งาน</th><th>Reach</th><th>ER</th><th>Leads</th><th>ป้ายผล</th></tr>
          </thead>
          <tbody>
            {ownerRows.map((r) => (
              <tr key={r.key}>
                <td>{profileOf(data, r.key)?.display_name ?? r.key}</td>
                <td className="mono">{r.n}</td>
                <td className="mono">{fmtCompact(r.reach)}</td>
                <td className="mono">{fmtPct(r.er)}</td>
                <td className="mono">{fmtInt(r.leads)}</td>
                <td className="labels">
                  {r.labels.green > 0 && <span className="lb green">{r.labels.green}</span>}
                  {r.labels.yellow > 0 && <span className="lb yellow">{r.labels.yellow}</span>}
                  {r.labels.red > 0 && <span className="lb red">{r.labels.red}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </>
  );
}
