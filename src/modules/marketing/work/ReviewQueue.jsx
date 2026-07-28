/* ============================================================
 ReviewQueue — คิวรอตรวจของ Team Lead
 คิว = การ์ดเรียงกริด (ไม่ใช่แถวยาวเต็มจอ) เรียงรอนานสุดขึ้นก่อน
 กด "ตรวจงาน" → popup เดียวจบ: หลักฐาน + โจทย์ + Self-check + ปุ่มตัดสิน
 ลำดับใน popup เรียงตามที่ผู้ตรวจทำจริง ไม่ใช่ลำดับฟิลด์ในฐานข้อมูล:
   1) เปิดไฟล์งาน + ของที่เอามาอ้าง  2) เหตุผลรอบก่อน (ถ้าตีกลับมา)
   3) เทียบกับโจทย์ที่อนุมัติไว้     4) Self-check ที่เจ้าของงานยืนยัน
 กติกาเหล็ก: ออกจาก Review ได้ทางปุ่ม Approve/ตีกลับ ของ Team Lead เท่านั้น
 ============================================================ */
import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { selfCheckItems, SCENE_ROLE_LABEL, sceneRole, secText } from "../mktEngine.js";
import { canDecideReview, hoursWaitingInReview, albumFrames, frameComplete, frameSize, isAlbum,
  timelineSummary, sceneComplete, timelineGaps, gateChecklist, briefRefCounts } from "../mktRules.js";
import { brandOf, profileOf, BrandTag, PillarTag, TypeTag, Avatar, fmtThai, fmtThaiDateTime } from "../mktParts.jsx";
import { WorkCard } from "../mktCard.jsx";
import { STAGE_META } from "../mktEngine.js";
import { RejectModal } from "../detail/RejectDialog.jsx";
import { Sheet } from "../detail/Sheet.jsx";
import { Icon } from "../mktIcon.jsx";
import { attachmentUrl } from "../detail/Attachments.jsx";

/* หัวใจที่คนตรวจต้องเทียบก่อน 3 อย่าง — แสดงตัวใหญ่ */
const HERO_FIELDS = [
  { label: "Hook — 3 วิแรกต้องหยุดนิ้ว", get: (c) => c.brief.hook },
  { label: "Key message — สารเดียวที่อยากให้จำ", get: (c) => c.brief.key_message },
  { label: "CTA — ให้คนดูทำอะไรต่อ", get: (c) => c.brief.cta },
];
/* รายละเอียดประกอบ — เล็ก 2 คอลัมน์ ไม่แย่งสายตาจากหัวใจ */
const SUPPORT_FIELDS = [
  { label: "ใคร → ทำอะไร", get: (c) => c.brief.who_action },
  { label: "ช่องทาง", get: (c) => c.brief.channels.join(" · ") },
  { label: "Mood", get: (c) => c.brief.mood },
  { label: "ซับไตเติล", only: "video", get: (c) => (c.brief.video_subtitle ? "มีซับไทยฝังในคลิป" : "ไม่มีซับ — ต้องอ่านรู้เรื่องปิดเสียง") },
  { label: "Layout", only: "image", get: (c) => c.brief.layout_note },
  { label: "Ref AW — อ้างอิงแง่ไหน", get: (c) => c.brief.ref_note },
  { label: "ลิงก์ CI", get: (c) => c.brief.ci_link },
  { label: "เช็คตัวเลขกับ Fact Sheet", get: (c) => (c.brief.fact_checked ? "เจ้าของงานยืนยันแล้ว" : "") },
  { label: "วัน–เวลาโพสต์", get: (c) => fmtThaiDateTime(c.brief.publish_at) },
];

/** สถานะ SLA ของใบหนึ่ง — ใช้ทั้งที่การ์ดและใน popup ให้ตรงกัน */
function slaOf(card, settings) {
  const wait = Math.round(hoursWaitingInReview(card));
  const left = settings.sla_hours - wait;
  return {
    wait, left,
    cls: left <= 0 ? "bad" : left <= 6 ? "warn" : "ok",
    text: left <= 0 ? `เกิน SLA ${-left} ชม.` : `เหลือ ${left} ชม.`,
  };
}

