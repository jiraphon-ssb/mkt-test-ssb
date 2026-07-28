import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info as InfoIcon } from "lucide-react";

/* ⓘ ช่วยอธิบาย — ไอคอนเล็กข้าง label/หัวคอลัมน์ กดแล้วเด้งคำอธิบายสั้น ๆ
   (คลิก ไม่ใช่ hover — ใช้บน iPad/มือถือได้). ข้อความมาจากทะเบียน helpText ของ
   แต่ละโมดูล รูปแบบ { t: "คำอธิบาย", ex: "ตัวอย่าง (ถ้ามี)" }.
   render ผ่าน portal + fixed → ไม่โดนตาราง overflow ตัด. Esc/คลิกที่อื่น/สกรอลล์ = ปิด. */

const WIDTH = 280;

export default function Info({ info, className = "" }) {
  const [pos, setPos] = useState(null);   // {left, top} = เปิดอยู่
  const btnRef = useRef(null);

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();                  // อย่าให้แถวตาราง/label ที่ครอบรับ click ไปด้วย
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const below = r.bottom + 8;
    // ล้นจอล่าง → เด้งขึ้นเหนือไอคอนแทน (ประมาณสูง popover ~120px)
    const top = below + 140 > window.innerHeight ? Math.max(8, r.top - 8 - 140) : below;
    setPos({ left, top });
  };

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (!info?.t) return null;              // ไม่มีข้อความ = ไม่ render (ปลอดภัยตอน key หาย)

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} aria-label="คำอธิบาย"
        className={`inline-flex translate-y-[1px] cursor-help text-zinc-600 hover:text-emerald-400 ${pos ? "text-emerald-400" : ""} ${className}`}>
        <InfoIcon size={12.5} strokeWidth={2.2} />
      </button>
      {pos && createPortal(
        <div style={{ position: "fixed", left: pos.left, top: pos.top, width: WIDTH, zIndex: 90 }}
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-left shadow-2xl">
          <div className="text-[12.5px] font-normal leading-relaxed text-zinc-200">{info.t}</div>
          {info.ex && <div className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[11.5px] font-normal leading-relaxed text-zinc-400">เช่น {info.ex}</div>}
        </div>,
        document.body
      )}
    </>
  );
}
