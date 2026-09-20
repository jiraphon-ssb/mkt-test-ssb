/* GoalLine — แสดงผลของ targetProgress (adsTargets.js) ใต้ตัวเลข: เป้า · ทำได้กี่ % · สถานะ + แถบความคืบหน้า
   คอมโพเนนต์นี้จัดรูปแบบอย่างเดียว ตัวเลขทั้งหมดคำนวณในโมเดลแล้ว */
import { TARGET_METRICS } from "../adsTargets.js";
import { fmtInt, fmtMoney, fmtPct, fmtNum } from "../dash/charts/theme.js";

const METRIC = Object.fromEntries(TARGET_METRICS.map((m) => [m.key, m]));
const fmtTarget = (key, v) => v == null ? "—" : key === "roas" ? `${fmtNum(v, 2)}×` : key === "pctAds" ? fmtPct(v, 1) : key === "cpl" ? fmtMoney(v) : fmtInt(v);
const clamp01 = (x) => Math.max(0, Math.min(1, x ?? 0));

export function GoalLine({ metric, goal, compact = false, targetOnly = false }) {
  if (!goal) return null;
  const m = METRIC[metric];
  if (goal.state === "unset") return <div className="ads-goal"><span className="zinc">ยังไม่ตั้งเป้า</span></div>;
  const lower = m.better === "lower";
  const targetText = m.kind === "count"
    ? goal.monthTarget !== goal.target ? `เป้าช่วงนี้ ${fmtTarget(metric, goal.target)} (เดือนละ ${fmtTarget(metric, goal.monthTarget)})` : `เป้าเดือน ${fmtTarget(metric, goal.target)}`
    : `${lower ? "เพดาน ≤" : "เป้า ≥"} ${fmtTarget(metric, goal.target)}`;
  if (goal.state === "nodata") return <div className="ads-goal"><span>{targetText}</span><span className="zinc">ยังไม่มีข้อมูล</span></div>;
  /* หน้าปัดข้างๆ บอก "ทำได้กี่ %" กับสถานะอยู่แล้ว — บรรทัดนี้จึงเหลือแค่เป้า ไม่งั้นข้อมูลเดียวกันพูดสามรอบ */
  if (targetOnly) return <div className="ads-goal ads-goal--target"><span>{targetText}</span></div>;
  /* paceOnly = เหลือเฉพาะข้อมูลที่ใช้ตัดสินใจ (จังหวะ + สถานะ + ส่วนโค้ง)
     เป้าเดือนกับ "ทำได้กี่ %" เป็นบริบท ผู้เรียกเอาไปใส่ tooltip แทน (อาร์ตเคาะ 21 ก.ย. 69) */
  const showBar = !compact;
  /* แถบของตัวชี้วัดแบบอัตรา: สเกล 0–200% ของเป้า ขีดเป้าอยู่กึ่งกลาง — สเกลเดียวกับหน้าปัดจังหวะ
     (เดิมมีแต่ตัวหนังสือ เทียบด้วยสายตาข้ามการ์ดไม่ได้เลย) */
  const rate = m.kind !== "count";
  const barValue = rate ? clamp01((goal.pct ?? 0) / 2) : clamp01(goal.pct);
  const barMark = rate ? 0.5 : (goal.expected != null && goal.expected !== goal.target ? clamp01(goal.expected / goal.target) : null);
  return <div className="ads-goal" aria-label={`${m.label}: ${targetText} · ${goal.text}`}>
    <span>{targetText}</span>
    {!lower && <span>ทำได้ <b>{fmtNum((goal.pct ?? 0) * 100, 2)}%</b></span>}
    {/* จังหวะ = เทียบกับที่ควรได้ "ถึงวันนี้" ไม่ใช่เป้าทั้งเดือน — ตัวเลขชุดเดียวกับหน้าปัดบนการ์ดยอดขาย */}
    {goal.pace != null && goal.expected !== goal.target && <span>จังหวะ <b>{fmtNum(goal.pace * 100, 2)}%</b></span>}
    <b className={goal.tone}>{goal.text}</b>
    {showBar && <span className="ads-goal-bar" aria-hidden="true">
      <i className={goal.tone} style={{ width: `${barValue * 100}%` }} />
      {barMark != null && <em style={{ left: `${barMark * 100}%` }} />}
    </span>}
  </div>;
}