export function ReviewQueue({ match = () => true, onOpen }) {
  const { data, currentUser, settings } = useReviewCtx();
  const [openId, setOpenId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);

  const queue = useMemo(() => data.cards
    .filter((c) => c.status === "review" && match(c))
    .sort((a, b) => hoursWaitingInReview(b) - hoursWaitingInReview(a)), [data.cards, match]);
  const nearSLA = queue.filter((c) => slaOf(c, settings).left <= 6).length;
  const isLead = canDecideReview(currentUser);
  /* การ์ดที่เปิด popup ต้องอ่านจาก data ล่าสุด — ตีกลับแล้วใบนี้จะหลุดคิว popup ต้องปิดเอง */
  const openCard = openId ? queue.find((c) => c.id === openId) ?? null : null;

  return (<>
   <div className="rq-summary">
    <span className="rq-sum-item">รอตรวจ <b className="mono">{queue.length}</b></span>
    <span className={`rq-sum-item ${nearSLA > 0 ? "alert" : ""}`}>
     ใกล้/เกิน SLA {settings.sla_hours} ชม. <b className="mono">{nearSLA}</b>
    </span>
    <span className="rq-sum-note">
     {isLead ? "กด “ตรวจงาน” เพื่อดูหลักฐานและตัดสินในหน้าต่างเดียว" : "เฉพาะ Team Lead ตัดสินได้ — ดูหลักฐานได้ทุกคน"}
    </span>
   </div>

   {queue.length === 0
     ? (<div className="empty"><div className="t">คิวว่าง — เคลียร์ครบแล้ว</div></div>)
     : (<div className="rq-grid">
        {queue.map((c) => <QueueCard key={c.id} card={c} onOpen={() => setOpenId(c.id)}/>)}
       </div>)}

   {openCard && (<ReviewSheet
     card={openCard}
     isLead={isLead}
     onClose={() => setOpenId(null)}
     onReject={() => setRejectFor(openCard)}
     onOpenCard={onOpen ? () => { const c = openCard; setOpenId(null); onOpen(c); } : null}
   />)}
   {rejectFor && <RejectModal card={rejectFor} onClose={() => setRejectFor(null)} onDone={() => { setRejectFor(null); setOpenId(null); }}/>}
  </>);
}

/* ---------- การ์ดในคิว: อ่านจบใน 3 บรรทัด แล้วกดเข้าไปตรวจ ---------- */
function QueueCard({ card, onOpen }) {
  const { settings } = useReviewCtx();
  const sla = slaOf(card, settings);
  const redo = card.first_pass === false;
  return (
    <WorkCard
      card={card}
      cover
      coverFallback
      dateLabel="โพสต์"
      statusChips={[
        { label: sla.text, tone: sla.cls },
        ...(redo ? [{ label: "รอบ 2", tone: "warn" }] : []),
        { label: `รอ ${sla.wait} ชม.`, tone: "plain" },
      ]}
      foot={<button className="btn dark small rq-go" onClick={onOpen}>ตรวจงาน</button>}
    />
  );
}

/* ---------- popup ตรวจงาน — เรียงตามลำดับที่หัวหน้าตรวจจริง ----------
   1 เปิดของที่ส่งมา → 2 รอบก่อนตีกลับเพราะ → 3 เทียบโจทย์ → 4 ไทม์ไลน์/รายภาพ
   → 5 Self-check → 6 ช่องที่กติกายังไม่ผ่าน → 7 ประวัติใบนี้ → ตัดสิน
   เลขขั้นนับอัตโนมัติจากส่วนที่โผล่จริง ไม่ฮาร์ดโค้ด (คลิป/ชุดภาพ/AW เดี่ยว โชว์ไม่เท่ากัน) */
