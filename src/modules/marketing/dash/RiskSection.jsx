/* ความเสี่ยงที่ต้องเคลียร์ตอนนี้ — อ่านสถานะสด ไม่ขึ้นกับช่วงเวลาที่เลือก */
import { useState } from "react";
import { STAGE_META } from "../mktEngine.js";
import { computeReviewSLA, hoursWaitingInReview, isIdeaPurgeDue, isReviewOverdue, isStuck, pendingToolboxItems, stuckDays, } from "../mktRules.js";
import { analyticsCards } from "../mktAnalytics.js";
import { brandOf, fmtDateTime, profileOf } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";
export function RiskSection({ data, onOpenCard, onJump, }) {
  const [showAll, setShowAll] = useState(false);
  const sla = computeReviewSLA(data.review_actions, data.settings);
  const toolbox = pendingToolboxItems(data.review_actions);
  const cards = analyticsCards(data.cards);
  const overdue = cards.filter((c) => isReviewOverdue(c, data.settings));
  const stuck = cards
    .filter((c) => isStuck(c, 3, undefined, data.status_history))
    .sort((a, b) => stuckDays(b, undefined, data.status_history) - stuckDays(a, undefined, data.status_history));
  const purge = cards.filter((c) => isIdeaPurgeDue(c, data.settings));
  /* งานที่โดนตีกลับแล้วยังไม่ผ่านตรวจใหม่ — โน้ตตีกลับยังปักหมุดอยู่ = ยังแก้ไม่จบ */
  const redoPending = cards.filter((c) =>
    (data.card_notes ?? []).some((n) => n.card_id === c.id && n.kind === "reject" && n.pinned));
  const clean = overdue.length === 0 && stuck.length === 0 && purge.length === 0 && toolbox.length === 0 && redoPending.length === 0;
  const stuckShown = showAll ? stuck : stuck.slice(0, 3);
  const purgeShown = showAll ? purge : purge.slice(0, 2);
  const toolboxShown = showAll ? toolbox : toolbox.slice(0, 2);
  const hidden = (stuck.length - stuckShown.length) + (purge.length - purgeShown.length) + (toolbox.length - toolboxShown.length);
  const row = (c, right, tone) => {
    const brand = brandOf(data, c.brand_id);
    return (<button className="risk-row" key={c.id} onClick={() => onOpenCard(c)}>
    <span className="dot" style={{ background: brand.color }}/>
    <span className="risk-title ellip">{c.title}</span>
    <span className="risk-stage">{STAGE_META[c.status].name}</span>
    <span className="risk-owner">{profileOf(data, c.owner_id)?.display_name}</span>
    <span className={`risk-val mono ${tone}`}>{right}</span>
   </button>);
  };
  return (<>
   {/* SLA ของ Team Lead — กติกาศักดิ์สิทธิ์ที่ทั้งทีมเห็นตัวเลขเดียวกัน */}
   <div className="risk-sla">
    <div className="big-metric">
     <span className="n mono" style={{ color: sla.rate !== null && sla.rate >= 0.9 ? "var(--ok)" : "var(--warn)" }}>
      {sla.rate === null ? "—" : `${Math.round(sla.rate * 100)}%`}
     </span>
     <span className="u">ตัดสินทันใน SLA</span>
    </div>
    <div className="tile-note">
     {sla.total === 0 ? "ยังไม่มีการตัดสิน" : `${sla.withinSLA}/${sla.total} ใบ · รอเฉลี่ย ${sla.avgHours?.toFixed(1)} ชม.`}
    </div>
   </div>

   {clean ? (<div className="empty-row">ไม่มีงานค้างเกินเกณฑ์</div>) : (<div className="risk-groups">
     {overdue.length > 0 && (<div className="risk-group">
       <div className="risk-head bad">
        <Icon name="alert" size={14}/> เกิน SLA ({overdue.length})
        <button className="risk-jump" onClick={() => onJump("review")}>ไปหน้ารอตรวจ</button>
       </div>
       {overdue.map((c) => row(c, `${Math.round(hoursWaitingInReview(c))} ชม.`, "bad-text"))}
      </div>)}

     {redoPending.length > 0 && (<div className="risk-group">
       <div className="risk-head bad">
        <Icon name="pencil" size={14}/> ตีกลับค้างแก้ ({redoPending.length})
        <button className="risk-jump" onClick={() => onJump("board")}>ไปบอร์ด</button>
       </div>
       {redoPending.slice(0, showAll ? 99 : 3).map((c) => row(
         c,
         `รอบ ${data.review_actions.filter((a) => a.card_id === c.id && a.action === "reject").length}`,
         "bad-text",
       ))}
      </div>)}

     {stuck.length > 0 && (<div className="risk-group">
       <div className="risk-head warn">
        <Icon name="clock" size={14}/> ค้างเกิน 3 วัน ({stuck.length})
        <button className="risk-jump" onClick={() => onJump("board")}>ไปบอร์ด</button>
       </div>
       {stuckShown.map((c) => row(c, `${stuckDays(c, undefined, data.status_history)} วัน`, "warn-text"))}
       
      </div>)}

     {purge.length > 0 && (<div className="risk-group">
       <div className="risk-head">
        <Icon name="info" size={14}/> ไอเดียค้างเกิน {data.settings.idea_purge_days} วัน ({purge.length})
       </div>
       {purgeShown.map((c) => row(c, "ตัดสินใจ", ""))}
      </div>)}
     {/* วาระเติม Direction Pack — ตีกลับแล้วชี้ข้อไม่ได้ (ย้ายมาจากหน้าสถิติ) */}
     {toolbox.length > 0 && (<div className="risk-group">
       <div className="risk-head">
        <Icon name="alert" size={14}/> ต้องเติม Direction Pack ({toolbox.length})
       </div>
       {toolboxShown.map((t, i) => {
          const c = data.cards.find((x) => x.id === t.cardId);
          return (<div className="tb-item" key={`${t.cardId}-${i}`}>
          <Icon name="alert" size={14}/>
          <div className="tb-main">
           <div className="tb-reason">{t.reason}</div>
           <div className="tb-meta">
            {c?.title ?? t.cardId} · โดย {profileOf(data, t.actedBy)?.display_name} · {fmtDateTime(t.actedAt)}
           </div>
          </div>
         </div>);
        })}
      </div>)}
    </div>)}

   {(hidden > 0 || showAll) && (<button className="dash-more" onClick={() => setShowAll(!showAll)}>
     {showAll ? "ย่อรายการ" : `ดูอีก ${hidden} รายการ`}
    </button>)}
  </>);
}
