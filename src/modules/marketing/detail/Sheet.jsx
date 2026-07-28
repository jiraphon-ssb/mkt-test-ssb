/* ============================================================
 Sheet — popup กลางของทั้งแอพ (ทุก popup ต้องใช้ตัวนี้)
 ยึดภาษาดีไซน์จากฟอร์ม Brief v2 เป็นมาตรฐาน:
  · หัว sticky: eyebrow (รหัส/หมวด) + title + ปุ่มปิด
  · body: Field (label + ดอกจันบังคับ + hint)
  · footer: ปุ่มหลักดำ + ปุ่มรอง ghost + ข้อความช่วยใต้ปุ่ม
 ปิดได้ด้วย: คลิกฉากหลัง · ปุ่ม ✕ · Esc
 ============================================================ */
import { useEffect, useRef, useState } from "react";

/* ซ้อน popup ได้ (เช่น popup รายฉาก เปิดทับฟอร์มบรีฟ) — Esc ต้องปิดแค่ใบบนสุด
   ไม่งั้นกด Esc ครั้งเดียวปิดหมดทั้งกอง งานที่กรอกค้างไว้หายไปด้วย
   ใช้ stack ระดับโมดูล: ใบที่ mount ทีหลัง = อยู่บนสุด */
const sheetStack = [];

/**
 * @param {object} p
 * @param {boolean} [p.dirty]         มีข้อมูลที่ยังไม่บันทึกอยู่ในฟอร์มนี้
 * @param {string}  [p.dirtyMessage]  ข้อความในกล่องยืนยันตอนจะปิดทั้งที่ยังไม่บันทึก
 */