function ReviewSheet({ card, isLead, onClose, onReject, onOpenCard }) {
  const { data, settings, approveCard } = useReviewCtx();
  const brand = brandOf(data, card.brand_id);
  const owner = profileOf(data, card.owner_id);
  const sla = slaOf(card, settings);
  const atts = data.attachments.filter((a) => a.card_id === card.id);
  const allImages = atts.filter((a) => a.mime_type.startsWith("image/")).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const workImages = allImages.filter((a) => a.attachment_type === "draft_work");
  const refImages = allImages.filter((a) => a.attachment_type !== "draft_work");
  const docs = atts.filter((a) => !a.mime_type.startsWith("image/"));
  const links = data.reference_links.filter((l) => l.card_id === card.id);
  /** ผลตีกลับครั้งล่าสุด — บริบทที่ผู้ตรวจรอบ 2 ต้องเห็นก่อนตัดสิน */
  const rejects = data.review_actions
    .filter((a) => a.card_id === card.id && a.action === "reject")
    .sort((a, b) => b.acted_at.localeCompare(a.acted_at));
  const lastReject = rejects[0] ?? null;
  const selfItems = selfCheckItems(card.brief);
  const scPassed = selfItems.filter((it) => card.self_check?.[it.key]).length;
  const frames = albumFrames(card.brief);
  const isVideo = card.brief.format === "video";
  const tl = timelineSummary(card.brief);
  const gaps = isVideo && tl.total > 0 ? timelineGaps(card.brief) : [];
  /* ช่องที่กติกายังไม่ผ่าน — คิดจากเกณฑ์เดียวกับที่ใช้กันการ์ดไม่ให้เดินขั้น */
  const refs = briefRefCounts(card.id, data.attachments, data.reference_links, data.channels);
  const briefGaps = gateChecklist({ ...card, status: "brief" }, refs).filter((g) => !g.done);
  const history = data.status_history
    .filter((h) => h.card_id === card.id)
    .sort((a, b) => b.moved_at.localeCompare(a.moved_at))
    .slice(0, 5);

  return (
    <Sheet
      wide
      onClose={onClose}
      eyebrow={card.id}
      title={card.title}
      subhead={<div className="rq-sheet-sub">
       <BrandTag brand={brand}/>
       <PillarTag card={card}/>
       {card.is_realtime && <span className="tag rt">Realtime</span>}
       {rejects.length > 0 && <span className="tag redo">รอบ {rejects.length + 1}</span>}
       <TypeTag brief={card.brief}/>
       <span className={`sla-chip ${sla.cls}`}>{sla.text}</span>
       <span className="rq-meta"><Avatar profile={owner} size={20}/> {owner?.display_name} · รอ {sla.wait} ชม.</span>
      </div>}
      footer={<div className="rq-sheet-foot">
       {onOpenCard && (<button className="btn ghost" onClick={onOpenCard}>
         <Icon name="external" size={14}/> เปิดการ์ดเต็ม
        </button>)}
       {isLead ? (<>
         <button className="btn ghost danger-text" onClick={onReject}>ตีกลับ</button>
         <button className="btn dark" onClick={() => { approveCard(card.id); onClose(); }}>
          <Icon name="check" size={15}/> Approve
         </button>
        </>) : (<div className="rq-readonly">เฉพาะ Team Lead ตัดสินได้</div>)}
      </div>}
    >
     <div className="rv-2col">
      {/* ══ ซ้าย — ดูงานจริง: กดเปิดไฟล์ / ดูรูป / ลิงก์ เพื่อตรวจ (sticky) ══ */}
      <aside className="rv-view">
       <div className="rv-kicker">ดูงานที่ส่งมา</div>
       {/* งานจริงเป็นแกลเลอรี เลื่อน/ซูมได้ — ตรวจได้ครบโดยไม่ต้องออกไป Drive */}
       {workImages.length > 0
         ? <WorkGallery images={workImages}/>
         : (<div className="rv-nowork"><Icon name="image" size={22}/><span>งานอยู่ในลิงก์ Drive — กดปุ่มด้านล่างเพื่อเปิดดู</span></div>)}

       {card.draft_link
         ? (<a className="rv-open" href={card.draft_link} target="_blank" rel="noreferrer">
            <Icon name="external" size={16}/> เปิดไฟล์งาน (Drive)
            <span className="rv-open-by">{owner?.display_name} ส่งเมื่อ {fmtThai(card.entered_review_at)}</span>
           </a>)
         : (<div className="rv-open-by" style={{ marginTop: 8 }}>{owner?.display_name} ส่งเมื่อ {fmtThai(card.entered_review_at)}</div>)}

       {(refImages.length > 0 || docs.length > 0 || links.length > 0) && (<div className="rv-refbox">
         <div className="rv-refbox-h">ของที่ใช้อ้างอิง</div>
         {refImages.length > 0 && (<div className="rq-refs grid">
           {refImages.map((a) => {
             const url = attachmentUrl(a);
             return (<figure className="rq-ref" key={a.id}>
              <span className="rq-ref-thumb">{url ? <img src={url} alt={a.caption || a.file_name}/> : <Icon name="image" size={16}/>}</span>
              <figcaption>{a.caption || a.file_name}</figcaption>
             </figure>);
           })}
          </div>)}
         {(docs.length > 0 || links.length > 0) && (<div className="rv-view-links">
           {docs.map((a) => (<span className="rq-reflink" key={a.id}><Icon name="paperclip" size={13}/> {a.caption || a.file_name}</span>))}
           {links.map((l) => (<a className="rq-reflink" key={l.id} href={l.url} target="_blank" rel="noreferrer"><Icon name="link" size={13}/> {l.title || l.url}</a>))}
          </div>)}
        </div>)}
      </aside>

      {/* ══ ขวา — รายละเอียดสำหรับตัดสิน ══ */}
      <div className="rv-detail">
       {lastReject && (<section className="rv-callout">
         <div className="rv-callout-head"><Icon name="alert" size={15}/> รอบก่อนตีกลับเพราะ</div>
         <p className="rv-reason">{lastReject.reason}</p>
         <div className="rv-reason-meta">
          <span className="chip-tone warn">{lastReject.direction_pack_ref === "new" ? "ยังไม่มีข้อในกติกา" : lastReject.direction_pack_ref}</span>
          {profileOf(data, lastReject.acted_by)?.display_name} · {fmtThaiDateTime(lastReject.acted_at)}
         </div>
        </section>)}

       <section className="rv-block">
        <div className="rv-kicker">หัวใจที่ต้องเทียบกับงาน</div>
        <div className="rv-hero">
         {HERO_FIELDS.map((f) => {
           const val = f.get(card);
           return (<div className="rv-hero-item" key={f.label}>
            <div className="rv-hero-k">{f.label}</div>
            <div className={`rv-hero-v ${val ? "" : "miss"}`}>{val || "ยังไม่กรอก"}</div>
           </div>);
         })}
        </div>
       </section>

       <section className="rv-block">
        <div className="rv-kicker">รายละเอียดประกอบ</div>
        <div className="rv-grid">
         {SUPPORT_FIELDS.filter((f) => !f.only || f.only === card.brief.format).map((f) => {
           const val = f.get(card);
           return (<div className="rv-field" key={f.label}>
            <div className="rv-k">{f.label}</div>
            <div className={`rv-v ${val ? "" : "miss"}`}>{val || "ยังไม่กรอก"}</div>
           </div>);
         })}
        </div>
       </section>

       {isVideo && (<section className="rv-block">
         <div className="rv-kicker">ไทม์ไลน์คลิป — เทียบทีละฉาก
          <span className={`chip-tone ${tl.ok ? "good" : "warn"}`}>{tl.filled}/{tl.count} ฉาก · {tl.covered}/{tl.total} วิ</span>
         </div>
         {gaps.length > 0 && (<div className="rv-miss">
           <Icon name="alert" size={14}/> ยังไม่มีฉากรับผิดชอบ {gaps.map((g) => `${secText(g.from)}–${secText(g.to)}`).join(" · ")}
          </div>)}
         <ol className="rv-scenes">
          {tl.scenes.map((sc, i) => {
            const role = sceneRole(i, tl.scenes.length);
            return (<li key={i} className={sceneComplete(sc) ? "" : "miss"}>
             <span className="rs-time mono">{secText(sc.from)}<i>–</i>{secText(sc.to)}</span>
             <span className="rs-body">
              <span className="rs-what">
               {SCENE_ROLE_LABEL[role] && <span className="rf-tag">{SCENE_ROLE_LABEL[role]}</span>}
               {sc.what || "ยังไม่ระบุว่าฉากนี้เห็นอะไร"}
              </span>
              <span className="rs-meta">
               {sc.shot && <span><b>มุมกล้อง</b> {sc.shot}</span>}
               {sc.who && <span><b>ใคร</b> {sc.who}</span>}
               {sc.place && <span><b>สถานที่</b> {sc.place}</span>}
               {sc.screen_text && <span><b>ข้อความบนจอ</b> “{sc.screen_text}”</span>}
               {sc.audio && <span><b>เสียง</b> {sc.audio}</span>}
               {sc.note && <span className="rs-note"><b>หมายเหตุ</b> {sc.note}</span>}
              </span>
             </span>
            </li>);
          })}
         </ol>
        </section>)}

       {isAlbum(card.brief) && (<section className="rv-block">
         <div className="rv-kicker">รายภาพในชุด <span className="chip-tone plain">{frames.length} ภาพ</span></div>
         <ol className="rv-frames">
          {frames.map((f, i) => (<li key={i} className={frameComplete(f) ? "" : "miss"}>
            <span className="rf-n mono">{i + 1}</span>
            <span className="rf-body">
             <span className="rf-text">{f.text || "ยังไม่ระบุว่าภาพนี้พูดอะไร"}</span>
             <span className="rf-meta">
              <b className="mono">{frameSize(card.brief, f) || "—"}</b>
              {i === 0 && <span className="rf-tag">ปก</span>}
              {i === frames.length - 1 && <span className="rf-tag">CTA</span>}
              {f.note && <span className="rf-note">{f.note}</span>}
             </span>
            </span>
           </li>))}
         </ol>
        </section>)}

       <section className="rv-block">
        <div className="rv-kicker">เจ้าของงานเช็คเองแล้ว
         <span className={`chip-tone ${scPassed === selfItems.length ? "good" : "warn"}`}>{scPassed}/{selfItems.length}</span>
        </div>
        <ul className="rv-sc">
         {selfItems.map((it) => (<li key={it.key} className={card.self_check?.[it.key] ? "ok" : "no"}>
           <Icon name={card.self_check?.[it.key] ? "check" : "alert"} size={13}/> {it.label}
          </li>))}
        </ul>
        {briefGaps.length > 0 && (<div className="rv-gap-note">
          <Icon name="alert" size={13}/> บรีฟยังขาดตามกติกา: {briefGaps.map((g) => g.label).join(" · ")}
         </div>)}
       </section>

       {history.length > 0 && (<section className="rv-block">
         <div className="rv-kicker">การเดินงานที่ผ่านมา
          {rejects.length > 0 && <span className="chip-tone warn">ตีกลับมาแล้ว {rejects.length} ครั้ง</span>}
         </div>
         <ul className="rv-hist">
          {history.map((h) => (<li key={h.id}>
            <span className="rh-who">{profileOf(data, h.moved_by)?.display_name ?? "—"}</span>
            <span className="rh-move">
             {h.from_status === h.to_status ? "แก้ไขในขั้นเดิม" : `${STAGE_META[h.from_status]?.name ?? h.from_status} → ${STAGE_META[h.to_status]?.name ?? h.to_status}`}
            </span>
            <span className="rh-when">{fmtThaiDateTime(h.moved_at)}</span>
           </li>))}
         </ul>
        </section>)}
      </div>
     </div>
    </Sheet>
  );
}

