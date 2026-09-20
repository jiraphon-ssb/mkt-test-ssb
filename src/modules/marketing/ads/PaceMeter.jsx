import { paceTone } from "./paceEngine.js";
import "./paceMeter.css";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pointOnArc = (position) => {
  const angle = Math.PI * (1 - position);
  return { x: 100 + 78 * Math.cos(angle), y: 99 - 78 * Math.sin(angle) };
};

/** หน้าปัด Pace กลาง
 * progress = actual ÷ target/จังหวะ (1 = พอดี) · ถ้าส่ง expected จะคำนวณ progress ÷ expected
 * health ใช้ progress 0–1 โดยตรง (1 = สด/ครบ)
 */
export function PaceMeter({ pace, label, detail = null, expected = null, compact = false, variant = "bar", kind = "outcome", actualText = null, planText = null }) {
  const raw = pace?.ratioToPace ?? (expected > 0 && pace?.progress != null ? pace.progress / expected : pace?.progress);
  const progress = raw == null || !Number.isFinite(raw) ? null : raw;
  const tone = paceTone(pace?.state);
  if (variant !== "gauge") {
    if (pace?.progress == null) return <span className="pace-empty">ยังประเมินไม่ได้</span>;
    return <div className={`pace-meter pace-bar ${compact ? "compact" : ""}`}>
      {(label || detail) && <div className="pace-copy"><span>{label}</span>{detail && <b className={tone}>{detail}</b>}</div>}
      <div className="pace-track" role="img" aria-label={`${label ?? "ความคืบหน้า"} ${Math.round(pace.progress * 100)}%`}><i className={tone} style={{ width: `${Math.min(100, Math.max(0, pace.progress * 100))}%` }} />{expected != null && <span style={{ left: `${Math.min(100, Math.max(0, expected * 100))}%` }} />}</div>
    </div>;
  }
  const direct = kind === "health";
  const position = progress == null ? 0 : clamp(direct ? progress : progress / 1.4);
  const targetPosition = direct ? 1 : 1 / 1.4;
  const point = pointOnArc(position), target = pointOnArc(targetPosition);
  const display = progress == null ? "—" : `${Math.round(progress * 100)}%`;
  const side = kind === "spend" ? ["ช้า", "ตามแผน", "เร็ว"] : direct ? ["ต่ำ", "พร้อม", "ครบ"] : ["ช้า", "ตามแผน", "เหนือแผน"];
  return <div className={`pace-meter pace-gauge pace-${kind} ${compact ? "compact" : ""}`} role="img" aria-label={`${label ?? "Pace"}: ${display}${detail ? ` · ${detail}` : ""}`}>
    {label && <div className="pace-title"><span>{label}</span>{detail && <b className={tone}>{detail}</b>}</div>}
    <svg viewBox="0 0 200 114" aria-hidden="true">
      <path className="pace-arc base" pathLength="100" d="M22 99 A78 78 0 0 1 178 99" />
      <path className="pace-arc zone zone-a" pathLength="100" d="M22 99 A78 78 0 0 1 178 99" />
      <path className="pace-arc zone zone-b" pathLength="100" d="M22 99 A78 78 0 0 1 178 99" />
      <path className="pace-arc zone zone-c" pathLength="100" d="M22 99 A78 78 0 0 1 178 99" />
      <path className={`pace-arc value ${tone}`} pathLength="100" strokeDasharray={`${position * 100} 100`} d="M22 99 A78 78 0 0 1 178 99" />
      <line className="pace-target" x1={target.x} y1={target.y - 7} x2={target.x} y2={target.y + 7} transform={`rotate(${targetPosition * 180 - 90} ${target.x} ${target.y})`} />
      {progress != null && <circle className={`pace-dot ${tone}`} cx={point.x} cy={point.y} r={compact ? 5 : 6} />}
    </svg>
    <div className="pace-center"><b className={tone}>{display}</b><small>{detail ?? "เทียบจังหวะที่ควรเป็น"}</small></div>
    {!compact && <><div className="pace-scale"><span>{side[0]}</span><span>{side[1]}</span><span>{side[2]}</span></div>{(actualText || planText) && <div className="pace-facts"><span>{actualText}</span><span>{planText}</span></div>}</>}
  </div>;
}
