import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreativeCard } from "../creatives/CreativeCard.jsx";
import { CreativeViewer, Dot } from "../creatives/CreativeViewer.jsx";
import { campaignDeliveryOf, campaignStatusIndex } from "../creatives/creativeStatus.js";
import { ChartBox } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, dayLabel, fmtCompact, fmtMoney, fmtPct, lineSeries, SERIES, fmtNum, fmtInt } from "../dash/charts/theme.js";
import { FATIGUE_LABEL, METRIC_LABEL, trendOf } from "../ads/glossary.js";

const METRICS = [["spend", "ค่าแอด", "money"], ["leads", "ผลลัพธ์", "int"], ["cpl", "CPL", "money"], ["roas", METRIC_LABEL.roasMeta, "roas"]];
const fmt = (kind, v) => (v == null ? "—" : kind === "money" ? fmtMoney(v) : kind === "roas" ? `${fmtNum(v, 2)}×` : fmtInt(v));

const deltaText = (d, sense = "higher") => {
  if (d == null || !Number.isFinite(d)) return null;
  const { good, word } = trendOf(d, sense);   // เปลี่ยน < 5% = ทรงตัว (ตรวจรอบ 28 ก.ย.)
  return { text: `${d >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(d), 2)}%${word ? ` ${word}` : ""}`, tone: good == null ? "" : good ? "good" : "bad" };
};

/* ตัวเลขหลัก — ช่องใหญ่ อ่านก่อนอย่างอื่น · เทียบช่วงก่อนติดใต้ตัวเลข (ไม่มีข้อมูลเทียบ = ไม่ขึ้นบรรทัดนั้น) */
function Kpi({ label, value, delta, tone }) {
  return <div className={`cd-kpi${tone ? ` ${tone}` : ""}`}><span>{label}</span><b>{value}</b>{delta && <small className={`cd-delta ${delta.tone}`}>{delta.text}</small>}</div>;
}

/* ตัวเลขรอง — รายการ ป้าย ... ค่า ทีละบรรทัด (รอบแรกกางเต็มความกว้าง 3 คอลัมน์ ตากระโดดไกล อ่านยาก — อาร์ต 26 ก.ย.)
   แถวที่ค่าเป็น null ไม่แสดง (ไม่มีงบ = ไม่ต้องบอก "ยังไม่ตั้ง" / "—") */
function List({ title, items }) {
  const shown = items.filter(([, v]) => v != null);
  return <section className="cd-list" role="group" aria-label={title}>
    <h3>{title}</h3>
    <ul>{shown.map(([k, v]) => <li key={k}><span>{k}</span><b>{v}</b></li>)}</ul>
  </section>;
}

/* แผงรายละเอียดแคมเปญ — รื้อรอบ 2 (26 ก.ย. อาร์ต: "อ่านยาก")
   คำแนะนำแถบเดียว (ความพร้อมท้ายแถบ) → ตัวเลขหลัก 4 ช่องใหญ่ → ตัวเลขรองเป็นรายการ 3 กลุ่ม → แนวโน้ม → การ์ดครีเอทีฟ */
