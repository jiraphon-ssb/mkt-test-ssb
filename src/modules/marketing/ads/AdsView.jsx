/* ============================================================
   Ads — หน้า "ค่าแอด" ของโมดูล marketing
   ยกแนวคิดหน้าจอมาจาก ads console (dashboard ads) แต่ประกอบด้วยของแพลตฟอร์มล้วน:
   Panel/Icon ของโมดูล · ธีม zinc/emerald เดิม (หน้านี้เป็นการ์ด/เกจล้วน)
   เลขทุกตัวมาจาก adsOverview.js (pure + มีเทส) — หน้าจอไม่คิดเลขเอง
   หัว: %Ads · ROAS · Spend · Conversions (ตามช่วงเวลา + ตัวกรองช่องทาง)
   ตัวกรองช่องทาง: segmented + คลิกที่ legend โดนัทก็ได้ — กรองทั้งหน้า
   แบรนด์×ช่องทาง: การ์ดเกจงบ "เดือนนี้" ขนาดเท่ากันทุกใบ · ไอคอน+เส้นขอบสีตามแพลตฟอร์มจริง
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsByBrandChannel, adsChannelList, adsCompanyPaceChart, adsCompanySummary, adsSpendShareByBrand, adsDailySeries, adsFunnel, adsKpis, adsMetricBoard, adsSalePipeline, change, filterByChannel, paceGroup, paceStatus, salesPaceStatus } from "../adsOverview.js";
import { ChartBox, ChartLegend } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtCompact, fmtInt, fmtMoney, fmtPct, SERIES } from "../dash/charts/theme.js";
import { Panel } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";
import { PlatformIcon, platformMeta } from "./PlatformIcon.jsx";
import { BrandMark } from "./BrandMark.jsx";
import { AdsWorkspace } from "./AdsWorkspace.jsx";

const PERIODS = [
  { k: "today", label: "วันนี้" },
  { k: "yesterday", label: "เมื่อวาน" },
  { k: "7d", label: "7 วัน" },
  { k: "mtd", label: "เดือนนี้" },
  { k: "lastMonth", label: "เดือนก่อน" },
  { k: "custom", label: "กำหนดเอง" },
];

const isoDay = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const atMidnight = (s) => new Date(`${s}T00:00:00`).toISOString();
const addDaysLocal = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function periodRange(key, from, to, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = day, end = addDaysLocal(day, 1);
  if (key === "yesterday") { start = addDaysLocal(day, -1); end = day; }
  if (key === "7d") start = addDaysLocal(day, -6);
  if (key === "mtd") start = new Date(day.getFullYear(), day.getMonth(), 1);
  if (key === "lastMonth") { start = new Date(day.getFullYear(), day.getMonth() - 1, 1); end = new Date(day.getFullYear(), day.getMonth(), 1); }
  if (key === "custom" && from && to) return { start: atMidnight(from), end: atMidnight(isoDay(addDaysLocal(new Date(`${to}T00:00:00`), 1))) };
  return { start: start.toISOString(), end: end.toISOString() };
}
function sameDatesLastMonth(range) {
  const start = new Date(range.start), end = new Date(range.end);
  start.setMonth(start.getMonth() - 1); end.setMonth(end.getMonth() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);

/* ตัวกรองสถานะจังหวะงบ — มีผลเฉพาะการ์ดแบรนด์×ช่องทาง (จังหวะงบเป็นราย 'เดือน') */
const STATUS_OPTS = [
  { k: "all", label: "ทั้งหมด" },
  { k: "over", label: "เกิน/ใช้เร็ว" },
  { k: "onplan", label: "ตามแผน" },
  { k: "under", label: "ใช้ช้า" },
  { k: "unset", label: "ยังไม่ตั้งงบ" },
];

/* chip ส่วนต่างเทียบช่วงก่อน — กติกาเดียวทั้งหน้า:
   ลูกศร = ทิศทางของตัวเลขจริง (ขึ้น/ลง) · คำและสี = ดี/แย่
   (%Ads ลดลงจึงเป็น ▼ + "ดีขึ้น" — ไม่ใช่ลูกศรขึ้นเพราะ "ดี" ซึ่งอ่านผิดเป็นค่าเพิ่ม) */
function DeltaChip({ d, good, noneText = "เทียบช่วงก่อนไม่ได้" }) {
  if (d == null) return <span className="kpi-delta none">{noneText}</span>;
  return (
    <span className={`kpi-delta ${good ? "up" : "down"}`}>
      <Icon name="chevron" size={11} style={{ transform: d >= 0 ? "rotate(180deg)" : "none" }} />
      {Math.abs(d).toFixed(0)}% {good ? "ดีขึ้น" : "แย่ลง"}
    </span>
  );
}

const GAUGE_TONE = { emerald: "var(--ok)", amber: "var(--warn)", rose: "var(--bad)", zinc: "var(--ink-soft)" };

/* เกจจังหวะทำยอด — สเกล 0–120% ของ "ที่ควรได้วันนี้"
   โซน: <70 ช้ากว่าแผน · 70–95 ใกล้เป้า · >95 ตามแผน · โซนที่เข็มชี้จะเข้มกว่าโซนอื่น */
const PACE_ZONES = [
  { to: 0.70, tone: "rose" },
  { to: 0.95, tone: "amber" },
  { to: 1.20, tone: "emerald" },
];
const PACE_MAX = 1.2;

function PaceGauge({ pct, tone }) {
  const cx = 100, cy = 100, r = 76;
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const active = pct == null ? -1 : PACE_ZONES.findIndex((z) => pct < z.to);
  const activeIdx = active === -1 ? PACE_ZONES.length - 1 : active;
  let from = 0;
  const segs = PACE_ZONES.map((z, i) => {
    const len = ((z.to - from) / PACE_MAX) * 100;
    const offset = -(from / PACE_MAX) * 100;
    from = z.to;
    return { len, offset, tone: z.tone, on: i === activeIdx };
  });
  const clamped = Math.min(PACE_MAX, Math.max(0, pct ?? 0));
  const ang = Math.PI * (1 - clamped / PACE_MAX);
  const nx = cx + Math.cos(ang) * (r - 26), ny = cy - Math.sin(ang) * (r - 26);
  const deg = 90 - (ang * 180) / Math.PI;
  return (
    <svg className="ads-pace-gauge" viewBox="0 0 200 116" role="img"
      aria-label={pct == null ? "ยังประเมินจังหวะทำยอดไม่ได้" : `ทำได้ ${fmtPct(pct, 0)} ของที่ควรได้วันนี้`}>
      {segs.map((sg) => (
        <path key={sg.tone} d={path} className={`ads-pace-zone ads-pace-zone--${sg.tone} ${sg.on ? "on" : ""}`}
          pathLength={100} strokeDasharray={`${sg.len} 100`} strokeDashoffset={sg.offset} />
      ))}
      {pct != null && (
        <polygon className="ads-pace-needle" points="0,-9 7,6 -7,6"
          transform={`translate(${nx} ${ny}) rotate(${deg})`} />
      )}
      <text className={`ads-pace-pct ads-pace-pct--${tone}`} x={cx} y={cy - 6} textAnchor="middle">
        {pct == null ? "—" : `${Math.round(pct * 100)}%`}
      </text>
      <text className="ads-pace-unit" x={cx} y={cy + 10} textAnchor="middle">ของที่ควรได้วันนี้</text>
    </svg>
  );
}

/** ป้ายอธิบายโซนสีของเกจ — สีอย่างเดียวบอกความหมายไม่ได้ (WCAG 1.4.1) */
function PaceZoneKey() {
  return (
    <ul className="ads-zone-key">
      {[
        { tone: "rose", text: `ต่ำกว่า ${Math.round(PACE_ZONES[0].to * 100)}% ช้ากว่าแผน` },
        { tone: "amber", text: `${Math.round(PACE_ZONES[0].to * 100)}–${Math.round(PACE_ZONES[1].to * 100)}% ใกล้เป้า` },
        { tone: "emerald", text: `เกิน ${Math.round(PACE_ZONES[1].to * 100)}% ตามแผน` },
      ].map((z) => (
        <li key={z.tone}><i className={`ads-zone-dot ads-zone-dot--${z.tone}`} />{z.text}</li>
      ))}
    </ul>
  );
}

/* เส้นแนวโน้มคู่ — ทึบ = ช่วงนี้ · ประ = ช่วงเทียบ (สเกลแกน y ร่วมกันเพื่อเทียบระดับได้จริง) */
function TrendSpark({ now, prev }) {
  const pts = (vals) => (vals ?? []).map((v, i) => ({ v, i })).filter((p) => p.v != null && Number.isFinite(p.v));
  const a = pts(now), b = pts(prev);
  if (a.length < 2) return <div className="ads-mspark-none">ข้อมูลยังไม่พอวาดแนวโน้ม</div>;
  const all = [...a, ...b].map((p) => p.v);
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const W = 140, H = 34;
  const path = (ps, n) => ps.map((p, k) =>
    `${k === 0 ? "M" : "L"}${((p.i / Math.max(1, n - 1)) * W).toFixed(1)},${(H - 3 - ((p.v - min) / span) * (H - 6)).toFixed(1)}`).join(" ");
  return (
    <svg className="ads-mspark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {b.length > 1 && <path className="prev" d={path(b, prev.length)} />}
      <path className="now" d={path(a, now.length)} />
    </svg>
  );
}

const fmtMetric = (fmt, v) => {
  if (v == null) return "—";
  if (fmt === "money") return fmtMoney(v);
  if (fmt === "int") return fmtInt(v);
  if (fmt === "compact") return fmtCompact(v);
  if (fmt === "pct2") return fmtPct(v, 2);
  if (fmt === "pct1") return fmtPct(v, 1);
  if (fmt === "roas") return `${v.toFixed(1)}x`;
  if (fmt === "freq") return `${v.toFixed(1)}x`;
  return String(v);
};

/** การ์ดตัวชี้วัดหนึ่งใบ — สรุปไม่ได้ = ขีด พร้อมเหตุผล ไม่ใช่ศูนย์
    ใบที่มีข้อมูลกดได้ → เปิดกราฟรายวันเต็มตัวใต้กริด */
