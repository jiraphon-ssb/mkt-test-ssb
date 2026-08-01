/* ============================================================
 การ์ดกลางของโมดูล — ใช้ซ้ำได้ทุกหน้า ห้ามเขียนกล่องการ์ดเองซ้ำอีก
 ที่ใช้อยู่: ไทล์ Dashboard · แผงผลตอบรับ · คอลัมน์บอร์ด · เรื่องด่วน · หน้าตั้งค่า

 <Panel>  = กล่องมาตรฐาน (พื้น surface + ขอบ line + เงา) หัวกล่อง + เนื้อกล่อง
 <Chip>   = ป้ายเล็กบอกระดับ/จำนวน ใช้ token ของ SSB ทุกโทน
 <Row>    = แถวรายการในกล่อง กดได้ (มี hover + ลูกศร) หรือกดไม่ได้ก็ได้

 โทนสี (tone) ผูกกับ token ของ SSB จุดเดียวที่นี่:
   critical = rose · warn = amber · good = emerald · info/plain = zinc
 ============================================================ */
import { InfoButton } from "./mktInfoButton.jsx";
import { Icon } from "./mktIcon.jsx";
import { useApp } from "./useMkt.jsx";
import { brandOf, profileOf, coverImage, typeIcon, fmtThai, fmtThaiDateTime } from "./mktParts.jsx";
import { attachmentUrl } from "./detail/Attachments.jsx";

/* ── ชิ้นส่วน reusable ของการ์ดงาน — ประกอบเอง/ยกไปใช้ที่อื่นได้ ──────────────
   <WorkIdentity> = บรรทัดแบรนด์ (จุดสี + ชื่อ + pillar จาง + ชิปเรียลไทม์)
   <WorkMeta>     = บรรทัดข้อมูล icon นำ อ่านกวาดตาได้: ผู้ดูแล · ชนิดงาน · เวลา
   ปฏิทิน (DayPanel) ก็ใช้สองตัวนี้ — ภาษาเดียวกันทุกจอ */

/** บรรทัดแบรนด์ของการ์ด — ชิป tint เดียวจบ
   pillar/เรียลไทม์ ย้ายไปอยู่ใน popup — บนการ์ด realtime เหลือ spine amber บอกอยู่แล้ว */
export function WorkIdentity({ card }) {
  const { data } = useApp();
  const brand = brandOf(data, card.brand_id);
  return (
    <div className="wcard-id">
     <span className="wcard-brand-chip" style={{ color: brand.color, background: `color-mix(in srgb, ${brand.color} 13%, transparent)` }}>
      {brand.name}
     </span>
    </div>
  );
}

/**
 * บรรทัด meta — แต่ละก้อนมี icon นำให้รู้ทันทีว่าคืออะไร (owner / ชนิดงาน / เวลา)
 * @param {object}  p
 * @param {object}  p.card
 * @param {string} [p.dateLabel]  คำนำหน้าวันที่ (ปกติเดาจากข้อมูล: โพสต์/ส่งตรวจ)
 * @param {boolean}[p.withTime]   โชว์เวลาด้วย (ปฏิทินใช้ — บอร์ดเอาแค่วัน)
 */
export function WorkMeta({ card, dateLabel, withTime = false }) {
  const { data } = useApp();
  const owner = profileOf(data, card.owner_id);
  const brief = card.brief;
  /* โน้ตในการ์ดโผล่บนการ์ดทุกจอ — มีตีกลับค้างอยู่ = จุดแดงเตือนให้เข้าไปแก้ */
  const cardNotes = (data.card_notes ?? []).filter((n) => n.card_id === card.id);
  const hasReject = cardNotes.some((n) => n.kind === "reject" && n.pinned);
  const dateISO = brief?.publish_at ?? (brief?.deadline_review ? brief.deadline_review + "T00:00:00" : null);
  const dateTxt = dateISO
    ? `${dateLabel ?? (brief?.publish_at ? "โพสต์" : "ส่งตรวจ")} ${withTime ? fmtThaiDateTime(dateISO) : fmtThai(dateISO)}`
    : null;
  return (
    <div className="wcard-meta">
     {/* 2 ก้อนพอ: คนทำ + วันที่ — สเปกงาน/จำนวนโน้ตอยู่ใน popup
        ยกเว้นตีกลับค้าง = เรื่องด่วนจริง คงจุดแดงไว้ */}
     <span className="wmeta-item" title="ผู้ดูแล"><Icon name="user" size={13}/>{owner?.display_name ?? "—"}</span>
     {dateTxt && <span className="wmeta-item" title="กำหนดเวลา"><Icon name="clock" size={13}/>{dateTxt}</span>}
     {hasReject && (
      <span className="wmeta-item" title="มีโน้ตตีกลับค้างอยู่ — เปิดการ์ดดูว่าต้องแก้อะไร">
       <Icon name="pencil" size={13}/><i className="wmeta-reject-dot"/>
      </span>
     )}
    </div>
  );
}