/* ---------- แกลเลอรีรูปงานจริง — รูปใหญ่ + thumbs + ‹ › + ตัวนับ + กดซูมเต็มจอ ---------- */
/* แกลเลอรีรูปงาน — คิวรอตรวจใช้ดูของที่ส่งมา · หน้าคลังยืมไปโชว์ผลงานที่ปิดแล้ว */
export function WorkGallery({ images }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const i = Math.min(idx, images.length - 1);
  const cur = images[i];
  const url = attachmentUrl(cur);
  const go = (d) => setIdx((n) => (n + d + images.length) % images.length);
  return (<div className="wgal">
   <div className="wgal-main">
    {url
      ? <img src={url} alt={cur.caption || cur.file_name} onClick={() => setZoom(true)}/>
      : <span className="wgal-ph"><Icon name="image" size={28}/></span>}
    {images.length > 1 && (<>
      <button className="wgal-nav prev" onClick={() => go(-1)} aria-label="รูปก่อนหน้า">‹</button>
      <button className="wgal-nav next" onClick={() => go(1)} aria-label="รูปถัดไป">›</button>
      <span className="wgal-count mono">{i + 1}/{images.length}</span>
     </>)}
   </div>
   {cur.caption && <div className="wgal-cap">{cur.caption}</div>}
   {images.length > 1 && (<div className="wgal-thumbs">
     {images.map((a, n) => {
       const u = attachmentUrl(a);
       return (<button key={a.id} className={`wgal-thumb ${n === i ? "on" : ""}`} onClick={() => setIdx(n)} aria-label={`รูป ${n + 1}`}>
        {u ? <img src={u} alt=""/> : <Icon name="image" size={13}/>}
       </button>);
     })}
    </div>)}
   {zoom && url && (<div className="lightbox" onClick={() => setZoom(false)}>
     <img src={url} alt={cur.caption || cur.file_name}/>
     <div className="lightbox-cap">{cur.caption || cur.file_name} · {i + 1}/{images.length}</div>
    </div>)}
  </div>);
}

/* helper */
function useReviewCtx() {
  const app = useApp();
  return { ...app, settings: app.data.settings };
}
