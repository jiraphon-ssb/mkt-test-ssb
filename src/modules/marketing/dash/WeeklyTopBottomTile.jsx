/* วาระ Weekly Sync — Top 1 / Bottom 1 ของสัปดาห์ (ย้ายมาจากหน้าสถิติ)
 SOP: คุยแค่สองใบนี้ "ทำไมได้/ไม่ได้" ไม่ไล่ทุกโพสต์ */
import { useMemo } from "react";
import { RESULT_LABEL_TEXT } from "../mktEngine.js";
import { brandAverageER, resultLabel, weeklyTopBottom } from "../mktRules.js";
import { brandOf, brandFill } from "../mktParts.jsx";
export function WeeklyTopBottomTile({ data, onOpenCard }) {
  const weekly = useMemo(() => weeklyTopBottom(data.cards, 7), [data.cards]);
  if (weekly.count === 0) {
    return <div className="empty-row">ยังไม่มีการ์ดที่กรอกผลใน 7 วันล่าสุด</div>;
  }
  return (<div className="wk-grid">
   {weekly.top && <WeeklyCard data={data} rank="top" item={weekly.top} onOpenCard={onOpenCard}/>}
   {weekly.bottom && <WeeklyCard data={data} rank="bottom" item={weekly.bottom} onOpenCard={onOpenCard}/>}
  </div>);
}
function WeeklyCard({ data, rank, item, onOpenCard, }) {
  const brand = brandOf(data, item.card.brand_id);
  const avg = brandAverageER(data.cards, item.card.brand_id, item.card.id);
  const label = resultLabel(item.card, avg);
  return (<button className={`wk-card ${rank}`} onClick={() => onOpenCard(item.card)}>
   <div className="wk-rank">{rank === "top" ? "Top ของสัปดาห์" : "Bottom ของสัปดาห์"}</div>
   <div className="wk-title">{item.card.title}</div>
   <div className="wk-meta">
    <span className="tag brand" style={brandFill(brand.color)}>{brand.name}</span>
    <span className="mono">ER {(item.er * 100).toFixed(1)}%</span>
    {label && (<span className={`rlabel ${label}`} style={{ fontSize: "var(--fs-xs)" }}>{RESULT_LABEL_TEXT[label]}</span>)}
   </div>
  </button>);
}