export function Sheet({
  eyebrow, title, head, subhead, wide, compact, onClose, children, footer,
  dirty = false, dirtyMessage,
}) {
  const boxRef = useRef(null);
  /* ทางออกทางเดียวของทุก popup — ✕ · คลิกฉากหลัง · Esc วิ่งผ่านตัวนี้หมด
     ถ้ายังไม่บันทึกจะถามก่อนเสมอ ไม่ว่าปิดด้วยวิธีไหน (เดิมแต่ละ popup ต่างคนต่างทำ
     บางใบไม่ถามเลย กรอกไปครึ่งทางแล้วกดพลาด = หายหมด) */
  const [askClose, setAskClose] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const requestClose = () => {
    if (dirtyRef.current) { setAskClose(true); return; }
    onClose();
  };
  /* Esc ปิด · ล็อกการเลื่อนหน้าหลัง · Tab วนอยู่ใน popup (ไม่หลุดไปหลังฉาก)
     ทุก popup ในแอพได้พฤติกรรมชุดเดียวกันหมดเพราะผ่านตัวนี้ */
  useEffect(() => {
    const token = {};
    sheetStack.push(token);
    const isTop = () => sheetStack[sheetStack.length - 1] === token;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (!isTop()) return;                       /* ใบล่างไม่รับคีย์ ปล่อยให้ใบบนจัดการ */
      if (e.key === "Escape") { e.stopPropagation(); requestCloseRef.current(); return; }
      if (e.key !== "Tab" || !boxRef.current) return;
      const items = [...boxRef.current.querySelectorAll(sel)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const i = sheetStack.indexOf(token);
      if (i >= 0) sheetStack.splice(i, 1);
      /* คืนค่า scroll เฉพาะตอนไม่มี popup เหลือแล้ว — ปิดใบบนแล้วใบล่างต้องยังล็อกอยู่ */
      if (sheetStack.length === 0) document.body.style.overflow = prevOverflow;
    };
  }, []);
  /* ref กัน effect ผูกกับ onClose เวอร์ชันเก่า — ปุ่มปิดต้องทำงานได้ทุกครั้ง ไม่ใช่บางครั้ง */
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  return (<><div className="overlay" onClick={requestClose}>
   <div ref={boxRef} className={`sheet ${wide ? "wide" : ""} ${compact ? "compact" : ""}`} role="dialog" aria-modal="true" aria-label={title ?? eyebrow ?? "dialog"} onClick={(e) => e.stopPropagation()}>
    {/* ไม่มีหัวเรื่อง = ไม่ต้องมีแถบหัว (กันพื้นที่ว่างเปล่า) — ปุ่มปิดลอยมุมขวา */}
    {head || title || eyebrow || subhead ? (<div className="sheet-head">
      <div className="sheet-head-row">
       {head ?? (<div style={{ flex: 1, minWidth: 0 }}>
         {eyebrow && <div className="sheet-eyebrow mono">{eyebrow}</div>}
         {title && <h2>{title}</h2>}
        </div>)}
       <button className="x" onClick={requestClose} aria-label="ปิด (Esc)" title="ปิด · Esc">✕</button>
      </div>
      {subhead}
     </div>) : (<button className="x x-float" onClick={requestClose} aria-label="ปิด (Esc)" title="ปิด · Esc">✕</button>)}

    <div className="sheet-body">{children}</div>

    {footer && <div className="sheet-foot">{footer}</div>}
   </div>
  </div>

  {/* กล่องยืนยันของ popup ใบนี้เอง — ไม่ผูกกับ context ใด จะได้ใช้ได้ทุกที่ที่ใช้ Sheet */}
  {askClose && (<Sheet
    compact
    title="ปิดโดยไม่บันทึก?"
    onClose={() => setAskClose(false)}
    footer={<div className="confirm-foot">
      <button className="btn ghost danger-text" onClick={() => { setAskClose(false); onClose(); }}>ปิดโดยไม่บันทึก</button>
      <button className="btn dark" autoFocus onClick={() => setAskClose(false)}>กลับไปกรอกต่อ</button>
     </div>}
   >
   <div className="confirm-msg">
    {dirtyMessage ?? "ยังมีข้อมูลที่กรอกไว้แต่ยังไม่ได้บันทึก — ปิดแล้วข้อมูลนี้จะหายไป"}
   </div>
  </Sheet>)}
  </>);
}
/* ---------- Field: label convention ของ Brief v2 ---------- */
export function Field({ label, required, hint, children, }) {
  return (<div className="field-row">
   <div className="form-label">
    {label} {required && <span className="req">*</span>}
   </div>
   {children}
   {hint && <div className="field-hint">{hint}</div>}
  </div>);
}
/* ---------- ปุ่มท้าย popup: หลักดำ + รอง ghost + ข้อความช่วย ---------- */
export function SheetActions({ primaryLabel, onPrimary, primaryDisabled, secondaryLabel, onSecondary, danger, help, }) {
  return (<>
   <div className="sheet-actions">
    {secondaryLabel && (<button className="btn ghost" onClick={onSecondary}>{secondaryLabel}</button>)}
    <button className={`btn ${danger ? "danger" : "dark"}`} disabled={primaryDisabled} onClick={onPrimary}>
     {primaryLabel}
    </button>
   </div>
   {help && <div className="gate-msg">{help}</div>}
  </>);
}
export function ConfirmDialog({ options, onResolve, }) {
  /* กล่องยืนยันมาตรฐาน — งานทำลาย: ปุ่ม "ทำต่อ" ปลอดภัย(dark)เด่นอยู่ขวา
     ปุ่มทำลายเป็นรอง(ghost ตัวหนังสือแดง)อยู่ซ้าย · ไม่ใช่ปุ่มแดงยักษ์เต็มความกว้าง */
  const cancel = options.cancelLabel ?? "ยกเลิก";
  const confirm = options.confirmLabel ?? "ยืนยัน";
  return (<Sheet compact title={options.title} onClose={() => onResolve(false)}
    footer={<div className="confirm-foot">
     {options.danger ? (<>
       <button className="btn ghost danger-text" onClick={() => onResolve(true)}>{confirm}</button>
       <button className="btn dark" autoFocus onClick={() => onResolve(false)}>{cancel}</button>
      </>) : (<>
       <button className="btn ghost" onClick={() => onResolve(false)}>{cancel}</button>
       <button className="btn dark" autoFocus onClick={() => onResolve(true)}>{confirm}</button>
      </>)}
    </div>}>
   {options.message && (<div className="confirm-msg">{options.message}</div>)}
  </Sheet>);
}
