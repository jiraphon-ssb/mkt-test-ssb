/* ============================================================
 ไฟล์บรีฟและ Reference — 3 ประเภท: ไฟล์เอกสาร · รูป · ลิงก์
 demo: ไฟล์เก็บเป็น object URL ราย session (metadata persist)
    ของจริงอัปขึ้น storage แล้วเก็บ URL — ดู migration 0002
 ============================================================ */
import { useRef, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { IMAGE_CATEGORIES, LINK_TYPE_LABEL, ATTACHMENT_TYPE_LABEL } from "../mktEngine.js";
import { checkFile, detectLinkType, extOf, formatBytes, hostLabel, isValidUrl, normalizeUrl, DOC_EXT, IMAGE_EXT, } from "../mktAttachments.js";
import { genId, nowISO } from "../mktRules.js";
import { profileOf } from "../mktParts.jsx";
import { Icon } from "../mktIcon.jsx";
import { MktSelect } from "../mktSelect.jsx";
/** object URL ราย session — ไม่ persist (สเปคห้ามเก็บ base64 ใน DB) */
const blobUrls = new Map();
/** URL ที่ใช้แสดงรูป/เปิดไฟล์ — demo ใช้ object URL, ของจริงใช้ file_url จาก storage */
/**
 * แนบรูปให้โน้ต — สร้าง record ผูก note_id + จอง blob URL (เดโม: refresh แล้วรูปหาย เหมือนไฟล์อื่น)
 * คืน { ok, bad } — ok เอาไปเข้า addAttachments · bad คือไฟล์ที่ไม่ผ่านเกณฑ์
 */
export function makeNoteImages(files, cardId, noteId, userId) {
  const ok = [], bad = [];
  for (const f of Array.from(files ?? [])) {
    const check = checkFile(f, "image");
    if (!check.ok) { bad.push({ name: f.name, error: check.error }); continue; }
    const id = genId("att");
    blobUrls.set(id, URL.createObjectURL(f));
    ok.push({
      id, card_id: cardId, note_id: noteId, attachment_type: "note_image",
      file_name: f.name, file_url: "", mime_type: f.type || "image/*",
      file_size: f.size, sort_order: ok.length, uploaded_by: userId, created_at: nowISO(),
    });
  }
  return { ok, bad };
}

export function attachmentUrl(a) {
  return blobUrls.get(a.id) || a.file_url || undefined;
}
function fmtThaiShort(iso) {
  const d = new Date(iso);
  const M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${d.getDate()} ${M[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
}
/** ลิงก์ที่เป็น "คลิปให้ดู" — แยกออกมาให้คนตรวจกดดูของจริงได้ทันที ไม่ปนกับลิงก์เอกสาร */
const CLIP_LINK_TYPES = ["tiktok", "youtube", "facebook"];
const isClipLink = (l) => CLIP_LINK_TYPES.includes(l.link_type);

/**
 * ไฟล์และของอ้างอิงของการ์ด — แยก 2 หน้าที่ให้ชัด
 *   บรีฟ  = ของที่ "ต้องทำตาม" (โจทย์ เอกสาร CI ภาพที่สั่งให้ใช้)
 *   เรฟ   = ของที่ "อ้างเป็นแนวทาง" (ภาพ/คลิปที่ชอบ — อ้างแค่บางแง่)
 * คำและกลุ่มเปลี่ยนตามชนิดงาน: คลิปได้กลุ่ม "คลิปอ้างอิง" เพิ่มมา ภาพนิ่งไม่มี
 * @param {"image"|"video"|""} format
 */
export function Attachments({ cardId, editable, format = "image" }) {
  const { data } = useApp();
  const isVideo = format === "video";
  const all = data.attachments.filter((a) => a.card_id === cardId);
  const docs = all.filter((a) => !a.mime_type.startsWith("image/"));
  const images = all
    .filter((a) => a.mime_type.startsWith("image/"))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const links = data.reference_links.filter((l) => l.card_id === cardId);
  const clipLinks = links.filter(isClipLink);
  const otherLinks = links.filter((l) => !isClipLink(l));
  /* ภาพ "บรีฟ/CI" คือของที่ต้องทำตาม · ที่เหลือคือเรฟ (ใช้เฉพาะงานภาพนิ่ง) */
  const briefImages = images.filter((a) => a.attachment_type === "brief_image" || a.attachment_type === "brand_guideline");
  const refImages = images.filter((a) => !briefImages.includes(a));

  /* คลิปกับภาพนิ่งไม่ใช้ของอ้างอิงชุดเดียวกัน — แสดงคนละชุดไปเลย ไม่เอามาปนกัน
     คลิป: ไฟล์บรีฟ → คลิปอ้างอิง (สำคัญสุด อยู่บน) → ภาพประกอบกองถ่าย 1 กล่อง → ลิงก์เอกสาร
     ภาพนิ่ง: ไฟล์บรีฟ → ภาพบรีฟ/CI (ต้องทำตาม) → ภาพอ้างอิง (แนวทาง) → ลิงก์อ้างอิง */
  if (isVideo) {
    return (<div className="stack-lg">
     <DocFiles cardId={cardId} items={docs} editable={editable}/>

     <LinkList
       cardId={cardId} items={clipLinks} editable={editable}
       title="คลิปอ้างอิง" note="ลิงก์ TikTok / YouTube / Facebook ที่อ้าง pacing หรือวิธีเล่า — กดดูของจริงได้เลย"
       defaultType="tiktok"/>

     <ImageFiles
       cardId={cardId} items={images} editable={editable} group="brief"
       title="ภาพประกอบกองถ่าย"
       note="สตอรี่บอร์ด · คีย์วิชวล · ภาพโลเคชัน — ของที่คนถ่ายต้องเห็นก่อนออกกอง"/>

     <LinkList
       cardId={cardId} items={otherLinks} editable={editable}
       title="ลิงก์เอกสาร / CI" note="เพิ่มได้หลายรายการ"/>
    </div>);
  }

  return (<div className="stack-lg">
   <DocFiles cardId={cardId} items={docs} editable={editable}/>

   <ImageFiles
     cardId={cardId} items={briefImages} editable={editable} group="brief"
     title="ภาพบรีฟ / CI"
     note="ของที่ต้องทำตาม — เลย์เอาต์ที่สั่ง โลโก้ ตัวอย่างจาก CI"/>

   <ImageFiles
     cardId={cardId} items={refImages} editable={editable} group="ref"
     title="ภาพอ้างอิง (Reference)"
     note="ของที่อ้างเป็นแนวทาง — ต้องเขียนในช่อง Ref AW ด้วยว่าอ้างแง่ไหน ไม่ใช่ลอกทั้งภาพ"/>

   <LinkList
     cardId={cardId} items={links} editable={editable}
     title="ลิงก์อ้างอิง" note="เพิ่มได้หลายรายการ"/>
  </div>);
}

/**
 * แคปหน้าจอหลักฐานของ "ช่องทางหนึ่ง ในขั้นหนึ่ง"
 * ต่างจาก ImageFiles ตรงที่ผูกกับ channel + attachment_type ตายตัว
 * อัปโหลดจากในป็อปอัปช่องทางได้เลย ไม่ต้องเลื่อนไปหาโซนไฟล์แนบ
 */
export function RunProof({ cardId, channel, type, label, editable }) {
  const { data, currentUser, addAttachments, removeAttachment } = useApp();
  const inputRef = useRef(null);
  const [errors, setErrors] = useState([]);
  const items = data.attachments.filter(
    (a) => a.card_id === cardId && a.channel === channel && a.attachment_type === type,
  );
  const onFiles = (files) => {
    if (!files?.length) return;
    const ok = [], bad = [];
    for (const f of Array.from(files)) {
      const check = checkFile(f, "image");
      if (!check.ok) { bad.push({ name: f.name, error: check.error }); continue; }
      const id = genId("att");
      blobUrls.set(id, URL.createObjectURL(f));
      ok.push({
        id, card_id: cardId, channel, attachment_type: type,
        file_name: f.name, file_url: "", mime_type: f.type || "image/*",
        file_size: f.size, sort_order: items.length, uploaded_by: currentUser.id, created_at: nowISO(),
      });
    }
    if (ok.length) addAttachments(ok);
    setErrors(bad);
    if (inputRef.current) inputRef.current.value = "";
  };
  return (<div className={`runproof ${items.length > 0 ? "on" : "opt"}`}>
   <div className="runproof-head">
    <Icon name={items.length > 0 ? "check" : "image"} size={13}/>
    <span>{label}</span>
    <b>{items.length > 0 ? `แนบแล้ว ${items.length}` : "แนบเพิ่มได้ (ไม่บังคับ)"}</b>
    {editable && (<button className="btn ghost small" onClick={() => inputRef.current?.click()}>
      <Icon name="upload" size={13}/> แนบแคป
     </button>)}
    <input ref={inputRef} type="file" multiple hidden accept={IMAGE_EXT.map((e) => `.${e}`).join(",")}
     onChange={(e) => onFiles(e.target.files)}/>
   </div>
   {errors.map((e) => (<div className="upload-error" key={e.name}>
     <Icon name="alert" size={13}/><span><b>{e.name}</b> — {e.error}</span>
    </div>))}
   {items.length > 0 && (<div className="runproof-list">
     {items.map((a) => {
       const url = blobUrls.get(a.id);
       return (<span className="runproof-item" key={a.id}>
        {url ? <img src={url} alt={a.file_name}/> : <Icon name="image" size={14}/>}
        <em>{a.file_name}</em>
        {editable && (<button className="icon-btn danger" onClick={() => removeAttachment(a.id)} title="ลบแคปนี้">
          <Icon name="trash" size={12}/>
         </button>)}
       </span>);
     })}
    </div>)}
  </div>);
}

/* ================= 1. ไฟล์บรีฟ ================= */
function DocFiles({ cardId, items, editable, }) {
  const { data, currentUser, addAttachments, removeAttachment } = useApp();
  const inputRef = useRef(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const onPick = (files) => {
    if (!files?.length)
      return;
    setBusy(true);
    const okItems = [];
    const bad = [];
    for (const f of Array.from(files)) {
      const check = checkFile(f, "doc");
      if (!check.ok) {
        bad.push({ name: f.name, error: check.error });
        continue;
      }
      const id = genId("att");
      blobUrls.set(id, URL.createObjectURL(f));
      okItems.push({
        id, card_id: cardId, attachment_type: "brief_file",
        file_name: f.name, file_url: "", mime_type: f.type || `application/${extOf(f.name)}`,
        file_size: f.size, uploaded_by: currentUser.id, created_at: nowISO(),
      });
    }
    if (okItems.length)
      addAttachments(okItems);
    setErrors(bad);
    setBusy(false);
    if (inputRef.current)
      inputRef.current.value = "";
  };
  return (<section>
   <SectionLabel icon="file" title="ไฟล์บรีฟ" hint={DOC_EXT.join(", ").toUpperCase()}/>

   {items.length === 0 ? (<EmptyRow text="ยังไม่มีไฟล์แนบ"/>) : (<div className="file-list">
     {items.map((a) => {
        const uploader = profileOf(data, a.uploaded_by);
        const url = blobUrls.get(a.id) || a.file_url;
        return (<div className="file-row" key={a.id}>
        <span className="file-ext mono">{extOf(a.file_name) || "?"}</span>
        <div className="file-main">
         <div className="file-name">{a.file_name}</div>
         <div className="file-meta">
          {formatBytes(a.file_size)} · {ATTACHMENT_TYPE_LABEL[a.attachment_type]} ·{" "}
          {fmtThaiShort(a.created_at)} · {uploader?.display_name ?? "—"}
         </div>
        </div>
        <div className="file-acts">
         {url ? (<>
           <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="เปิด">
            <Icon name="external"/>
           </a>
           <a className="icon-btn" href={url} download={a.file_name} title="ดาวน์โหลด">
            <Icon name="download"/>
           </a>
          </>) : (<span className="file-note" title="demo: ไม่มีไฟล์จริง — เก็บเฉพาะข้อมูลไฟล์">
           metadata
          </span>)}
         {editable && (<button className="icon-btn danger" onClick={() => removeAttachment(a.id)} title="ลบ">
           <Icon name="trash"/>
          </button>)}
        </div>
       </div>);
      })}
    </div>)}

   {errors.map((e) => (<div className="upload-error" key={e.name}>
     <Icon name="alert" size={14}/>
     <span><b>{e.name}</b> — {e.error}</span>
    </div>))}

   {editable && (<>
     <button className="btn ghost small" disabled={busy} onClick={() => inputRef.current?.click()}>
      <Icon name="upload"/> {busy ? "กำลังอัปโหลด…" : "เพิ่มไฟล์"}
     </button>
     <input ref={inputRef} type="file" multiple hidden accept={DOC_EXT.map((e) => `.${e}`).join(",")} onChange={(e) => onPick(e.target.files)}/>
    </>)}
  </section>);
}
/* ================= 2. รูปบรีฟ / Reference ================= */
export function ImageFiles({ cardId, items, editable, group, title, note }) {
  const { currentUser, addAttachments, updateAttachment, removeAttachment } = useApp();
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const onFiles = (files) => {
    if (!files?.length)
      return;
    const okItems = [];
    const bad = [];
    let order = items.length;
    for (const f of Array.from(files)) {
      const check = checkFile(f, "image");
      if (!check.ok) {
        bad.push({ name: f.name, error: check.error });
        continue;
      }
      const id = genId("att");
      blobUrls.set(id, URL.createObjectURL(f));
      okItems.push({
        id, card_id: cardId, attachment_type: group === "work" ? "draft_work" : group === "brief" ? "brief_image" : "reference",
        file_name: f.name, file_url: "", mime_type: f.type || "image/*",
        file_size: f.size, sort_order: order++, uploaded_by: currentUser.id, created_at: nowISO(),
      });
    }
    if (okItems.length)
      addAttachments(okItems);
    setErrors(bad);
    if (inputRef.current)
      inputRef.current.value = "";
  };
  const move = (a, dir) => {
    const idx = items.findIndex((x) => x.id === a.id);
    const swap = items[idx + dir];
    if (!swap)
      return;
    updateAttachment(a.id, { sort_order: swap.sort_order ?? idx + dir });
    updateAttachment(swap.id, { sort_order: a.sort_order ?? idx });
  };
  return (<section>
   <SectionLabel icon="image" title={title} hint={IMAGE_EXT.join(", ").toUpperCase()}/>
   {note && <div className="sec-note">{note}</div>}

   {editable && (<div className={`dropzone ${over ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()}>
     <Icon name="upload" size={18}/>
     <span>ลาก{title}มาวาง หรือคลิกเพื่อเลือก (เลือกหลายรูปได้)</span>
     <input ref={inputRef} type="file" multiple hidden accept={IMAGE_EXT.map((e) => `.${e}`).join(",")} onChange={(e) => onFiles(e.target.files)}/>
    </div>)}

   {errors.map((e) => (<div className="upload-error" key={e.name}>
     <Icon name="alert" size={14}/>
     <span><b>{e.name}</b> — {e.error}</span>
    </div>))}

   {items.length === 0 && !editable && <EmptyRow text={`ยังไม่มี${title}`}/>}

   {items.length > 0 && (<div className="img-grid">
     {items.map((a, i) => {
        const url = blobUrls.get(a.id);
        return (<figure className="img-cell" key={a.id}>
        <div className="img-frame">
         <button className="img-thumb" onClick={() => url && setLightbox(a)} title={url ? "ดูภาพใหญ่" : "demo: ไม่มีไฟล์จริง"}>
          {url ? <img src={url} alt={a.caption || a.file_name}/> : (<span className="img-placeholder"><Icon name="image" size={20}/></span>)}
         </button>

         {/* ปุ่มลอยบนรูป — ไม่เบียดพื้นที่ dropdown ด้านล่าง */}
         {editable && (<div className="img-overlay">
           <button className="ov-btn" disabled={i === 0} onClick={() => move(a, -1)} title="เลื่อนซ้าย">
            <Icon name="chevron" size={13} style={{ transform: "rotate(90deg)" }}/>
           </button>
           <button className="ov-btn" disabled={i === items.length - 1} onClick={() => move(a, 1)} title="เลื่อนขวา">
            <Icon name="chevron" size={13} style={{ transform: "rotate(-90deg)" }}/>
           </button>
           <button className="ov-btn danger" onClick={() => removeAttachment(a.id)} title="ลบรูป">
            <Icon name="trash" size={13}/>
           </button>
          </div>)}
        </div>

        <MktSelect compact className="img-cat" value={a.attachment_type} disabled={!editable}
         onChange={(v) => updateAttachment(a.id, { attachment_type: v })}
         options={IMAGE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}/>

        <input className="img-caption" placeholder="คำอธิบาย เช่น ชอบ layout แบบนี้" value={a.caption ?? ""} disabled={!editable} onChange={(e) => updateAttachment(a.id, { caption: e.target.value })}/>
       </figure>);
      })}
    </div>)}

   {lightbox && (<div className="lightbox" onClick={() => setLightbox(null)}>
     <img src={blobUrls.get(lightbox.id)} alt={lightbox.caption || lightbox.file_name}/>
     <div className="lightbox-cap">{lightbox.caption || lightbox.file_name}</div>
    </div>)}
  </section>);
}
/* ================= 3. ลิงก์อ้างอิง ================= */
function LinkList({ cardId, items, editable, title = "ลิงก์อ้างอิง", note, defaultType = "website" }) {
  const { currentUser, upsertLink, removeLink } = useApp();
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const blank = () => ({
    id: genId("lnk"), card_id: cardId, title: "", url: "",
    link_type: defaultType, note: "", created_by: currentUser.id, created_at: nowISO(),
  });
  return (<section>
   <SectionLabel icon={defaultType === "tiktok" ? "video" : "link"} title={title} hint="เพิ่มได้หลายรายการ"/>
   {note && <div className="sec-note">{note}</div>}

   {items.length === 0 && !adding && <EmptyRow text={defaultType === "tiktok" ? "ยังไม่มีคลิปอ้างอิง" : "ยังไม่มีลิงก์"}/>}

   <div className="file-list">
    {items.map((l) => editing?.id === l.id ? (<LinkForm key={l.id} value={editing} onChange={setEditing} onSave={() => { upsertLink(editing); setEditing(null); }} onCancel={() => setEditing(null)}/>) : (<div className="file-row" key={l.id}>
       <span className="link-type">{LINK_TYPE_LABEL[l.link_type]}</span>
       <div className="file-main">
        <div className="file-name">{l.title || hostLabel(l.url)}</div>
        <div className="file-meta">
         <span className="link-url">{l.url}</span>
         {l.note && <> · {l.note}</>}
        </div>
       </div>
       <div className="file-acts">
        <a className="icon-btn" href={l.url} target="_blank" rel="noreferrer" title="เปิดลิงก์">
         <Icon name="external"/>
        </a>
        {editable && (<>
          <button className="icon-btn" onClick={() => setEditing(l)} title="แก้ไข">
           <Icon name="pencil"/>
          </button>
          <button className="icon-btn danger" onClick={() => removeLink(l.id)} title="ลบ">
           <Icon name="trash"/>
          </button>
         </>)}
       </div>
      </div>))}
   </div>

   {adding && (<LinkForm value={editing ?? blank()} onChange={setEditing} onSave={() => { if (editing)
      upsertLink(editing); setEditing(null); setAdding(false); }} onCancel={() => { setEditing(null); setAdding(false); }}/>)}

   {editable && !adding && (<button className="btn ghost small" onClick={() => { setEditing(blank()); setAdding(true); }}>
     <Icon name="plus"/> เพิ่มลิงก์
    </button>)}
  </section>);
}
function LinkForm({ value, onChange, onSave, onCancel, }) {
  const [touched, setTouched] = useState(false);
  const urlOk = isValidUrl(normalizeUrl(value.url));
  const showErr = touched && value.url.trim() !== "" && !urlOk;
  return (<div className="link-form">
   <div className="grid2">
    <div>
     <div className="form-label">URL <span className="req">*</span></div>
     <input className={`field ${showErr ? "invalid" : ""}`} placeholder="https://example.com" value={value.url} onBlur={() => {
      setTouched(true);
      if (value.url.trim()) {
        const norm = normalizeUrl(value.url);
        onChange({ ...value, url: norm, link_type: detectLinkType(norm), title: value.title || hostLabel(norm) });
      }
    }} onChange={(e) => onChange({ ...value, url: e.target.value })}/>
     {showErr && <div className="field-error"><Icon name="alert" size={13}/> URL ไม่ถูกต้อง</div>}
    </div>
    <div>
     <div className="form-label">ประเภท</div>
     <MktSelect value={value.link_type} onChange={(v) => onChange({ ...value, link_type: v })}
      options={Object.keys(LINK_TYPE_LABEL).map((t) => ({ value: t, label: LINK_TYPE_LABEL[t] }))}/>
    </div>
   </div>
   <div className="grid2" style={{ marginTop: 8 }}>
    <div>
     <div className="form-label">ชื่อลิงก์</div>
     <input className="field" placeholder="เช่น หน้าเว็บเดิม" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })}/>
    </div>
    <div>
     <div className="form-label">หมายเหตุ</div>
     <input className="field" placeholder="ไม่บังคับ" value={value.note ?? ""} onChange={(e) => onChange({ ...value, note: e.target.value })}/>
    </div>
   </div>
   <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
    <button className="btn dark small" disabled={!urlOk} onClick={onSave}>บันทึกลิงก์</button>
    <button className="btn ghost small" onClick={onCancel}>ยกเลิก</button>
   </div>
  </div>);
}
/* ---------- ชิ้นเล็ก ---------- */
function SectionLabel({ icon, title, hint }) {
  return (<div className="sub-head">
   <Icon name={icon}/>
   <span className="sub-title">{title}</span>
   {hint && <span className="sub-hint">{hint}</span>}
  </div>);
}
function EmptyRow({ text }) {
  return <div className="empty-row">{text}</div>;
}
