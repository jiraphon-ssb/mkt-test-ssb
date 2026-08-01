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
/* ============================================================
 กล่องแนบรวม (AttachBox) — จุดแนบเดียวรับทุกอย่าง
 ลากรูป/ไฟล์มาวาง หรือวางลิ้งแล้ว Enter — ระบบแยกชนิดเอง ผู้ใช้ไม่ต้องเลือกก่อน
 หลังบ้านเก็บแยก 2 ตารางเหมือนเดิม (attachments / reference_links) ไม่แตะ schema
 gate เดิมใช้ได้ต่อ: รูปที่มีคำอธิบาย = นับ ref · ลิ้งทุกอันนับเข้า refLinks
 ============================================================ */

/** สร้าง attachment จากไฟล์ — แยกชนิดจาก mime/นามสกุลเอง: รูป → imageType, เอกสาร → brief_file */
export function makeAttachment(f, cardId, userId, order = 0, imageType = "reference") {
  const isImg = (f.type || "").startsWith("image/") || IMAGE_EXT.includes(extOf(f.name));
  const check = checkFile(f, isImg ? "image" : "doc");
  if (!check.ok) return { ok: false, name: f.name, error: check.error };
  const id = genId("att");
  blobUrls.set(id, URL.createObjectURL(f));
  return { ok: true, item: {
    id, card_id: cardId, attachment_type: isImg ? imageType : "brief_file",
    file_name: f.name, file_url: "", mime_type: f.type || (isImg ? "image/*" : `application/${extOf(f.name)}`),
    file_size: f.size, sort_order: order, uploaded_by: userId, created_at: nowISO(),
  } };
}
/** สร้าง link record จาก URL — detect ประเภท (Canva/Drive/TikTok…) อัตโนมัติ · คืน null ถ้า URL ไม่ถูก */
export function makeLink(url, cardId, userId) {
  const norm = normalizeUrl(url);
  if (!isValidUrl(norm)) return null;
  return { id: genId("lnk"), card_id: cardId, title: hostLabel(norm), url: norm,
    link_type: detectLinkType(norm), note: "", created_by: userId, created_at: nowISO() };
}

/** ทางเข้าเดียว: dropzone (ไฟล์+รูป) + แถบวางลิ้ง — ใช้ทั้งใน CardSheet และ IdeaModal */
export function AttachEntry({ onFiles, onLink, compact = false }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const [linkErr, setLinkErr] = useState(false);
  const commitLink = () => {
    const t = url.trim();
    if (!t) return;
    if (onLink(t)) { setUrl(""); setLinkErr(false); }
    else setLinkErr(true);
  };
  const accept = [...IMAGE_EXT, ...DOC_EXT].map((e) => `.${e}`).join(",");
  return (<div className={`attach-entry ${compact ? "compact" : ""}`}>
   <div className={`dropzone ${over ? "over" : ""}`}
    onDragOver={(e) => { e.preventDefault(); setOver(true); }}
    onDragLeave={() => setOver(false)}
    onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
    onClick={() => inputRef.current?.click()}>
    <Icon name="upload" size={compact ? 15 : 18}/>
    <span>ลากรูปหรือไฟล์มาวาง หรือคลิกเลือก</span>
    <input ref={inputRef} type="file" multiple hidden accept={accept}
     onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}/>
   </div>
   <div className={`attach-linkbar ${linkErr ? "invalid" : ""}`}>
    <Icon name="link" size={14}/>
    <input placeholder="หรือวางลิ้งตรงนี้ (Canva · Drive · TikTok …) แล้วกด Enter"
     value={url}
     onChange={(e) => { setUrl(e.target.value); setLinkErr(false); }}
     onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitLink(); } }}/>
    <button type="button" className="btn ghost small" disabled={!url.trim()} onClick={commitLink}>
     เพิ่มลิ้ง
    </button>
   </div>
   {linkErr && <div className="field-error"><Icon name="alert" size={13}/> URL ไม่ถูกต้อง</div>}
  </div>);
}

/**
 * หน้ากากแสดงของแนบทั้งหมดในกล่องเดียว — ไม่ผูก store
 * live (CardSheet) กับ buffer (IdeaModal) ส่ง list + callbacks มาเอง
 * actions: { files, link, moveImage?, updateAtt?, removeAtt, editLink?, removeLink }
 */
