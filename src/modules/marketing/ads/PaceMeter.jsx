import { paceTone } from "./paceEngine.js";
import "./paceMeter.css";

export function PaceMeter({ pace, label, detail = null, expected = null, compact = false }) {
  const progress = pace?.progress;
  const tone = paceTone(pace?.state);
  if (progress == null) return <span className="pace-empty">ยังประเมินไม่ได้</span>;
  return <div className={`pace-meter ${compact ? "compact" : ""}`}>
    {(label || detail) && <div className="pace-copy"><span>{label}</span>{detail && <b className={tone}>{detail}</b>}</div>}
    <div className="pace-track" role="img" aria-label={`${label ?? "ความคืบหน้า"} ${Math.round(progress * 100)}%`}><i className={tone} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />{expected != null && <span style={{ left: `${Math.min(100, Math.max(0, expected * 100))}%` }} />}</div>
  </div>;
}
