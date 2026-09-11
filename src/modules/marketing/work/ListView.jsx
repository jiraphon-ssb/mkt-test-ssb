/* ============================================================
 ListView — "ต้องจัดการอะไรก่อน" ไม่ใช่ตารางข้อมูลดิบ
 เดิมเป็นตาราง 8 คอลัมน์ ทุกแถวน้ำหนักเท่ากัน — งานค้าง 72 วันกับงานเพิ่งสร้าง
 หน้าตาเหมือนกัน คนอ่านไม่รู้ว่าต้องหยิบอะไรก่อน
 ใหม่: จัดกลุ่มตามความเร่งด่วน + เขียนเป็นคำว่า "ทำไมต้องสนใจแถวนี้"
 บอร์ดตอบ "งานอยู่ขั้นไหน" · ลิสต์ตอบ "ฉันต้องหยิบอะไรก่อน"
 ============================================================ */
import { useCallback, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { CONTENT_STAGES, STAGE_META } from "../mktEngine.js";
import { briefRefCounts, gateBlocking, gateChecklist, hoursWaitingInReview, isReviewOverdue, stuckDays } from "../mktRules.js";
import { brandOf, profileOf, fmtDayMonth, typeText, typeIcon, typeIncomplete } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";

const DAY = 86_400_000;
/** เงื่อนไขที่ "กั้นทาง" จริง (soft = แนะนำ ไม่นับ) */
const blockingLeft = (c, refs) => gateBlocking(gateChecklist(c, refs)).filter((g) => !g.done).length;

/**
 * จัดอันดับว่าแถวนี้เร่งแค่ไหน + เขียนเหตุผลเป็นคำ
 * คืน { bucket, tone, why } — bucket ใช้จัดกลุ่ม · why คือสิ่งที่คนอ่านต้องรู้
 */
function triage(c, { settings, history, refs, now }) {
  const stuck = stuckDays(c, undefined, history);
  const dueISO = c.brief.publish_at ?? (c.brief.deadline_review ? `${c.brief.deadline_review}T00:00:00` : null);
  const dueIn = dueISO ? Math.ceil((new Date(dueISO).getTime() - now) / DAY) : null;

  if (c.status === "review") {
    const h = Math.round(hoursWaitingInReview(c));
    if (isReviewOverdue(c, settings)) return { bucket: 0, tone: "bad", why: `รอตรวจ ${h} ชม. — เกิน SLA แล้ว` };
    return { bucket: 1, tone: "warn", why: `รอ Team Lead ตรวจ ${h} ชม.` };
  }
  if (dueIn != null && dueIn < 0) return { bucket: 0, tone: "bad", why: `เลยกำหนดมา ${-dueIn} วัน` };
  if (stuck >= 14) return { bucket: 0, tone: "bad", why: `ไม่มีใครแตะ ${stuck} วัน` };
  if (dueIn != null && dueIn <= 2) return { bucket: 1, tone: "warn", why: dueIn === 0 ? "ถึงกำหนดวันนี้" : `เหลือ ${dueIn} วัน` };
  if (stuck >= 7) return { bucket: 1, tone: "warn", why: `ค้างมา ${stuck} วัน` };
  const left = blockingLeft(c, refs);
  if (left > 0) return { bucket: 2, tone: "", why: `ยังขาด ${left} ข้อก่อนไป${STAGE_META[c.status]?.next ?? "ขั้นถัดไป"}` };
  return { bucket: 2, tone: "ok", why: "พร้อมไปขั้นถัดไป" };
}

const BUCKETS = [
  { id: 0, label: "ต้องจัดการก่อน", hint: "เกินกำหนด · เกิน SLA · ค้างนาน", tone: "bad" },
  { id: 1, label: "ใกล้ถึงกำหนด", hint: "เหลือ ≤2 วัน หรือรอตรวจอยู่", tone: "warn" },
  { id: 2, label: "เดินตามแผน", hint: "ยังมีเวลา", tone: "" },
];

export function ListView({ cards, allCards = cards, onOpen, stageFilter, onStageFilter, onQuickFilter = () => {} }) {
  const { data, settings } = useApp();
  const now = Date.now();
  /* พับกลุ่มที่ไม่เร่งไว้ก่อน — เปิดมาเห็นเฉพาะของที่ต้องหยิบ */
  const [openCalm, setOpenCalm] = useState(false);

  const refsOf = useCallback(
    (c) => briefRefCounts(c.id, data.attachments, data.reference_links, data.channels),
    [data.attachments, data.reference_links, data.channels]);

  /** นับต่อขั้น — แถบกรองด้านบน */
  const stageCounts = useMemo(() => CONTENT_STAGES.map((st) => {
    const inStage = allCards.filter((c) => c.status === st.id);
    const notReady = inStage.filter((c) => blockingLeft(c, refsOf(c)) > 0).length;
    return { id: st.id, name: st.name, icon: st.icon, color: STAGE_META[st.id].color, n: inStage.length, notReady };
  }), [allCards, refsOf]);

  /** แถวพร้อมป้ายเร่งด่วน — เรียงในกลุ่มด้วยความเร่ง แล้วตามด้วยกำหนดที่ใกล้สุด */
  const grouped = useMemo(() => {
    const withT = cards.map((c) => ({ c, t: triage(c, { settings, history: data.status_history, refs: refsOf(c), now }) }));
    return BUCKETS.map((b) => ({
      ...b,
      rows: withT.filter((x) => x.t.bucket === b.id).sort((a, z) => {
        const tone = (x) => (x.t.tone === "bad" ? 0 : x.t.tone === "warn" ? 1 : 2);
        if (tone(a) !== tone(z)) return tone(a) - tone(z);
        return stuckDays(z.c, undefined, data.status_history) - stuckDays(a.c, undefined, data.status_history);
      }),
    }));
  }, [cards, data.status_history, refsOf, settings, now]);

  if (cards.length === 0) {
    return <div className="empty"><div className="t">ไม่มีงานตรงตัวกรองนี้</div></div>;
  }

  return (<>
   {/* แถบขั้น = ตัวกรอง ไม่ใช่แดชบอร์ด — แถวเดียวจบ
       เดิมเป็นการ์ด 7 ใบสูง 110px และมีบรรทัด "ยังขาด n" ที่ซ้ำกับกลุ่มเร่งด่วนด้านล่าง */}
   <div className="stagebar">
    {stageCounts.map((st) => (
      <button key={st.id}
       className={`sb ${stageFilter === st.id ? "on" : ""} ${st.n === 0 ? "zero" : ""}`}
       style={{ ["--stage"]: st.color }}
       onClick={() => onStageFilter(stageFilter === st.id ? null : st.id)}
       title={stageFilter === st.id ? "กดอีกครั้งเพื่อเลิกกรอง" : `ดูเฉพาะขั้น ${st.name}`}>
       <Icon name={st.icon} size={13}/>
       <span className="sb-name">{st.name}</span>
       <span className="sb-n mono">{st.n}</span>
      </button>))}
   </div>

   {stageFilter && (<div className="wl-active">
     กำลังดูเฉพาะขั้น <b>{STAGE_META[stageFilter].name}</b>
     <button onClick={() => onStageFilter(null)}>ล้าง</button>
    </div>)}

   {grouped.map((g) => {
     if (g.rows.length === 0) return null;
     const calm = g.id === 2;
     const collapsed = calm && !openCalm;
     return (<section className={`tri ${g.tone}`} key={g.id}>
      <button className="tri-head" onClick={() => calm && setOpenCalm(!openCalm)} disabled={!calm}>
       <span className="tri-dot"/>
       <b>{g.label}</b>
       <span className="tri-n mono">{g.rows.length}</span>
       <em>{g.hint}</em>
       {calm && <span className="tri-toggle">{collapsed ? "แสดง" : "ซ่อน"}</span>}
      </button>

      {!collapsed && (<div className="tri-rows">
       {g.rows.map(({ c, t }) => {
         const brand = brandOf(data, c.brand_id);
         const stage = STAGE_META[c.status];
         const dueISO = c.brief.publish_at ?? (c.brief.deadline_review ? `${c.brief.deadline_review}T00:00:00` : null);
         return (
          <div className={`tri-row ${t.tone}`} key={c.id}>
           <button className="tri-main" onClick={() => onOpen(c)}>
            <span className="tri-title">{c.title}</span>
            <span className="tri-sub">
             <span className="tri-brand" style={{ color: brand.color }}>{brand.name}</span>
             <span className="tri-stage" style={{ ["--stage"]: stage.color }}>{stage.name}</span>
             <span className="tri-kind" title={typeText(c.brief)}>
              <Icon name={typeIcon(c.brief)} size={12}/>{typeText(c.brief).split("·")[0].trim().split(" ")[0]}
              {typeIncomplete(c.brief) && !c.archived && <i className="wcard-warn-dot"/>}
             </span>
             {c.is_realtime && <span className="tag rt">Realtime</span>}
             {c.track === "project" && <span className="tag proj">Project</span>}
             {c.archived && <span className="tag">ปิดแล้ว</span>}
            </span>
           </button>

           <span className={`tri-why ${t.tone}`}>{t.why}</span>

           <button className="tri-owner cell-filter" onClick={() => onQuickFilter("owner", c.owner_id)} title="ดูเฉพาะงานของคนนี้">
            <Icon name="user" size={12}/>{profileOf(data, c.owner_id)?.display_name}
           </button>

           <span className="tri-due">
            {dueISO
              ? <><Icon name={c.brief.publish_at ? "send" : "eye"} size={12}/><span className="mono">{fmtDayMonth(dueISO)}</span></>
              : <span className="mono tri-nodue">ยังไม่มีกำหนด</span>}
           </span>
          </div>);
       })}
      </div>)}
     </section>);
   })}
  </>);
}
