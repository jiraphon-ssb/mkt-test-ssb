/* สื่อบนการ์ด Creative — กรอบ 1:1 เสมอ
   ภาพ/คลิปทุกสัดส่วน (9:16 · 4:5 · 16:9) แสดงครบทั้งชิ้น (contain) บนพื้นเบลอจากภาพเดียวกัน → ข้อความบนกราฟิกไม่ถูกตัด
   สถานะ: กำลังโหลด (skeleton) · ภาพหมดอายุ/โหลดไม่ขึ้น · ไม่มีภาพ · ภาพจากเพจ · กดดูตัวอย่างโฆษณาจริงเมื่อมีรหัสโฆษณา */
import { useState } from "react";
import { Film, ImageOff, Images, Image as ImageIcon, Play } from "lucide-react";
import { mediaView } from "./creativeMedia.js";

const KIND_ICON = { video: Film, carousel: Images, image: ImageIcon, none: ImageOff };

export function CreativeMedia({ row, onPreview }) {
  const asset = row.asset;
  const view = mediaView(asset);
  const [status, setStatus] = useState({ src: view.src, state: view.src ? "loading" : "none" });
  // ภาพเปลี่ยน (ดึงข้อมูลใหม่/เปลี่ยนหน้า) → เริ่มสถานะโหลดใหม่ ไม่ค้าง error ของภาพเก่า
  const state = status.src === view.src ? status.state : view.src ? "loading" : "none";
  const set = (next) => setStatus({ src: view.src, state: next });
  const canPreview = Boolean(asset?.adId && asset?.connectionId && onPreview);
  const broken = state === "error";
  const KindIcon = KIND_ICON[view.kind];
  const alt = asset?.copy?.headline || row.creative;

  const frame = <div className={`cl-media cl-media--${view.kind}`} data-state={state}>
    {view.src && !broken && <>
      <img className="cl-media-backdrop" src={view.src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <img className="cl-media-img" src={view.src} alt={alt} loading="lazy" decoding="async" onLoad={() => set("loaded")} onError={() => set("error")} />
    </>}
    {state === "loading" && <span className="cl-media-skeleton" aria-hidden="true" />}
    {(view.kind === "none" || broken) && <span className="cl-media-fallback">
      <ImageOff size={24} aria-hidden="true" />
      <strong>{broken ? "ภาพหมดอายุ" : "ยังไม่มีภาพ"}</strong>
      <small>{broken ? "กดดึงข้อมูลใหม่ในหน้าสถานะ Sync" : canPreview ? "กดเพื่อดูตัวอย่างโฆษณาจาก Meta" : "จะแสดงหลังดึง Creative สำเร็จ"}</small>
    </span>}
    {view.kind === "video" && !broken && <span className="cl-media-play" aria-hidden="true"><Play size={20} fill="currentColor" /></span>}
    <span className="cl-media-badge"><KindIcon size={12} aria-hidden="true" />{view.label}</span>
    {view.fromPage && !broken && <span className="cl-media-note">ภาพจากเพจ</span>}
    {canPreview && <span className="cl-media-hint" aria-hidden="true">ดูตัวอย่างโฆษณา</span>}
  </div>;

  return canPreview
    ? <button type="button" className="cl-media-button" onClick={() => onPreview(row)} aria-label={`ดูตัวอย่างโฆษณา ${row.creative} (${view.label})`}>{frame}</button>
    : frame;
}
