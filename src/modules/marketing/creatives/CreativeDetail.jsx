/* ดูครีเอทีฟเต็ม (คลิกแถวในตารางครีเอทีฟกลาง) — ภาพทั้งชุด · ข้อความเต็ม · ตัวเลข · คำแนะนำ · สถานะ · ลิงก์
   ตัวอย่างโฆษณาจริงจาก Meta (iframe) เปิดต่อจากปุ่มในนี้ เฉพาะเมื่อดูตัวอย่างได้ (canPreview + มีรหัสโฆษณา) */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, X } from "lucide-react";
import { fmtMoney, fmtNum, fmtPct, fmtInt } from "../dash/charts/theme.js";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { CreativePreview } from "./CreativePreview.jsx";
import { StatusDot } from "./CreativeTable.jsx";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import "./creativePreview.css";
import "./creativeTable.css";

const times = (x) => (x == null ? "—" : `${fmtNum(x, 2)}x`);
const when = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(t)) : null;
};

export function CreativeDetail({ row, campaignStatus = null, canPreview = false, onClose }) {
  const [preview, setPreview] = useState(false);
  const closeRef = useRef(null);
  const previewOpen = useRef(false);
  previewOpen.current = preview;
  const asset = row.asset;
  const status = adStatusOf(asset?.status);
  const statusAt = when(asset?.statusAt);
  const links = postLinksOf(asset);
  const copy = asset?.copy ?? {};
  const previewable = Boolean(canPreview && asset?.adId && asset?.connectionId);

  useEffect(() => {
    closeRef.current?.focus();
    // ตัวอย่างจาก Meta ซ้อนอยู่ = Esc ปิดตัวอย่างก่อน ไม่ปิดหน้าต่างนี้ไปด้วย
    const onKey = (event) => { if (event.key === "Escape" && !previewOpen.current) onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const facts = [
    ["ค่าแอด", fmtMoney(row.spend)],
    ["CTR", row.ctr == null ? "—" : fmtPct(row.ctr, 2)],
    ["ความถี่", times(row.frequency)],
    ["ROAS", times(row.roas)],
    row.cpl !== undefined && [row.resultLabel && row.resultLabel !== "ผลลัพธ์" ? `ต่อ${row.resultLabel}` : "ต่อผลลัพธ์ Meta", row.cpl == null ? "—" : fmtMoney(row.cpl)],
    row.purchases !== undefined && ["การซื้อ (Meta)", row.purchases == null ? "—" : fmtInt(row.purchases)],
  ].filter(Boolean);

  return <div className="cl-preview-layer" role="presentation">
    <button type="button" className="cl-preview-backdrop" aria-label="ปิด" onClick={onClose} tabIndex={-1} />
    <section className="cl-preview ct-detail" role="dialog" aria-modal="true" aria-labelledby="ct-detail-title">
      <header>
        <div><span>{[row.brand, row.platform, (row.campaigns ?? []).join(", ")].filter(Boolean).join(" · ")}</span><h2 id="ct-detail-title">{row.creative}</h2></div>
        <button ref={closeRef} type="button" className="cl-preview-close" onClick={onClose} aria-label="ปิด"><X size={16} /></button>
      </header>
      <div className="ct-detail-body">
        <div className="ct-detail-media"><CreativeMedia row={row} onPreview={previewable ? () => setPreview(true) : undefined} /></div>
        <div className="ct-detail-side">
          <div className="ct-detail-status">
            <StatusDot status={status} prefix="โฆษณา" />
            {campaignStatus && <StatusDot status={campaignStatus} prefix="แคมเปญ" />}
            <small>{statusAt ? `สถานะจาก Meta · ${statusAt}` : "ยังไม่มีสถานะจาก Meta (มากับรอบรีเฟรชครีเอทีฟตี 5)"}</small>
          </div>
          <dl className="ct-detail-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className={`ct-detail-advice ct-action--${actionTone(row)}`}><b>{actionLabel(row)}</b>{row.why && <span>{row.why}</span>}</p>
          {copy.headline && <p className="ct-detail-copy"><small>หัวข้อ</small><strong>{copy.headline}</strong></p>}
          {copy.primaryText && <p className="ct-detail-copy"><small>ข้อความโฆษณา</small><span>{copy.primaryText}</span></p>}
          {copy.callToAction && <p className="ct-detail-copy"><small>ปุ่ม</small><span>{String(copy.callToAction).replaceAll("_", " ")}</span></p>}
          <div className="cl-preview-links">
            {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={12} aria-hidden="true" /></a>)}
            {asset?.destinationUrl && <a href={asset.destinationUrl} target="_blank" rel="noreferrer">หน้าปลายทาง <ExternalLink size={12} aria-hidden="true" /></a>}
          </div>
          {previewable && <button type="button" className="ct-detail-preview" onClick={() => setPreview(true)}><Eye size={14} aria-hidden="true" /> ดูตัวอย่างโฆษณาจริงจาก Meta</button>}
        </div>
      </div>
    </section>
    {preview && <CreativePreview row={row} onClose={() => setPreview(false)} />}
  </div>;
}
