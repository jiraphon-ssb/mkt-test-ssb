/* ============================================================
   MktSelect — dropdown กลางของทั้งระบบ ห้ามใช้ <select> ดิบอีก
   ทำตามแพทเทิร์น OptionPicker ของ ssbgroup-platform (oem/ui.jsx):
   trigger + overlay ปิดคลิกนอก + แผงลอยใต้ปุ่ม + เช็คมาร์ก + chevron หมุน
   เพิ่มจากของเขา: คีย์บอร์ดครบ (ลูกศร/Enter/Esc/Home/End) + จุดสี/hint/จัดกลุ่ม
   + เด้งขึ้นเองถ้าใกล้ขอบล่างจอ · สี/ระยะทั้งหมดมาจาก token ของ SSB

   ใช้:
   <MktSelect value onChange={(v)=>…} placeholder="ทุกแบรนด์" options={[
     { value: "b_td", label: "TEAMDEE", dot: "#F26B21", hint: "grow" },
     { group: "ส่วนที่ 2", options: [{ value, label }, …] },
   ]}/>
   ============================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./mktIcon.jsx";

/** คลี่กลุ่มเป็นลิสต์แบน — ใช้เดินคีย์บอร์ด/หา label ของค่า */
function flat(options) {
  return options.flatMap((o) => (o.group ? o.options : [o]));
}

/**
 * @param {object}   p
 * @param {any}      p.value
 * @param {(v:any)=>void} p.onChange
 * @param {Array}    p.options    [{value,label,hint?,dot?,icon?}] หรือ [{group, options:[…]}] ปนกันได้
 * @param {string}  [p.placeholder] ข้อความตอนยังไม่เลือก (ค่า null/"" = ยังไม่เลือก)
 * @param {boolean} [p.disabled]
 * @param {boolean} [p.compact]   ตัวเล็กสำหรับแถบตัวกรอง/แถวตาราง
 * @param {string}  [p.className]
 */
export function MktSelect({ value, onChange, options, placeholder = "— เลือก —", disabled, compact, className = "" }) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);          /* ใกล้ขอบล่าง = เด้งแผงขึ้น */
  const [hi, setHi] = useState(-1);             /* index ที่คีย์บอร์ดชี้อยู่ (ในลิสต์แบน) */
  const rootRef = useRef(null);
  const popRef = useRef(null);
  const items = useMemo(() => flat(options), [options]);
  const current = items.find((o) => o.value === value);

  const openPop = () => {
    if (disabled) return;
    const r = rootRef.current?.getBoundingClientRect();
    setUp(r ? window.innerHeight - r.bottom < 300 && r.top > 300 : false);
    setHi(Math.max(0, items.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o) => {
    onChange(o.value);
    setOpen(false);
    rootRef.current?.querySelector("button")?.focus();
  };

  /* เลื่อนรายการที่คีย์บอร์ดชี้ให้อยู่ในสายตาเสมอ */
  useEffect(() => {
    if (!open || hi < 0) return;
    popRef.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const onKey = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openPop(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setHi(0); }
    else if (e.key === "End") { e.preventDefault(); setHi(items.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[hi]) pick(items[hi]); }
    else if (e.key === "Tab") setOpen(false);
  };

  /* วาดรายการหนึ่งแถว — ใช้ทั้งแบบมีกลุ่ม/ไม่มีกลุ่ม */
  let flatIdx = -1;
  const renderOpt = (o) => {
    flatIdx += 1;
    const i = flatIdx;
    const on = o.value === value;
    return (
      <button type="button" key={`${o.value}`} data-i={i} role="option" aria-selected={on}
        className={`msel-opt ${on ? "on" : ""} ${i === hi ? "hi" : ""}`}
        onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
        <span className="msel-check">{on && <Icon name="check" size={12}/>}</span>
        {o.dot && <i className="msel-dot" style={{ background: o.dot }}/>}
        {o.icon && <Icon name={o.icon} size={13}/>}
        <span className="msel-lab">{o.label}</span>
        {o.hint && <em className="msel-hint">{o.hint}</em>}
      </button>
    );
  };

  return (
    <div ref={rootRef} className={`msel ${compact ? "compact" : ""} ${className}`} onKeyDown={onKey}>
      <button type="button" className={`msel-btn ${open ? "open" : ""}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openPop())}>
        {current?.dot && <i className="msel-dot" style={{ background: current.dot }}/>}
        {current?.icon && <Icon name={current.icon} size={13}/>}
        <span className={`msel-val ${current ? "" : "ph"}`}>{current?.label ?? placeholder}</span>
        <Icon name="chevron" size={13} className={`msel-chev ${open ? "flip" : ""}`}/>
      </button>

      {open && (<>
        <div className="msel-veil" onClick={() => setOpen(false)}/>
        <div ref={popRef} className={`msel-pop ${up ? "up" : ""}`} role="listbox">
          {options.map((o, gi) => o.group
            ? (<div className="msel-sec" key={`g${gi}`}>
                <div className="msel-group">{o.group}</div>
                {o.options.map(renderOpt)}
              </div>)
            : renderOpt(o))}
        </div>
      </>)}
    </div>
  );
}
