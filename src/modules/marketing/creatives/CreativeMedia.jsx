/* สื่อบนการ์ด Creative — กรอบ 1:1 เสมอ (คลังครีเอทีฟ + drawer แคมเปญ)
   ภาพ/คลิปทุกสัดส่วน (9:16 · 4:5 · 16:9) แสดงครบทั้งชิ้น (contain) บนพื้นเบลอจากภาพเดียวกัน → ข้อความบนกราฟิกไม่ถูกตัด
   หลายภาพ: ปุ่มก่อนหน้า/ถัดไป (ปลายสุดซ่อนปุ่ม) · ลูกศรซ้าย/ขวาบนคีย์บอร์ด · ปัดบนจอสัมผัส · ตัวนับ n / ทั้งหมด · จุดบอกตำแหน่ง (≤10 ภาพ)
   สถานะต่อภาพ: กำลังโหลด · ภาพหมดอายุ/โหลดไม่ขึ้น · ไม่มีภาพ · กดทั้งกรอบดูตัวอย่างโฆษณาจริงเมื่อมีรหัสโฆษณา */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Film, ImageOff, Images, Image as ImageIcon, Play } from "lucide-react";
import { clampIndex, mediaView, swipeStep } from "./creativeMedia.js";
import "./creativeMedia.css";

const KIND_ICON = { video: Film, carousel: Images, image: ImageIcon, none: ImageOff };
const MAX_DOTS = 10;