export function AttachSurface({ images, docs, links, editable, actions, errors = [], compact = false }) {
  const [lightbox, setLightbox] = useState(null);
  const empty = images.length === 0 && docs.length === 0 && links.length === 0;
  return (<>
   {editable && <AttachEntry onFiles={actions.files} onLink={actions.link} compact={compact}/>}

   {errors.map((e) => (<div className="upload-error" key={e.name}>
     <Icon name="alert" size={14}/>
     <span><b>{e.name}</b> — {e.error}</span>
    </div>))}

   {empty && !editable && <EmptyRow text="ยังไม่มีของแนบ"/>}

   {images.length > 0 && (<div className="img-grid">
     {images.map((a, i) => {
        const url = attachmentUrl(a);
        return (<figure className="img-cell" key={a.id}>
        <div className="img-frame">
         <button className="img-thumb" onClick={() => url && setLightbox(a)} title={url ? "ดูภาพใหญ่" : "demo: ไม่มีไฟล์จริง"}>
          {url ? <img src={url} alt={a.caption || a.file_name}/> : (<span className="img-placeholder"><Icon name="image" size={20}/></span>)}
         </button>
         {editable && (<div className="img-overlay">
           {actions.moveImage && (<>
            <button className="ov-btn" disabled={i === 0} onClick={() => actions.moveImage(a, -1)} title="เลื่อนซ้าย">
             <Icon name="chevron" size={13} style={{ transform: "rotate(90deg)" }}/>
            </button>
            <button className="ov-btn" disabled={i === images.length - 1} onClick={() => actions.moveImage(a, 1)} title="เลื่อนขวา">
             <Icon name="chevron" size={13} style={{ transform: "rotate(-90deg)" }}/>
            </button>
           </>)}
           <button className="ov-btn danger" onClick={() => actions.removeAtt(a.id)} title="ลบรูป">
            <Icon name="trash" size={13}/>
           </button>
          </div>)}
        </div>
        {!compact && actions.updateAtt && (
         <MktSelect compact className="img-cat" value={a.attachment_type} disabled={!editable}
          onChange={(v) => actions.updateAtt(a.id, { attachment_type: v })}
          options={IMAGE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}/>)}
        {actions.updateAtt && (
         <input className="img-caption" placeholder="อ้างแง่ไหน เช่น ชอบ layout แบบนี้" value={a.caption ?? ""} disabled={!editable}
          onChange={(e) => actions.updateAtt(a.id, { caption: e.target.value })}/>)}
       </figure>);
      })}
    </div>)}

   {docs.length > 0 && (<div className="file-list">
     {docs.map((a) => {
        const url = attachmentUrl(a);
        return (<div className="file-row" key={a.id}>
        <span className="file-ext mono">{extOf(a.file_name) || "?"}</span>
        <div className="file-main">
         <div className="file-name">{a.file_name}</div>
         <div className="file-meta">{formatBytes(a.file_size)} · {ATTACHMENT_TYPE_LABEL[a.attachment_type] ?? "ไฟล์"}</div>
        </div>
        <div className="file-acts">
         {url ? (<>
           <a className="icon-btn" href={url} target="_blank" rel="noreferrer" title="เปิด"><Icon name="external"/></a>
           <a className="icon-btn" href={url} download={a.file_name} title="ดาวน์โหลด"><Icon name="download"/></a>
          </>) : (<span className="file-note" title="demo: ไม่มีไฟล์จริง — เก็บเฉพาะข้อมูลไฟล์">metadata</span>)}
         {editable && (<button className="icon-btn danger" onClick={() => actions.removeAtt(a.id)} title="ลบ"><Icon name="trash"/></button>)}
        </div>
       </div>);
      })}
    </div>)}

   {links.length > 0 && (<div className="file-list">
     {links.map((l) => (<div className="file-row" key={l.id}>
       <span className="link-type">{LINK_TYPE_LABEL[l.link_type]}</span>
       <div className="file-main">
        <div className="file-name">{l.title || hostLabel(l.url)}</div>
        <div className="file-meta"><span className="link-url">{l.url}</span>{l.note && <> · {l.note}</>}</div>
       </div>
       <div className="file-acts">
        <a className="icon-btn" href={l.url} target="_blank" rel="noreferrer" title="เปิดลิงก์"><Icon name="external"/></a>
        {editable && actions.editLink && (<button className="icon-btn" onClick={() => actions.editLink(l)} title="แก้ไข"><Icon name="pencil"/></button>)}
        {editable && (<button className="icon-btn danger" onClick={() => actions.removeLink(l.id)} title="ลบ"><Icon name="trash"/></button>)}
       </div>
      </div>))}
    </div>)}

   {lightbox && (<div className="lightbox" onClick={() => setLightbox(null)}>
     <img src={attachmentUrl(lightbox)} alt={lightbox.caption || lightbox.file_name}/>
     <div className="lightbox-cap">{lightbox.caption || lightbox.file_name}</div>
    </div>)}
  </>);
}

