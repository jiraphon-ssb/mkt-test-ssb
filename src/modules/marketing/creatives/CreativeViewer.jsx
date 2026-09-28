/* หน้าต่างครีเอทีฟตัวเดียว — แบบ B ที่อาร์ตเคาะ 25 ก.ย. ("ต้องแสดงข้อมูลละเอียด")
   ซ้าย: รูปทั้งชุด (หรือตัวอย่างจาก Meta ในกรอบเดียวกัน) · ลิงก์โพสต์ · ข้อความโฆษณา
   ขวา: สถานะ · คำแนะนำ · ตัวเลข 3 กลุ่ม (การใช้เงิน · การเข้าถึง · ผลลัพธ์)
   ล่าง: อยู่ใน N แคมเปญ แยกตัวเลขรายแคมเปญ
   ไม่มีอะไรเด้งซ้อน · ‹ › และลูกศรซ้าย/ขวา = ชิ้นก่อน/ถัดไป · Esc ปิด */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Eye, Image as ImageIcon, X } from "lucide-react";
import { fmtInt, fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { mediaView } from "./creativeMedia.js";
import { FORMAT_LABELS, creativeFormatOf } from "./creativeLibrary.js";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { MetaPreviewPane } from "./CreativePreview.jsx";
import { actionLabel, actionTone, adStatusOf, campaignDeliveryOf } from "./creativeStatus.js";
import { RULE_STATUS_TEXT } from "./creativeRules.js";
import "./creativePreview.css";
import "./creativeViewer.css";
import { useDialogFocus } from "../ui/useDialogFocus.js";

const times = (x) => (x == null ? "—" : `${fmtNum(x, 2)}×`);
const pct = (x) => (x == null ? "—" : fmtPct(x, 2));
const int = (x) => (x == null ? "—" : fmtInt(x));
const when = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(t)) : null;
};

export function Dot({ status, prefix = "" }) {
  return <span className={`cv-status cv-status--${status.tone}`}><i aria-hidden="true" />{prefix}{status.label}</span>;
}

/* สถานะคอลัมน์เดียว (26 ก.ย. — สองคอลัมน์ทำตารางล้นขวาและพูดซ้ำ): สถานะแคมเปญ
   + "ชิ้นนี้ปิด" เฉพาะกรณีแคมเปญเปิดแต่ชิ้นนี้ไม่ได้วิ่ง ซึ่งเป็นกรณีเดียวที่ให้ข้อมูลเพิ่ม */
function CampaignState({ camp, ad, name }) {
  /* ลำดับเดียวกับหน้าแคมเปญ (26 ก.ย.): สถานะจากโฆษณาในแคมเปญ → สถานะชิ้นนี้ → ท้ายชื่อ "เปิด/CLS" · ไม่รู้ = ว่าง */
  const byName = campaignDeliveryOf({ name, creatives: [] });
  const shown = camp && camp.key !== "unknown" ? camp : ad.key !== "unknown" ? ad : byName;
  if (shown.key === "unknown") return null;
  const extra = shown.on === true && ad.on === false;
  return <span className="cv-camp-state"><Dot status={shown} />{extra && <small>ชิ้นนี้ปิด</small>}</span>;
}

function Group({ title, items }) {
  return <section className="cv-group" role="group" aria-label={title}>
    <h3>{title}</h3>
    <dl>{items.map(([k, v, cls]) => <div key={k}><dt>{k}</dt><dd className={cls}>{v}</dd></div>)}</dl>
  </section>;
}

