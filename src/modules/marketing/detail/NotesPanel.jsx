/* ============================================================
   NotesPanel — โน้ตประจำการ์ด (คอลัมน์ขวาสุดของ popup การ์ด)
   จดตรงนี้แทนการไปตามหาในแชท: feedback ลูกค้า · สิ่งที่ต้องแก้ · ข้อตกลง
   - บันทึกทันทีที่กด (ไม่ผูกกับปุ่มบันทึกของฟอร์ม — ปิด popup โน้ตไม่หาย)
   - แนบรูปได้หลายรูป (ก่อนกดจดมีพรีวิว ลบออกได้) · กดรูปดูเต็มจอ
   - โน้ตติดขั้นที่จดอัตโนมัติ กรองดู "ขั้นนี้" ได้
   - ตีกลับจากคิวรอตรวจ = โน้ตแดงปักหมุดอัตโนมัติ บอกว่าต้องแก้อะไร
   - ปักหมุดเรื่องสำคัญขึ้นบนสุด · แก้/ลบได้เฉพาะโน้ตของตัวเอง
   ============================================================ */
import { useRef, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { Icon } from "../mktIcon.jsx";
import { STAGE_META } from "../mktEngine.js";
import { genId } from "../mktRules.js";
import { profileOf, Avatar, fmtThaiDateTime } from "../mktParts.jsx";
import { makeNoteImages, attachmentUrl } from "./Attachments.jsx";

export function NotesPanel({ card }) {
  const { data, currentUser, addNote, updateNote, removeNote, addAttachments, confirm } = useApp();
  const [text, setText] = useState("");
  const [pending, setPending] = useState([]);      /* File[] รอแนบไปกับโน้ตที่กำลังพิมพ์ */
  const [fileErrors, setFileErrors] = useState([]);
  const [onlyStage, setOnlyStage] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState("");
  const [viewImg, setViewImg] = useState(null);    /* {url, name} — lightbox */
  const fileRef = useRef(null);

  const all = (data.card_notes ?? []).filter((n) => n.card_id === card.id);
  const notes = (onlyStage ? all.filter((n) => n.stage === card.status) : all)
    .slice()
    .sort((a, b) => (b.pinned - a.pinned) || b.created_at.localeCompare(a.created_at));
  const imagesOf = (n) => data.attachments.filter((a) => a.note_id === n.id);

  const canSubmit = text.trim() !== "" || pending.length > 0;
  const submit = () => {
    if (!canSubmit) return;
    const noteId = genId("note");
    if (pending.length > 0) {
      const { ok, bad } = makeNoteImages(pending, card.id, noteId, currentUser.id);
      if (ok.length) addAttachments(ok);
      setFileErrors(bad);
    }
    addNote(card.id, text, card.status, noteId);
    setText("");
    setPending([]);
  };
  const onPickFiles = (files) => {
    if (files?.length) setPending((p) => [...p, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const onDelete = async (n) => {
    const imgs = imagesOf(n).length;
    const ok = await confirm({
      title: "ลบโน้ตนี้",
      message: `ลบแล้วกู้คืนไม่ได้${imgs > 0 ? ` — รูปที่แนบไว้ ${imgs} รูปจะถูกลบไปด้วย` : ""}`,
      confirmLabel: "ลบโน้ต", danger: true,
    });
    if (ok) removeNote(n.id);
  };

  return (
    <aside className="notes-panel">
      <div className="notes-head">
        <Icon name="pencil" size={14}/>
        <h3>โน้ตการทำงาน</h3>
        {all.length > 0 && <span className="notes-n mono">{all.length}</span>}
        <button className={`notes-filter ${onlyStage ? "on" : ""}`} onClick={() => setOnlyStage(!onlyStage)}
          title="ดูเฉพาะโน้ตของขั้นปัจจุบัน">
          ขั้นนี้
        </button>
      </div>

      {/* กล่องจด — พิมพ์ + แนบรูปได้หลายรูป · ⌘/Ctrl+Enter บันทึก */}
      <div className="notes-compose">
        <textarea
          rows={3}
          placeholder={`จดถึงการ์ดนี้… (ติดขั้น ${STAGE_META[card.status].name} อัตโนมัติ)`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
        />
        {pending.length > 0 && (
          <div className="notes-pending">
            {pending.map((f, i) => (
              <span className="notes-pending-img" key={`${f.name}${i}`}>
                <img src={URL.createObjectURL(f)} alt={f.name}/>
                <button title="เอารูปนี้ออก" onClick={() => setPending(pending.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
        )}
        {fileErrors.map((e) => (
          <div className="upload-error" key={e.name}>
            <Icon name="alert" size={13}/><span><b>{e.name}</b> — {e.error}</span>
          </div>
        ))}
        <div className="notes-compose-foot">
          <button className="notes-attach" title="แนบรูปไปกับโน้ต" onClick={() => fileRef.current?.click()}>
            <Icon name="image" size={14}/>{pending.length > 0 ? ` ${pending.length} รูป` : " แนบรูป"}
          </button>
          <input ref={fileRef} type="file" multiple hidden accept="image/*" onChange={(e) => onPickFiles(e.target.files)}/>
          <span className="notes-hint">⌘+Enter</span>
          <button className="btn dark small" disabled={!canSubmit} onClick={submit}>จดโน้ต</button>
        </div>
      </div>

      {notes.length === 0 && (
        <div className="notes-empty">
          {onlyStage ? "ขั้นนี้ยังไม่มีโน้ต" : "ยังไม่มีโน้ต — จดข้อตกลง/สิ่งที่ต้องแก้ไว้ที่นี่"}
        </div>
      )}

      <div className="notes-list">
        {notes.map((n) => {
          const author = profileOf(data, n.author_id);
          const mine = n.author_id === currentUser.id;
          const stage = STAGE_META[n.stage];
          const imgs = imagesOf(n);
          const isReject = n.kind === "reject";
          const isLesson = n.kind === "lesson";
          return (
            <article key={n.id} className={`note ${n.pinned ? "pinned" : ""} ${isReject ? "reject" : ""} ${isLesson ? "lesson" : ""}`}>
              <div className="note-head">
                <Avatar profile={author} size={18}/>
                <b>{author?.display_name ?? "—"}</b>
                {isReject
                  ? <span className="note-reject-chip">ตีกลับ</span>
                  : isLesson
                    ? <span className="note-lesson-chip">บทเรียน</span>
                    : stage && <span className="note-stage" style={{ ["--stage"]: stage.color }}>{stage.name}</span>}
                <button className={`note-pin ${n.pinned ? "on" : ""}`} title={n.pinned ? "เลิกปักหมุด" : "ปักหมุดขึ้นบนสุด"}
                  onClick={() => updateNote(n.id, { pinned: !n.pinned })}>
                  {n.pinned ? "★" : "☆"}
                </button>
              </div>

              {editId === n.id
                ? (<div className="note-edit">
                    <textarea rows={3} value={editText} autoFocus onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { updateNote(n.id, { text: editText.trim() }); setEditId(null); } }}/>
                    <div className="note-edit-foot">
                      <button className="btn ghost small" onClick={() => setEditId(null)}>ยกเลิก</button>
                      <button className="btn dark small" disabled={!editText.trim()}
                        onClick={() => { updateNote(n.id, { text: editText.trim() }); setEditId(null); }}>บันทึก</button>
                    </div>
                  </div>)
                : n.text && (<p className="note-text">{n.text}</p>)}

              {imgs.length > 0 && (
                <div className="note-imgs">
                  {imgs.map((a) => {
                    const url = attachmentUrl(a);
                    return url
                      ? (<button className="note-img" key={a.id} title={a.file_name}
                          onClick={() => setViewImg({ url, name: a.file_name })}>
                          <img src={url} alt={a.file_name}/>
                        </button>)
                      : (<span className="note-img lost" key={a.id} title={`${a.file_name} — ไฟล์เดโมหายหลังรีเฟรช`}>
                          <Icon name="image" size={14}/>
                        </span>);
                  })}
                </div>
              )}

              <div className="note-foot">
                <span className="note-time">{fmtThaiDateTime(n.created_at)}{n.updated_at ? " · แก้ไขแล้ว" : ""}</span>
                {mine && !isReject && editId !== n.id && (<span className="note-acts">
                  <button title="แก้โน้ต" onClick={() => { setEditId(n.id); setEditText(n.text); }}><Icon name="pencil" size={12}/></button>
                  <button title="ลบโน้ต" onClick={() => onDelete(n)}><Icon name="trash" size={12}/></button>
                </span>)}
              </div>
            </article>
          );
        })}
      </div>

      {/* ดูรูปเต็มจอ — คลิกที่ไหนก็ปิด */}
      {viewImg && (
        <div className="note-lightbox" onClick={() => setViewImg(null)} role="dialog" aria-label={viewImg.name}>
          <img src={viewImg.url} alt={viewImg.name}/>
          <span className="note-lightbox-name">{viewImg.name}</span>
        </div>
      )}
    </aside>
  );
}