/**
 * กล่องแนบรวมแบบ live — ผูกกับการ์ดจริงผ่าน useApp
 * ไม่รวมของที่มีบ้านของตัวเอง: งานจริง (ขั้น Draft) · แคปหลักฐาน (ขั้น 5-7) · รูปในโน้ต
 * @param {"image"|"video"|""} format — เปลี่ยนแค่คำแนะนำ ไม่เปลี่ยนโครง
 */
export function AttachBox({ cardId, editable, format = "image", title = "ของแนบ (รูป · ไฟล์ · ลิ้ง)" }) {
  const { data, currentUser, addAttachments, updateAttachment, removeAttachment, upsertLink, removeLink } = useApp();
  const [errors, setErrors] = useState([]);
  const [editingLink, setEditingLink] = useState(null);
  const OWN_HOME = ["draft_work", "schedule_proof", "live_proof", "insight_proof", "note_image"];
  const all = data.attachments.filter((a) => a.card_id === cardId && !OWN_HOME.includes(a.attachment_type));
  const images = all.filter((a) => a.mime_type.startsWith("image/"))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const docs = all.filter((a) => !a.mime_type.startsWith("image/"));
  const links = data.reference_links.filter((l) => l.card_id === cardId);

  const onFiles = (files) => {
    if (!files?.length) return;
    const ok = [], bad = [];
    let order = images.length;
    for (const f of Array.from(files)) {
      const r = makeAttachment(f, cardId, currentUser.id, order);
      if (r.ok) { ok.push(r.item); order++; }
      else bad.push(r);
    }
    if (ok.length) addAttachments(ok);
    setErrors(bad);
  };
  const onLink = (url) => {
    const l = makeLink(url, cardId, currentUser.id);
    if (!l) return false;
    upsertLink(l);
    return true;
  };
  const moveImage = (a, dir) => {
    const idx = images.findIndex((x) => x.id === a.id);
    const swap = images[idx + dir];
    if (!swap) return;
    updateAttachment(a.id, { sort_order: swap.sort_order ?? idx + dir });
    updateAttachment(swap.id, { sort_order: a.sort_order ?? idx });
  };
  return (<section className="attach-box">
   <SectionLabel icon="paperclip" title={title}
    hint={format === "video" ? "คลิปอ้างอิงวางเป็นลิ้ง TikTok/YouTube ได้เลย" : "โยนใส่ช่องเดียวจบ — ระบบแยกชนิดให้เอง"}/>
   <div className="sec-note">
    รูปที่อ้างเป็นแนวทาง ใส่คำอธิบายใต้รูปว่าอ้างแง่ไหน (layout / สี / pacing) — นับผ่านเงื่อนไข Ref ให้เลย
   </div>
   <AttachSurface images={images} docs={docs} links={links} editable={editable} errors={errors}
    actions={{ files: onFiles, link: onLink, moveImage, updateAtt: updateAttachment,
      removeAtt: removeAttachment, editLink: setEditingLink, removeLink }}/>
   {editingLink && (<LinkForm value={editingLink} onChange={setEditingLink}
     onSave={() => { upsertLink(editingLink); setEditingLink(null); }}
     onCancel={() => setEditingLink(null)}/>)}
  </section>);
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
