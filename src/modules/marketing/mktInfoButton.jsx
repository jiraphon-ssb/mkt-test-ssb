/* ปุ่ม i + ป้ายคำอธิบาย — ใช้ซ่อนคำอธิบายยาวๆ ไว้ ให้หน้าจอเหลือแต่เนื้อ
 ปิดด้วยคลิกนอกกล่องหรือ Esc */
import { useEffect, useRef, useState } from "react";
export function InfoButton({ label, text }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open)
      return;
    const away = (e) => {
      if (!box.current?.contains(e.target))
        setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (<div className="infowrap" ref={box}>
   <button className={`infobtn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-label={`คำอธิบาย ${label}`} aria-expanded={open}>
    i
   </button>
   {open && <div className="infopop">{text}</div>}
  </div>);
}
