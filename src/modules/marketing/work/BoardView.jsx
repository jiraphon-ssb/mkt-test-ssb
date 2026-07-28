/* ============================================================
   Board — kanban 7 คอลัมน์ (อ่านอย่างเดียว ไม่มี drag)
   การ์ดใช้ <WorkCard> ตัวกลางร่วมกับหน้ารอตรวจ/ปฏิทิน — ทิศทางเดียวกันทั้งหมด
   ทำไมไม่มี drag: แพลตฟอร์มไม่มี dnd lib และกติกาที่นั่นระบุว่า
   "Kanban never advances stages" — การขยับขั้นต้องผ่าน RPC ที่ตรวจสิทธิ์
   ============================================================ */
import { useApp } from "../useMkt.jsx";
import { Panel, WorkCard } from "../mktCard.jsx";
import { CONTENT_STAGES, STAGE_META } from "../mktEngine.js";
import { briefRefCounts, gatePercent, gateReason, isReviewOverdue, isIdeaPurgeDue, runProgress } from "../mktRules.js";
import { Icon } from "../mktIcon.jsx";

/** ตัวกรองเป็นของหน้า "งาน" (แชร์กับมุมมองลิสต์) — Board รับการ์ดที่กรองมาแล้ว */
export function Board({ cards, onOpen }) {
  return (
    <div className="board">
      {CONTENT_STAGES.map((st) => {
        const inStage = cards.filter((c) => c.status === st.id);
        return (
          <Column key={st.id} status={st.id} name={st.name} count={inStage.length}>
            {inStage.length === 0
              ? <div className="col-empty">— ว่าง —</div>
              : inStage.map((c) => <BoardCard key={c.id} card={c} onOpen={onOpen} />)}
          </Column>
        );
      })}
    </div>
  );
}

/* คอลัมน์ = หัวคอลัมน์เปล่า + ไอคอนประจำขั้น (ใช้ <Panel className="col bare">) */
function Column({ status, name, count, children }) {
  const meta = STAGE_META[status];
  return (
    <Panel
      className={`col bare ${status === "review" ? "review-col" : ""}`}
      accent={meta.color}
      icon={meta.icon}
      title={name}
      count={count}
      hint={`${meta.owner} · ${meta.question}`}
      tools={status === "review" ? <span className="gatekeeper">Team Lead</span> : null}
    >
      {children}
    </Panel>
  );
}

/* CardFace = สิ่งที่ board ป้อนเข้า WorkCard — คงข้อมูลเดิมครบ (รูปปก · เตือน · ชิป · แถบพร้อม) */
export function BoardCard({ card, onOpen }) {
  const { data, settings } = useCardCtx();
  const refs = briefRefCounts(card.id, data.attachments, data.reference_links, data.channels);
  const pct = gatePercent(card, refs);
  const reason = gateReason(card, refs);
  const overdue = isReviewOverdue(card, settings);
  const purge = isIdeaPurgeDue(card, settings);
  const redoRounds = data.review_actions.filter((a) => a.card_id === card.id && a.action === "reject").length;

  const atts = data.attachments.filter((a) => a.card_id === card.id);
  const images = atts.filter((a) => a.mime_type.startsWith("image/"));
  const docCount = atts.length - images.length;
  const linkCount = data.reference_links.filter((l) => l.card_id === card.id).length;

  const isReview = card.status === "review";
  const fillWidth = isReview ? 100 : pct ?? 0;
  /* คอลัมน์ Review ใช้ส้ม SSB (โทนเดียวกับป้าย Team Lead) — amber บนพื้นครีมแล้วขุ่น */
  const fillColor = isReview ? "var(--accent)" : pct === 100 ? "var(--ok)" : "var(--brand)";
  const capColor = isReview ? "var(--accent-text)" : pct === 100 ? "var(--ok)" : "var(--ink-soft)";
  let cap = isReview ? reason : pct === 100 ? reason : `${pct ?? 0}% · ${reason}`;
  /* 3 ขั้นท้ายเดินรายช่องทาง — บอกตรงๆ ว่ากี่ช่องทางจากทั้งหมด + ER ถ้ามี */
  if (card.status === "scheduled" || card.status === "published" || card.status === "measured") {
    const pr = runProgress(card, card.status, data.channels);
    const word = { scheduled: "ตั้งเวลาแล้ว", published: "ขึ้นจริงแล้ว", measured: "กรอกตัวเลขแล้ว" }[card.status];
    if (pr.total > 0) {
      cap = `${word} ${pr.done}/${pr.total} ช่องทาง`;
      const er = card.metrics?.reach > 0 && card.metrics?.engagement != null
        ? (card.metrics.engagement / card.metrics.reach) * 100 : null;
      if (card.status === "measured" && er != null) cap += ` · ER ${er.toFixed(1)}%`;
    }
  }

  const statusChips = overdue ? [{ label: "เกิน SLA", tone: "bad" }]
    : card.first_pass === false && redoRounds > 0 ? [{ label: `แก้ ${redoRounds} รอบ`, tone: "warn" }]
    : purge ? [{ label: "กวาดล้าง", tone: "bad" }] : [];

  /* วันที่อยู่ในบรรทัด meta แล้ว — foot เหลือแค่ชิปไฟล์ (ไม่มีไฟล์ = ไม่ต้องมีแถว) */
  const hasFiles = card.first_pass === true || images.length > 0 || docCount > 0 || linkCount > 0;
  const foot = hasFiles ? (<span className="kchips">
    {card.first_pass === true && (<span className="kchip fp" title="ผ่านรอบแรก">✓</span>)}
    {images.length > 0 && (<span className="kchip" title={`${images.length} รูปเรฟ`}><Icon name="image" size={12}/>{images.length}</span>)}
    {docCount > 0 && (<span className="kchip" title={`${docCount} ไฟล์แนบ`}><Icon name="paperclip" size={12}/>{docCount}</span>)}
    {linkCount > 0 && (<span className="kchip" title={`${linkCount} ลิงก์อ้างอิง`}><Icon name="link" size={12}/>{linkCount}</span>)}
   </span>) : null;

  return (
    <WorkCard
      card={card}
      onOpen={() => onOpen(card)}
      cover
      statusChips={statusChips}
      foot={foot}
      progress={{ width: fillWidth, color: fillColor, cap, capColor }}
    />
  );
}

function useCardCtx() {
  const { data } = useApp();
  return { data, settings: data.settings };
}
