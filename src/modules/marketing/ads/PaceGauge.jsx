/* หน้าปัดจังหวะ — ครึ่งวงกลม เติมจากซ้าย สเกล 0–200% (สเปก 2026-09-21 หัวข้อ 3.1)
   จุดอ่อนของหน้าปัดแบบนี้คือ "ต้องหาขีด 100% ก่อนถึงรู้ว่าเร็วหรือช้า" แก้ด้วย 3 อย่างที่ต้องมีครบ:
     ① หมุดสามเหลี่ยม + คำว่า "ตามแผน" ตรงขีด 100%   ② รางสองโทน ซ้าย(ยังไม่ถึงแผน)เข้มกว่าขวา(เกินแผน)
     ③ ปลายส่วนโค้งตัดตรง — ปลายมนล้ำออกไปครึ่งความหนาเส้น ทำให้เทียบกับหมุดคลาดเคลื่อน
   ใช้กับ "ยิ่งมากยิ่งดี" เท่านั้น (ยอดขาย) — ห้ามใส่การ์ดงบ เพราะยิ่งยาวยิ่งเขียว ซึ่งกลับหัวกับงบ */
import { GAUGE_MAX, gaugeFraction, paceLabel, paceReason, paceTone } from "./paceEngine.js";
import { fmtNum } from "../dash/charts/theme.js";
import "./paceGauge.css";

const R = 62, SW = 13, CX = 86, CY = 78;
const pt = (f, r) => {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, f)));
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};
const arc = (f1, f2, r) => {
  const [x1, y1] = pt(f1, r), [x2, y2] = pt(f2, r);
  return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`;
};
const HALF = 1 / GAUGE_MAX;                       // ตำแหน่ง 100% บนสเกล 0–200% = กึ่งกลางพอดี

/** kind = ชุดคำที่ใช้ · higher (จังหวะรายเดือน) · spend (งบ) · rate_higher (ROAS) · rate_lower (%Ads · CPL · CAC)
    ไม่ใส่ = เดาจาก direction ของ pace ที่ส่งมา */
export function PaceGauge({ pace, kind = null, title = "จังหวะทำยอด", caption = "ของที่ควรได้วันนี้", width = 200, mini = false, label: sideLabel = null, showValue = true, showState = true }) {
  const state = pace?.state ?? "unknown";
  const tone = paceTone(state);
  const direction = kind ?? pace?.direction ?? "higher";
  const label = paceLabel(state, direction);
  const reason = paceReason(pace?.reason);
  const { fraction, over } = gaugeFraction(pace?.value);
  const text = pace?.value == null ? "—" : `${fmtNum(pace.value * 100, 2)}%`;
  const [tx1, ty1] = pt(HALF, R - SW / 2 - 1), [tx2, ty2] = pt(HALF, R + SW / 2 + 1);
  const pinY = CY - R - SW / 2 - 4;

  /* มินิซ่อนป้ายใต้วง (0%/200%/คำบรรยาย) แล้ว — viewBox ต้องหดตาม ไม่งั้น SVG จองที่ว่างล่างไว้ 26px
     กลายเป็นแถบตายมองไม่เห็นดันเนื้อหาข้างล่างหนี (จับได้ตอนรีวิว ui-ux-pro-max: whitespace-balance) */
  const viewH = mini ? CY + 8 : CY + 26;
  return <div className={`pg ${tone} ${mini ? "pg--mini" : ""}`}>
    <svg viewBox={`0 0 ${CX * 2} ${viewH}`} width={width} role="img"
      aria-label={`${title} ${text} ${caption} — ${label}${reason ? ` (${reason})` : ""}`}>
      <path className="pg-track left" d={arc(0, HALF, R)} strokeWidth={SW} fill="none" strokeLinecap="round" />
      <path className="pg-track right" d={arc(HALF, 1, R)} strokeWidth={SW} fill="none" strokeLinecap="round" />
      {fraction != null && fraction > 0 && (
        <path className="pg-val" d={arc(0, fraction, R)} strokeWidth={SW} fill="none" strokeLinecap="butt" />
      )}
      <line className="pg-tick" x1={tx1} y1={ty1} x2={tx2} y2={ty2} strokeWidth="2.5" />
      <polygon className="pg-pin" points={`${CX - 5},${pinY} ${CX + 5},${pinY} ${CX},${pinY + 7}`} />
      {/* ตัวชี้วัดแบบอัตราไม่มีตาราง "ควรถึงวันนี้" — หมุดคือเส้นเป้า ไม่ใช่จังหวะ */}
      {!mini && <text className="pg-pin-label" x={CX} y={pinY - 4} textAnchor="middle">{direction === "rate_lower" ? "เพดาน" : direction.startsWith("rate") ? "เป้า" : "ตามแผน"}</text>}
      {/* ทะลุสเกล — วางนอกวงพ้นความหนาเส้น ไม่งั้นกลืนไปกับปลายส่วนโค้งจนมองไม่เห็น */}
      {over && <text className="pg-over" x={CX + R + 11} y={CY + 5} textAnchor="middle">»</text>}
      {showValue && <text className="pg-value" x={CX} y={CY - 12} textAnchor="middle">{text}</text>}
      {!mini && <text className="pg-caption" x={CX} y={CY + 2} textAnchor="middle">{caption}</text>}
      {!mini && <><text className="pg-end" x="7" y={CY + 19}>0%</text>
      <text className="pg-end" x={CX * 2 - 7} y={CY + 19} textAnchor="end">200%</text></>}
    </svg>
    {showState && <div className="pg-state">{sideLabel ? <><span className="pg-side">{sideLabel}</span> {label}</> : label}</div>}
    {reason && <div className="pg-reason">{reason}</div>}
  </div>;
}
