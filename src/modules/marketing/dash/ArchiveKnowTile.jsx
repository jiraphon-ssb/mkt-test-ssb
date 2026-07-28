/* ============================================================
   จากคลังผลงาน — ความรู้ที่สกัดจากงานปิดแล้ว โผล่บน Dashboard
   ซ้าย: สูตรที่เวิร์ค (สูตรกลางตัวเดียวกับหน้าคลัง) กด → ไปหน้าคลัง
   ขวา: บทเรียนล่าสุดที่ทีมจดตอนปิดงาน กด → เปิดการ์ดต้นเรื่อง
   ============================================================ */
import { topFormulas } from "../mktAnalytics.js";
import { PILLAR_LABEL } from "../mktEngine.js";
import { brandOf, profileOf, fmtThai } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";

const KIND_TH = { video: "คลิป", album: "ชุดภาพ", single: "ภาพเดี่ยว" };

export function ArchiveKnowTile({ data, onOpenCard, onJump }) {
  const closed = data.cards.filter((c) => c.archived && !c.id.startsWith("hist"));
  const formulas = topFormulas(closed);
  const lessons = (data.card_notes ?? [])
    .filter((n) => n.kind === "lesson")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3)
    .map((n) => ({ ...n, card: data.cards.find((c) => c.id === n.card_id) }))
    .filter((n) => n.card);

  if (formulas.length === 0 && lessons.length === 0)
    return <div className="empty-row">ยังไม่มีความรู้จากคลัง — ปิดงานพร้อมจดบทเรียนแล้วจะมาโผล่ที่นี่</div>;

  return (<div className="aknow">
   <div className="aknow-col">
    <div className="aknow-head"><Icon name="bulb" size={13}/> สูตรที่เวิร์ค</div>
    {formulas.length === 0 && <div className="empty-row">ยังไม่พบสูตร (ต้อง ≥3 งานที่วัดผลในกลุ่มเดียวกัน)</div>}
    {formulas.map((f) => {
      const brand = brandOf(data, f.brand_id);
      return (<button className="aknow-row" key={`${f.brand_id}${f.pillar}${f.kind}`}
        onClick={() => onJump("archive")} title="ดูงานกลุ่มนี้ในหน้าคลัง">
       <span className="dot" style={{ background: brand.color }}/>
       <span className="aknow-label ellip"><b>{brand.name}</b> · {KIND_TH[f.kind]} {PILLAR_LABEL[f.pillar]}</span>
       <span className="aknow-val mono">ER {(f.er * 100).toFixed(1)}%</span>
       <span className="aknow-sub mono">×{f.ratio.toFixed(2)}</span>
      </button>);
    })}
   </div>

   <div className="aknow-col">
    <div className="aknow-head"><Icon name="pencil" size={13}/> บทเรียนล่าสุด</div>
    {lessons.length === 0 && <div className="empty-row">ยังไม่มีบทเรียน — จดได้ตอนกดปิดงาน</div>}
    {lessons.map((n) => (<button className="aknow-row lesson" key={n.id}
      onClick={() => onOpenCard(n.card)} title={`เปิด ${n.card.title}`}>
      <span className="aknow-lesson">{n.text}</span>
      <span className="aknow-by">{profileOf(data, n.author_id)?.display_name} · {fmtThai(n.created_at)}</span>
     </button>))}
   </div>
  </div>);
}
