import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CreativeMedia } from "../creatives/CreativeMedia.jsx";
import { CreativePreview } from "../creatives/CreativePreview.jsx";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { ChartBox } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, dayLabel, fmtCompact, fmtMoney, fmtPct, lineSeries, SERIES, fmtNum, fmtInt } from "../dash/charts/theme.js";

const METRICS = [["spend", "ค่าแอด", "money"], ["leads", "ผลลัพธ์", "int"], ["cpl", "CPL", "money"], ["roas", "ROAS", "roas"]];
const fmt = (kind, v) => (v == null ? "—" : kind === "money" ? fmtMoney(v) : kind === "roas" ? `${fmtNum(v, 2)}x` : fmtInt(v));

function CreativeCard({ creative, onPreview }) {
  const asset = creative.asset;
  const links = postLinksOf(asset);
  const destination = asset?.destinationUrl;
  return <article className={`cp-creative-card ${asset ? "has-asset" : ""}`}>
    {asset && <CreativeMedia row={creative} onPreview={onPreview} />}
    <div className="cp-creative-copy">
      <div className="cp-creative-title"><b title={creative.creative}>{creative.creative}</b><span className={`ads-badge ads-badge--${creative.tone}`}>{creative.action}</span></div>
      <dl><div><dt>ค่าแอด</dt><dd>{fmtMoney(creative.spend)}</dd></div><div><dt>CTR</dt><dd>{creative.ctr != null ? fmtPct(creative.ctr, 2) : "—"}</dd></div><div><dt>ความถี่</dt><dd>{creative.frequency != null ? `${fmtNum(creative.frequency, 2)}x` : "—"}</dd></div></dl>
      {asset?.copy?.headline && <strong className="cp-creative-headline">{asset.copy.headline}</strong>}
      {asset?.copy?.primaryText && <p className="cp-creative-text">{asset.copy.primaryText}</p>}
      <p>{creative.why}</p>
      {asset && (asset.copy?.callToAction || links.length > 0 || destination) && <div className="cp-creative-links">{asset.copy?.callToAction && <span>{String(asset.copy.callToAction).replaceAll("_", " ")}</span>}
        {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.label} ของ ${creative.creative}`}>{link.key === "facebook" ? "FB" : "IG"} <ExternalLink size={12} aria-hidden="true" /></a>)}
        {destination && <a href={destination} target="_blank" rel="noreferrer">ลิงก์ปลายทาง <ExternalLink size={12} aria-hidden="true" /></a>}
      </div>}
    </div>
  </article>;
}

export function CampaignDetail({ row, compareLabel, canPreview = false }) {
  const [metric, setMetric] = useState("spend");
  const [previewRow, setPreviewRow] = useState(null);
  const [, label, kind] = METRICS.find((m) => m[0] === metric);
  const data = row.series[metric];
  const fatigued = row.creatives.filter((c) => c.fatigue);
  const creativeAssets = row.creatives.filter((c) => c.asset).length;
  const readyDays = Math.max(0, 3 - row.days);
  const readyResults = Math.max(0, 5 - row.leads);
  const confidence = !row.complete ? "ข้อมูลไม่ครบ" : readyDays > 0 || readyResults > 0 ? "ยังประเมินไม่ได้" : "พร้อมตัดสินใจ";
  return <div className="cp-detail-body">
    <section className="cp-readiness" aria-label="ความพร้อมของข้อมูล"><div><span>ความพร้อม</span><strong>{confidence}</strong></div><dl><div><dt>ข้อมูล</dt><dd>{row.complete ? "ครบ" : "รอซิงก์"}</dd></div><div><dt>ระยะเวลา</dt><dd>{row.days} วัน{readyDays ? ` · ขาด ${readyDays}` : " · ผ่าน"}</dd></div><div><dt>ผลลัพธ์</dt><dd>{row.leads}{readyResults ? ` · ขาด ${readyResults}` : " · ผ่าน"}</dd></div></dl></section>
    <div className="cp-detail-primary">
      <section className="cp-trend" aria-label="แนวโน้มรายวัน">
        <header><div><h4>แนวโน้มรายวัน</h4><p>ดูว่าผลงานเริ่มเปลี่ยนตรงวันไหน</p></div><div className="cp-metric-tabs" role="tablist" aria-label="เลือกตัวชี้วัด">{METRICS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={metric === k} className={metric === k ? "active" : ""} onClick={() => setMetric(k)}>{l}</button>)}</div></header>
        <ChartBox type="line" height={190} ariaLabel={`${label} รายวันของ ${row.name}`}
          data={{ labels: row.series.days.map(dayLabel), datasets: [{ label, data, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.10)", fill: true, ...lineSeries(row.series.days.length) }] }}
          options={baseOpts({ scales: { x: { grid: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => (kind === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v)) } } }, plugins: { tooltip: { callbacks: { title: (i) => i[0]?.label ?? "", label: (c) => `${label} ${fmt(kind, c.parsed.y)}` } } } })} />
      </section>

      <aside className={`cp-next cp-next--${row.decision.tone}`} aria-label="ข้อเสนอแนะ">
        <span>ข้อเสนอแนะ</span><h4>{row.decision.label}</h4><p>{row.decision.why}</p><div><b>ทำต่อ</b><p>{row.decision.next}</p></div>
        <small>เทียบ{compareLabel}</small>
        <dl><div><dt>ค่าแอด</dt><dd>{row.delta.spend == null ? "—" : `${row.delta.spend >= 0 ? "+" : ""}${fmtNum(row.delta.spend, 2)}%`}</dd></div><div><dt>ผลลัพธ์</dt><dd>{row.delta.leads == null ? "—" : `${row.delta.leads >= 0 ? "+" : ""}${fmtNum(row.delta.leads, 2)}%`}</dd></div><div><dt>CPL</dt><dd>{row.delta.cpl == null ? "—" : `${row.delta.cpl >= 0 ? "+" : ""}${fmtNum(row.delta.cpl, 2)}%`}</dd></div></dl>
      </aside>
    </div>

    <section className="cp-creative-section" aria-label="ครีเอทีฟ">
      <header><div><h4>ครีเอทีฟ</h4><p>{row.creatives.length} ชิ้นในแคมเปญ</p></div><div className="cp-creative-status">{creativeAssets ? <span className="ads-badge ads-badge--emerald">มีสื่อ {creativeAssets}</span> : <span className="ads-badge ads-badge--zinc">รอ Creative API</span>}{fatigued.length > 0 && <span className="ads-badge ads-badge--amber">เสี่ยงล้า {fatigued.length}</span>}</div></header>
      {row.creatives.length ? <div className="cp-creatives">{row.creatives.map((c) => <CreativeCard key={c.key} creative={c} onPreview={canPreview ? setPreviewRow : undefined} />)}</div> : <p className="cp-no-value">ไม่มีข้อมูลครีเอทีฟ</p>}
    </section>

    <details className="cp-lineage"><summary>ที่มาและวิธีคำนวณ</summary><ul>
      <li>ข้อมูลจำลองจากการ์ดรายวัน · รันมา {row.days} วันในช่วง</li>
      <li>ROAS = รายได้ที่แพลตฟอร์ม attribute ให้แคมเปญ ÷ ค่าแอด จึงไม่ใช่ยอดขายจริงจาก CRM</li>
      <li>งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน {row.budget == null ? "(ยังไม่ตั้ง)" : ""}</li>
      <li>จังหวะ = ค่าแอดสะสมตั้งแต่วันที่ 1 ถึงวันนี้ ÷ งบเดือน เทียบสัดส่วนวันที่ผ่านไป</li>
      <li>ข้อเสนอแนะใช้กฎกลาง เป้าแบรนด์ และข้อมูลขั้นต่ำ 3 วัน / 5 ผลลัพธ์</li>
      <li>ยังไม่มีประวัติการแก้ไขจากแพลตฟอร์ม จึงไม่สรุปว่าการเปลี่ยนงบหรือสถานะเป็นสาเหตุของผลงาน</li>
    </ul></details>
    {previewRow && <CreativePreview row={previewRow} onClose={() => setPreviewRow(null)} />}
  </div>;
}