export function CreativeMedia({ row, onPreview }) {
  const asset = row.asset;
  const view = mediaView(asset);
  const multi = view.count > 1;
  // ตำแหน่งผูกกับชุดภาพ: ชุดเปลี่ยน (ดึงใหม่/เปลี่ยนหน้า) → กลับภาพแรก
  const [nav, setNav] = useState({ key: view.key, index: 0 });
  const index = nav.key === view.key ? clampIndex(nav.index, view.count) : 0;
  const item = view.items[index] ?? null;
  const src = item?.src ?? null;
  const [loads, setLoads] = useState({});   // src → loaded | error (กลับมาภาพเดิมไม่ต้องโหลดใหม่)
  const state = !src ? "none" : loads[src] ?? "loading";
  const broken = state === "error";
  const canPreview = Boolean(asset?.adId && asset?.connectionId && onPreview);
  const prevRef = useRef(null);
  const nextRef = useRef(null);
  const focusAfter = useRef(null);
  const touch = useRef(null);
  const swipedAt = useRef(0);

  const mark = (url, next) => setLoads((current) => (current[url] === next ? current : { ...current, [url]: next }));
  const go = (target) => {
    const next = clampIndex(target, view.count);
    if (next === index) return;
    // ถึงปลายแล้วปุ่มที่โฟกัสอยู่จะถูกซ่อน → ย้ายโฟกัสไปปุ่มฝั่งตรงข้าม ไม่ให้โฟกัสหลุด
    const active = document.activeElement;
    if (active === nextRef.current && next === view.count - 1) focusAfter.current = "prev";
    else if (active === prevRef.current && next === 0) focusAfter.current = "next";
    setNav({ key: view.key, index: next });
  };

  useEffect(() => {
    const target = focusAfter.current === "prev" ? prevRef.current : focusAfter.current === "next" ? nextRef.current : null;
    focusAfter.current = null;
    target?.focus();
  }, [index]);

  // โหลดภาพถัดไปรอไว้ → กดเลื่อนแล้วขึ้นทันที
  const upcoming = view.items[index + 1]?.src;
  useEffect(() => {
    if (!upcoming || loads[upcoming]) return;
    const img = new Image();
    img.decoding = "async";
    img.src = upcoming;
  }, [upcoming, loads]);

  const onKeyDown = (event) => {
    if (!multi || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      go(index + (event.key === "ArrowRight" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      go(event.key === "Home" ? 0 : view.count - 1);
    }
  };
  const onTouchStart = (event) => {
    const point = event.touches[0];
    touch.current = event.touches.length === 1 ? { x: point.clientX, y: point.clientY } : null;
  };
  const onTouchEnd = (event) => {
    const start = touch.current;
    touch.current = null;
    const point = event.changedTouches[0];
    if (!multi || !start || !point) return;
    const step = swipeStep(point.clientX - start.x, point.clientY - start.y);
    if (!step) return;
    swipedAt.current = event.timeStamp;   // กันคลิกที่ตามมาหลังปัด (ถ้ามี) ไม่ให้เปิดหน้าต่างตัวอย่าง
    go(index + step);
  };
  const openPreview = (event) => {
    if (event.timeStamp - swipedAt.current < 500) return;
    onPreview(row);
  };

  const KindIcon = KIND_ICON[view.kind];
  const badge = multi ? "ชุดภาพ" : view.label;
  const alt = [asset?.copy?.headline || row.creative, multi ? `ภาพที่ ${index + 1} จาก ${view.count}` : null].filter(Boolean).join(" · ");

  return <div
    className={`cl-media cl-media--${view.kind}`}
    data-state={state}
    data-multi={multi || undefined}
    role={multi ? "group" : undefined}
    aria-roledescription={multi ? "ชุดภาพ" : undefined}
    aria-label={multi ? `${row.creative} · ${view.count} ภาพ · ใช้ลูกศรซ้ายขวาเพื่อเลื่อน` : undefined}
    tabIndex={multi && !canPreview ? 0 : undefined}
    onKeyDown={multi ? onKeyDown : undefined}
    onTouchStart={multi ? onTouchStart : undefined}
    onTouchEnd={multi ? onTouchEnd : undefined}
    onTouchCancel={multi ? () => { touch.current = null; } : undefined}
  >
    {src && !broken && <>
      <img key={`b|${src}`} className="cl-media-backdrop" src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <img key={src} className="cl-media-img" src={src} alt={alt} loading="lazy" decoding="async" draggable="false" onLoad={() => mark(src, "loaded")} onError={() => mark(src, "error")} />
    </>}
    {state === "loading" && <span className="cl-media-skeleton" aria-hidden="true" />}
    {(state === "none" || broken) && <span className="cl-media-fallback">
      <ImageOff size={24} aria-hidden="true" />
      <strong>{broken ? (multi ? "ภาพนี้หมดอายุ" : "ภาพหมดอายุ") : "ยังไม่มีภาพ"}</strong>
      <small>{broken ? (multi ? "เลื่อนดูภาพอื่นได้ หรือดึงข้อมูลใหม่ในหน้าสถานะ Sync" : "กดดึงข้อมูลใหม่ในหน้าสถานะ Sync") : canPreview ? "กดเพื่อดูตัวอย่างโฆษณาจาก Meta" : "จะแสดงหลังดึง Creative สำเร็จ"}</small>
    </span>}
    {item?.type === "video" && !broken && <span className="cl-media-play" aria-hidden="true"><Play size={20} fill="currentColor" /></span>}
    <span className="cl-media-badge"><KindIcon size={12} aria-hidden="true" />{badge}</span>
    {canPreview && <button type="button" className="cl-media-open" onClick={openPreview} aria-label={`ดูตัวอย่างโฆษณา ${row.creative} (${view.label})`}>
      <span className="cl-media-hint" aria-hidden="true">ดูตัวอย่างโฆษณา</span>
    </button>}
    {multi && <>
      <button ref={prevRef} type="button" className="cl-media-nav cl-media-nav--prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label="ภาพก่อนหน้า"><ChevronLeft size={20} aria-hidden="true" /></button>
      <button ref={nextRef} type="button" className="cl-media-nav cl-media-nav--next" onClick={() => go(index + 1)} disabled={index === view.count - 1} aria-label="ภาพถัดไป"><ChevronRight size={20} aria-hidden="true" /></button>
      <span className="cl-media-count" aria-live="polite" aria-atomic="true"><span className="cl-media-sr">ภาพที่ </span>{index + 1} / {view.count}</span>
      {view.count <= MAX_DOTS && <span className="cl-media-dots" aria-hidden="true">{view.items.map((media, i) => <i key={`${i}|${media.src}`} className={i === index ? "on" : undefined} />)}</span>}
    </>}
  </div>;
}