/**
 * WorkCard — การ์ดงานกลาง ใช้ทั้งบอร์ด · รอตรวจ · ปฏิทิน (ทิศทางเดียวกันทั้งหมด)
 * ส่วนไหนไม่ส่ง = ไม่แสดง · realtime อ่านจาก card เอง (พื้น tint + ชิป ไม่ต้องส่งอะไรเพิ่ม)
 * @param {object}  p
 * @param {object}  p.card
 * @param {()=>void}[p.onOpen]      กดการ์ด
 * @param {boolean} [p.cover]       โชว์รูปหน้าปก (จากไฟล์แนบ/ลิงก์ไดร์ฟ)
 * @param {{label:string,tone?:"bad"|"warn"|"ok"|"plain"}[]} [p.statusChips] ชิปสถานะ (SLA / แก้ n รอบ / กวาดล้าง)
 * @param {any}     [p.foot]        ท้ายการ์ด (ชิปไฟล์ หรือ ปุ่ม action)
 * @param {{width:number,color:string,cap:any,capColor?:string}} [p.progress] แถบความพร้อม
 * @param {string}  [p.dateLabel]   คำนำหน้าวันที่ใน meta (ปกติเดาจากข้อมูล)
 * @param {any}     [p.children]    เนื้อหาเสริมใต้ meta
 */
export function WorkCard({ card, onOpen, cover, coverFallback, statusChips, foot, progress, dateLabel, children, className = "" }) {
  const { data } = useApp();
  const brand = brandOf(data, card.brand_id);
  const coverUrl = cover ? coverImage(card, data, attachmentUrl) : null;
  const go = onOpen ? () => onOpen() : undefined;
  /* identity บอกแบรนด์อยู่แล้ว — ชื่องานที่ขึ้นต้น "แบรนด์ — " ตัดซ้ำออกให้อ่านลื่น */
  const title = card.title.replace(new RegExp(`^${brand.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—–-]\\s*`), "");
  return (
    <article
      className={`wcard ${card.is_realtime ? "rt" : ""} ${go ? "clickable" : ""} ${className}`}
      style={{ ["--brand"]: brand.color }}
      role={go ? "button" : undefined}
      tabIndex={go ? 0 : undefined}
      onClick={go}
      onKeyDown={go ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } : undefined}
    >
      {coverUrl
        ? (<div className="wcard-cover"><img src={coverUrl} alt="" loading="lazy"/></div>)
        : cover && coverFallback && (
          /* กริดที่การ์ดต้องสูงเท่ากัน (คลัง/รอตรวจ): ไม่มีรูปก็กันพื้นที่ไว้เท่ากัน
             — แถวไม่เบี้ยว และบอกตรงๆ ว่าใบนี้ไม่มีรูปแนบ */
          <div className="wcard-cover ph" aria-hidden="true">
           <Icon name={typeIcon(card.brief)} size={24}/>
           <span>ไม่มีรูปงานแนบ</span>
          </div>)}

      <WorkIdentity card={card}/>
      <h3 className="wcard-title">{title}</h3>
      <WorkMeta card={card} dateLabel={dateLabel}/>

      {children}

      {/* สถานะ: ชิปเตือน/SLA + แถบ progress หรือปุ่ม */}
      {(statusChips?.length > 0 || progress || foot) && (<div className="wcard-status">
        {statusChips?.length > 0 && (<div className="wcard-chips">
          {statusChips.map((c, i) => <span key={i} className={`wchip ${c.tone || "plain"}`}>{c.label}</span>)}
         </div>)}
        {progress && (<div className="wcard-prog">
          <div className="wcard-bar"><i style={{ width: `${progress.width}%`, background: progress.color }}/></div>
          {progress.cap != null && <span className="wcard-cap" style={progress.capColor ? { color: progress.capColor } : undefined}>{progress.cap}</span>}
         </div>)}
        {foot && <div className="wcard-foot">{foot}</div>}
       </div>)}
    </article>
  );
}

