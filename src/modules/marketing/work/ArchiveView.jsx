/* ============================================================
   คลังผลงาน — งานที่ปิดแล้วทั้งหมด รวมไว้หน้าเดียวให้เกิดประโยชน์จริง:
   1) ความจำของทีม — งานจบแล้วไม่หายไปกับบอร์ด ย้อนดูได้พร้อมผลตอบรับ + บทเรียน
   2) "สูตรที่เวิร์ค" — วิเคราะห์จากงานที่วัดผลแล้วว่า แบรนด์×สาย×ชนิดไหน ER ชนะ
      ค่าเฉลี่ยของแบรนด์ (อย่างน้อย 3 งานถึงนับเป็นสูตร) — กดสูตรเพื่อดูงานกลุ่มนั้น
   3) ต้นแบบติดดาว — ปักงานที่อยากหยิบใช้บ่อยเป็นมาตรฐานทีม + แท็บแยกดูเฉพาะต้นแบบ
   4) "ใช้เป็นต้นแบบ" — กดเดียวก๊อปบรีฟเป็นไอเดียใหม่ พร้อมโน้ตอ้างถึงต้นทาง
   ใช้ตัวกรองชุดเดียวกับบอร์ด/ลิสต์ (match จาก WorkView)
   ============================================================ */
import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { WorkCard, WorkIdentity, WorkMeta } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";
import { PILLAR_LABEL } from "../mktEngine.js";
import { engagementRate, brandAverageER, genId, nowISO, isAlbum, channelRuns } from "../mktRules.js";
import { topFormulas } from "../mktAnalytics.js";
import { brandOf, profileOf, fmtThai } from "../mktParts.jsx";
import { Sheet } from "../detail/Sheet.jsx";
import { MktSelect } from "../mktSelect.jsx";
import { WorkGallery } from "./ReviewQueue.jsx";