export function CampaignDetail({ row, compareLabel, canPreview = false }) {
  const [metric, setMetric] = useState("spend");
  const [openIndex, setOpenIndex] = useState(null);
  const [, label, kind] = METRICS.find((m) => m[0] === metric);
  const data = row.series[metric];
  const fatigued = row.creatives.filter((c) => c.fatigue);
  const delivery = campaignDeliveryOf(row);
  const statusIndex = useMemo(() => campaignStatusIndex(row.creatives), [row.creatives]);
  const readyDays = Math.max(0, 3 - row.days);
  const readyResults = Math.max(0, 5 - row.leads);
  /* บรรทัดความพร้อมขึ้นเฉพาะยังตัดสินไม่ได้ (สเปก 2026-09-26 — พร้อมแล้วไม่ต้องบอกซ้ำทุกแคมเปญ) */
  /* ขึ้นเฉพาะตอนป้ายเป็น "รอข้อมูล" — ใช้เงินเกินเกณฑ์แล้วไม่มีผลตัดสินได้เลย (ควรหยุด) ห้ามบอกว่ายังตัดสินไม่ได้ (ทดสอบละเอียด 27 ก.ย.) */
  const readyNote = row.decision?.tag !== "wait" ? null
    : !row.complete ? "ข้อมูลยังไม่ครบทุกวัน"
    : readyDays > 0 || readyResults > 0 ? ["ยังตัดสินไม่ได้", readyDays > 0 ? `รออีก ${readyDays} วัน` : null, readyResults > 0 ? `รอผลลัพธ์อีก ${readyResults}` : null].filter(Boolean).join(" · ") : null;
  // การซื้อ: รวมจากครีเอทีฟ (ชุดการ์ดเดียวกับแคมเปญ) · ไม่รู้ทุกชิ้น = null (ไม่แสดงแถว)
  const purchases = row.creatives.some((c) => c.purchases != null) ? row.creatives.reduce((n, c) => n + (c.purchases ?? 0), 0) : null;
  const money = (v) => (v == null ? null : fmtMoney(v));
  const int = (v) => (v == null ? null : fmtInt(v));
  const pct = (v) => (v == null ? null : fmtPct(v, 2));
  const times = (v) => (v == null ? null : `${fmtNum(v, 2)}×`);
  const hasBudget = row.budget != null;
  return <div className="cp-detail-body">
    <section className={`cd-advice cd-advice--${row.decision.tone}`} aria-label="คำแนะนำ">
      <p className="cd-advice-main"><b>{row.decision.label}</b><span>{row.decision.why}</span></p>
      <p className="cd-advice-next"><small>ทำต่อ</small>{row.decision.next}
        {/* แพงแต่ขายได้บอกให้เทียบยอดขายจริง — ต้องมีทางไปดู (ตรวจรอบ 28 ก.ย.) */}
        {row.decision.tag === "sells" && <> · <Link to={`/mkt/ads?brand=${encodeURIComponent(row.brandId)}`}>ดูยอดขาย {row.brand}</Link></>}</p>
      {readyNote && <p className="cd-advice-ready">{readyNote}</p>}
    </section>

    <section className="cd-kpis" role="group" aria-label="ตัวเลขหลัก">
      <Kpi label="ค่าแอด" value={fmtMoney(row.spend)} delta={deltaText(row.delta.spend, "neutral")} />
      <Kpi label="ผลลัพธ์" value={fmtInt(row.leads)} delta={deltaText(row.delta.leads, "higher")} />
      <Kpi label="CPL" value={row.cpl == null ? "—" : fmtMoney(row.cpl)} delta={deltaText(row.delta.cpl, "lower")} />
      {/* ช่องที่ 4 = ความถี่ (อาร์ตเคาะ 26 ก.ย.) — มีค่าจริงทุกแคมเปญ · ROAS ของ Meta ย้ายไปรายการผลลัพธ์ */}
      <Kpi label="ความถี่" value={row.frequency == null ? "—" : `${fmtNum(row.frequency, 2)}×`} delta={deltaText(row.delta.frequency, "lower")} />
    </section>
    {(row.delta.spend != null || row.delta.leads != null) && <p className="cd-compare">เทียบ{compareLabel}</p>}

    <div className="cd-lists">
      <List title="การใช้เงิน" items={[
        ["CPM", money(row.cpm)], ["CPC", money(row.cpc)], ["สัดส่วนค่าแอด", pct(row.spendShare)],
        ["งบเดือน", hasBudget ? `${fmtMoney(row.monthSpend ?? 0)} / ${fmtMoney(row.budget)}` : null],
        ["ใช้งบแล้ว", hasBudget && row.pace?.used != null ? `${fmtPct(row.pace.used, 2)} (ควรถึง ${fmtPct(row.pace.expected, 2)})` : null],
      ]} />
      <List title="การเข้าถึง" items={[
        ["การแสดงผล", int(row.impressions)], ["เข้าถึง (รวมรายวัน)", int(row.reach)],
        ["คลิกลิงก์", int(row.linkClicks)], ["CTR ลิงก์", pct(row.linkCtr)], ["CPC ลิงก์", money(row.linkCpc)], ["CTR ทั้งหมด", pct(row.ctr)],
      ]} />
      <List title="ผลลัพธ์" items={[
        ["การซื้อ (Meta)", int(purchases)], ["รายได้ที่ Meta เห็น", money(row.revenue)],
        ["ROAS (Meta)", row.roas == null ? "—" : times(row.roas)], ["%Ads (Meta)", pct(row.pctAds)],
      ]} />
    </div>

    <section className="cp-trend" aria-label="แนวโน้มรายวัน">
      <header><div><h4>แนวโน้มรายวัน</h4><p>ดูว่าผลงานเริ่มเปลี่ยนตรงวันไหน</p></div><div className="cp-metric-tabs" role="tablist" aria-label="เลือกตัวชี้วัด">{METRICS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={metric === k} className={metric === k ? "active" : ""} onClick={() => setMetric(k)}>{l}</button>)}</div></header>
      <ChartBox type="line" height={150} ariaLabel={`${label} รายวันของ ${row.name}`}
        data={{ labels: row.series.days.map(dayLabel), datasets: [{ label, data, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.10)", fill: true, ...lineSeries(row.series.days.length) }] }}
        options={baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => (kind === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v)) } } }, plugins: { tooltip: { callbacks: { title: (i) => i[0]?.label ?? "", label: (c) => `${label} ${fmt(kind, c.parsed.y)}` } } } })} />
    </section>

    <section className="cp-creative-section" aria-label="ครีเอทีฟ">
      {/* ตารางครีเอทีฟกลาง (25 ก.ย. อาร์ตขอ — เดิมการ์ดภาพใหญ่ทีละ 2 ชิ้น ไล่หา/เทียบยาก) ชี้ค้าง = ตัวอย่าง · คลิก = ดูเต็ม */}
      <header><div><h4>ครีเอทีฟ</h4><p>{row.creatives.length} ชิ้น · ตัวเลขเฉพาะในแคมเปญนี้ จึงอาจต่างจากหน้า Creative ที่รวมทุกแคมเปญ{delivery.key !== "unknown" && <> · แคมเปญ<Dot status={delivery} /></>}</p></div><div className="cp-creative-status">{fatigued.length > 0 && <span className="ads-badge ads-badge--amber">{FATIGUE_LABEL} {fatigued.length}</span>}</div></header>
      {/* การ์ดใหญ่แบบเดิมที่อาร์ตชอบ (เคาะ 25 ก.ย.) — การ์ดตัวเดียวกับหน้าคลัง · คลิก = หน้าต่างครีเอทีฟ */}
      {row.creatives.length ? <div className="cc-grid cp-creative-grid">{row.creatives.map((c, i) => <CreativeCard key={c.key} row={c} onOpen={() => setOpenIndex(i)} />)}</div> : <p className="cp-no-value">ไม่มีข้อมูลครีเอทีฟ</p>}
    </section>

    <details className="cp-lineage"><summary>ที่มาและวิธีคำนวณ</summary><ul>
      <li>ค่าแอดรายวันจาก Meta · รันมา {row.days} วันในช่วง</li>
      <li>ROAS (Meta) = รายได้ที่ Meta เห็น ÷ ค่าแอด ไม่ใช่ยอดขายจริงจากระบบขาย · Meta ไม่เห็นยอด (แคมเปญทักแชท) = "—"</li>
      <li>CTR ลิงก์ = คลิกลิงก์ ÷ การแสดงผล · CTR ทั้งหมดนับทุกคลิก</li>
      {hasBudget && <li>งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน · จังหวะ = ค่าแอดสะสมตั้งแต่วันที่ 1 ÷ งบเดือน เทียบสัดส่วนวันที่ผ่านไป</li>}
      <li>ข้อเสนอแนะใช้กฎกลาง เป้าแบรนด์ และข้อมูลขั้นต่ำ 3 วัน / 5 ผลลัพธ์</li>
      <li>ยังไม่มีประวัติการแก้ไขจากแพลตฟอร์ม จึงไม่สรุปว่าการเปลี่ยนงบหรือสถานะเป็นสาเหตุของผลงาน</li>
    </ul></details>
    {openIndex != null && <CreativeViewer rows={row.creatives} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} canPreview={canPreview} campaignStatus={statusIndex} highlightCampaign={row.name} />}
  </div>;
}