/** ruleOf: (row) => ผลกฎ (หน้าคลังที่เปิดกฎอยู่) — เหตุผลเต็มอยู่ที่นี่ การ์ดเหลือบรรทัดเดียว */
export function CreativeViewer({ rows, index, onIndex, onClose, canPreview = false, campaignStatus = new Map(), highlightCampaign = null, ruleOf = null }) {
  const row = rows[index];
  const [preview, setPreview] = useState(false);
  const [fullCopy, setFullCopy] = useState(false);
  const closeRef = useRef(null);
  const nav = useRef({ index, count: rows.length, onIndex, onClose });
  nav.current = { index, count: rows.length, onIndex, onClose };
  const previewable = Boolean(canPreview && row?.asset?.adId && row?.asset?.connectionId);

  useEffect(() => { setPreview(false); setFullCopy(false); }, [index]);
  /* focus เข้าหน้าต่าง · Tab วน · Esc ปิด · ปิดแล้วคืน focus ให้ตัวที่เปิด (ชุด B ข้อ 16) */
  const dialogRef = useRef(null);
  useDialogFocus(true, dialogRef, () => nav.current.onClose(), closeRef);
  useEffect(() => {
    const onKey = (event) => {
      const { index: i, count, onIndex: go } = nav.current;
      // ลูกศรในกรอบรูปใช้เลื่อนภาพ (CreativeMedia จัดการเอง) — เลื่อนชิ้นเฉพาะเมื่อโฟกัสไม่อยู่ในกรอบรูป
      if (event.target?.closest?.(".cl-media")) return;
      if (event.key === "ArrowRight" && i < count - 1) go(i + 1);
      if (event.key === "ArrowLeft" && i > 0) go(i - 1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, []);
  if (!row) return null;

  const status = adStatusOf(row.asset?.status);
  const rule = ruleOf?.(row) ?? null;
  const statusAt = when(row.asset?.statusAt);
  const copy = row.asset?.copy ?? {};
  const links = postLinksOf(row.asset);
  const per = row.perCampaign ?? [];
  const view = mediaView(row.asset);
  const result = row.resultLabel && row.resultLabel !== "ผลลัพธ์" ? row.resultLabel : "ผลลัพธ์ Meta";
  const pctAds = row.revenue > 0 ? row.spend / row.revenue : null;
  const tone = actionTone(row);
  const longCopy = (copy.primaryText ?? "").split("\n").length > 5 || (copy.primaryText ?? "").length > 280;
  const meta = [row.brand, row.platform, FORMAT_LABELS[creativeFormatOf(row)] + (view.count > 1 ? ` ${view.count} ภาพ` : "")].filter(Boolean).join(" · ");

  return <div className="cl-preview-layer" role="presentation">
    <button type="button" className="cl-preview-backdrop" aria-label="ปิด" onClick={onClose} tabIndex={-1} />
    <section ref={dialogRef} className="cl-preview cv" role="dialog" aria-modal="true" aria-labelledby="cv-title">
      <header className="cv-head">
        <div className="cv-head-text"><span>{meta}</span><h2 id="cv-title">{row.creative}</h2></div>
        <div className="cv-nav">
          <div className="cv-stepper">
            <button type="button" aria-label="ชิ้นก่อนหน้า" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={16} /></button>
            <span>{index + 1} / {rows.length}</span>
            <button type="button" aria-label="ชิ้นถัดไป" disabled={index >= rows.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={16} /></button>
          </div>
          <button ref={closeRef} type="button" className="cv-close" aria-label="ปิด" onClick={onClose}><X size={16} /></button>
        </div>
      </header>

      <div className="cv-body">
        <div className="cv-left">
          <div className="cv-media">{preview && previewable ? <MetaPreviewPane row={row} /> : <CreativeMedia key={row.key} row={row} />}</div>
          <div className="cv-actions">
            {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={12} aria-hidden="true" /></a>)}
            {row.asset?.destinationUrl && <a href={row.asset.destinationUrl} target="_blank" rel="noreferrer">หน้าปลายทาง <ExternalLink size={12} aria-hidden="true" /></a>}
            {previewable && (preview
              ? <button type="button" onClick={() => setPreview(false)}><ImageIcon size={13} aria-hidden="true" />กลับไปดูภาพ</button>
              : <button type="button" onClick={() => setPreview(true)}><Eye size={13} aria-hidden="true" />ตัวอย่างจาก Meta</button>)}
          </div>
          {(copy.headline || copy.primaryText) && <section className="cv-copy">
            <h3>ข้อความโฆษณา</h3>
            {copy.headline && <strong>{copy.headline}</strong>}
            {copy.primaryText && <p className={fullCopy ? undefined : "is-clamped"}>{copy.primaryText}</p>}
            {longCopy && <button type="button" className="cv-more" onClick={() => setFullCopy((v) => !v)}>{fullCopy ? "ย่อ" : "อ่านทั้งหมด"}</button>}
            {copy.callToAction && <small>ปุ่ม: {String(copy.callToAction).replaceAll("_", " ").toLowerCase()}</small>}
          </section>}
        </div>

        <div className="cv-right">
          {/* ไม่รู้สถานะ = ไม่ขึ้นป้ายและไม่ขึ้นบรรทัดเทคนิค (สเปก 2026-09-26 · ที่มาอยู่ใน "สูตรและที่มา" ของหน้าคลัง) */}
          {status.key !== "unknown" && <div className="cv-state"><span className={`cv-pill cv-pill--${status.tone}`}><i aria-hidden="true" />โฆษณา{status.label}</span>
            {statusAt && <small>สถานะจาก Meta · {statusAt}</small>}</div>}
          {rule && <section className={`cv-rule cv-rule--${rule.status}`} role="group" aria-label="ผลกฎ"><b>{RULE_STATUS_TEXT[rule.status] ?? rule.status}</b>{rule.text && <span>{rule.text}</span>}</section>}
          <p className={`cv-advice cv-advice--${tone}`}><b>{actionLabel(row)}</b>{row.why && <span> · {row.why}</span>}</p>
          <Group title="การใช้เงิน" items={[["ค่าแอด", fmtMoney(row.spend)], ["CPM", row.cpm == null ? "—" : fmtMoney(row.cpm)], ["CPC", row.cpc == null ? "—" : fmtMoney(row.cpc)]]} />
          {/* คลิกลิงก์ก่อน (สเปก 2026-09-26) · CTR ทั้งหมดยังอยู่เพราะเป็นฐานของกฎเริ่มล้าและกฎคัดครีเอทีฟ */}
          <Group title="การเข้าถึง" items={[
            ["การแสดงผล", int(row.impressions)], ["เข้าถึง (รวมรายวัน)", int(row.reach)], ["ความถี่", times(row.frequency)],
            ["คลิกลิงก์", int(row.linkClicks)], ["CTR ลิงก์", pct(row.linkCtr)], ["CPC ลิงก์", row.linkCpc == null ? "—" : fmtMoney(row.linkCpc)],
            ["CTR ทั้งหมด", pct(row.ctr)], ["CTR ทั้งหมด ครึ่งแรก → หลัง", row.ctrEarly == null || row.ctrLate == null ? "—" : `${fmtPct(row.ctrEarly, 2)} → ${fmtPct(row.ctrLate, 2)}`],
          ]} />
          <Group title="ผลลัพธ์" items={[
            [result, int(row.leads)], [`ต้นทุนต่อ${result === "ผลลัพธ์ Meta" ? "ผลลัพธ์" : result}`, row.cpl == null ? "—" : fmtMoney(row.cpl)], ["การซื้อ (Meta)", int(row.purchases)],
            ["ต่อการซื้อ", row.cpa == null ? "—" : fmtMoney(row.cpa)], ["รายได้ที่ Meta เห็น", row.revenue == null ? "—" : fmtMoney(row.revenue)],
            ["ROAS (Meta) · %Ads (Meta)", `${times(row.roas)} · ${pct(pctAds)}`, row.roas != null && row.roas < 1 ? "bad" : undefined],
          ]} />
        </div>

        {per.length > 0 && <section className="cv-campaigns" aria-label={`อยู่ใน ${per.length} แคมเปญ`}>
          <h3>อยู่ใน {per.length} แคมเปญ</h3>
          <div className="cv-campaigns-scroll"><table>
            <thead><tr><th>แคมเปญ</th><th>สถานะ</th><th className="num">ค่าแอด</th><th className="num">การแสดงผล</th><th className="num">CTR ลิงก์</th><th className="num">ผลลัพธ์</th><th className="num">ต่อผลลัพธ์</th><th className="num">ซื้อ (Meta)</th><th className="num">ROAS (Meta)</th></tr></thead>
            <tbody>{per.map((p) => <tr key={p.campaign} className={p.campaign === highlightCampaign ? "is-here" : undefined}>
              <th title={p.campaign}><Link to={`/mkt/campaigns?open=${encodeURIComponent(p.campaign)}`} onClick={onClose}>{p.campaign}</Link>
                {p.adsets?.length > 0 && <small className="cv-adsets" title={`ชุดโฆษณา: ${p.adsets.join(" · ")}`}>{p.adsets.join(" · ")}</small>}</th>
              <td><CampaignState camp={campaignStatus.get(p.campaign) ?? null} ad={adStatusOf(p.status)} name={p.campaign} /></td>
              <td className="num">{fmtMoney(p.spend)}</td>
              <td className="num">{int(p.impressions)}</td>
              <td className="num">{pct(p.linkCtr)}</td>
              <td className="num">{int(p.leads)}</td>
              <td className="num">{p.cpl == null ? "—" : fmtMoney(p.cpl)}</td>
              <td className="num">{int(p.purchases)}</td>
              <td className={`num${p.roas != null && p.roas < 1 ? " bad" : ""}`}>{times(p.roas)}</td>
            </tr>)}</tbody>
          </table></div>
        </section>}
      </div>
    </section>
  </div>;
}
