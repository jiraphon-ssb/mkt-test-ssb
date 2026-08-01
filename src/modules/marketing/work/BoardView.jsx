/* ============================================================
   Board — kanban 7 คอลัมน์ (อ่านอย่างเดียว ไม่มี drag)
   การ์ดใช้ <WorkCard> ตัวกลางร่วมกับหน้ารอตรวจ/ปฏิทิน — ทิศทางเดียวกันทั้งหมด
   ทำไมไม่มี drag: แพลตฟอร์มไม่มี dnd lib และกติกาที่นั่นระบุว่า
   "Kanban never advances stages" — การขยับขั้นต้องผ่าน RPC ที่ตรวจสิทธิ์

   ผิว Premium Dark: การ์ดเสียงเงียบ (แถบ % สีเดียว · ชิปเฉพาะด่วนจริง)
   สเปกงาน/ตัวนับแนบ/เหตุผล gate ย้ายไปอยู่ใน popup — บอร์ดเอาไว้กวาดตา
   ============================================================ */
import { useState } from "react";
import { useApp } from "../useMkt.jsx";
import { Panel, WorkCard } from "../mktCard.jsx";
import { CONTENT_STAGES, STAGE_META } from "../mktEngine.js";
import { briefRefCounts, gatePercent, isReviewOverdue, isIdeaPurgeDue, runProgress } from "../mktRules.js";
import { Icon } from "../mktIcon.jsx";

/** ตัวกรองเป็นของหน้า "งาน" (แชร์กับมุมมองลิสต์) — Board รับการ์ดที่กรองมาแล้ว */
export function Board({ cards, onOpen }) {
  /* ขั้นว่างพับเป็นแท่งแคบ — กดแล้วกางค้างไว้ทั้ง session ของหน้า */
  const [openEmpty, setOpenEmpty] = useState(() => new Set());
  return (
    <div className="board">
      {CONTENT_STAGES.map((st) => {
        const inStage = cards.filter((c) => c.status === st.id);
        if (inStage.length === 0 && !openEmpty.has(st.id)) {
          return <EmptyRail key={st.id} status={st.id} name={st.name}
            onExpand={() => setOpenEmpty((s) => new Set([...s, st.id]))}/>;
        }
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

/* ขั้นที่ว่าง = แท่งตั้งแคบ ชื่อ+0 — ที่จอเหลือให้ขั้นที่มีงานจริง */
function EmptyRail({ status, name, onExpand }) {
  const meta = STAGE_META[status];
  return (
    <button className="col-rail" style={{ ["--stage"]: meta.color }} onClick={onExpand}
      title={`ขั้น ${name} ว่าง — กดเพื่อกางคอลัมน์`}>
      <Icon name={meta.icon} size={14}/>
      <span className="rail-name">{name}</span>
      <span className="rail-n mono">0</span>
    </button>
  );
}

/* คอลัมน์เพรียว: ไอคอน+ชื่อ+จำนวน — คำโปรย (owner·คำถามประจำขั้น) ย้ายเข้าปุ่ม i */
function Column({ status, name, count, children }) {
  const meta = STAGE_META[status];
  return (
    <Panel
      className={`col bare ${status === "review" ? "review-col" : ""}`}
      accent={meta.color}
      icon={meta.icon}
      title={name}
      count={count}
      info={{ label: `ขั้น ${name}`, text: `${meta.owner} · ${meta.question}` }}
    >
      {children}
    </Panel>
  );
}

/* CardFace เสียงเงียบ — ชิปเฉพาะเรื่องด่วนจริง + แถบ % สีเดียวทั้งกระดาน */
export function BoardCard({ card, onOpen }) {
  const { data, settings } = useCardCtx();
  const refs = briefRefCounts(card.id, data.attachments, data.reference_links, data.channels);
  const pct = gatePercent(card, refs);
  const overdue = isReviewOverdue(card, settings);
  const purge = isIdeaPurgeDue(card, settings);
  const redoRounds = data.review_actions.filter((a) => a.card_id === card.id && a.action === "reject").length;

  const isReview = card.status === "review";
  const fillWidth = isReview ? 100 : pct ?? 0;
  /* สีเดียวทั้งกระดาน — พอทุกใบเงียบ ใบที่มีชิปเตือนจะเด่นเอง */
  let cap = isReview ? "รอตรวจ" : `${pct ?? 0}%`;
  if (card.status === "scheduled" || card.status === "published" || card.status === "measured") {
    const pr = runProgress(card, card.status, data.channels);
    if (pr.total > 0) cap = `${pr.done}/${pr.total}`;
  }

  const statusChips = overdue ? [{ label: "เกิน SLA", tone: "bad" }]
    : card.first_pass === false && redoRounds > 0 ? [{ label: `แก้ ${redoRounds} รอบ`, tone: "warn" }]
    : purge ? [{ label: "กวาดล้าง", tone: "bad" }] : [];

  return (
    <WorkCard
      card={card}
      onOpen={() => onOpen(card)}
      cover
      statusChips={statusChips}
      progress={{ width: fillWidth, color: "var(--accent)", cap }}
    />
  );
}

function useCardCtx() {
  const { data } = useApp();
  return { data, settings: data.settings };
}
