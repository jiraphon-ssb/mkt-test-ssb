/* ไอคอน i ที่ใช้งานได้จริง — จ่อเมาส์ขึ้นทันที · กด = ตรึงไว้อ่าน · Esc/กดข้างนอก/กดซ้ำ = ปิด
   ทำไมไม่ใช้ title ของเบราว์เซอร์: ต้องจ่อค้างราววินาทีครึ่ง · บนมือถือไม่ขึ้นเลย · จัดสไตล์ไม่ได้
   และหายทันทีที่เมาส์ขยับ ทำให้อ่านข้อความหลายบรรทัดไม่ทัน

   เปิดจากสองทางแยกสถานะกัน: hover (ชั่วคราว) กับ pinned (กดตรึง) · เปิดอยู่ = อย่างใดอย่างหนึ่ง
   เคยใช้ open ก้อนเดียวแล้วเจอบั๊ก: จ่อเมาส์เปิดอยู่ → กดเพื่อจะตรึง → toggle ไปปิด ดับต่อหน้า */
import { useEffect, useId, useRef, useState } from "react";

export function InfoTip({ label, lines = [], align = "start" }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  const id = useId();
  const box = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => { setPinned(false); setHover(false); };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      close();
      button.current?.focus();      // กด Esc แล้วโฟกัสต้องกลับมาที่ปุ่ม ไม่หลุดไปต้นหน้า
    };
    const onDown = (event) => { if (!box.current?.contains(event.target)) close(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const text = lines.filter(Boolean);
  if (!text.length) return null;
  return <span className="ui-info" ref={box} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
    {/* ไม่เปิดตอน focus — ตอนกด Esc เราโฟกัสกลับมาที่ปุ่ม เดี๋ยวเด้งเปิดใหม่ · คีย์บอร์ดกด Enter/Space ยิง onClick อยู่แล้ว */}
    <button type="button" ref={button} className="ui-info-btn" aria-expanded={open} aria-controls={id}
      aria-label={`รายละเอียด ${label}`}
      onClick={() => { if (pinned) setHover(false); setPinned(!pinned); }}>i</button>
    {open && <span className="ui-info-box" role="tooltip" id={id} data-align={align}>
      {text.map((line) => <span key={line}>{line}</span>)}
    </span>}
  </span>;
}
