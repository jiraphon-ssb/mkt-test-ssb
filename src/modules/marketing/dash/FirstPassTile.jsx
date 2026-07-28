/* first-pass rate รายคน — ย้ายมาจากหน้าสถิติเดิม
 กติกาเดิมคงไว้: content_owner เห็นแถวตัวเอง + ค่าเฉลี่ยทีมเท่านั้น (Spec ข้อ 2) */
import { useMemo } from "react";
import { computeFirstPassRate } from "../mktRules.js";
import { profileOf } from "../mktParts.jsx";
export function FirstPassTile({ data, viewer }) {
  const settings = data.settings;
  const owners = useMemo(() => data.profiles.filter((p) => p.role === "content_owner"), [data.profiles]);
  const fpStats = useMemo(() => computeFirstPassRate(data.cards, data.review_actions, settings, owners.map((o) => o.id)), [data.cards, data.review_actions, settings, owners]);
  const seeAll = viewer.role !== "content_owner";
  const visible = seeAll ? fpStats : fpStats.filter((s) => s.ownerId === viewer.id);
  const teamAvg = useMemo(() => {
    const rates = fpStats.map((s) => s.rate).filter((r) => r != null);
    return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  }, [fpStats]);
  const targetPct = Math.round(settings.first_pass_target * 100);
  return (<>
   <div className="tile-note">เป้า ≥{targetPct}%{!seeAll && " · เห็นแถวของตัวเอง + ค่าทีม"}</div>

   {visible.length === 0 && <div className="empty-row">ยังไม่มีข้อมูลการตัดสินในหน้าต่างนี้</div>}

   {visible.map((s) => {
      const owner = profileOf(data, s.ownerId);
      const pct = s.rate === null ? 0 : Math.round(s.rate * 100);
      const pass = s.rate !== null && s.rate >= settings.first_pass_target;
      return (<div className="fp-row" key={s.ownerId}>
      <span className="who">{owner?.display_name}</span>
      <div className="fp-bar">
       <div className={`fp-fill ${pass ? "pass" : ""}`} style={{ width: `${pct}%` }}/>
       <div className="fp-target" style={{ left: `${settings.first_pass_target * 100}%` }}/>
      </div>
      <span className="fp-val">{s.rate === null ? "—" : `${pct}%`}</span>
      <span className="streak">
       {s.weekHits.map((h, i) => <i key={i} className={h ? "hit" : ""}/>)}
      </span>
      {s.unlocked && <span className="unlock-tag">ครบเกณฑ์ปลดตรวจ</span>}
     </div>);
    })}

   <div className="fp-row" style={{ borderTop: "1px solid var(--line)" }}>
    <span className="who" style={{ color: "var(--ink-faint)" }}>ค่าทีม</span>
    <div className="fp-bar">
     <div className="fp-fill" style={{ width: `${teamAvg ? Math.round(teamAvg * 100) : 0}%`, background: "var(--ink-faint)" }}/>
     <div className="fp-target" style={{ left: `${settings.first_pass_target * 100}%` }}/>
    </div>
    <span className="fp-val">{teamAvg == null ? "—" : `${Math.round(teamAvg * 100)}%`}</span>
   </div>

  </>);
}
