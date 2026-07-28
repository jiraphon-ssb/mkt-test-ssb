import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { thaiDate, THAI_MONTHS_SHORT } from "../utils/format.js";

/* DatePicker — single-date, click-to-select (ไม่ต้องพิมพ์). ค่าเป็น YYYY-MM-DD
   (เหมือน <input type="date">) → เปลี่ยน native date input ได้ตรงๆ. Popover เป็น
   portal + position:fixed → ไม่โดน drawer/modal ที่ overflow บัง. ธีมเดียวทั้งแอป
   (AP=Tailwind, AR/OEM=inline tokens) ผ่าน className/style ที่ส่งเข้ามาให้ปุ่ม trigger.
   ปีพุทธ + เดือนไทย ตาม thaiDate. onChange(ymd) — "" = ล้างค่า. */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, dd] = s.split("-").map(Number); return new Date(y, m - 1, dd); };
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
function monthCells(y, m) {
  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  return cells;
}

/* neutrals via CSS vars so the popover follows the light theme (index.css remap) */
const navBtn = { display: "flex", alignItems: "center", justifyContent: "center", height: 26, width: 26, borderRadius: 7, border: "none", background: "transparent", color: "var(--color-zinc-400)", cursor: "pointer" };
const footBtn = { border: "1px solid var(--color-zinc-700)", background: "transparent", color: "var(--color-zinc-300)", borderRadius: 7, padding: "4px 10px", fontSize: 11, cursor: "pointer" };
const POP_H = 300;

export default function DatePicker({ value = "", onChange, placeholder = "เลือกวันที่", className, style, disabled, min, max, id }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? parse(value) : new Date()));
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const place = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= POP_H + 8 ? r.bottom + 4 : Math.max(8, r.top - POP_H - 4);
    const w = 264;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    setPos({ top, left, width: w });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    setView(value ? parse(value) : new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!btnRef.current?.contains(e.target) && !popRef.current?.contains(e.target)) setOpen(false); };
    // capture-phase + stopPropagation so Esc closes ONLY the calendar, not a parent
    // modal/drawer that also listens for Esc on document (would discard its edits)
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const onMove = () => place();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (d) => { onChange?.(ymd(d)); setOpen(false); };
  const disabledDay = (s) => (min && s < min) || (max && s > max);
  const label = value ? thaiDate(value, { year: true }) : "";

  return (
    <>
      <button type="button" id={id} ref={btnRef} disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)} className={className}
        style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", textAlign: "left", cursor: disabled ? "default" : "pointer", ...style }}>
        <Calendar size={14} style={{ color: "var(--color-zinc-500)", flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: label ? "inherit" : "var(--color-zinc-500)" }}>
          {label || placeholder}
        </span>
      </button>

      {open && pos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 9999,
          background: "var(--color-zinc-900)", border: "1px solid var(--color-zinc-700)", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,.35)", padding: 10, fontFamily: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} style={navBtn} aria-label="เดือนก่อน"><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-zinc-200)" }}>{THAI_MONTHS_SHORT[view.getMonth()]} {view.getFullYear() + 543}</span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} style={navBtn} aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center" }}>
            {DOW.map((d) => <div key={d} style={{ fontSize: 10, color: "var(--color-zinc-600)", padding: "2px 0" }}>{d}</div>)}
            {monthCells(view.getFullYear(), view.getMonth()).map((d, i) => {
              if (!d) return <div key={i} />;
              const s = ymd(d);
              const sel = s === value;
              const dis = disabledDay(s);
              return (
                <button key={i} type="button" disabled={dis} onClick={() => !dis && pick(d)}
                  onMouseEnter={(e) => { if (!sel && !dis) e.currentTarget.style.background = "var(--color-zinc-800)"; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}
                  style={{ height: 30, borderRadius: 7, border: "none", fontSize: 12, cursor: dis ? "not-allowed" : "pointer",
                    background: sel ? "var(--color-amber-500)" : "transparent", color: dis ? "var(--color-zinc-700)" : sel ? "#1c232e" : "var(--color-zinc-300)", fontWeight: sel ? 600 : 400 }}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, borderTop: "1px solid var(--color-zinc-800)", paddingTop: 8 }}>
            <button type="button" onClick={() => pick(new Date())} style={footBtn}>วันนี้</button>
            {value && <button type="button" onClick={() => { onChange?.(""); setOpen(false); }} style={footBtn}>ล้าง</button>}
            <button type="button" onClick={() => setOpen(false)} style={{ ...footBtn, marginLeft: "auto" }}>ปิด</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
