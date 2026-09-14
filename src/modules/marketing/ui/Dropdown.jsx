import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./dropdown.css";

/* Dropdown — เมนูเลือกค่าแบบของเราเอง (แทน <select> ที่แต่ง popup ไม่ได้)
   props: options [[key,label]] · value · onChange(key) · placeholder · align "start"|"end" · className · active (ปุ่มโชว์สถานะเลือกอยู่)
   คีย์บอร์ด: Enter/Space/↓ เปิด · ↑↓ เลื่อน · Home/End · Enter เลือก · Esc ปิด · คลิกนอกปิด */
export function Dropdown({ options, value, onChange, placeholder = "เลือก", label = null, align = "start", className = "", active = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const root = useRef(null);
  const listId = useId();
  const selected = options.find(([k]) => k === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, options.findIndex(([k]) => k === value));
    setCursor(idx);
    root.current?.querySelector(`[data-idx="${idx}"]`)?.focus();
  }, [open, options, value]);

  const pick = (key) => { onChange(key); setOpen(false); root.current?.querySelector("button")?.focus(); };
  const move = (delta) => setCursor((c) => {
    const next = (c + delta + options.length) % options.length;
    root.current?.querySelector(`[data-idx="${next}"]`)?.focus();
    return next;
  });
  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); root.current?.querySelector("button")?.focus(); return; }
    if (!open) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); setOpen(true); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); root.current?.querySelector('[data-idx="0"]')?.focus(); }
    else if (e.key === "End") { e.preventDefault(); const last = options.length - 1; setCursor(last); root.current?.querySelector(`[data-idx="${last}"]`)?.focus(); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (cursor >= 0) pick(options[cursor][0]); }
    else if (e.key === "Tab") setOpen(false);
  };

  return <div ref={root} className={`dd ${open ? "dd--open" : ""} ${active || selected ? "dd--active" : ""} ${className}`} onKeyDown={onKey}>
    <button type="button" className="dd-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={ariaLabel ?? label ?? undefined} onClick={() => setOpen((o) => !o)}>
      <span>{label && <em className="dd-label">{label} · </em>}<b>{selected ? selected[1] : placeholder}</b></span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <ul id={listId} role="listbox" className={`dd-menu dd-menu--${align}`} aria-label={ariaLabel ?? placeholder} aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}>
      {options.map(([k, l], i) => <li key={k} id={`${listId}-${i}`} role="option" aria-selected={k === value} data-idx={i} tabIndex={-1} className={`dd-item ${k === value ? "is-selected" : ""}`} onMouseEnter={() => setCursor(i)} onClick={() => pick(k)}>
        <span>{l}</span>{k === value && <Check size={14} aria-hidden="true" />}
      </li>)}
    </ul>}
  </div>;
}
