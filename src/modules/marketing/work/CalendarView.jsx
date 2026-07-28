/* ============================================================
 Calendar — หน้าเดียวจบ: ตารางเดือน (ซ้าย) + งานของวันที่เลือก (ขวา)
 เดิมแยกเป็นมุมมอง "วัน" กับ "เดือน" ต้องสลับไปมา — รวมแล้วเห็นภาพรวมทั้งเดือน
 พร้อมเจาะรายวันในจอเดียว ไม่ต้องจำว่าตอนนี้อยู่มุมมองไหน
 ข้อมูล: การ์ด scheduled/published ที่มี publish_at (เกณฑ์เดิม ไม่มี logic ใหม่)
 ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { STAGE_META, secText, sceneRole, SCENE_ROLE_LABEL } from "../mktEngine.js";
import { briefRefCounts, flexSlotUsage, gatePercent, timelineSummary, channelRuns } from "../mktRules.js";
import { brandOf, profileOf, fmtThaiDateTime, coverImage } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";
import { WorkIdentity, WorkMeta } from "../mktCard.jsx";
import { attachmentUrl } from "../detail/Attachments.jsx";

const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

/** จันทร์ของสัปดาห์ที่ครอบวันที่ ref — ใช้คิดโควตา flex slot รายสัปดาห์ */
function weekStart(ref) {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Calendar({ onOpen, match = () => true }) {
  const { data, settings } = useApp();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selected, setSelected] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); });
  const [pickedId, setPickedId] = useState(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const monthRef = useMemo(() => {
    const m = new Date(today);
    m.setDate(1);
    m.setMonth(m.getMonth() + monthOffset);
    return m;
  }, [today, monthOffset]);

  const cards = useMemo(() => data.cards.filter((c) => !c.archived &&
    (c.status === "scheduled" || c.status === "published") &&
    c.brief.publish_at &&
    match(c)), [data.cards, match]);

  const selectedDate = useMemo(() => new Date(selected), [selected]);
  const dayCards = useMemo(() => cards
    .filter((c) => sameDay(new Date(c.brief.publish_at), selectedDate))
    .sort((a, b) => a.brief.publish_at.localeCompare(b.brief.publish_at)), [cards, selectedDate]);
  const flex = flexSlotUsage(data.cards.filter((c) => !c.archived), settings, weekStart(selectedDate).toISOString());

  /* เปลี่ยนวันแล้วเลือกงานใบแรกให้เลย ไม่ต้องกดสองครั้ง */
  const firstOfDay = dayCards.length > 0 ? dayCards[0].id : null;
  useEffect(() => { setPickedId(firstOfDay); }, [firstOfDay]);
  const picked = dayCards.find((c) => c.id === pickedId) ?? null;

  /* ---- ตารางเดือน (จันทร์ = คอลัมน์แรก) ---- */
  const year = monthRef.getFullYear();
  const month = monthRef.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leading = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const jumpToday = () => {
    setMonthOffset(0);
    setSelected(today.getTime());
  };

  return (<>
   <div className="cal-nav">
    <button className="icon-btn" onClick={() => setMonthOffset(monthOffset - 1)} aria-label="เดือนก่อนหน้า">‹</button>
    <span className="rangelabel">{TH_MONTH[month]} {year + 543}</span>
    <button className="icon-btn" onClick={() => setMonthOffset(monthOffset + 1)} aria-label="เดือนถัดไป">›</button>
    <button className="btn ghost small" onClick={jumpToday}>วันนี้</button>
    <span className="cal-flex mono">Flex slot {flex.remaining}/{flex.limit}</span>
   </div>

   <div className="cal-wrap">
    {/* ---------- ตารางเดือน ---------- */}
    <div className="cal-grid-box">
     <div className="cal-month-head">
      {DOW.slice(1).concat(DOW[0]).map((d) => <span key={d}>{d}</span>)}
     </div>
     <div className="cal-month">
      {cells.map((day, i) => {
        if (day == null) return <div className="cal-cell empty" key={`e${i}`}/>;
        const cellDate = new Date(year, month, day);
        const isToday = sameDay(cellDate, today);
        const isSel = sameDay(cellDate, selectedDate);
        const of = cards.filter((c) => sameDay(new Date(c.brief.publish_at), cellDate));
        return (
          <button
            key={day}
            className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "sel" : ""}`}
            onClick={() => setSelected(cellDate.getTime())}
            title={of.length === 0 ? "ไม่มีงานลงวันนี้" : `${of.length} งาน`}
          >
           <span className="cal-cell-n mono">{day}</span>
           {of.length > 0 && (<span className="cal-cell-body">
             {of.slice(0, 3).map((c) => {
               const brand = brandOf(data, c.brand_id);
               return (<span className="cal-line" key={c.id}>
                <i style={{ background: brand.color }}/>
                <b className="mono">{fmtTime(c.brief.publish_at)}</b>
                <em>{c.title}</em>
               </span>);
             })}
             {of.length > 3 && <span className="cal-more">+{of.length - 3} งาน</span>}
            </span>)}
          </button>
        );
      })}
     </div>
    </div>

    {/* ---------- ขวา: งานของวันที่เลือก + รายละเอียดใบที่กด ---------- */}
    <aside className="cal-side">
     <div className="cs-head">
      <div className="cs-date">
       {DOW[selectedDate.getDay()]} {selectedDate.getDate()} {TH_MONTH[selectedDate.getMonth()]}
      </div>
      <span className="cs-n mono">{dayCards.length} งาน</span>
     </div>

     {dayCards.length === 0
       ? (<div className="cs-empty">
          <b>วันนี้ยังไม่มีงานตั้งเวลาไว้</b>
          <span>Flex slot ว่าง {flex.remaining} ช่อง แทรกงานเทรนด์ได้</span>
         </div>)
       : (<div className="cs-list">
          {dayCards.map((c) => {
            const brand = brandOf(data, c.brand_id);
            return (<button key={c.id} className={`cs-item ${pickedId === c.id ? "on" : ""} ${c.is_realtime ? "rt" : ""}`} onClick={() => setPickedId(c.id)}>
             <span className="cs-time mono">{fmtTime(c.brief.publish_at)}</span>
             <span className="cs-dot" style={{ background: c.is_realtime ? "var(--rt)" : brand.color }}/>
             <span className="cs-title">{c.title}</span>
             {c.is_realtime && <span className="tag rt">RT</span>}
            </button>);
          })}
         </div>)}

     {picked && <DayPanel card={picked} onOpen={onOpen}/>}
    </aside>
   </div>
  </>);
}

/* ---------- รายละเอียดงานที่เลือก (อยู่ใต้รายการของวันนั้น) ---------- */
function DayPanel({ card, onOpen }) {
  const { data } = useApp();
  const stage = STAGE_META[card.status];
  const refs = briefRefCounts(card.id, data.attachments, data.reference_links, data.channels);
  const tl = card.brief.format === "video" ? timelineSummary(card.brief) : { count: 0, scenes: [] };
  const posted = channelRuns(card).filter((r) => r.post_url);
  const pct = gatePercent(card, refs);
  const history = data.status_history
    .filter((h) => h.card_id === card.id)
    .slice(-3)
    .reverse();
  const cover = coverImage(card, data, attachmentUrl);
  return (<div className={`calpanel ${card.is_realtime ? "rt" : ""}`}>
   {cover && (<div className="cp-cover"><img src={cover} alt="" loading="lazy"/></div>)}
   <div className="cp-head">
    <span className="cp-stage" style={{ ["--stage"]: stage.color }}>{stage.name}</span>
   </div>

   {/* identity + meta ใช้ชิ้นส่วนเดียวกับการ์ดบอร์ด/รอตรวจ — ภาษาเดียวกันทุกจอ */}
   <WorkIdentity card={card}/>
   <h3 className="cp-title">{card.title}</h3>
   <WorkMeta card={card} withTime/>

   {card.brief.channels.length > 0 && (<div className="cp-row">
     <span className="k">ช่องทาง</span>
     <span className="v">{card.brief.channels.join(" · ")}</span>
    </div>)}
   {card.brief.hook && (<div className="cp-row">
     <span className="k">Hook</span>
     <span className="v">{card.brief.hook}</span>
    </div>)}
   {card.brief.key_message && (<div className="cp-row">
     <span className="k">Key message</span>
     <span className="v">{card.brief.key_message}</span>
    </div>)}
   {/* คลิป: 2 ฉากแรกพอให้รู้ว่าเปิดด้วยอะไร — รายละเอียดเต็มอยู่ในการ์ด */}
   {tl.count > 0 && (<div className="cp-tl">
     {tl.scenes.slice(0, 2).map((sc, i) => (<div className="cp-tlrow" key={i}>
       <span className="mono">{secText(sc.from)}–{secText(sc.to)}</span>
       <span>{SCENE_ROLE_LABEL[sceneRole(i, tl.count)] || ""} {sc.what || "ยังไม่ระบุ"}</span>
      </div>))}
     {tl.count > 2 && <div className="cp-tlmore">+ อีก {tl.count - 2} ฉาก</div>}
    </div>)}

   {/* ลิงก์โพสต์แยกรายช่องทาง — งานใบเดียวลงหลายช่อง เดิมโชว์ได้ลิงก์เดียว */}
   {posted.length > 0 && (<div className="cp-row">
     <span className="k">โพสต์</span>
     <span className="v cp-links">
      {posted.map((r) => (<a key={r.channel} href={r.post_url} target="_blank" rel="noreferrer">{r.channel}</a>))}
     </span>
    </div>)}

   {pct != null && (<div className="cp-gate">
     <div className="cp-gatebar"><i style={{ width: `${pct}%` }}/></div>
     <span className="mono">{pct}%</span>
    </div>)}

   {history.length > 0 && (<div className="cp-hist">
     <div className="cp-histhead">ล่าสุด</div>
     {history.map((h) => (<div className="cp-histrow" key={h.id}>
       <span className="hw">{profileOf(data, h.moved_by)?.display_name ?? "—"}</span>
       <span className="hs">
        {h.from_status === h.to_status ? "ปิดงาน" : `→ ${STAGE_META[h.to_status].name}`}
       </span>
       <span className="ht mono">{fmtThaiDateTime(h.moved_at)}</span>
      </div>))}
    </div>)}

   <button className="btn dark cp-open" onClick={() => onOpen(card)}>
    <Icon name="external" size={14}/> เปิดการ์ดเต็ม
   </button>
  </div>);
}
