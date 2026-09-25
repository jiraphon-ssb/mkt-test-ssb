import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PERIOD_PRESETS, periodRange, isoDay, monthGrid, rangeLabel, daysInclusive, MONTHS_TH_FULL, WEEKDAYS_TH, thaiYear } from "../adsScope.js";
import "./dateRangePicker.css";

/* DateRangePicker — ปุ่มเดียวเปิด popover: ซ้าย = ช่วงสำเร็จรูป (radio) · ขวา = ปฏิทิน 2 เดือน เลือกช่วงเอง (คลิกวันแรก → วันสุดท้าย)
   props: period · from/to (ISO วัน รวมหัวท้าย ที่แสดงอยู่) · onChange({period, from, to}) กดยืนยันถึงส่ง · max = วันสุดท้ายที่เลือกได้ (วันนี้)
   วันที่ทั้งหมดคิดใน adsScope.js (มีเทส) — คอมโพเนนต์นี้แค่แสดงผล/รับคลิก */
const toShown = (range) => ({ from: isoDay(new Date(range.start)), to: isoDay(new Date(new Date(range.end).getTime() - 1)) });
const monthOf = (iso) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1 });
const addMonths = ({ y, m }, n) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
const monthIndex = ({ y, m }) => y * 12 + m;

export function DateRangePicker({ period, from, to, onChange, max = isoDay(new Date()), presets = PERIOD_PRESETS, className = "" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ period, from, to });
  const [pending, setPending] = useState(null);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => addMonths(monthOf(to), -1));
  const root = useRef(null);
  const today = isoDay(new Date());

  useEffect(() => {
    if (!open) return;
    setDraft({ period, from, to }); setPending(null); setView(addMonths(monthOf(to), -1));
    const onDown = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); root.current?.querySelector(".drp-trigger")?.focus(); } };
    document.addEventListener("pointerdown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, period, from, to]);

  const presetLabel = presets.find((p) => p[0] === period)?.[1] ?? "กำหนดเอง";
  const pickPreset = (key) => { const s = toShown(periodRange(key, null, null)); setDraft({ period: key, ...s }); setPending(null); setView(addMonths(monthOf(s.to), -1)); };
  const clickDay = (iso) => {
    if (iso > max) return;
    if (!pending) { setPending(iso); setDraft({ period: "custom", from: iso, to: iso }); return; }
    const [a, b] = iso < pending ? [iso, pending] : [pending, iso];
    setDraft({ period: "custom", from: a, to: b }); setPending(null);
  };
  const [pFrom, pTo] = pending && hover ? (hover < pending ? [hover, pending] : [pending, hover]) : [draft.from, draft.to];
  const months = [view, addMonths(view, 1)];
  const canNext = monthIndex(months[1]) < monthIndex(monthOf(max));
  const apply = () => { onChange(draft); setOpen(false); root.current?.querySelector(".drp-trigger")?.focus(); };

  return <div ref={root} className={`drp ${open ? "drp--open" : ""} ${className}`}>
    <button type="button" className="drp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      <CalendarDays size={14} aria-hidden="true" /><span><b>{presetLabel}</b> · {rangeLabel(from, to)}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className="drp-pop" role="dialog" aria-label="เลือกช่วงเวลา">
      <div className="drp-presets" role="radiogroup" aria-label="ช่วงสำเร็จรูป">
        <span className="drp-presets-title">ช่วงเวลา</span>
        {presets.map(([key, label]) => <button type="button" key={key} role="radio" aria-checked={draft.period === key} className={`drp-preset ${draft.period === key ? "is-on" : ""}`} onClick={() => pickPreset(key)}><i /><span>{label}</span></button>)}
        <button type="button" role="radio" aria-checked={draft.period === "custom"} className={`drp-preset ${draft.period === "custom" ? "is-on" : ""}`} onClick={() => { setDraft((d) => ({ ...d, period: "custom" })); }}><i /><span>กำหนดเอง</span></button>
      </div>
      <div className="drp-cal">
        <div className="drp-months">
          {months.map((mo, i) => <div className="drp-month" key={`${mo.y}-${mo.m}`}>
            <header>
              {i === 0 ? <button type="button" className="drp-nav" aria-label="เดือนก่อนหน้า" onClick={() => setView((v) => addMonths(v, -1))}><ChevronLeft size={16} /></button> : <span className="drp-nav-spacer" />}
              <strong>{MONTHS_TH_FULL[mo.m]} {thaiYear(mo.y)}</strong>
              {i === 1 ? <button type="button" className="drp-nav" aria-label="เดือนถัดไป" disabled={!canNext} onClick={() => setView((v) => addMonths(v, 1))}><ChevronRight size={16} /></button> : <span className="drp-nav-spacer" />}
            </header>
            <div className="drp-grid" role="grid" onMouseLeave={() => setHover(null)}>
              {WEEKDAYS_TH.map((w) => <span key={w} className="drp-wd" role="columnheader">{w}</span>)}
              {monthGrid(mo.y, mo.m).flat().map((iso, idx) => iso == null ? <span key={`e${idx}`} className="drp-empty" /> : (() => {
                const disabled = iso > max;
                const isStart = iso === pFrom, isEnd = iso === pTo, inRange = iso > pFrom && iso < pTo;
                return <button type="button" key={iso} role="gridcell" aria-selected={isStart || isEnd || inRange} aria-label={rangeLabel(iso, iso)} disabled={disabled}
                  className={`drp-day ${isStart ? "is-start" : ""} ${isEnd ? "is-end" : ""} ${inRange ? "in-range" : ""} ${iso === today ? "is-today" : ""} ${pending === iso ? "is-pending" : ""}`}
                  onMouseEnter={() => pending && setHover(iso)} onClick={() => clickDay(iso)}>{Number(iso.slice(8, 10))}</button>;
              })())}
            </div>
          </div>)}
        </div>
        <footer className="drp-foot">
          <span className="drp-summary">{pending ? "เลือกวันสุดท้าย…" : <>{rangeLabel(draft.from, draft.to)} <small>· {daysInclusive(draft.from, draft.to)} วัน</small></>}</span>
          <div className="drp-actions"><button type="button" className="drp-btn" onClick={() => setOpen(false)}>ยกเลิก</button><button type="button" className="drp-btn drp-btn--primary" disabled={Boolean(pending)} onClick={apply}>ใช้ช่วงนี้</button></div>
        </footer>
      </div>
    </div>}
  </div>;
}