/**
 * @param {object}  p
 * @param {string} [p.title]      หัวกล่อง
 * @param {number} [p.count]      ตัวเลขข้างหัวกล่อง (ป้ายกลม)
 * @param {any}    [p.hint]       บรรทัดอธิบายใต้หัวกล่อง
 * @param {{label:string,text:string}} [p.info]  ปุ่ม i อธิบายวิธีอ่าน
 * @param {any}    [p.tools]      ปุ่ม/ตัวเลือกชิดขวาของหัวกล่อง
 * @param {string} [p.accent]     สีไอคอน/จุดนำหน้าหัวกล่อง (เช่นสีขั้นของบอร์ด)
 * @param {string} [p.icon]       ชื่อไอคอนนำหน้าหัวกล่อง (แทนจุดสี)
 * @param {"critical"|"warn"|"good"|"info"} [p.tone]  โทนของกล่อง (แต้มสีที่ขอบซ้าย)
 * @param {boolean}[p.scroll]     ให้เนื้อกล่องเลื่อนในตัวเอง
 * @param {number} [p.maxH]       ความสูงสูงสุดของกล่อง (คู่กับ scroll)
 */
export function Panel({
  title, count, hint, info, tools, accent, icon, tone,
  scroll = false, maxH, className = "", bodyClass = "", children,
}) {
  const hasHead = title != null || tools != null || info != null;
  return (
    <section
      className={`stat-section ${tone ? `panel-${tone}` : ""} ${className}`}
      style={{ ...(accent ? { ["--stage"]: accent } : null), ...(maxH ? { maxHeight: maxH } : null) }}
    >
      {hasHead && (
        <div className="tile-head">
          {icon
            ? <span className="panel-icon"><Icon name={icon} size={15}/></span>
            : accent && <span className="panel-dot"/>}
          {title != null && <h2>{title}</h2>}
          {count != null && <span className="panel-n mono">{count}</span>}
          {info && <InfoButton label={info.label} text={info.text}/>}
          {tools && <div className="panel-tools">{tools}</div>}
        </div>
      )}
      {hint && <div className="panel-hint">{hint}</div>}
      <div className={`tile-body ${scroll ? "panel-scroll" : ""} ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** ป้ายเล็ก — tone เดียวกับ Panel · plain = ป้ายจำนวนกลางๆ */
export function Chip({ tone = "plain", children }) {
  return <span className={`chip-tone ${tone}`}>{children}</span>;
}

/**
 * แถวรายการในกล่อง — ส่ง onGo มาแล้วทั้งแถวคลิกได้ (คีย์บอร์ดใช้ได้ด้วย)
 * ไม่ส่งมา = แถวอ่านอย่างเดียว ไม่ทำท่าว่ากดได้
 */
export function Row({ tone, onGo, title, sub, chips, right, children }) {
  const go = onGo ? () => onGo() : undefined;
  return (
    <article
      className={`panel-row ${tone ? `panel-${tone}` : ""} ${go ? "clickable" : ""}`}
      role={go ? "button" : undefined}
      tabIndex={go ? 0 : undefined}
      onClick={go}
      onKeyDown={go ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } } : undefined}
    >
      <div className="pr-main">
        {title != null && <div className="pr-title">{title}</div>}
        {sub && <p className="pr-sub">{sub}</p>}
        {chips?.length > 0 && (
          <div className="pr-chips">
            {chips.map((c) => (<span className="pr-chip" key={c.label}>{c.label} <b>{c.value}</b></span>))}
          </div>
        )}
        {children}
      </div>
      {right}
      {go && <span className="pr-go"><Icon name="arrow" size={15}/></span>}
    </article>
  );
}
