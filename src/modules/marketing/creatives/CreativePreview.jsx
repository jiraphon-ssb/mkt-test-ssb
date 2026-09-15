/* ตัวอย่างโฆษณาจริงจาก Meta — iframe ของ Meta เล่นคลิป/ภาพตามตำแหน่งที่ลูกค้าเห็น
   src มาจาก Edge Function ads-preview (ตรวจแล้วฝั่ง server) และตรวจซ้ำที่นี่ก่อนใส่ iframe · ไม่ใช้ HTML จาก Meta */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, LoaderCircle, X } from "lucide-react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { adsErrorText } from "../ads/adsSyncMessages.js";
import { isPreviewSrc, postLinksOf } from "../ads/metaCreativeContract.js";

const FORMATS = [
  ["MOBILE_FEED_STANDARD", "Facebook มือถือ", 690],
  ["DESKTOP_FEED_STANDARD", "Facebook คอม", 640],
  ["INSTAGRAM_STANDARD", "Instagram ฟีด", 720],
  ["INSTAGRAM_STORY", "Instagram สตอรี่", 640],
];
const cache = new Map();   // adId|format → src (ลิงก์ของ Meta มีอายุ ใช้ซ้ำในหน้าเดียวกันพอ)

export function CreativePreview({ row, onClose }) {
  const asset = row.asset;
  const [format, setFormat] = useState(FORMATS[0][0]);
  const [state, setState] = useState({ status: "loading", src: null, error: null });
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    const key = `${asset.adId}|${format}`;
    if (cache.has(key)) { setState({ status: "ready", src: cache.get(key), error: null }); return undefined; }
    setState({ status: "loading", src: null, error: null });
    apiClient.ads.creativePreview(asset.connectionId, asset.adId, format)
      .then((data) => {
        if (!alive) return;
        if (!isPreviewSrc(data?.src)) throw Object.assign(new Error("PREVIEW_UNAVAILABLE"), { code: "PREVIEW_UNAVAILABLE" });
        cache.set(key, data.src);
        setState({ status: "ready", src: data.src, error: null });
      })
      .catch((error) => { if (alive) setState({ status: "error", src: null, error }); });
    return () => { alive = false; };
  }, [asset.adId, asset.connectionId, format]);

  const height = FORMATS.find(([key]) => key === format)?.[2] ?? 690;
  const links = postLinksOf(asset);
  return <div className="cl-preview-layer" role="presentation">
    <button type="button" className="cl-preview-backdrop" aria-label="ปิดตัวอย่าง" onClick={onClose} tabIndex={-1} />
    <section className="cl-preview" role="dialog" aria-modal="true" aria-labelledby="cl-preview-title">
      <header>
        <div><span>{row.brand} · {row.platform}</span><h2 id="cl-preview-title">{row.creative}</h2></div>
        <button ref={closeRef} type="button" className="cl-preview-close" onClick={onClose} aria-label="ปิด"><X size={16} /></button>
      </header>
      <div className="cl-preview-formats" role="tablist" aria-label="ตำแหน่งที่แสดงโฆษณา">
        {FORMATS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={format === key} className={format === key ? "active" : ""} onClick={() => setFormat(key)}>{label}</button>)}
      </div>
      <div className="cl-preview-body">
        <div className="cl-preview-frame" style={{ minHeight: Math.min(height, 720) }}>
          {state.status === "loading" && <div className="cl-preview-state" role="status"><LoaderCircle size={20} className="spin" /><span>กำลังโหลดตัวอย่างจาก Meta…</span></div>}
          {state.status === "error" && <div className="cl-preview-state bad" role="alert"><strong>แสดงตัวอย่างไม่ได้</strong><span>{adsErrorText(state.error, "ลองตำแหน่งอื่นหรือกดดึงข้อมูลใหม่")}</span></div>}
          {state.status === "ready" && <iframe key={state.src} src={state.src} title={`ตัวอย่างโฆษณา ${row.creative}`} width="540" height={height} loading="lazy" referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />}
        </div>
        <aside className="cl-preview-side">
          {asset.copy?.headline && <p><small>หัวข้อ</small><strong>{asset.copy.headline}</strong></p>}
          {asset.copy?.primaryText && <p className="cl-preview-text"><small>ข้อความโฆษณา</small><span>{asset.copy.primaryText}</span></p>}
          {asset.copy?.callToAction && <p><small>ปุ่ม</small><span>{asset.copy.callToAction.replaceAll("_", " ")}</span></p>}
          <div className="cl-preview-links">
            {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={12} /></a>)}
            {asset.destinationUrl && <a href={asset.destinationUrl} target="_blank" rel="noreferrer">หน้าปลายทาง <ExternalLink size={12} /></a>}
          </div>
          <small className="cl-preview-note">ตัวอย่างสร้างโดย Meta ตามตำแหน่งที่เลือก · คลิปเล่นได้ในกรอบนี้</small>
        </aside>
      </div>
    </section>
  </div>;
}