function MetricCard({ m, active, onPick }) {
  const d = change(m.value, m.before);
  const good = m.sense === "neutral" || d == null || d === 0 ? null : (m.sense === "lower" ? d < 0 : d > 0);
  const body = (
    <>
      <div className="ads-mcard-head"><b>{m.label}</b><span>{m.thai}</span></div>
      <div className="ads-mcard-value mono">{fmtMetric(m.fmt, m.value)}</div>
      {m.value == null ? (
        <p className="ads-mcard-reason">{m.reason}</p>
      ) : (
        <>
          <div className="ads-mcard-delta">
            {d == null ? (
              <span className="ads-muted">เทียบช่วงก่อนไม่ได้</span>
            ) : (
              <span className={good == null ? "neutral" : good ? "ads-good" : "ads-over"}>
                {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%{good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}
              </span>
            )}
          </div>
          <TrendSpark now={m.series} prev={m.prevSeries} />
        </>
      )}
    </>
  );
  const clickable = m.value != null && m.series.some((v) => v != null);
  if (!clickable) return <div className="ads-mcard">{body}</div>;
  return (
    <button type="button" className={`ads-mcard ads-mcard--btn ${active ? "active" : ""}`}
      onClick={onPick} aria-pressed={active} aria-label={`ดูกราฟรายวันของ ${m.label}`}>
      {body}
    </button>
  );
}

/* แกน y ของกราฟรายวัน — ย่อให้อ่านไว ส่วนค่าเต็มอยู่ใน tooltip */
const metricTick = (fmt) => (val) =>
  fmt === "pct2" ? `${(val * 100).toFixed(1)}%`
  : fmt === "roas" || fmt === "freq" ? `${Number(val).toFixed(1)}x`
  : fmtCompact(val);

/** ทิศทางดี/แย่ของตัวชี้วัด — neutral = ไม่ตัดสิน (เช่น Reach) */
const metricDelta = (m) => {
  const d = change(m.value, m.before);
  const good = m.sense === "neutral" || d == null || d === 0 ? null : (m.sense === "lower" ? d < 0 : d > 0);
  return { d, good };
};

/* กราฟรายวันของตัวชี้วัดหนึ่งตัว + ตารางสำรอง (charts.csv: canvas ต้องมีตารางอ่านได้) */
function MetricDailyChart({ m, days, compare, onClose, innerRef }) {
  const prevLabel = compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า";
  return (
    <div className="ads-mdetail" ref={innerRef}>
      <div className="ads-mdetail-head">
        <b>{m.label}</b>
        <span className="ads-muted">{m.thai} · รายวัน</span>
        <ChartLegend style={{ margin: 0 }} items={[
          { label: "ช่วงนี้", color: SERIES.blue, line: true },
          { label: prevLabel, color: chartColor.inkFaint(), line: true },
        ]} />
        <button type="button" className="ads-clear" onClick={onClose}>ปิดกราฟ</button>
      </div>
      <ChartBox
        type="line"
        height={220}
        ariaLabel={`กราฟรายวันของ ${m.label}`}
        data={{
          labels: days.map((day) => Number(day.slice(-2))),
          datasets: [
            { label: "ช่วงนี้", data: m.series, borderColor: SERIES.blue,
              backgroundColor: "rgba(111,140,245,.12)", borderWidth: 2, tension: .25,
              pointRadius: 2, spanGaps: false, fill: true },
            { label: "ช่วงเทียบ", data: days.map((_, i) => m.prevSeries[i] ?? null),
              borderColor: chartColor.inkFaint(), borderWidth: 1.5, borderDash: [5, 4],
              tension: .25, pointRadius: 0, spanGaps: false, fill: false },
          ],
        }}
        options={baseOpts({
          scales: {
            y: { grid: { color: chartColor.line(), drawTicks: false }, border: { display: false },
              ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: metricTick(m.fmt) } },
          },
          plugins: { tooltip: { callbacks: {
            title: (items) => `วันที่ ${items[0]?.label}`,
            label: (ctx) => `${ctx.dataset.label} ${ctx.parsed.y == null ? "—" : fmtMetric(m.fmt, ctx.parsed.y)}`,
          } } },
        })}
      />
      <details className="ads-chart-table">
        <summary>ดูเป็นตาราง (เข้าถึงด้วยคีย์บอร์ด)</summary>
        <div className="ads-table-wrap">
          <table className="ads-decision-table">
            <caption className="ads-sr-only">{m.label} รายวัน เทียบกับ{prevLabel}</caption>
            <thead><tr><th scope="col">วันที่</th><th scope="col">ช่วงนี้</th><th scope="col">ช่วงเทียบ</th></tr></thead>
            <tbody>
              {days.map((day, i) => (
                <tr key={day}>
                  <th scope="row">{Number(day.slice(-2))}</th>
                  <td className="mono">{fmtMetric(m.fmt, m.series[i] ?? null)}</td>
                  <td className="mono">{fmtMetric(m.fmt, m.prevSeries[i] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/* ตารางการส่งมอบโฆษณา (แผงแบบใหม่) — ตัวรอง 7 ตัวเรียงเลขตรงคอลัมน์ กดชื่อเปิดกราฟ */
const DELIVERY_KEYS = ["impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm"];
function DeliveryTable({ board, activeKey, onPick }) {
  const rows = DELIVERY_KEYS.map((k) => board.find((m) => m.key === k)).filter(Boolean);
  return (
    <div className="ads-table-wrap">
      <table className="ads-decision-table ads-mb2-table">
        <caption className="ads-sr-only">ตัวชี้วัดการส่งมอบโฆษณาในช่วงที่เลือก</caption>
        <thead>
          <tr><th scope="col">ตัวชี้วัด</th><th scope="col" className="num">ค่า</th><th scope="col">เทียบช่วงก่อน</th><th scope="col">แนวโน้ม</th></tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const { d, good } = metricDelta(m);
            const clickable = m.value != null && m.series.some((x) => x != null);
            const active = activeKey === m.key;
            return (
              <tr key={m.key} className={active ? "active" : ""}>
                <th scope="row">
                  {clickable ? (
                    <button type="button" className="ads-mb2-rowbtn" onClick={() => onPick(m.key)} aria-pressed={active} aria-label={`ดูกราฟรายวันของ ${m.label}`}>
                      <b>{m.label}</b><span>{m.thai}</span>
                    </button>
                  ) : (
                    <span className="ads-mb2-rowbtn ads-mb2-rowbtn--static"><b>{m.label}</b><span>{m.thai}</span></span>
                  )}
                </th>
                <td className="mono num">{fmtMetric(m.fmt, m.value)}</td>
                {m.value == null ? (
                  <td colSpan={2} className="ads-muted">{m.reason}</td>
                ) : (
                  <>
                    <td>
                      {d == null
                        ? <span className="ads-muted">เทียบไม่ได้</span>
                        : <span className={good == null ? "ads-mb2-neutral" : good ? "ads-good" : "ads-over"}>{d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(1)}%{good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}</span>}
                    </td>
                    <td className="ads-mb2-spark"><TrendSpark now={m.series} prev={m.prevSeries} /></td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* กราฟจังหวะเดือน (สะสมจริง + เป้า/งบ + คาดการณ์) — ใช้ร่วมกันทั้งแผงเดิมและแผงใหม่ */
function PaceChart({ pc, view, onClose, innerRef }) {
  const isRev = view === "rev";
          const color = isRev ? SERIES.green : SERIES.orange;
          const actual = isRev ? pc.revCum : pc.spendCum;
          const projd = isRev ? pc.revProj : pc.spendProj;
          const capLine = isRev ? pc.targetLine : pc.budgetLine;
          const capLabel = isRev ? "เป้าตามจังหวะวัน" : "เพดานงบเดือน";
          const datasets = [
            { label: "สะสมจริง", data: actual, borderColor: color, backgroundColor: "transparent",
              borderWidth: 2, tension: .2, pointRadius: 2, spanGaps: false, fill: false },
            { label: "คาดการณ์", data: projd, borderColor: color, borderDash: [3, 4], borderWidth: 1.5,
              tension: 0, pointRadius: 0, spanGaps: false, fill: false },
            ...(capLine ? [{ label: capLabel, data: capLine, borderColor: chartColor.inkFaint(),
              borderDash: [7, 5], borderWidth: 1.5, tension: 0, pointRadius: 0, fill: false }] : []),
          ];
          return (
            <div className="ads-mdetail" ref={innerRef}>
              <div className="ads-mdetail-head">
                <b>{isRev ? "ยอดขายสะสมเทียบเป้า" : "ค่าแอดสะสมเทียบงบ"}</b>
                <span className="ads-muted">เดือนนี้ · รายวัน</span>
                <ChartLegend style={{ margin: 0 }} items={[
                  { label: "สะสมจริง", color, line: true },
                  { label: "คาดการณ์", color, line: true },
                  ...(capLine ? [{ label: capLabel, color: chartColor.inkFaint(), line: true }] : []),
                ]} />
                {!isRev && pc.exhaustDay != null && pc.exhaustDay <= pc.daysInMonth && (
                  <span className="ads-over">แนวโน้มนี้งบหมดราววันที่ {pc.exhaustDay}</span>
                )}
                {capLine == null && <span className="ads-muted">{isRev ? "ยังตั้งเป้าไม่ครบ — ไม่มีเส้นเป้า" : "ยังตั้งงบไม่ครบ — ไม่มีเส้นงบ"}</span>}
                <button type="button" className="ads-clear" onClick={() => onClose()}>ปิดกราฟ</button>
              </div>
              <ChartBox
                type="line"
                height={220}
                ariaLabel={isRev ? "กราฟยอดขายสะสมรายวันเทียบเป้าเดือน" : "กราฟค่าแอดสะสมรายวันเทียบงบเดือน"}
                data={{ labels: pc.days, datasets }}
                options={baseOpts({
                  scales: { y: { grid: { color: chartColor.line(), drawTicks: false }, border: { display: false },
                    ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (val) => fmtCompact(val) } } },
                  plugins: { tooltip: { callbacks: {
                    title: (items) => `วันที่ ${items[0]?.label}`,
                    label: (ctx) => `${ctx.dataset.label} ${ctx.parsed.y == null ? "—" : fmtMoney(ctx.parsed.y)}`,
                  } } },
                })}
              />
              {/* charts.csv: กราฟต้องมีตารางสำรอง อ่านด้วยคีย์บอร์ด/screen reader ได้ */}
              <details className="ads-chart-table">
                <summary>ดูเป็นตาราง (เข้าถึงด้วยคีย์บอร์ด)</summary>
                <div className="ads-table-wrap">
                  <table className="ads-decision-table">
                    <caption className="ads-sr-only">{isRev ? "ยอดขายสะสมรายวันเทียบเป้า" : "ค่าแอดสะสมรายวันเทียบงบ"}</caption>
                    <thead><tr><th scope="col">วันที่</th><th scope="col">สะสมจริง</th><th scope="col">คาดการณ์</th>{capLine && <th scope="col">{capLabel}</th>}</tr></thead>
                    <tbody>
                      {pc.days.map((d, i) => (
                        <tr key={d}>
                          <th scope="row">{d}</th>
                          <td className="mono">{actual[i] == null ? "—" : fmtMoney(actual[i])}</td>
                          <td className="mono">{projd[i] == null ? "—" : fmtMoney(projd[i])}</td>
                          {capLine && <td className="mono">{fmtMoney(capLine[i])}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          );
}

/* Sale pipeline แนวนอน — เอาแค่ตัวเลขหลัก (ชื่อขั้น + จำนวน) + ดีขึ้น/แย่ลงเทียบช่วงก่อน */
function SalePipeline({ items, worstKey = null, row = false, title = true }) {
  return (
    <div className={`ads-pipe ${row ? "ads-pipe--row" : ""}`}>
      {!row && title && <span className="ads-pipe-title">Sale pipeline</span>}
      {items.map((it) => {
        const d = change(it.value, it.before);
        const good = d == null || d === 0 ? null : it.sense === "lower" ? d < 0 : d > 0;
        /* ฐานเล็ก (ต่ำกว่า 10) — % แกว่งแรงจากส่วนต่างไม่กี่หน่วย อย่าให้สีตะโกน */
        const tiny = it.fmt === "int" && (it.value ?? 0) < 10 && (it.before ?? 0) < 10;
        return (
          <div className="ads-pipe-item" key={it.key}>
            <span className="ads-pipe-label">{it.label}</span>
            <b className="mono">{fmtMetric(it.fmt, it.value)}</b>
            <span className="ads-pipe-delta">
              {d == null ? (
                <span className="ads-muted">เทียบไม่ได้</span>
              ) : (
                <span className={tiny || good == null ? "ads-muted" : good ? "ads-good" : "ads-over"}>
                  {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%{good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}{tiny ? " · ฐานเล็ก" : ""}
                </span>
              )}
            </span>
            {/* อัตราแปลงจากขั้นก่อน — ขั้นที่แปลงต่ำสุดคือคอขวดของเส้นทางขาย */}
            {it.conv != null ? (
              <span className={`ads-pipe-conv ${worstKey === it.key ? "ads-pipe-conv--worst" : ""}`}>
                {fmtPct(it.conv, 0)} {worstKey === it.key ? "· หล่นแรงสุด" : "จากขั้นก่อน"}
              </span>
            ) : it.convPlaceholder ? (
              <span className="ads-pipe-conv">{it.convPlaceholder}</span>
            ) : null}
            {it.sub && <span className="ads-pipe-sub">{it.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** ข้อความคาดการณ์สิ้นเดือน — run-rate เชิงเส้น */
function forecastNote(pace) {
  if (pace.forecastOver == null) return `คาดสิ้นเดือน ${fmtMoney(pace.forecast)}`;
  if (pace.forecastOver > 0) return `คาดเกินงบ ${fmtMoney(pace.forecastOver)}`;
  return `คาดพอดีงบ · เหลือ ${fmtMoney(-pace.forecastOver)}`;
}

/** เส้นจิ๋วบอกทิศทางย้อนหลังในเดือน — ค่า null คือวันที่คำนวณไม่ได้ ข้ามไปไม่ลากเส้นผ่าน */
function Sparkline({ values, tone = "zinc", lower = false, word = true }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return <span className="ads-spark-none">ข้อมูลยังไม่พอวาดแนวโน้ม</span>;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const W = 92, H = 22;
  const x = (i) => (i / Math.max(1, values.length - 1)) * W;
  const y = (v) => H - 2 - ((v - min) / span) * (H - 4);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const first = vs[0], last = vs[vs.length - 1];
  const better = lower ? last < first : last > first;
  return (
    <span className="ads-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke={GAUGE_TONE[tone]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <circle cx={x(pts[pts.length - 1].i)} cy={y(last)} r="1.8" fill={GAUGE_TONE[tone]} />
      </svg>
      {word && <b className={better ? "ads-good" : "ads-over"}>{better ? "ดีขึ้น" : "แย่ลง"}</b>}
    </span>
  );
}

/** การ์ดช่องทาง — ขนาดเท่ากันทุกใบ · ไอคอน+เส้นขอบสีตามแพลตฟอร์ม · เกจ/ป้าย = สีสถานะ */
function ChannelCard({ c }) {
  const st = paceStatus(c.pace);
  const meta = platformMeta(c.key);
  const [openDetail, setOpenDetail] = useState(false);
  const d = c.delivery;
  return (
    <div className="ads-chan-card" style={{ borderTopColor: meta.color }}>
      <div className="ads-chan-head">
        <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        <span className={`ads-badge ads-badge--${st.tone}`}>{st.text}</span>
      </div>
      {/* ชั้นนี้ตอบคำถามเดียว: เงินที่จ่ายไปคุ้มไหม — ยอดขาย/เป้าอยู่ชั้นแบรนด์ ไม่ซ้ำกัน
          ใช้ Bullet chart ตาม charts.csv (Performance vs Target แบบ compact: หลาย KPI เรียงกัน
          ในที่แคบ) — เกจสงวนไว้ให้การ์ดแบรนด์ซึ่งเป็น "KPI เดี่ยวที่ต้องเน้น" */}
      <div className="ads-chan-main">
        <div className="ads-chan-top">
          <span className="ads-chan-spend mono">
            ค่าแอด <b>{fmtMoney(c.spend)}</b>
            <span className="ads-muted"> จากงบ {c.budget != null ? fmtMoney(c.budget) : "ยังไม่ตั้งงบ"}</span>
          </span>
          <span className="ads-chan-pct mono">
            <span className="ads-chan-pctads">%Ads <b>{c.pctAds != null ? fmtPct(c.pctAds, 1) : "—"}</b></span>
            {c.pace.used != null && <> · {Math.round(c.pace.used * 100)}% ของงบ</>}
          </span>
        </div>

        {c.budget != null ? (
          <div className="ads-bullet" role="img"
            aria-label={`ใช้ไป ${fmtMoney(c.spend)} จากงบ ${fmtMoney(c.budget)} · ควรใช้ ${fmtMoney(c.pace.expectedSpend)} ณ วันนี้`}>
            {/* ช่วงคุณภาพ: ก่อนขีด = ยังตามจังหวะ · หลังขีด = เร็วกว่าจังหวะ (มีคำกำกับใต้แถบ) */}
            <span className="ads-bullet-range ads-bullet-range--ok" style={{ width: `${Math.round(c.pace.expected * 100)}%` }} />
            <span className="ads-bullet-range ads-bullet-range--warn" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
            <i className="ads-bullet-fill" style={{ width: `${Math.min(100, Math.round(c.pace.used * 100))}%`, background: GAUGE_TONE[st.tone] }} />
            <span className="ads-bullet-marker" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
          </div>
        ) : (
          <div className="empty-row">ยังไม่ตั้งงบช่องทางนี้ — เทียบจังหวะไม่ได้</div>
        )}

        {/* บรรทัดเอก: สรุปให้เลยว่าเร็ว/ช้ากว่าจังหวะกี่บาท คนอ่านไม่ต้องลบเลขเอง */}
        {c.pace.vsPace != null && (
          <p className="ads-chan-verdict">
            <b className={c.pace.vsPace > 0 ? "ads-over" : "ads-good"}>
              {c.pace.vsPace > 0
                ? <>ใช้เร็วกว่าจังหวะ {fmtMoney(c.pace.vsPace)}</>
                : <>ใช้ช้ากว่าจังหวะ {fmtMoney(-c.pace.vsPace)}</>}
            </b>
            <span className="ads-muted"> · ควรใช้ตอนนี้ {fmtMoney(c.pace.expectedSpend)} · {forecastNote(c.pace)}</span>
          </p>
        )}

        <p className="ads-chan-support ads-muted">
          เหลือ {c.pace.remaining != null ? fmtMoney(Math.abs(c.pace.remaining)) : "—"}
          {c.pace.remaining != null && c.pace.remaining < 0 ? " (เกินงบ)" : ""} ·
          เฉลี่ย/วัน {fmtMoney(c.pace.average)} · ผ่านไป {fmtPct(c.pace.expected, 0)} ของเดือน เหลือ {c.pace.daysLeft} วัน
        </p>
      </div>

      {/* พับเดียว เปิดทีเดียวเห็นหมด — เดิมแยกสองปุ่ม แต่ละฝั่งได้ความกว้างครึ่งเดียว
          เนื้อหาเลยอัดเป็นคอลัมน์เดียวจนอ่านไม่ออกในการ์ดแคบ */}
      <div className="ads-detail">
        <button type="button" className="ads-detail-toggle" onClick={() => setOpenDetail((o) => !o)} aria-expanded={openDetail}>
          <Icon name="chevron" size={12} />
          {openDetail ? "ซ่อนรายละเอียด" : `ดูรายละเอียด · 6 ตัวชี้วัด${c.campaigns.length ? ` · ${c.campaigns.length} แคมเปญ` : ""}`}
        </button>

        {openDetail && (
          <div className="ads-detail-body">
            <dl className="ads-metrics">
              <div><dt>ROAS</dt><dd className="mono">{fmtRoas(c.roas)}</dd></div>
              <div><dt>CPL</dt><dd className="mono">{c.cpl != null ? fmtMoney(c.cpl) : "—"}</dd></div>
              <div><dt>CTR</dt><dd className="mono">{d.ctr != null ? fmtPct(d.ctr, 2) : "—"}</dd></div>
              <div><dt>CPC</dt><dd className="mono">{d.cpc != null ? fmtMoney(d.cpc) : "—"}</dd></div>
              <div><dt>CPM</dt><dd className="mono">{d.cpm != null ? fmtMoney(d.cpm) : "—"}</dd></div>
              <div><dt>ความถี่</dt><dd className="mono">{d.frequency != null ? `${d.frequency.toFixed(1)}x` : "—"}</dd></div>
            </dl>

            <div className="ads-chan-spark">
              <span className="ads-muted">CPL ในเดือน</span>
              <Sparkline values={c.cplSeries} tone={st.tone} lower />
            </div>

            {c.campaigns.length > 0 && (
              <div className="ads-camp-list">
                <h4>แคมเปญ {c.campaigns.length} ชุด</h4>
                {/* ลิสต์แทนตาราง — การ์ดกว้างราว 330px ตารางสี่คอลัมน์จะตัดคำจนอ่านยาก */}
                <ul>
                  {c.campaigns.map((cp) => (
                    <li key={cp.name}>
                      <span className="ads-camp-name">{cp.name}</span>
                      <span className="ads-camp-nums mono">
                        {fmtMoney(cp.spend)}
                        <span className="ads-muted"> · CPL {cp.cpl != null ? fmtMoney(cp.cpl) : "—"} · ROAS {fmtRoas(cp.roas)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* แถวแบรนด์ — "แถบตัวเลข + 3 ช่องเท่ากัน"
   แถบบน = ตัวเลขหัว 3 ตัว ตรงคอลัมน์กันทุกแบรนด์ (เทียบข้ามแบรนด์ได้ด้วยตา)
   ช่องล่าง = รูปทรง/รายละเอียด: เป้า+เกจ · pipeline · แพลตฟอร์ม — เต็มความกว้างเสมอ
   ค่าแอด/งบ อยู่ที่การ์ดแพลตฟอร์มเท่านั้น (ไม่ทวนบนแถบ) */
function BrandRow({ b, pipeline }) {
  const rst = salesPaceStatus(b.revPace.pctOfExpected);
  const roasItem = pipeline?.items.find((i) => i.key === "roas");
  const roasD = change(roasItem?.value, roasItem?.before);
  return (
    <div className="ads-b2" id={`ads-brand-${b.id}`}>
      {/* หัวแบรนด์บรรทัดเดียว แล้วตัวเลข 3 ตัวใช้กริด 3 คอลัมน์เดียวกับช่องล่าง — เส้นตั้งตรงกันทั้งแถว */}
      <div className="ads-b2-head">
        <BrandMark brand={b} />
        <h3>{b.name}</h3>
        <span className={`ads-badge ads-badge--${rst.tone}`}>{rst.text}</span>
      </div>
      <div className="ads-b2-strip ads-b2-strip--3">
        <div className="ads-b2-stat">
          <span className="ads-b2-k">ยอดขายเดือนนี้</span>
          <span className="ads-b2-v mono">{fmtMoney(b.revenue)}</span>
          <span className="ads-b2-d"><DeltaChip d={b.revChangePct} good={(b.revChangePct ?? 0) >= 0} noneText="เทียบเดือนก่อนไม่ได้" /><span className="kpi-hint">เทียบเดือนก่อน</span></span>
        </div>
        <div className="ads-b2-stat">
          <span className="ads-b2-k">คาดปิดเดือน</span>
          <span className="ads-b2-v mono">{b.revPace.forecast != null ? fmtMoney(b.revPace.forecast) : "—"}</span>
          <span className="ads-b2-d">
            {b.revPace.forecastVsTarget == null
              ? <span className="kpi-hint">ยังไม่ตั้งเป้า</span>
              : b.revPace.forecastVsTarget >= 0
                ? <span className="ads-good">เกินเป้า {fmtMoney(b.revPace.forecastVsTarget)}</span>
                : <span className="ads-over">ขาดเป้า {fmtMoney(-b.revPace.forecastVsTarget)}</span>}
          </span>
        </div>
        {/* คอลัมน์ 3: ROAS คู่ %Ads (สองด้านของเรื่องเดียวกัน: ยอดขาย÷ค่าแอด · ค่าแอด÷ยอดขาย) */}
        <div className="ads-b2-pair">
          <div className="ads-b2-stat">
            <span className="ads-b2-k">ROAS</span>
            <span className="ads-b2-v mono">{roasItem?.value != null ? fmtRoas(roasItem.value) : "—"}</span>
            <span className="ads-b2-d"><DeltaChip d={roasD} good={roasD != null && roasD > 0} /><Sparkline values={b.roasSeries} tone={rst.tone} word={false} /></span>
          </div>
          <div className="ads-b2-stat">
            <span className="ads-b2-k">%Ads <span className="ads-sum-tag">เดือนนี้</span></span>
            <span className="ads-b2-v mono">{b.pctAds != null ? fmtPct(b.pctAds, 1) : "—"}</span>
            <span className="ads-b2-d"><span className="kpi-hint">ค่าแอด ÷ ยอดขาย · ยิ่งต่ำยิ่งดี</span></span>
          </div>
        </div>
      </div>

      <div className="ads-b2-panes">
        <section className="ads-b2-pane" aria-label={`${b.name} — ยอดขายเทียบเป้า`}>
          <h4>ยอดขายเทียบเป้า <span className="ads-sum-tag">เดือนนี้</span></h4>
          <div className="ads-brand-bar" role="img"
            aria-label={`ทำได้ ${b.revPct != null ? fmtPct(b.revPct, 0) : "—"} ของเป้าเดือน · ควรถึง ${fmtPct(b.pace.expected, 0)} แล้ว`}>
            <i style={{ width: `${Math.min(100, Math.round((b.revPct ?? 0) * 100))}%`, background: GAUGE_TONE[rst.tone] }} />
            <span className="ads-brand-bar-tick" style={{ left: `${Math.round(b.pace.expected * 100)}%` }} />
          </div>
          <div className="ads-brand-sub">
            ทำได้ {b.revPct != null ? fmtPct(b.revPct, 0) : "—"} ของเป้า {b.revTarget != null ? fmtMoney(b.revTarget) : "—"}
            {b.revPace.expectedToDate != null && <> · ควรได้ตอนนี้ {fmtMoney(b.revPace.expectedToDate)}</>}
          </div>
          <div className="ads-b2-gauge">
            <PaceGauge pct={b.revPace.pctOfExpected} tone={rst.tone} />
            {b.revPace.behind != null && (
              <div className="ads-brand-gap">
                {b.revPace.behind > 0
                  ? <>ยังขาดอีก {fmtMoney(b.revPace.behind)} ถึงจะตามแผน</>
                  : <>นำแผนอยู่ {fmtMoney(-b.revPace.behind)}</>}
              </div>
            )}
          </div>
        </section>

        <section className="ads-b2-pane" aria-label={`${b.name} — Sale pipeline`}>
          <h4>Sale pipeline <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
          <SalePipeline row items={(pipeline?.items ?? []).slice(0, 4)} worstKey={pipeline?.worstKey ?? null} />
        </section>

        <section className="ads-b2-pane ads-b2-pane--ads" aria-label={`${b.name} — ค่าแอดตามแพลตฟอร์ม`}>
          <h4>ค่าแอดตามแพลตฟอร์ม <span className="ads-sum-tag">เดือนนี้</span></h4>
          <div className="ads-chan-cards">
            {b.channels.length === 0 ? <div className="empty-row">ไม่มีค่าแอดในช่องทางที่เลือก</div> : b.channels.map((c) => <ChannelCard key={c.key} c={c} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ══ แถวแบรนด์แบบใหม่ "Ledger" (แผงทดลองไว้เทียบ) ══
   หัวแถว 1 บรรทัดโครงเดียวทุกแบรนด์ · ซ้าย = จังหวะเดือน · ขวา = แพลตฟอร์มเป็น "ตาราง" (1 แถว/แพลตฟอร์ม กดขยาย)
   · ล่าง = Sale pipeline 4 ช่องแถวเดียว — ค่าทุกตัวของแบบเดิมยังอยู่ครบ แค่ย้ายที่ */
function LedgerPlatformRow({ c, open, onToggle }) {
  const st = paceStatus(c.pace);
  const meta = platformMeta(c.key);
  const d = c.delivery;
  return (
    <>
      <tr className={`ads-lg-row ${open ? "open" : ""}`}>
        <th scope="row" style={{ boxShadow: `inset 3px 0 0 ${meta.color}` }}>
          <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        </th>
        <td className="ads-lg-spend">
          <span className="mono"><b>{fmtMoney(c.spend)}</b><span className="ads-muted"> / {c.budget != null ? fmtMoney(c.budget) : "ยังไม่ตั้งงบ"}</span></span>
          {c.budget != null ? (
            <span className="ads-lg-bullet-wrap">
              <span className="ads-bullet ads-lg-bullet" role="img" aria-label={`ใช้ไป ${fmtPct(c.pace.used, 0)} ของงบ · ควรใช้ ${fmtPct(c.pace.expected, 0)} ณ วันนี้`}>
                <span className="ads-bullet-range ads-bullet-range--ok" style={{ width: `${Math.round(c.pace.expected * 100)}%` }} />
                <span className="ads-bullet-range ads-bullet-range--warn" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
                <i className="ads-bullet-fill" style={{ width: `${Math.min(100, Math.round(c.pace.used * 100))}%`, background: GAUGE_TONE[st.tone] }} />
                <span className="ads-bullet-marker" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
              </span>
              <span className="mono ads-muted">{Math.round(c.pace.used * 100)}%</span>
            </span>
          ) : <span className="ads-muted">เทียบจังหวะไม่ได้</span>}
        </td>
        <td className="mono num">{c.pctAds != null ? fmtPct(c.pctAds, 1) : "—"}</td>
        <td className="mono num">{fmtRoas(c.roas)}</td>
        <td className="ads-lg-pace">
          <span className={`ads-badge ads-badge--${st.tone}`}>{st.text}</span>
          {c.pace.vsPace != null && (
            <span className={c.pace.vsPace > 0 ? "ads-over" : "ads-good"}>
              {c.pace.vsPace > 0 ? `เร็วกว่าจังหวะ ${fmtMoney(c.pace.vsPace)}` : `ช้ากว่าจังหวะ ${fmtMoney(-c.pace.vsPace)}`}
            </span>
          )}
        </td>
        <td className="ads-lg-more">
          <button type="button" className="ads-lg-expand" onClick={onToggle} aria-expanded={open}
            aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด ${c.key}`}>
            <Icon name="chevron" size={12} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="ads-lg-detail">
          <td colSpan={6}>
            <div className="ads-lg-detail-grid">
              <div>
                <h5>คาดการณ์เดือนนี้</h5>
                {c.pace.expectedSpend != null ? (
                  <ul className="ads-lg-facts">
                    <li>ควรใช้ตอนนี้ <b className="mono">{fmtMoney(c.pace.expectedSpend)}</b></li>
                    <li>{forecastNote(c.pace)}</li>
                    <li>เหลือ <b className="mono">{fmtMoney(Math.abs(c.pace.remaining))}</b>{c.pace.remaining < 0 ? " (เกินงบ)" : ""}</li>
                    <li>เฉลี่ย/วัน <b className="mono">{fmtMoney(c.pace.average)}</b></li>
                    <li>ผ่านไป {fmtPct(c.pace.expected, 0)} ของเดือน · เหลือ {c.pace.daysLeft} วัน</li>
                  </ul>
                ) : <p className="ads-muted">ยังไม่ตั้งงบช่องทางนี้ — จัดสรรอัตโนมัติ</p>}
              </div>
              <div>
                <h5>ตัวชี้วัด</h5>
                <dl className="ads-metrics ads-lg-metrics">
                  <div><dt>CPL</dt><dd className="mono">{c.cpl != null ? fmtMoney(c.cpl) : "—"}</dd></div>
                  <div><dt>CTR</dt><dd className="mono">{d.ctr != null ? fmtPct(d.ctr, 2) : "—"}</dd></div>
                  <div><dt>CPC</dt><dd className="mono">{d.cpc != null ? fmtMoney(d.cpc) : "—"}</dd></div>
                  <div><dt>CPM</dt><dd className="mono">{d.cpm != null ? fmtMoney(d.cpm) : "—"}</dd></div>
                  <div><dt>ความถี่</dt><dd className="mono">{d.frequency != null ? `${d.frequency.toFixed(1)}x` : "—"}</dd></div>
                </dl>
                <div className="ads-chan-spark"><span className="ads-muted">CPL ในเดือน</span><Sparkline values={c.cplSeries} tone={st.tone} lower /></div>
              </div>
              <div>
                <h5>แคมเปญ {c.campaigns.length} ชุด</h5>
                {c.campaigns.length === 0 ? <p className="ads-muted">ยังไม่มีแคมเปญย่อย</p> : (
                  <ul className="ads-lg-camps">
                    {c.campaigns.map((cp) => (
                      <li key={cp.name}><span>{cp.name}</span><span className="mono">{fmtMoney(cp.spend)}<span className="ads-muted"> · CPL {cp.cpl != null ? fmtMoney(cp.cpl) : "—"} · ROAS {fmtRoas(cp.roas)}</span></span></li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function BrandRowLedger({ b, pipeline }) {
  const rst = salesPaceStatus(b.revPace.pctOfExpected);
  const bst = paceStatus(b.pace);
  const roasItem = pipeline?.items.find((i) => i.key === "roas");
  const roasD = change(roasItem?.value, roasItem?.before);
  const [openKey, setOpenKey] = useState(null);
  return (
    <div className="ads-lg" id={`ads-brand2-${b.id}`}>
      {/* หัวแถว: โครงเดียวทุกแบรนด์ — ช่องเท่ากัน คั่นเส้นบาง */}
      <div className="ads-lg-head">
        <div className="ads-lg-id">
          <BrandMark brand={b} />
          <div><h3>{b.name}</h3><span className={`ads-badge ads-badge--${rst.tone}`}>{rst.text}</span></div>
        </div>
        <div className="ads-lg-stat">
          <span className="ads-b2-k">ยอดขายเดือนนี้</span>
          <span className="ads-b2-v mono">{fmtMoney(b.revenue)}</span>
          <span className="ads-b2-d"><DeltaChip d={b.revChangePct} good={(b.revChangePct ?? 0) >= 0} noneText="เทียบเดือนก่อนไม่ได้" /><span className="kpi-hint">เทียบเดือนก่อน</span></span>
        </div>
        <div className="ads-lg-stat">
          <span className="ads-b2-k">คาดปิดเดือน</span>
          <span className="ads-b2-v mono">{b.revPace.forecast != null ? fmtMoney(b.revPace.forecast) : "—"}</span>
          <span className="ads-b2-d">
            {b.revPace.forecastVsTarget == null ? <span className="kpi-hint">ยังไม่ตั้งเป้า</span>
              : b.revPace.forecastVsTarget >= 0 ? <span className="ads-good">เกินเป้า {fmtMoney(b.revPace.forecastVsTarget)}</span>
              : <span className="ads-over">ขาดเป้า {fmtMoney(-b.revPace.forecastVsTarget)}</span>}
          </span>
        </div>
        <div className="ads-lg-stat">
          <span className="ads-b2-k">ค่าแอดรวม / งบรวม</span>
          <span className="ads-b2-v mono">{fmtMoney(b.spend)}<span className="ads-top2-cap"> / {b.budget != null ? fmtMoney(b.budget) : "—"}</span></span>
          <span className="ads-b2-d">
            {b.budget == null ? <span className="kpi-hint">ยังตั้งงบไม่ครบทุกแพลตฟอร์ม</span>
              : <span className={`ads-badge ads-badge--${bst.tone}`}>{bst.text}{b.pace.vsPace != null && Math.abs(b.pace.vsPace) >= 1 ? ` ${fmtMoney(Math.abs(b.pace.vsPace))}` : ""}</span>}
          </span>
        </div>
        <div className="ads-lg-stat">
          <span className="ads-b2-k">ROAS</span>
          <span className="ads-b2-v mono">{roasItem?.value != null ? fmtRoas(roasItem.value) : "—"}</span>
          <span className="ads-b2-d"><DeltaChip d={roasD} good={roasD != null && roasD > 0} /><Sparkline values={b.roasSeries} tone={rst.tone} word={false} /></span>
        </div>
        <div className="ads-lg-stat">
          <span className="ads-b2-k">%Ads</span>
          <span className="ads-b2-v mono">{b.pctAds != null ? fmtPct(b.pctAds, 1) : "—"}</span>
          <span className="ads-b2-d"><span className="kpi-hint">ค่าแอด ÷ ยอดขาย</span></span>
        </div>
      </div>

      <div className="ads-lg-body">
        <section className="ads-lg-pane" aria-label={`${b.name} — จังหวะเดือน`}>
          <h4>จังหวะเดือน <span className="ads-sum-tag">เดือนนี้</span></h4>
          <div className="ads-top2-bullet-head"><span>ยอดขาย vs เป้า</span><span className="ads-top2-sep" aria-hidden="true">·</span><b className="mono">{b.revPct != null ? fmtPct(b.revPct, 0) : "—"}</b></div>
          <div className="ads-brand-bar" role="img"
            aria-label={`ทำได้ ${b.revPct != null ? fmtPct(b.revPct, 0) : "—"} ของเป้าเดือน · ควรถึง ${fmtPct(b.pace.expected, 0)} แล้ว`}>
            <i style={{ width: `${Math.min(100, Math.round((b.revPct ?? 0) * 100))}%`, background: GAUGE_TONE[rst.tone] }} />
            <span className="ads-brand-bar-tick" style={{ left: `${Math.round(b.pace.expected * 100)}%` }} />
          </div>
          <p className="ads-brand-sub">
            ทำได้ {b.revPct != null ? fmtPct(b.revPct, 0) : "—"} ของเป้า {b.revTarget != null ? fmtMoney(b.revTarget) : "—"}
            {b.revPace.expectedToDate != null && <> · ควรได้ตอนนี้ {fmtMoney(b.revPace.expectedToDate)}</>}
          </p>
          <div className="ads-lg-gauge">
            <PaceGauge pct={b.revPace.pctOfExpected} tone={rst.tone} />
            {b.revPace.behind != null && (
              <p className="ads-brand-gap">{b.revPace.behind > 0 ? <>ยังขาดอีก {fmtMoney(b.revPace.behind)} ถึงจะตามแผน</> : <>นำแผนอยู่ {fmtMoney(-b.revPace.behind)}</>}</p>
            )}
          </div>
        </section>

        <section className="ads-lg-pane" aria-label={`${b.name} — ค่าแอดตามแพลตฟอร์ม`}>
          <h4>ค่าแอดตามแพลตฟอร์ม <span className="ads-sum-tag">เดือนนี้</span></h4>
          {b.channels.length === 0 ? <div className="empty-row">ไม่มีค่าแอดในช่องทางที่เลือก</div> : (
            <div className="ads-table-wrap">
              <table className="ads-decision-table ads-lg-table">
                <caption className="ads-sr-only">ค่าแอดเทียบงบรายแพลตฟอร์มของ {b.name}</caption>
                <thead><tr>
                  <th scope="col">แพลตฟอร์ม</th><th scope="col">ค่าแอด / งบ</th><th scope="col" className="num">%Ads</th><th scope="col" className="num">ROAS</th><th scope="col">จังหวะงบ</th><th scope="col"><span className="ads-sr-only">รายละเอียด</span></th>
                </tr></thead>
                <tbody>
                  {b.channels.map((c) => <LedgerPlatformRow key={c.key} c={c} open={openKey === c.key} onToggle={() => setOpenKey((k) => (k === c.key ? null : c.key))} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <div className="ads-lg-pipe">
        <h4>Sale pipeline <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
        <SalePipeline row items={(pipeline?.items ?? []).slice(0, 4)} worstKey={pipeline?.worstKey ?? null} />
      </div>
    </div>
  );
}

/* ══ แถวแบรนด์แบบที่ 3 "Decision-first" (แผงทดลองไว้เทียบ) ══
   ชั้นแรกตอบ 3 เรื่อง: ผลลัพธ์ตามเป้าหรือไม่ · เงินเดินเร็วไปไหม · จุดหลุดอยู่ตรงไหน
   รายละเอียดแพลตฟอร์ม/ตัวชี้วัด/แคมเปญเดิมอยู่ในส่วนขยาย ไม่ตัดข้อมูลทิ้ง */
function brandDecision(b, pipeline) {
  const rst = salesPaceStatus(b.revPace.pctOfExpected);
  const unset = b.channels.find((c) => c.budget == null);
  const fast = [...b.channels]
    .filter((c) => c.pace.vsPace != null && c.pace.vsPace > 0)
    .sort((a, z) => z.pace.vsPace - a.pace.vsPace)[0];
  const worst = pipeline?.items.find((i) => i.key === pipeline?.worstKey);
  if (b.revTarget == null || b.budget == null || unset) {
    const what = b.revTarget == null ? "เป้ายอดขาย" : b.budget == null ? "งบรวม" : `งบ ${unset.key}`;
    return { tone: "zinc", label: "ข้อมูลยังไม่ครบ", text: `ยังไม่มี${what} จึงประเมินแผนของแบรนด์นี้ได้ไม่ครบ`, focus: unset ?? b.channels[0] ?? null };
  }
  if (b.revPace.forecastVsTarget != null && b.revPace.forecastVsTarget < 0) {
    const extra = fast ? ` · ${fast.key} ใช้งบเร็วกว่าจังหวะ ${fmtMoney(fast.pace.vsPace)}` : "";
    return { tone: "rose", label: "ต้องเร่งยอด", text: `คาดปิดเดือนต่ำกว่าเป้า ${fmtMoney(-b.revPace.forecastVsTarget)}${extra}`, focus: fast ?? b.channels[0] ?? null };
  }
  if (fast) {
    return { tone: "amber", label: "ใช้งบเร็ว", text: `${fast.key} ใช้งบเร็วกว่าจังหวะ ${fmtMoney(fast.pace.vsPace)} ควรตรวจผลลัพธ์ก่อนเพิ่มงบ`, focus: fast };
  }
  if (worst?.conv != null) {
    return { tone: rst.tone, label: rst.text, text: `ยอดขายยังเดินตามแผน · จุดหลุดสูงสุดอยู่ที่ ${worst.label} เหลือ ${fmtPct(worst.conv, 0)} จากขั้นก่อน`, focus: b.channels[0] ?? null };
  }
  return { tone: rst.tone, label: rst.text, text: "ยอดขายและจังหวะใช้เงินยังอยู่ในกรอบแผน", focus: b.channels[0] ?? null };
}

function DecisionPace({ label, actual, expected, actualText, expectedText, tone }) {
  const width = actual == null ? 0 : Math.min(100, Math.max(0, actual * 100));
  const marker = expected == null ? null : Math.min(100, Math.max(0, expected * 100));
  return (
    <div className="ads-dc-pace">
      <div className="ads-dc-pace-head"><b>{label}</b><span className="mono">{actualText}</span></div>
      <div className="ads-brand-bar" role="img" aria-label={`${label} ${actualText} · ควรถึง ${expectedText}`}>
        <i style={{ width: `${width}%`, background: GAUGE_TONE[tone] }} />
        {marker != null && <span className="ads-brand-bar-tick" style={{ left: `${marker}%` }} />}
      </div>
      <div className="ads-dc-pace-note"><span>ทำได้ {actualText}</span><span>ควรถึงวันนี้ {expectedText}</span></div>
    </div>
  );
}

function BrandRowDecision({ b, pipeline }) {
  const [expanded, setExpanded] = useState(false);
  const [openKey, setOpenKey] = useState(null);
  const decision = brandDecision(b, pipeline);
  const rst = salesPaceStatus(b.revPace.pctOfExpected);
  const bst = paceStatus(b.pace);
  const roasItem = pipeline?.items.find((i) => i.key === "roas");
  const roasD = change(roasItem?.value, roasItem?.before);
  const stages = (pipeline?.items ?? []).slice(0, 4);
  const focus = decision.focus;
  const focusStatus = focus ? paceStatus(focus.pace) : null;
  return (
    <article className={`ads-dc ads-dc--${decision.tone}`} id={`ads-brand3-${b.id}`}>
      <header className="ads-dc-head">
        <div className="ads-dc-identity"><BrandMark brand={b} /><h3>{b.name}</h3><span className={`ads-badge ads-badge--${decision.tone}`}>{decision.label}</span></div>
        <p className="ads-dc-verdict">{decision.text}</p>
        <button type="button" className="ads-dc-toggle" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
          {expanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียดทั้งหมด"}<Icon name="chevron" size={12} />
        </button>
      </header>

      <div className="ads-dc-kpis">
        <div className="ads-dc-kpi"><span>ยอดขาย / เป้าเดือน</span><b className="mono">{fmtMoney(b.revenue)} <small>/ {b.revTarget != null ? fmtMoney(b.revTarget) : "—"}</small></b><span>{b.revPct != null ? `${fmtPct(b.revPct, 0)} ของเป้า` : "ยังไม่ตั้งเป้า"} · <DeltaChip d={b.revChangePct} good={(b.revChangePct ?? 0) >= 0} noneText="เทียบไม่ได้" /></span></div>
        <div className="ads-dc-kpi"><span>คาดปิดเดือน</span><b className="mono">{b.revPace.forecast != null ? fmtMoney(b.revPace.forecast) : "—"}</b><span>{b.revPace.forecastVsTarget == null ? "ประเมินเทียบเป้าไม่ได้" : b.revPace.forecastVsTarget >= 0 ? <span className="ads-good">เกินเป้า {fmtMoney(b.revPace.forecastVsTarget)}</span> : <span className="ads-over">ขาดเป้า {fmtMoney(-b.revPace.forecastVsTarget)}</span>}</span></div>
        <div className="ads-dc-kpi"><span>ค่าแอด / งบเดือน</span><b className="mono">{fmtMoney(b.spend)} <small>/ {b.budget != null ? fmtMoney(b.budget) : "—"}</small></b><span>{b.budget == null ? "ยังตั้งงบไม่ครบ" : <span className={`ads-badge ads-badge--${bst.tone}`}>{bst.text}</span>}</span></div>
        <div className="ads-dc-kpi ads-dc-kpi--pair"><div><span>ROAS</span><b className="mono">{roasItem?.value != null ? fmtRoas(roasItem.value) : "—"}</b><DeltaChip d={roasD} good={roasD != null && roasD > 0} /></div><div><span>%Ads</span><b className="mono">{b.pctAds != null ? fmtPct(b.pctAds, 1) : "—"}</b><small>ค่าแอด ÷ ยอดขาย</small></div></div>
      </div>

      <div className="ads-dc-core">
        <section className="ads-dc-paces" aria-label={`${b.name} — จังหวะยอดขายและงบ`}>
          <h4>จังหวะเดือน <span className="ads-sum-tag">เดือนปัจจุบัน</span></h4>
          <DecisionPace label="ยอดขาย" actual={b.revPct} expected={b.pace.expected} actualText={b.revPct != null ? fmtPct(b.revPct, 0) : "—"} expectedText={fmtPct(b.pace.expected, 0)} tone={rst.tone} />
          <DecisionPace label="ค่าแอด" actual={b.pace.used} expected={b.pace.expected} actualText={b.pace.used != null ? fmtPct(b.pace.used, 0) : "—"} expectedText={fmtPct(b.pace.expected, 0)} tone={bst.tone} />
        </section>

        <section className="ads-dc-pipeline" aria-label={`${b.name} — Sale pipeline`}>
          <h4>Sale pipeline <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
          <div className="ads-dc-stages">
            {stages.map((it, i) => (
              <div key={it.key} className={pipeline?.worstKey === it.key ? "is-worst" : ""}>
                <span>{it.label}</span><b className="mono">{fmtMetric(it.fmt, it.value)}</b>
                <small>{i === 0 ? "ฐานเริ่มต้น" : it.conv != null ? `${fmtPct(it.conv, 0)} จากขั้นก่อน` : "เทียบไม่ได้"}</small>
              </div>
            ))}
          </div>
          {pipeline?.worstKey && <p className="ads-dc-worst">จุดหลุดสูงสุด: {stages.find((s) => s.key === pipeline.worstKey)?.label ?? "—"}</p>}
        </section>

        <section className="ads-dc-focus" aria-label={`${b.name} — แพลตฟอร์มที่ควรตรวจ`}>
          <h4>แพลตฟอร์มที่ควรตรวจ <span className="ads-sum-tag">เดือนปัจจุบัน</span></h4>
          {focus ? <>
            <div className="ads-dc-platform"><span className="ads-chan-name"><PlatformIcon channel={focus.key} size={17} /><b>{focus.key}</b></span><span className={`ads-badge ads-badge--${focusStatus.tone}`}>{focusStatus.text}</span></div>
            <div className="ads-dc-platform-values"><span><small>ค่าแอด / งบ</small><b className="mono">{fmtMoney(focus.spend)} / {focus.budget != null ? fmtMoney(focus.budget) : "—"}</b></span><span><small>ROAS</small><b className="mono">{fmtRoas(focus.roas)}</b></span><span><small>%Ads</small><b className="mono">{focus.pctAds != null ? fmtPct(focus.pctAds, 1) : "—"}</b></span></div>
            <p>{focus.pace.vsPace == null ? "ยังเทียบจังหวะไม่ได้" : focus.pace.vsPace > 0 ? <span className="ads-over">ใช้เร็วกว่าจังหวะ {fmtMoney(focus.pace.vsPace)}</span> : <span className="ads-good">ใช้ช้ากว่าจังหวะ {fmtMoney(-focus.pace.vsPace)}</span>}</p>
          </> : <div className="empty-row">ไม่มีค่าแอดในช่องทางที่เลือก</div>}
        </section>
      </div>

      {expanded && (
        <div className="ads-dc-detail">
          <h4>รายละเอียดทุกแพลตฟอร์ม <span className="ads-sum-tag">เดือนปัจจุบัน</span></h4>
          {b.channels.length === 0 ? <div className="empty-row">ไม่มีค่าแอดในช่องทางที่เลือก</div> : <div className="ads-table-wrap"><table className="ads-decision-table ads-lg-table"><caption className="ads-sr-only">รายละเอียดทุกแพลตฟอร์มของ {b.name}</caption><thead><tr><th scope="col">แพลตฟอร์ม</th><th scope="col">ค่าแอด / งบ</th><th scope="col" className="num">%Ads</th><th scope="col" className="num">ROAS</th><th scope="col">จังหวะงบ</th><th scope="col"><span className="ads-sr-only">รายละเอียด</span></th></tr></thead><tbody>{b.channels.map((c) => <LedgerPlatformRow key={c.key} c={c} open={openKey === c.key} onToggle={() => setOpenKey((k) => k === c.key ? null : c.key)} />)}</tbody></table></div>}
          <div className="ads-dc-pipe-detail"><h4>การเปลี่ยนแปลงของ Sale pipeline <span className="ads-sum-tag">เทียบช่วงก่อน</span></h4><SalePipeline row items={stages} worstKey={pipeline?.worstKey ?? null} /></div>
        </div>
      )}
    </article>
  );
}

export function AdsView() {
  const { data, inBrandScope, brandFilter, updateAdsControl, toast } = useApp();
  const todayLocal = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [customFrom, setCustomFrom] = useState(todayLocal.slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(todayLocal);
  const [compare, setCompare] = useState("previous");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [metricKey, setMetricKey] = useState(null);
  const metricDetailRef = useRef(null);
  const [paceView, setPaceView] = useState(null);   // null | "rev" | "spend"
  const paceRef = useRef(null);

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const today = isoDay(new Date());
    const monthRange = periodRange("mtd", null, null);
    const brandTotals = adsByBrandChannel(scopedAll, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredBrands = channel === "all" ? brandTotals : adsByBrandChannel(scoped, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredById = new Map(filteredBrands.map((b) => [b.id, b]));
    const summary = adsCompanySummary(brandTotals, today);
    const brandIds = new Set(brands.map((b) => b.id));
    const brandCards = scopedAll.filter((c) => brandIds.has(c.brand_id));
    return {
      scoped, range, today, before, compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
      channelList: adsChannelList(scopedAll),
      kpis: adsKpis(scoped, range, before),
      summary,
      paceChart: adsCompanyPaceChart(brandCards, monthRange, today, summary.revTarget, summary.budget),
      share: adsSpendShareByBrand(brandTotals),
      brands: brandTotals.map((b) => ({ ...b, channels: filteredById.get(b.id)?.channels ?? [] })),
      funnel: adsFunnel(scoped, range, before),
      board: adsMetricBoard(scoped, range, before),
      boardDays: adsDailySeries(scoped, range).map((d) => d.day),
      pipelines: Object.fromEntries(brands.map((b) => [
        b.id, adsSalePipeline(scoped.filter((c) => c.brand_id === b.id), range, before),
      ])),
    };
  }, [data, inBrandScope, period, customFrom, customTo, compare, brandFilter, channel]);

  const hasSpend = v.kpis.spend.value != null && v.kpis.spend.value > 0;
  /* การ์ดที่เลือกต้องยังมีค่าอยู่หลังเปลี่ยนตัวกรอง ไม่งั้นพับกราฟ */
  const pickedMetric = metricKey ? v.board.find((m) => m.key === metricKey && m.value != null) ?? null : null;
  useEffect(() => {
    if (paceView && paceRef.current) paceRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paceView]);
  useEffect(() => {
    if (pickedMetric && metricDetailRef.current) metricDetailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // เลื่อนเฉพาะตอน "เปลี่ยนตัวชี้วัด" — ผูกทั้ง object จะเลื่อนซ้ำทุกครั้งที่ข้อมูลรีเฟรช
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedMetric?.key]);

  /* กรองการ์ดแบรนด์×ช่องทางตามสถานะจังหวะงบ (คนละมิติกับตัวกรองช่องทาง) */
  const shownBrands = status === "all"
    ? v.brands
    : v.brands
      .map((b) => ({ ...b, channels: b.channels.filter((c) => paceGroup(c.pace) === status) }))
      .filter((b) => b.channels.length > 0);

  const statusTools = (
    <div className="ads-seg" role="tablist" aria-label="กรองตามจังหวะงบ">
      {STATUS_OPTS.map((s) => (
        <button key={s.k} className={`ads-seg-btn ${status === s.k ? "active" : ""}`} onClick={() => setStatus(s.k)} role="tab" aria-selected={status === s.k}>
          {s.label}
        </button>
      ))}
    </div>
  );

  if (new URLSearchParams(window.location.search).get("design") === "workspace") {
    const shownFrom = isoDay(new Date(v.range.start));
    const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
    const changeFrom = (next) => {
      setCustomFrom(next);
      setCustomTo(next > shownTo ? next : shownTo);
      setPeriod("custom");
    };
    const changeTo = (next) => {
      setCustomTo(next);
      setCustomFrom(next < shownFrom ? next : shownFrom);
      setPeriod("custom");
    };
    return <AdsWorkspace v={v} ChannelCard={ChannelCard} SalePipeline={SalePipeline} settings={data.settings} updateAdsControl={updateAdsControl} toast={toast} controls={<>
      <div className="aw-presets" role="group" aria-label="ช่วงเวลาด่วน">{[["today","วันนี้"],["7d","7 วัน"],["mtd","เดือนนี้"]].map(([key,label])=><button type="button" key={key} className={period===key?'active':''} aria-pressed={period===key} onClick={()=>setPeriod(key)}>{label}</button>)}</div>
      <div className="aw-date-range"><label><span>จาก</span><input aria-label="วันที่เริ่มต้น" type="date" value={shownFrom} max={shownTo} onChange={e=>changeFrom(e.target.value)}/></label><b>–</b><label><span>ถึง</span><input aria-label="วันที่สิ้นสุด" type="date" value={shownTo} min={shownFrom} max={todayLocal} onChange={e=>changeTo(e.target.value)}/></label></div>
      <label className="aw-filter"><span>ช่องทาง</span><select value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">ทั้งหมด</option>{v.channelList.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
      <label className="aw-filter"><span>เทียบ</span><select value={compare} onChange={e=>setCompare(e.target.value)}><option value="previous">ช่วงก่อน</option><option value="lastMonth">เดือนก่อน</option></select></label>
    </>} />;
  }

  return (
    <div className="dash-linear-shell">
      <a href="/mkt/ads?design=workspace" style={{alignSelf:"flex-end",padding:"8px 12px"}}>เปิดหน้าออกแบบใหม่ ↗</a>
      {/* หน้านี้ไม่มีหัวเรื่องที่มองเห็น (ชื่อหน้าอยู่บน breadcrumb ของ shell)
          แต่โครง heading ต้องเริ่มที่ h1 ไม่งั้นคนใช้ screen reader ไล่โครงหน้าไม่ได้ */}
      <h1 className="ads-sr-only">ค่าแอด — ภาพรวมและจังหวะใช้เงิน</h1>
      <div className="ads-unified-filters" aria-label="ตัวกรองค่าแอด">
        <label>ช่วงเวลา
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((r) => <option value={r.k} key={r.k}>{r.label}</option>)}
          </select>
        </label>
        {period === "custom" && (
          <div className="ads-date-fields">
            <label>จาก <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></label>
            <label>ถึง <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} /></label>
          </div>
        )}
        {/* มีแพลตฟอร์มเดียว (ช่วงแรกยิงแค่ Meta) ก็ไม่ต้องมีตัวเลือกให้กด — โผล่เองเมื่อเปิดช่องทางเพิ่ม */}
        {v.channelList.length > 1 && (
          <label>ช่องทาง
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">ทุกช่องทาง</option>
              {v.channelList.map((ch) => <option value={ch} key={ch}>{ch}</option>)}
            </select>
          </label>
        )}
        <label>เทียบกับ
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="previous">ช่วงก่อนหน้า</option>
            <option value="lastMonth">วันเดียวกันเดือนก่อน</option>
          </select>
        </label>
        <div className="ads-filter-range">
          <span>ข้อมูลช่วง</span>
          <b className="mono">{new Date(v.range.start).toLocaleDateString("th-TH")} – {new Date(new Date(v.range.end).getTime() - 1).toLocaleDateString("th-TH")}</b>
        </div>
      </div>

      {/* ── สรุปรวมทุกแบรนด์ — แถบตัวเลข 5 ตัว + 3 ช่องเท่ากัน (จังหวะเดือน / รายแบรนด์ / เส้นทางขาย) ── */}
      <section className="dash-card ads-top2">
        <Panel title="สรุปรวมทุกแบรนด์"
          info={{ label: "สรุปรวม", text: "แถบบน = ตัวเลขหัว 5 ตัว (ยอดขาย · คาดสิ้นเดือน · ค่าแอด เป็นเดือนนี้ / ROAS · %Ads ตามช่วงที่เลือก) · ช่องซ้าย = จังหวะเดือน ยอดขาย vs เป้า · ค่าแอด vs งบ กดดูกราฟสะสมรายวัน · ช่องกลาง = รายแบรนด์ สัดส่วนค่าแอด + สถานะจังหวะทำยอด กดชื่อเลื่อนลงไปแบรนด์นั้น · ช่องขวา = เส้นทางขายรวม" }}>
          {(() => {
            const sm = v.summary;
            const rvSt = salesPaceStatus(sm.revPctOfExpected);
            const spSt = paceStatus(sm.pace);
            const statusOf = new Map(sm.byStatus.flatMap((g) => g.brands.map((b) => [b.id, g])));
            const shareOf = new Map(v.share.rows.map((r) => [r.id, r]));
            const brandRows = [...v.brands].sort((a, b) => b.spend - a.spend);
            const roasD = change(v.kpis.roas.value, v.kpis.roas.before);
            const pctD = change(v.kpis.pctAds.value, v.kpis.pctAds.before);
            /* bullet: ชื่อ · % อยู่ติดกัน (ไม่แยกคนละฝั่ง) → แถบ → สถานะ+ปุ่มกราฟของตัวเอง — ตาเดินเส้นเดียวจากบนลงล่าง */
            const bullet = (label, pct, expected, tone, right, sub, missing, action) => (
              <div className="ads-top2-bullet">
                <div className="ads-top2-bullet-head">
                  <span>{label}</span>
                  {!missing && <><span className="ads-top2-sep" aria-hidden="true">·</span><b className="mono">{pct != null ? fmtPct(pct, 0) : "—"}</b></>}
                </div>
                {missing ? <div className="ads-muted">{missing}</div> : (
                  <>
                    <div className="ads-brand-bar" role="img" aria-label={`${label} ${fmtPct(pct ?? 0, 0)} · ควรถึง ${fmtPct(expected, 0)} แล้ววันนี้`}>
                      <i style={{ width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%`, background: GAUGE_TONE[tone] }} />
                      <span className="ads-brand-bar-tick" style={{ left: `${Math.round((expected ?? 0) * 100)}%` }} />
                    </div>
                    <div className="ads-top2-bullet-sub">{right}<span className="ads-muted">{sub}</span>{action}</div>
                  </>
                )}
              </div>
            );
            const chartBtn = (key, label) => (
              <button type="button" className={`ads-top2-chartbtn ${paceView === key ? "active" : ""}`} aria-pressed={paceView === key}
                onClick={() => setPaceView((p) => (p === key ? null : key))}>
                <Icon name="chart" size={12} />{label}
              </button>
            );
            return (
              <>
                <div className="ads-top2-groups" aria-hidden="true">
                  <span className="ads-top2-group ads-top2-group--month">เดือนนี้</span>
                  <span className="ads-top2-group ads-top2-group--range">ช่วงที่เลือก</span>
                </div>
                <div className="ads-b2-strip ads-top2-strip">
                  <div className="ads-b2-stat">
                    <span className="ads-b2-k">ยอดขายรวม <span className="ads-sum-tag ads-top2-tag--narrow">เดือนนี้</span></span>
                    <span className="ads-b2-v mono">{fmtMoney(sm.revenue)}</span>
                    <span className="ads-b2-d"><DeltaChip d={sm.revChangePct} good={(sm.revChangePct ?? 0) >= 0} noneText="เทียบเดือนก่อนไม่ได้" /><span className="kpi-hint">เทียบเดือนก่อน</span></span>
                  </div>
                  <div className="ads-b2-stat">
                    <span className="ads-b2-k">คาดสิ้นเดือน</span>
                    <span className="ads-b2-v mono">{fmtMoney(sm.revPace.forecast)}</span>
                    <span className="ads-b2-d">
                      {sm.revPace.forecastOver == null
                        ? <span className="kpi-hint">ยังตั้งเป้าไม่ครบทุกแบรนด์</span>
                        : sm.revPace.forecastOver >= 0
                          ? <span className="ads-good">เกินเป้า {fmtMoney(sm.revPace.forecastOver)}</span>
                          : <span className="ads-over">ขาดเป้า {fmtMoney(-sm.revPace.forecastOver)}</span>}
                    </span>
                  </div>
                  <div className="ads-b2-stat">
                    <span className="ads-b2-k">ค่าแอดรวม</span>
                    <span className="ads-b2-v mono">{fmtMoney(sm.spend)}<span className="ads-top2-cap"> / งบ {sm.budget != null ? fmtMoney(sm.budget) : "—"}</span></span>
                    <span className="ads-b2-d">
                      {sm.budget == null
                        ? <span className="kpi-hint">ยังตั้งงบไม่ครบทุกแบรนด์</span>
                        : <span className={`ads-badge ads-badge--${spSt.tone}`}>{spSt.text}{sm.pace.vsPace != null && Math.abs(sm.pace.vsPace) >= 1 ? ` ${fmtMoney(Math.abs(sm.pace.vsPace))}` : ""}</span>}
                    </span>
                  </div>
                  <div className="ads-b2-stat ads-top2-stat--group">
                    <span className="ads-b2-k">ROAS <span className="ads-sum-tag ads-top2-tag--narrow">ช่วงที่เลือก</span></span>
                    <span className="ads-b2-v mono">{fmtRoas(v.kpis.roas.value)}</span>
                    <span className="ads-b2-d"><DeltaChip d={roasD} good={roasD != null && roasD > 0} /><span className="kpi-hint">รายได้ ÷ ค่าแอด</span></span>
                  </div>
                  <div className="ads-b2-stat">
                    <span className="ads-b2-k">%Ads</span>
                    <span className="ads-b2-v mono">{v.kpis.pctAds.value != null ? fmtPct(v.kpis.pctAds.value, 1) : "—"}</span>
                    <span className="ads-b2-d"><DeltaChip d={pctD} good={pctD != null && pctD < 0} /><span className="kpi-hint">ยิ่งต่ำยิ่งดี</span></span>
                  </div>
                </div>

                <div className="ads-b2-panes ads-top2-panes">
                  <section className="ads-b2-pane" aria-label="จังหวะเดือน">
                    <h4>จังหวะเดือน <span className="ads-sum-tag">เดือนนี้</span></h4>
                    {bullet("ยอดขาย vs เป้า", sm.revPct, sm.revPace.expected, rvSt.tone,
                      <span className={`ads-badge ads-badge--${rvSt.tone}`}>{rvSt.text}</span>,
                      sm.revPace.expectedSpend != null ? ` · ควรได้ตอนนี้ ${fmtMoney(sm.revPace.expectedSpend)}` : "",
                      sm.revTarget == null ? "ยังตั้งเป้าไม่ครบทุกแบรนด์ — รวมเป้าไม่ได้" : null,
                      chartBtn("rev", "กราฟสะสม"))}
                    {bullet("ค่าแอด vs งบ", sm.pace.used, sm.pace.expected, spSt.tone,
                      <span className={`ads-badge ads-badge--${spSt.tone}`}>{spSt.text}</span>,
                      ` · คาดสิ้นเดือน ${fmtMoney(sm.pace.forecast)}${sm.pace.forecastOver > 0 ? ` · เกินงบ ${fmtMoney(sm.pace.forecastOver)}` : ""}`,
                      sm.budget == null ? "ยังตั้งงบไม่ครบทุกแบรนด์ — รวมงบไม่ได้" : null,
                      chartBtn("spend", "กราฟสะสม"))}
                  </section>

                  <section className="ads-b2-pane" aria-label="รายแบรนด์ — สัดส่วนค่าแอดและสถานะ">
                    <h4>รายแบรนด์ <span className="ads-sum-tag">เดือนนี้</span></h4>
                    <div className="ads-table-wrap">
                      <table className="ads-decision-table ads-top2-brands">
                        <caption className="ads-sr-only">สัดส่วนค่าแอดและสถานะจังหวะทำยอดรายแบรนด์</caption>
                        <thead><tr><th scope="col">แบรนด์</th><th scope="col">สัดส่วนค่าแอด</th><th scope="col" className="num">ค่าแอด</th><th scope="col">สถานะ</th></tr></thead>
                        <tbody>
                          {brandRows.map((b) => {
                            const sh = shareOf.get(b.id);
                            const st = statusOf.get(b.id);
                            return (
                              <tr key={b.id}>
                                <th scope="row">
                                  <button type="button" className="ads-top2-brandbtn" aria-label={`เลื่อนไปดู ${b.name}`}
                                    onClick={() => document.getElementById(`ads-brand-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                                    <i style={{ background: b.color ?? "var(--ink-soft)" }} aria-hidden="true" />{b.name}
                                  </button>
                                </th>
                                <td className="ads-top2-sharecell">
                                  <div className="ads-top2-sharebar" role="img" aria-label={sh ? `${fmtPct(sh.share, 0)} ของค่าแอดรวม` : "ยังไม่ใช้เงิน"}>
                                    <i style={{ width: `${Math.round((sh?.share ?? 0) * 100)}%`, background: b.color ?? "var(--ink-soft)" }} />
                                  </div>
                                  <span className="mono ads-muted">{sh ? fmtPct(sh.share, 0) : "—"}</span>
                                </td>
                                <td className="mono num">{fmtMoney(b.spend)}</td>
                                <td>{st ? <span className={`ads-badge ads-badge--${st.tone}`}>{st.text}</span> : <span className="ads-muted">—</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="ads-b2-pane" aria-label="เส้นทางขายรวม">
                    <h4>เส้นทางขาย <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
                    {v.funnel.stages[0].value == null || v.funnel.stages[0].value === 0 ? (
                      <div className="empty-row">ยังไม่มีข้อมูลคนทักในช่วงนี้</div>
                    ) : (
                      <SalePipeline row worstKey={v.funnel.worstKey}
                        items={v.funnel.stages.map((st, i) => ({
                          key: st.key, label: st.label, value: st.value, before: st.before, sense: "higher", fmt: "int",
                          conv: i === 0 ? null : st.rate,
                          convPlaceholder: i === 0 ? "ฐานเริ่มต้น 100%" : null,
                          sub: `ต้นทุนต่อขั้น ${st.cost == null ? "—" : fmtMoney(st.cost)}`,
                        }))} />
                    )}
                    {v.funnel.estimated && <p className="ads-funnel-strip-note ads-top2-note"><Icon name="info" size={12} /> Lead, มัดจำ และออเดอร์เป็นข้อมูลจำลองจากคนทัก จนกว่าจะเชื่อม CRM</p>}
                  </section>
                </div>
                {paceView && <PaceChart pc={v.paceChart} view={paceView} onClose={() => setPaceView(null)} innerRef={paceRef} />}
              </>
            );
          })()}
        </Panel>
      </section>

      {!hasSpend && (
        <section className="dash-card">
          <div className="empty-row">{v.kpis.quality.rows > 0 ? "มีรายการในช่วงนี้ แต่ข้อมูล Spend ยังไม่ครบ" : "ยังไม่มีค่าแอดในเงื่อนไขนี้ · ลองเปลี่ยนแพลตฟอร์มหรือช่วงเวลา"}</div>
        </section>
      )}

      {/* ── สรุปรายแบรนด์ — แถบตัวเลข (ตรงคอลัมน์กันทุกแบรนด์) + 3 ช่องเท่ากันเต็มความกว้าง ── */}
      <section className="dash-card">
        <Panel title="สรุปรายแบรนด์ — ยอดขาย · Sale pipeline · งบค่าแอด" tools={statusTools}
          info={{ label: "รายแบรนด์", text: "แถบบน = ยอดขายเดือนนี้ · คาดปิดเดือน (run-rate) · ROAS ตามช่วงที่เลือก — ตำแหน่งเดียวกันทุกแบรนด์ไล่เทียบได้ · ช่องล่าง: ซ้าย = เป้า+จังหวะทำยอด (เดือนปัจจุบัน) · กลาง = Sale pipeline ตามช่วงที่เลือก พร้อมอัตราแปลงและขั้นที่หล่นแรงสุด · ขวา = ค่าแอดเทียบงบรายแพลตฟอร์ม (เดือนปัจจุบัน) — สองช่วงเวลาต่างกันโดยตั้งใจ ป้ายบอกไว้ทุกช่อง" }}>
          {shownBrands.length === 0 ? (
            <div className="empty-row">ไม่มีช่องทางที่ตรงกับตัวกรองจังหวะงบ</div>
          ) : (
            <div className="ads-b2-list">
              {shownBrands.map((b) => <BrandRow key={b.id} b={b} pipeline={v.pipelines[b.id]} />)}
            </div>
          )}
          <PaceZoneKey />
        </Panel>
      </section>


      {/* ── แผงทดลอง "แบรนด์แบบใหม่ (Ledger)" — โครงเดียวทุกแบรนด์ · แพลตฟอร์มเป็นตาราง — ไว้เทียบกับแผงเดิมด้านบน ── */}
      <section className="dash-card">
        <Panel title="สรุปรายแบรนด์ (แบบใหม่) — หัวแถวเดียว · แพลตฟอร์มเป็นตาราง"
          info={{ label: "แผงทดลอง", text: "ข้อมูลชุดเดียวกับแผงเดิม จัดใหม่: หัวแถว = โลโก้ · ยอดขาย · คาดปิดเดือน · ค่าแอดรวม/งบรวม · ROAS · %Ads ตำแหน่งเดียวกันทุกแบรนด์ · ซ้าย = จังหวะเดือน · ขวา = แพลตฟอร์ม 1 แถว/ตัว (กด ▸ ดูคาดการณ์ ตัวชี้วัด แคมเปญ) · ล่าง = Sale pipeline · ตัวกรองจังหวะงบด้านบนคุมทั้งสองแผง" }}>
          {shownBrands.length === 0 ? (
            <div className="empty-row">ไม่มีช่องทางที่ตรงกับตัวกรองจังหวะงบ</div>
          ) : (
            <div className="ads-b2-list">
              {shownBrands.map((b) => <BrandRowLedger key={b.id} b={b} pipeline={v.pipelines[b.id]} />)}
            </div>
          )}
          <PaceZoneKey />
        </Panel>
      </section>

      {/* ── แผงทดลองแบบที่ 3: สรุปเพื่อการตัดสินใจ แล้วค่อยเปิดรายละเอียดทั้งหมด ── */}
      <section className="dash-card">
        <Panel title="สรุปรายแบรนด์ (แบบที่ 3) — เห็นปัญหาก่อน แล้วค่อยดูรายละเอียด" tools={statusTools}
          info={{ label: "Decision-first", text: "หนึ่งการ์ดต่อแบรนด์: หัวการ์ดสรุปเรื่องที่ควรจัดการก่อน · KPI หลัก 4 กลุ่ม · เปรียบเทียบจังหวะยอดขายกับจังหวะค่าแอด · Sale pipeline และแพลตฟอร์มที่ควรตรวจอยู่ในระดับแรก ส่วนแพลตฟอร์ม ตัวชี้วัด และแคมเปญทั้งหมดเปิดดูได้โดยไม่ตัดข้อมูลเดิม" }}>
          {shownBrands.length === 0 ? <div className="empty-row">ไม่มีช่องทางที่ตรงกับตัวกรองจังหวะงบ</div> : <div className="ads-dc-list">{shownBrands.map((b) => <BrandRowDecision key={b.id} b={b} pipeline={v.pipelines[b.id]} />)}</div>}
          <PaceZoneKey />
        </Panel>
      </section>

      {/* ── ตัวชี้วัดและแนวโน้ม — ตัวหลัก 3 ใบใหญ่ + ตารางการส่งมอบ · ROAS ไม่ทวน (อยู่แถบบนแล้ว) ── */}
      <section className="dash-card">
        <Panel
          title="ตัวชี้วัดและแนวโน้ม"
          tools={<span className="ads-trend-sub">เส้นประ = {compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า"}</span>}
          info={{ label: "ตัวชี้วัด", text: "ทุกตัวชี้วัดของขอบเขตและช่วงเวลาที่เลือก · ซ้าย = ตัวที่ต้องดูทุกวัน (Spend · Leads · CPL) · ขวา = ตารางการส่งมอบโฆษณา 7 ตัว · เส้นทึบ = ช่วงนี้ เส้นประ = ช่วงเทียบ · กดการ์ดหรือชื่อในตารางเพื่อเปิดกราฟรายวัน · ตัวที่ยังสรุปไม่ได้มีเหตุผลกำกับ (ไม่เดา) · ROAS ไม่แสดงซ้ำเพราะอยู่แถบบนแล้ว" }}
        >
          {(() => {
            const heroKeys = ["spend", "leads", "cpl"];
            const heroes = heroKeys.map((k) => v.board.find((m) => m.key === k)).filter(Boolean);
            const pending = ["inquiry", "cpr"].map((k) => v.board.find((m) => m.key === k)).filter((m) => m && m.value == null);
            return (
              <div className="ads-mb2">
                <div className="ads-mb2-hero">
                  <h4>ผลลัพธ์จากค่าแอด <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
                  <div className="ads-mb2-cards">
                    {heroes.map((m) => (
                      <MetricCard key={m.key} m={m} active={metricKey === m.key}
                        onPick={() => setMetricKey((k) => (k === m.key ? null : m.key))} />
                    ))}
                  </div>
                  {pending.length > 0 && (
                    <p className="ads-mb2-pending">
                      ยังไม่มีข้อมูล: {pending.map((m, i) => <span key={m.key}>{i > 0 && " · "}<b>{m.label}</b> — {m.reason}</span>)}
                    </p>
                  )}
                </div>
                <div className="ads-mb2-side">
                  <h4>การส่งมอบโฆษณา <span className="ads-sum-tag">ช่วงที่เลือก</span></h4>
                  <DeliveryTable board={v.board} activeKey={metricKey} onPick={(k) => setMetricKey((cur) => (cur === k ? null : k))} />
                </div>
              </div>
            );
          })()}
          {pickedMetric && <MetricDailyChart m={pickedMetric} days={v.boardDays} compare={compare} onClose={() => setMetricKey(null)} innerRef={metricDetailRef} />}
          <p className="ads-note">ข้อมูลจำลอง · Reach/Frequency รวมข้ามแพลตฟอร์มไม่ได้ (คนซ้ำกัน)</p>
        </Panel>
      </section>

    </div>
  );
}
