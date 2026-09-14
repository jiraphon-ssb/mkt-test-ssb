/* GoalLine — แสดงผลของ targetProgress (adsTargets.js) ใต้ตัวเลข: เป้า · ทำได้กี่ % · สถานะ + แถบความคืบหน้า
   คอมโพเนนต์นี้จัดรูปแบบอย่างเดียว ตัวเลขทั้งหมดคำนวณในโมเดลแล้ว */
import { TARGET_METRICS } from "../adsTargets.js";
import { fmtInt, fmtMoney, fmtPct } from "../dash/charts/theme.js";

const METRIC = Object.fromEntries(TARGET_METRICS.map((m) => [m.key, m]));
const fmtTarget = (key, v) => v == null ? "—" : key === "roas" ? `${v.toFixed(1)}×` : key === "pctAds" ? fmtPct(v, 1) : key === "cpl" ? fmtMoney(v) : fmtInt(v);
const clamp01 = (x) => Math.max(0, Math.min(1, x ?? 0));

export function GoalLine({ metric, goal, compact = false }) {
  if (!goal) return null;
  const m = METRIC[metric];
  if (goal.state === "unset") return <div className="ads-goal"><span className="zinc">ยังไม่ตั้งเป้า</span></div>;
  const lower = m.better === "lower";
  const targetText = m.kind === "count"
    ? goal.monthTarget !== goal.target ? `เป้าช่วงนี้ ${fmtTarget(metric, goal.target)} (เดือนละ ${fmtTarget(metric, goal.monthTarget)})` : `เป้าเดือน ${fmtTarget(metric, goal.target)}`
    : `${lower ? "เพดาน ≤" : "เป้า ≥"} ${fmtTarget(metric, goal.target)}`;
  if (goal.state === "nodata") return <div className="ads-goal"><span>{targetText}</span><span className="zinc">ยังไม่มีข้อมูล</span></div>;
  const showBar = !compact && m.kind === "count";
  return <div className="ads-goal" aria-label={`${m.label}: ${targetText} · ${goal.text}`}>
    <span>{targetText}</span>
    {!lower && <span>ทำได้ <b>{fmtPct(goal.pct, 0)}</b></span>}
    <b className={goal.tone}>{goal.text}</b>
    {showBar && <span className="ads-goal-bar" aria-hidden="true">
      <i className={goal.tone} style={{ width: `${clamp01(goal.pct) * 100}%` }} />
      {goal.expected != null && goal.expected !== goal.target && <em style={{ left: `${clamp01(goal.expected / goal.target) * 100}%` }} />}
    </span>}
  </div>;
}