const SORTS = [
  { id: "recent", label: "ปิดล่าสุด" },
  { id: "er", label: "ER สูงสุด" },
  { id: "reach", label: "Reach สูงสุด" },
];
const KIND_TH = { video: "คลิป", album: "ชุดภาพ", single: "ภาพเดี่ยว" };
const kindOf = (b) => (b.format === "video" ? "video" : isAlbum(b) ? "album" : "single");
const fmtNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function ArchiveView({ match, onOpen }) {
  const { data, currentUser, upsertCard, addNote, toggleStar, toast } = useApp();
  const [sort, setSort] = useState("recent");
  const [tab, setTab] = useState("all");           /* all | star */
  const [formula, setFormula] = useState(null);    /* {brand_id, pillar, kind} จากแถบสูตร */
  const [picked, setPicked] = useState(null);      /* การ์ดที่เปิดดูรายละเอียด (popup แบบคิวรอตรวจ) */
  /* แต่ละแบรนด์เห็นก่อน 5 ใบ (แถวเดียวบนจอกว้าง) — กด "ดูเพิ่ม" ทีละ 5 ไม่ท่วมจอ */
  const [showN, setShowN] = useState({});
  const PAGE = 5;

  const closed = useMemo(() => data.cards.filter((c) => c.archived && !c.id.startsWith("hist") && match(c)), [data.cards, match]);

  /* สูตรที่เวิร์ค — สูตรกลางตัวเดียวกับ Dashboard (mktAnalytics.topFormulas) */
  const formulas = useMemo(() => topFormulas(closed), [closed]);

  const inFormula = (c) => !formula ||
    (c.brand_id === formula.brand_id && c.pillar === formula.pillar && kindOf(c.brief) === formula.kind);
  const starredCount = closed.filter((c) => c.starred).length;
  const shown = closed.filter((c) => inFormula(c) && (tab !== "star" || c.starred));
  const sorted = useMemo(() => shown.slice().sort((a, b) => {
    if (sort === "er") return (engagementRate(b.metrics) ?? -1) - (engagementRate(a.metrics) ?? -1);
    if (sort === "reach") return (b.metrics?.reach ?? -1) - (a.metrics?.reach ?? -1);
    return b.updated_at.localeCompare(a.updated_at);
  }), [shown, sort]);

  /* สถิติหัวหน้า — สรุปคลังทั้งก้อนในแวบเดียว */
  const ers = closed.map((c) => engagementRate(c.metrics)).filter((r) => r != null);
  const avgER = ers.length ? (ers.reduce((s, r) => s + r, 0) / ers.length) * 100 : null;

  /* บทเรียนล่าสุดของการ์ด — โชว์ย่อบนการ์ดให้ความรู้ไม่จมอยู่ข้างใน */
  const lessonOf = (c) => (data.card_notes ?? [])
    .filter((n) => n.card_id === c.id && n.kind === "lesson")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.text;

  /* ก๊อปงานที่เวิร์คเป็นไอเดียใหม่ — บรีฟติดมา แต่ล้างของที่ผูกกับรอบเดิม */
  const reuse = (src) => {
    const id = genId("CT");
    upsertCard({
      id,
      track: src.track,
      status: "idea",
      brand_id: src.brand_id,
      owner_id: currentUser.id,
      title: `ทำซ้ำ: ${src.title}`,
      pillar: src.pillar,
      is_realtime: false,
      plan_confirmed: false,
      brief: { ...src.brief, publish_at: null, deadline_review: null, fact_checked: false },
      draft_link: "",
      self_check: Object.fromEntries(Object.keys(src.self_check ?? {}).map((k) => [k, false])),
      first_pass: null,
      entered_review_at: null,
      archived: false,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
    const er = engagementRate(src.metrics);
    addNote(id, `ต้นแบบจาก ${src.id} "${src.title}"${er != null ? ` — รอบก่อนได้ ER ${(er * 100).toFixed(1)}%` : ""}\nดูของเดิมในคลังผลงานได้ ถ้าจะเปลี่ยนมุมให้จดไว้ตรงนี้`, "idea");
    toast(`ก๊อปเป็นไอเดียใหม่แล้ว — ${id} อยู่คอลัมน์ Idea`, "ok");
  };

  return (<div className="arch">
   {/* สรุปคลัง + แท็บต้นแบบ + ตัวเรียง — แถวเดียวจบ */}
   <div className="arch-bar">
    <div className="arch-stats">
     <span className="arch-stat"><b className="mono">{closed.length}</b> งานปิดแล้ว</span>
     {avgER != null && <span className="arch-stat">ER เฉลี่ย <b className="mono">{avgER.toFixed(1)}%</b></span>}
    </div>
    <div className="arch-sort arch-tab">
     <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>ทั้งหมด</button>
     <button className={tab === "star" ? "on" : ""} onClick={() => setTab("star")}>★ ต้นแบบ{starredCount > 0 && ` ${starredCount}`}</button>
    </div>
    <div className="arch-sort">
     {SORTS.map((s) => (<button key={s.id} className={sort === s.id ? "on" : ""} onClick={() => setSort(s.id)}>{s.label}</button>))}
    </div>
   </div>

   {/* สูตรที่เวิร์ค — กดเพื่อดูเฉพาะงานกลุ่มนั้น จะได้รู้ว่าควรทำอะไรซ้ำ */}
   {formulas.length > 0 && (<div className="arch-fx">
     <span className="arch-fx-head"><Icon name="bulb" size={14}/> สูตรที่เวิร์ค</span>
     {formulas.map((f) => {
       const brand = brandOf(data, f.brand_id);
       const on = formula && formula.brand_id === f.brand_id && formula.pillar === f.pillar && formula.kind === f.kind;
       return (
         <button key={`${f.brand_id}${f.pillar}${f.kind}`} className={`arch-fx-item ${on ? "on" : ""}`}
           onClick={() => setFormula(on ? null : f)}
           title={on ? "กดอีกครั้งเพื่อเลิกกรอง" : `ดู ${f.n} งานในกลุ่มนี้`}>
          <i className="wcard-dot" style={{ background: brand.color }}/>
          <b>{brand.name}</b> · {KIND_TH[f.kind]} {PILLAR_LABEL[f.pillar]}
          <em>ER {(f.er * 100).toFixed(1)}% · สูงกว่าค่าเฉลี่ยแบรนด์ {Math.round((f.ratio - 1) * 100)}% · {f.n} งาน</em>
         </button>
       );
     })}
    </div>)}

   {sorted.length === 0
     ? (<div className="empty">
        <div className="t">{tab === "star" ? "ยังไม่มีต้นแบบติดดาว" : "ยังไม่มีงานที่ปิดแล้ว"}</div>
        <p className="s">{tab === "star"
          ? "กด ★ บนการ์ดในคลังเพื่อปักงานที่อยากใช้เป็นมาตรฐานทีม"
          : 'งานที่กรอกตัวเลขครบแล้วกด "ปิดงาน" จะมารวมกันที่นี่'}</p>
       </div>)
     : (<div className="arch-groups">
        {/* แบ่งแถวตามแบรนด์ — หัวแถวสรุปจำนวน + ER เฉลี่ยของแบรนด์นั้นในชุดที่กรองอยู่ */}
        {data.brands.filter((bd) => sorted.some((c) => c.brand_id === bd.id)).map((bd) => {
          const items = sorted.filter((c) => c.brand_id === bd.id);
          const bers = items.map((c) => engagementRate(c.metrics)).filter((x) => x != null);
          const bAvg = bers.length ? (bers.reduce((t, x) => t + x, 0) / bers.length) * 100 : null;
          const n = Math.min(showN[bd.id] ?? PAGE, items.length);
          const shownItems = items.slice(0, n);
          return (
           <section className="arch-brandsec" key={bd.id}>
            <div className="arch-brand-head">
             <i className="wcard-dot" style={{ background: bd.color }}/>
             <b style={{ color: bd.color }}>{bd.name}</b>
             <span className="arch-brand-n mono">{items.length} งาน</span>
             {bAvg != null && <span className="arch-brand-er">ER เฉลี่ย <b className="mono">{bAvg.toFixed(1)}%</b></span>}
             <i className="arch-brand-rule" style={{ ["--brand"]: bd.color }}/>
            </div>
            <div className="arch-grid">
             {shownItems.map((c) => {
          const er = engagementRate(c.metrics);
          const brandAvg = brandAverageER(data.cards, c.brand_id, c.id);
          const lesson = lessonOf(c);
          const chips = [];
          if (er != null) chips.push({ label: `ER ${(er * 100).toFixed(1)}%`, tone: brandAvg != null && er >= brandAvg ? "ok" : "plain" });
          if (c.metrics?.reach != null) chips.push({ label: `Reach ${fmtNum(c.metrics.reach)}`, tone: "plain" });
          return (
            <WorkCard key={c.id} card={c} cover coverFallback dateLabel="โพสต์"
              onOpen={() => setPicked(c)}
              statusChips={chips}
              foot={<>
                <button className={`arch-starbtn ${c.starred ? "on" : ""}`}
                  title={c.starred ? "เอาออกจากต้นแบบ" : "ปักเป็นต้นแบบประจำทีม"}
                  onClick={(e) => { e.stopPropagation(); toggleStar(c.id); }}>
                 {c.starred ? "★" : "☆"}
                </button>
                <button className="btn ghost small arch-reuse"
                  onClick={(e) => { e.stopPropagation(); reuse(c); }}
                  title="ก๊อปบรีฟของงานนี้เป็นไอเดียใหม่ — ไม่ต้องเริ่มจากศูนย์">
                 <Icon name="clipboard" size={13}/> ใช้เป็นต้นแบบ
                </button>
               </>}
            >
             {lesson
               ? (<p className="arch-lesson" title={lesson}><Icon name="bulb" size={12}/><span>{lesson}</span></p>)
               : (<button className="arch-nolesson" title="จดสิ่งที่ได้เรียนรู้จากงานนี้ให้ทีม"
                   onClick={(e) => { e.stopPropagation(); setPicked(c); }}>
                  <Icon name="bulb" size={12}/> + จดบทเรียนจากงานนี้
                 </button>)}
            </WorkCard>
          );
             })}
            </div>

            {/* แสดงกี่ใบจากทั้งหมด + ดูเพิ่ม/ย่อกลับ — คุมทีละแบรนด์ */}
            {items.length > PAGE && (<div className="arch-more">
              <span className="arch-more-n">แสดง <b className="mono">{n}</b> จาก <b className="mono">{items.length}</b> งาน</span>
              {n < items.length && (<button className="btn ghost small"
                onClick={() => setShowN((m) => ({ ...m, [bd.id]: n + PAGE }))}>
                ดูเพิ่มอีก {Math.min(PAGE, items.length - n)} <Icon name="chevron" size={13}/>
               </button>)}
              {n > PAGE && (<button className="btn ghost small"
                onClick={() => setShowN((m) => ({ ...m, [bd.id]: PAGE }))}>
                ย่อเหลือ {PAGE}
               </button>)}
             </div>)}
           </section>
          );
        })}
       </div>)}

   {picked && (<ArchiveSheet card={picked} onClose={() => setPicked(null)}
     onOpenFull={() => { const c = picked; setPicked(null); onOpen(c); }}
     onReuse={() => { reuse(picked); setPicked(null); }}
     onStar={() => toggleStar(picked.id)}/>)}
  </div>);
}

/* ============================================================
   ArchiveSheet — popup ดูงานที่ปิดแล้ว (โครงเดียวกับคิวรอตรวจที่ชอบ)
   ซ้าย = พรีวิวชิ้นงาน (แกลเลอรีตัวเดียวกับรอตรวจ) + ลิงก์โพสต์จริง
   ขวา = ตัวเลขรวม + กราฟเทียบรายช่องทาง + โจทย์ย่อ + บทเรียน
   ============================================================ */
function ArchiveSheet({ card: cardProp, onClose, onOpenFull, onReuse, onStar }) {
  const { data, addNote, upsertCard } = useApp();
  const [lessonDraft, setLessonDraft] = useState("");
  /* อ่านตัวล่าสุดจากสโตร์เสมอ — แก้หมวด/ติดดาวจากใน popup แล้วเห็นผลทันที */
  const card = data.cards.find((x) => x.id === cardProp.id) ?? cardProp;
  const brand = brandOf(data, card.brand_id);
  const images = data.attachments
    .filter((a) => a.card_id === card.id && a.mime_type?.startsWith("image/"))
    .sort((a, b) => (a.attachment_type === "draft_work" ? -1 : 1) - (b.attachment_type === "draft_work" ? -1 : 1) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const hasMedia = images.length > 0;
  const runs = channelRuns(card);
  const withData = runs.filter((r) => r.metrics && (r.metrics.reach ?? 0) > 0);
  /* งานรุ่นเก่ามีแต่ยอดรวม → เฉลี่ยเท่ากันทุกช่องทาง (กติกาเดียวกับ rollupByChannel ของ Dashboard) */
  const estimated = withData.length === 0 && (card.metrics?.reach ?? 0) > 0 && runs.length > 0;
  const chartRows = withData.length > 0
    ? withData.map((r) => ({ channel: r.channel, reach: r.metrics.reach ?? 0, er: engagementRate(r.metrics) }))
    : estimated
      ? runs.map((r) => ({ channel: r.channel, reach: (card.metrics.reach ?? 0) / runs.length, er: engagementRate(card.metrics) }))
      : [];
  const maxReach = Math.max(1, ...chartRows.map((r) => r.reach));
  const er = engagementRate(card.metrics);
  const brandAvg = brandAverageER(data.cards, card.brand_id, card.id);
  const lessons = (data.card_notes ?? []).filter((n) => n.card_id === card.id && n.kind === "lesson");
  const b = card.brief;
  const kpis = [
    { label: "Reach", value: card.metrics?.reach },
    { label: "Engagement", value: card.metrics?.engagement },
    { label: "Leads", value: card.metrics?.leads },
    { label: "ER", value: er != null ? `${(er * 100).toFixed(1)}%` : null,
      tone: er != null && brandAvg != null ? (er >= brandAvg ? "ok" : "bad") : null },
  ];
  return (
    <Sheet wide eyebrow={`${card.id} · ปิดงานแล้ว`} title={card.title} onClose={onClose}
      footer={<div className="rq-sheet-foot">
       <button className="btn ghost" onClick={onOpenFull}><Icon name="external" size={14}/> เปิดการ์ดเต็ม</button>
       <button className={`arch-starbtn ${card.starred ? "on" : ""}`} onClick={onStar}
         title={card.starred ? "เอาออกจากต้นแบบ" : "ปักเป็นต้นแบบประจำทีม"}>
        {card.starred ? "★ ต้นแบบ" : "☆ ปักเป็นต้นแบบ"}
       </button>
       <button className="btn dark" onClick={onReuse}><Icon name="clipboard" size={14}/> ใช้เป็นต้นแบบ</button>
      </div>}>
     <div className={`rv-2col as ${hasMedia ? "" : "nomedia"}`}>
      {/* ---------- ซ้าย: พรีวิวชิ้นงาน (ไม่มีรูป = ไม่ต้องเปลืองคอลัมน์) ---------- */}
      {hasMedia && (<div className="rv-view">
       <div className="rv-kicker"><Icon name="image" size={14}/> ชิ้นงานที่ขึ้นจริง</div>
       <WorkGallery images={images}/>
      </div>)}

      {/* ---------- ขวา: ผลงาน + โจทย์ + บทเรียน ---------- */}
      <div className="rv-detail">
       <WorkIdentity card={card}/>
       <WorkMeta card={card} dateLabel="โพสต์"/>

       {/* งานเก่าหลายใบไม่มีหมวด — เติมตรงนี้แล้วสูตรที่เวิร์ค/ตัวกรองจับงานนี้ได้เลย */}
       <div className="as-fix">
        <span className="as-fix-label">หมวด (Pillar)</span>
        <MktSelect compact value={card.pillar ?? ""} placeholder="— เติมหมวดให้งานนี้ —"
         onChange={(v) => upsertCard({ ...card, pillar: v || null })}
         options={[{ value: "", label: "— ไม่ระบุ —" },
           ...Object.keys(PILLAR_LABEL).map((pl) => ({ value: pl, label: PILLAR_LABEL[pl] }))]}/>
       </div>

       {/* ---- ผลตอบรับ: ตัวเลขรวม + รายช่องทาง + ลิงก์โพสต์ อยู่ก้อนเดียวกัน ---- */}
       <section className="as-sec">
        <div className="as-sec-head"><Icon name="chart" size={15}/> ผลตอบรับ</div>
        <div className="arch-kpis">
         {kpis.map((k) => (<div key={k.label} className={`arch-kpi ${k.tone ?? ""}`}>
           <span>{k.label}</span>
           <b className="mono">{k.value ?? "—"}</b>
          </div>))}
        </div>
        {er != null && brandAvg != null && (<div className="arch-vsavg">
          {er >= brandAvg ? "ชนะ" : "ต่ำกว่า"}ค่าเฉลี่ยของ {brand.name} ({(brandAvg * 100).toFixed(1)}%)
         </div>)}

        {estimated
          ? (<div className="achart" style={{ marginTop: 12 }}>
             {/* งานเก่ามีแต่ยอดรวม — โชว์เป็นชิปแบ่งเฉลี่ย ไม่วาดแท่งยาวเท่ากันให้เข้าใจผิด */}
             <div className="achart-even">
              {chartRows.map((r) => (<span key={r.channel}>{r.channel} <b className="mono">~{r.reach >= 1000 ? `${(r.reach / 1000).toFixed(1)}k` : Math.round(r.reach)}</b></span>))}
             </div>
             <div className="achart-legend">งานรุ่นเก่ามีแต่ยอดรวม — แบ่งเฉลี่ยต่อช่องทางให้ดูคร่าวๆ (กติกาเดียวกับ Dashboard)</div>
            </div>)
          : chartRows.length > 0 && (<div className="achart" style={{ marginTop: 12 }}>
             {chartRows.map((r) => (<div className="achart-row" key={r.channel}>
               <span className="achart-ch">{r.channel}</span>
               <span className="achart-bar"><i style={{ width: `${(r.reach / maxReach) * 100}%` }}/></span>
               <span className="achart-val mono">{r.reach >= 1000 ? `${(r.reach / 1000).toFixed(1)}k` : Math.round(r.reach)}</span>
               <span className="achart-er mono">{r.er != null ? `${(r.er * 100).toFixed(1)}%` : "—"}</span>
              </div>))}
             <div className="achart-legend">แท่ง = Reach · ตัวเลขขวา = ER ของช่องทางนั้น</div>
            </div>)}
        {runs.some((r) => r.post_url) && (<div className="arch-links">
          {runs.filter((r) => r.post_url).map((r) => (
            <a key={r.channel} className="arch-postlink" href={r.post_url} target="_blank" rel="noreferrer">
             <Icon name="external" size={12}/> {r.channel}
            </a>))}
         </div>)}
       </section>

       {/* ---- โจทย์ย่อ — พอให้รู้ว่างานนี้เล่นมุมไหน (เต็มอยู่ในการ์ดเต็ม) ---- */}
       {(b.hook || b.key_message || b.cta) && (<section className="as-sec">
         <div className="as-sec-head"><Icon name="clipboard" size={15}/> โจทย์ของงานนี้</div>
         <div className="arch-brief">
          {b.hook && <p><em>Hook</em>{b.hook}</p>}
          {b.key_message && <p><em>Key message</em>{b.key_message}</p>}
          {b.cta && <p><em>CTA</em>{b.cta}</p>}
         </div>
        </section>)}

       {/* ---- บทเรียน — อ่านของเดิม หรือจดเพิ่มจากตรงนี้ได้เลย ---- */}
       <section className="as-sec">
        <div className="as-sec-head"><Icon name="bulb" size={15}/> บทเรียนจากงานนี้</div>
        <div className="arch-lessons">
         {lessons.map((n) => (<p className="arch-lesson full" key={n.id}>
           <Icon name="bulb" size={12}/>
           <span>{n.text}<i className="arch-lesson-by"> — {profileOf(data, n.author_id)?.display_name} · {fmtThai(n.created_at)}</i></span>
          </p>))}
         <div className="arch-lesson-add">
          <textarea rows={2} placeholder="จดสิ่งที่ได้เรียนรู้ ให้รอบหน้าทำได้ดีกว่าเดิม…" value={lessonDraft}
           onChange={(e) => setLessonDraft(e.target.value)}/>
          <button className="btn ghost small" disabled={!lessonDraft.trim()}
           onClick={() => { addNote(card.id, lessonDraft, "measured", undefined, "lesson"); setLessonDraft(""); }}>
           จดบทเรียน
          </button>
         </div>
        </div>
       </section>
      </div>
     </div>
    </Sheet>
  );
}
