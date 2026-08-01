/* โยนไอเดียเข้าคลัง (SOP ขั้น 1: ชื่อ + brand ก็พอ)
 + ปุ่ม "กรอก Brief ต่อเลย" สำหรับเคสที่รู้โจทย์แล้ว (Spec 5.1)
 + กล่องแนบรวม (ไม่บังคับ) — เจอรูป/ลิ้งตอนไถฟีดก็โยนเก็บได้เลย รูปขึ้นเป็น cover การ์ดเอง */
import { brandFill } from "../mktParts.jsx";
import { useState } from "react";
import { useApp } from "../useMkt.jsx";
import { genId, nowISO } from "../mktRules.js";
import { Sheet, Field } from "./Sheet.jsx";
import { AttachSurface, makeAttachment, makeLink } from "./Attachments.jsx";
const emptyBrief = {
  who_action: "", hook: "", key_message: "", cta: "", fact_checked: false,
  format: "", size: "", deadline_review: null, channels: [], publish_at: null,
  aw_type: "single", album_count: null, album_frames: [],
  layout_note: "", mood: "", ref_note: "", ci_link: "",
};
const emptyCheck = { visual: false, logo: false, text_ratio: false, no_forbidden: false, data_verified: false, cta_clear: false };
const TRACKS = [
  { value: "content", label: "Content", hint: "7 ขั้น — Idea ถึง Measured" },
  { value: "project", label: "Project / Ads", hint: "5 ขั้น — จบที่ Done" },
];
export function IdeaModal({ onClose, onCreated, }) {
  const { data, currentUser, upsertCard, addAttachments, upsertLink, toast } = useApp();
  const [title, setTitle] = useState("");
  const [brandId, setBrandId] = useState("");
  const [track, setTrack] = useState("content");
  const [realtime, setRealtime] = useState(false);
  /* ของแนบพักไว้ก่อน — การ์ดยังไม่เกิดจนกด submit เลยยังไม่มี card_id ให้ผูก */
  const [pendAtts, setPendAtts] = useState([]);
  const [pendLinks, setPendLinks] = useState([]);
  const [attErrors, setAttErrors] = useState([]);
  const onFiles = (files) => {
    if (!files?.length) return;
    const ok = [], bad = [];
    for (const f of Array.from(files)) {
      const r = makeAttachment(f, null, currentUser.id, pendAtts.length + ok.length);
      if (r.ok) ok.push(r.item);
      else bad.push(r);
    }
    if (ok.length) setPendAtts((p) => [...p, ...ok]);
    setAttErrors(bad);
  };
  const onLink = (url) => {
    const l = makeLink(url, null, currentUser.id);
    if (!l) return false;
    setPendLinks((p) => [...p, l]);
    return true;
  };
  const valid = title.trim().length > 0 && brandId !== "";
  const build = () => ({
    id: genId("CT"),
    track,
    status: "idea",
    brand_id: brandId,
    owner_id: currentUser.id,
    // SOP: สมาชิกใส่เองตอนรู้ว่าใครเกี่ยว ไม่ยัดให้อัตโนมัติ
    title: title.trim(),
    pillar: null,
    is_realtime: realtime,
    plan_confirmed: false,
    brief: { ...emptyBrief },
    draft_link: "",
    self_check: { ...emptyCheck },
    first_pass: null,
    entered_review_at: null,
    archived: false,
    created_at: nowISO(),
    updated_at: nowISO(),
  });
  const submit = (thenOpen) => {
    if (!valid) {
      toast("ต้องมีชื่อไอเดีย + เลือก brand", "bad");
      return;
    }
    const card = build();
    upsertCard(card);
    /* ของที่พักไว้ → ผูกกับการ์ดที่เพิ่งเกิด (blob URL จองไว้แล้วตอนเลือกไฟล์) */
    if (pendAtts.length) addAttachments(pendAtts.map((a) => ({ ...a, card_id: card.id })));
    pendLinks.forEach((l) => upsertLink({ ...l, card_id: card.id }));
    onClose();
    if (thenOpen)
      onCreated?.(card);
    else
      toast("เข้าคลัง Idea แล้ว — งานมีตัวตนใน board แล้ว", "ok");
  };
  /* กรอกอะไรไปแล้วแม้ช่องเดียว = ปิดแล้วหาย ต้องถามก่อน */
  const dirty = title.trim() !== "" || brandId !== "" || realtime || track !== "content"
    || pendAtts.length > 0 || pendLinks.length > 0;
  return (<Sheet eyebrow="Idea" title="โยนไอเดียเข้าคลัง" onClose={onClose}
   dirty={dirty} dirtyMessage="กรอกไอเดียไว้แล้วแต่ยังไม่ได้สร้างการ์ด — ปิดแล้วข้อมูลจะหายไป"
   footer={<>
     <div className="sheet-actions">
      <button className="btn ghost" onClick={onClose}>ยกเลิก</button>
      <button className="btn ghost" disabled={!valid} onClick={() => submit(true)}>
       กรอก Brief ต่อเลย
      </button>
      <button className="btn dark" disabled={!valid} onClick={() => submit(false)}>
       เข้าคลัง Idea
      </button>
     </div>
     <div className="gate-msg">แค่ชื่อ + brand ก็พอ — Brief ค่อยกรอกตอนจะทำจริง</div>
    </>}>
   <Field label="ชื่อไอเดีย" required>
    <input className="field" placeholder="จดสั้นๆ กันลืมก็พอ" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus/>
   </Field>

   <Field label="Brand" required>
    <div className="chips-input">
     {data.brands.filter((b) => b.active).map((b) => (<button key={b.id} className={brandId === b.id ? "on" : ""} style={brandId === b.id ? { ...brandFill(b.color), borderColor: brandFill(b.color).background } : {}} onClick={() => setBrandId(b.id)}>
       {b.name}
      </button>))}
    </div>
   </Field>

   <Field label="ประเภทงาน" hint={TRACKS.find((t) => t.value === track)?.hint}>
    <div className="chips-input">
     {TRACKS.map((t) => (<button key={t.value} className={track === t.value ? "on" : ""} onClick={() => setTrack(t.value)}>
       {t.label}
      </button>))}
    </div>
   </Field>

   <label className={`check ${realtime ? "on" : ""}`} onClick={() => setRealtime(!realtime)}>
    <span className="cbox">✓</span>
    <span>Realtime — เกาะเทรนด์ (ลง flex slot)</span>
   </label>

   <Field label="แนบรูป / ลิ้งอ้างอิง" hint="ไม่บังคับ — เจอของน่าสนใจก็โยนเก็บไว้ก่อน รูปแรกขึ้นเป็นหน้าปกการ์ดเอง">
    <AttachSurface compact editable
     images={pendAtts.filter((a) => a.mime_type.startsWith("image/"))}
     docs={pendAtts.filter((a) => !a.mime_type.startsWith("image/"))}
     links={pendLinks} errors={attErrors}
     actions={{
       files: onFiles, link: onLink,
       updateAtt: (id, patch) => setPendAtts((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a))),
       removeAtt: (id) => setPendAtts((p) => p.filter((a) => a.id !== id)),
       removeLink: (id) => setPendLinks((p) => p.filter((l) => l.id !== id)),
     }}/>
   </Field>
  </Sheet>);
}
