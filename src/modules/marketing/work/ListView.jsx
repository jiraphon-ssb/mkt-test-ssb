/* ============================================================
 ListView — มุมมองลิสต์ของงานทั้งหมด (เรียง/กวาดตา/หางานเก่า)
 ไม่มี drag: เดินการ์ดทำที่บอร์ดหรือในการ์ด (ผ่าน validateTransition เดิม)
 แถวที่รอตรวจ + ผู้ใช้เป็น Team Lead → ตัดสินจากลิสต์ได้เลย
 ============================================================ */
import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { CONTENT_STAGES, STAGE_META } from "../mktEngine.js";
import { briefRefCounts, gatePercent, hoursWaitingInReview, isReviewOverdue, stuckDays, isAlbum } from "../mktRules.js";
import { brandOf, profileOf, fmtDayMonth, typeText, typeIcon, typeIncomplete } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";
export function ListView({ cards, allCards = cards, onOpen, stageFilter, onStageFilter, onQuickFilter = () => {} }) {
  const { data, settings } = useApp();
  const [sort, setSort] = useState("updated");
  /** วันกำหนดของการ์ด — วันโพสต์ก่อน ถ้าไม่มีใช้เดดไลน์ส่งตรวจ (เกณฑ์เดียวกับบอร์ด) */
  const dueOf = (c) => {
    const iso = c.brief.publish_at ?? (c.brief.deadline_review ? `${c.brief.deadline_review}T00:00:00` : null);
    return iso ? new Date(iso).getTime() : null;
  };
  /** นับต่อขั้น + จำนวนที่ยังไม่พร้อมไปขั้นถัดไป — ใช้วาดแถบสายผลิต */
  const stageCounts = useMemo(() => CONTENT_STAGES.map((st) => {
    /* นับจากชุดก่อนกรองขั้น — ไม่งั้นกดกรองแล้วขั้นอื่นกลายเป็น 0 หมด */
    const inStage = allCards.filter((c) => c.status === st.id);
    const notReady = inStage.filter((c) => {
      const pct = gatePercent(c, briefRefCounts(c.id, data.attachments, data.reference_links, data.channels));
      return pct != null && pct < 100;
    }).length;
    return { id: st.id, name: st.name, icon: st.icon, color: STAGE_META[st.id].color, n: inStage.length, notReady };
  }), [allCards, data.attachments, data.reference_links, data.channels]);

  const rows = useMemo(() => {
    const list = [...cards];   /* กรองขั้นทำที่ WorkView แล้ว (ตัวเลขบนแถบจะได้ตรงกัน) */
    if (sort === "updated") {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }
    else if (sort === "due") {
      // ไม่มีกำหนด = ไปท้ายสุด
      list.sort((a, b) => (dueOf(a) ?? Infinity) - (dueOf(b) ?? Infinity));
    }
    else {
      list.sort((a, b) => stuckDays(b, undefined, data.status_history) - stuckDays(a, undefined, data.status_history));
    }
    return list;
  }, [cards, sort, data.status_history]);
  if (cards.length === 0) {
    return <div className="empty"><div className="t">ไม่มีงานตรงตัวกรองนี้</div></div>;
  }
  return (<>
   {/* แถบสายผลิต — กดการ์ดขั้นเพื่อกรอง กดซ้ำเพื่อเลิกกรอง
       ไม่มีการ์ด "ทั้งหมด" แล้ว เพราะทุกแถวในตารางบอกขั้นของตัวเองอยู่ */}
   <div className="pipe">
    {stageCounts.map((st) => (<div className="pipe-step" key={st.id}>
      <button
       className={`pipe-card ${stageFilter === st.id ? "on" : ""} ${st.n === 0 ? "zero" : ""}`}
       style={{ ["--stage"]: st.color }}
       onClick={() => onStageFilter(stageFilter === st.id ? null : st.id)}
       title={stageFilter === st.id ? "กดอีกครั้งเพื่อเลิกกรอง" : `ดูเฉพาะขั้น ${st.name}`}
      >
       <span className="pc-head"><Icon name={st.icon} size={14}/> {st.name}</span>
       <span className="pc-n mono">{st.n}</span>
       <span className={`pc-sub ${st.notReady > 0 ? "warn" : ""}`}>
        {st.n === 0 ? "ว่าง" : st.notReady > 0 ? `ไม่พร้อม ${st.notReady}` : "พร้อมทั้งหมด"}
       </span>
      </button>
      <span className="pipe-arrow" aria-hidden="true">›</span>
     </div>))}
   </div>

   {stageFilter && (<div className="wl-active">
     กำลังดูเฉพาะขั้น <b>{STAGE_META[stageFilter].name}</b>
     <button onClick={() => onStageFilter(null)}>ล้าง</button>
    </div>)}

   <div className="worklist">
    {/* หัวตาราง — ไม่มีหัวคอลัมน์แล้วตัวเลข 31/7 · 100% · 1 วัน อ่านไม่รู้ว่าอะไร */}
    <div className="wl-row wl-head">
     <button className={`wl-sort ${sort === "updated" ? "on" : ""}`} onClick={() => setSort("updated")} title="เรียงตามอัปเดตล่าสุด">
      งาน {sort === "updated" && <i>▾</i>}
     </button>
     <span>แบรนด์</span>
     <span>ชนิด</span>
     <span>ขั้น</span>
     <span>ผู้ดูแล</span>
     <button className={`wl-sort ${sort === "due" ? "on" : ""}`} onClick={() => setSort("due")} title="เรียงตามกำหนดที่ใกล้ที่สุด">
      กำหนด {sort === "due" && <i>▾</i>}
     </button>
     <span>ความพร้อม</span>
     <button className={`wl-sort ta-r ${sort === "stuck" ? "on" : ""}`} onClick={() => setSort("stuck")} title="เรียงตามค้างนานสุด">
      ค้าง {sort === "stuck" && <i>▾</i>}
     </button>
    </div>
    {rows.map((c) => {
      const brand = brandOf(data, c.brand_id);
      const stage = STAGE_META[c.status];
      const refs = briefRefCounts(c.id, data.attachments, data.reference_links, data.channels);
      const pct = gatePercent(c, refs);
      const due = dueOf(c);
      const inReview = c.status === "review";
      const overdue = isReviewOverdue(c, settings);
      const days = stuckDays(c, undefined, data.status_history);
      const waitH = inReview ? Math.round(hoursWaitingInReview(c)) : 0;
      return (<div className={`wl-row ${c.archived ? "done" : ""}`} key={c.id}>
       <button className="wl-main" onClick={() => onOpen(c)}>
        <span className="wl-title">{c.title}</span>
        {c.is_realtime && <span className="tag rt">Realtime</span>}
        {c.track === "project" && <span className="tag proj">Project</span>}
        {c.archived && <span className="tag">ปิดแล้ว</span>}
       </button>

       {/* กดที่ค่าในคอลัมน์เพื่อกรองด้วยค่านั้นทันที ไม่ต้องไปเปิดแผงตัวกรอง */}
       <button className="wl-brand cell-filter" onClick={() => onQuickFilter("brand", c.brand_id)} title={`ดูเฉพาะ ${brand.name}`}>
        <i style={{ background: brand.color }}/>{brand.name}
       </button>
       {/* ชนิดงาน — กดเพื่อกรองเฉพาะภาพเดี่ยว/ชุดภาพ/คลิป */}
       <TypeCol brief={c.brief} onPick={(v) => onQuickFilter("kind", v)}/>
       <button className="wl-stage cell-filter" style={{ ["--stage"]: stage.color }} onClick={() => onStageFilter(stageFilter === c.status ? null : c.status)} title={`ดูเฉพาะขั้น ${stage.name}`}>
        {stage.name}
       </button>
       <button className="wl-owner cell-filter" onClick={() => onQuickFilter("owner", c.owner_id)} title="ดูเฉพาะงานของคนนี้">
        {profileOf(data, c.owner_id)?.display_name}
       </button>
       <span className="wl-due mono">{due ? fmtDayMonth(new Date(due).toISOString()) : "—"}</span>
       {/* ความพร้อม — แถบ + ตัวเลข อ่านเร็วกว่าเลขเปล่า */}
       <span className="wl-pct" title={pct == null ? "ยังไม่เริ่มกรอก" : `กรอกครบ ${pct}%`}>
        <span className="wl-prog"><i style={{ width: `${pct ?? 0}%`, background: pct === 100 ? "var(--ok)" : "var(--accent)" }}/></span>
        <b className="mono">{pct == null ? "—" : `${pct}%`}</b>
       </span>
       <span className={`wl-stuck mono ${inReview ? (overdue ? "bad" : "") : days > 7 ? "bad" : days > 3 ? "warn" : ""}`}>
        {c.archived ? "—" : inReview ? `${waitH} ชม.` : `${days} วัน`}
       </span>

      </div>);
    })}
   </div>

  </>);
}

/* ชนิดงานในลิสต์ — ภาษาเดียวกับบรรทัด meta ของการ์ด (icon นำ + typeText) */
function TypeCol({ brief, onPick }) {
  const kind = brief.format === "video" ? "video" : isAlbum(brief) ? "album" : "single";
  return (
    <button className={`wl-kind cell-filter ${typeIncomplete(brief) ? "warn" : ""}`}
     onClick={() => onPick(kind)} title={`ดูเฉพาะ${kind === "video" ? "คลิป" : kind === "album" ? "ชุดภาพ" : "ภาพเดี่ยว"}`}>
     <Icon name={typeIcon(brief)} size={13}/><em>{typeText(brief)}</em>
    </button>
  );
}
