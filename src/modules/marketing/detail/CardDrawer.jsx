/* ============================================================
 CardSheet — หน้ารายละเอียด Brief
 โครง: ซ้าย = ข้อมูลงาน (รหัส/ชื่อ/badge/stepper/meta/ประวัติ) อยู่นิ่ง
    ขวา = ฟอร์มทั้งหมดเรียงลงมา เลื่อนได้เฉพาะฝั่งนี้
    ล่าง = สถานะบันทึก + ปุ่มบันทึก/ไปขั้นถัดไป
 ============================================================ */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { CHANNEL_KIND_LABEL, selfCheckItems, SCENE_OPTIONAL, SCENE_ROLE_LABEL, sceneRole, emptyScene, secText, sizeText, stagesFor, PILLAR_LABEL, STAGE_META, RESULT_LABEL_TEXT, } from "../mktEngine.js";
import { brandAverageER, briefRefCounts, engagementRate, gateChecklist, isAdsCard, metricsComplete, nowISO, resultLabel, stageIndex, validateTransition, validateBriefForm, firstErrorField, canEditCard, canDecideReview, canDeleteCard, albumFrames, albumFilledCount, frameComplete, meaningful,  timelineSummary, sceneComplete, sceneDetailCount, timelineGaps, channelRuns, rollupCardMetrics, runMetricFields, channelKindOf, runMissing, runProgress, normalizeRunMetrics,} from "../mktRules.js";
import { brandOf, profileOf, fmtDateTime, fmtDayMonth, brandFill, typeIcon, typeText, typeIncomplete } from "../mktParts.jsx";
import { Sheet, Field, SheetActions } from "./Sheet.jsx";
import { Icon } from "../mktIcon.jsx";
import { InfoButton } from "../mktInfoButton.jsx";
import { RejectModal } from "./RejectDialog.jsx";
import { Attachments, RunProof, ImageFiles } from "./Attachments.jsx";
import { NotesPanel } from "./NotesPanel.jsx";
import { MktSelect } from "../mktSelect.jsx";
/**
 * เลือกขนาด — preset มาจากหน้าตั้งค่า (เพิ่มได้ไม่จำกัด) + กรอก pixel เอง
 * ratioOnly = คลิป เก็บแค่อัตราส่วน (9:16) ไม่ต้องมี pixel
 */
function SizePicker({ value, presets, onChange, disabled, ratioOnly = false }) {
  const px = String(value ?? "").match(/(\d+)\s*[×x]\s*(\d+)/);
  const w = px ? Number(px[1]) : "";
  const h = px ? Number(px[2]) : "";
  const set = (nw, nh) => onChange(nw > 0 && nh > 0 ? sizeText(nw, nh) : "");
  return (<>
   <div className="size-presets">
    {presets.map((sp, i) => {
      const val = ratioOnly ? sp.ratio : sizeText(sp.w, sp.h);
      /* ลำดับเป็น key สำรอง — ขนาดที่ผู้ใช้เพิ่มเองอาจไม่มี id/ratio */
      return (<button key={sp.id ?? sp.ratio ?? i} className={value === val ? "on" : ""} disabled={disabled}
        onClick={() => onChange(value === val ? "" : val)} title={sp.note}>
        <b>{sp.ratio}</b>
        {!ratioOnly && <span className="mono">{sp.w}×{sp.h}</span>}
       </button>);
    })}
   </div>
   {!ratioOnly && (<div className="size-custom">
     <input className="field" type="number" min={1} placeholder="กว้าง" value={w} disabled={disabled}
      onChange={(e) => set(Number(e.target.value) || 0, h || 0)}/>
     <span className="size-x">×</span>
     <input className="field" type="number" min={1} placeholder="สูง" value={h} disabled={disabled}
      onChange={(e) => set(w || 0, Number(e.target.value) || 0)}/>
     <span className="size-u">px</span>
     {w > 0 && h > 0 && <span className="size-ratio mono">{ratioOf(w, h)}</span>}
    </div>)}
  </>);
}

/** อัตราส่วนจากขนาดจริง — ใช้บอกผู้ใช้ว่าที่กรอกเองเท่ากับอัตราส่วนอะไร */
function ratioOf(w, h) {
  const g = (a, b) => (b === 0 ? a : g(b, a % b));
  const d = g(w, h) || 1;
  return `${w / d}:${h / d}`;
}
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function fmtThai(iso) {
  if (!iso)
    return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function fmtClock(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const SEC_STAGE = {
  idea: "idea", part1: "brief", part2: "brief", draft: "draft",
  scheduled: "scheduled", published: "published", measured: "measured",
};
/** ช่องผิด → อยู่กลุ่มไหน (ใช้กางกลุ่มที่พับอยู่ตอนกรอกไม่ครบ) */
const FIELD_SEC = {
  who_action: "part1", hook: "part1", key_message: "part1", cta: "part1", fact_checked: "part1",
  format: "part2", size: "part2", deadline_review: "part2", channels: "part2",
  publish_at: "part2", layout_note: "part2", mood: "part2", ref_note: "part2", ci_link: "part2",
};
/* ตัวเลือกชนิดชิ้นงาน + ภาพประกอบ SVG — ให้คนบรีฟเห็นความต่างทันทีว่าได้อะไร
   art ใช้ currentColor ล้วน (ตามธีม) · apply = ค่าที่เซ็ตให้ brief พร้อมล้างข้อมูลแบบอื่น */
const CLEAR_VIDEO = { video_seconds: null, video_subtitle: false, video_scenes: [] };
const CLEAR_ALBUM = { album_count: null, album_frames: [] };
const KIND_OPTIONS = [
  {
    id: "single", label: "ภาพเดี่ยว (AW)", hint: "ภาพเดียวจบ — โพสต์รูปเดียว",
    apply: { format: "image", aw_type: "single", ...CLEAR_ALBUM, ...CLEAR_VIDEO },
    art: (<svg viewBox="0 0 52 40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="14" y="6" width="24" height="28" rx="3"/>
      <circle cx="21.5" cy="14.5" r="2.5" fill="currentColor" stroke="none"/>
      <path d="M16 30l6-7 4 4 5-6 5 9" strokeLinecap="round" strokeLinejoin="round"/>
     </svg>),
  },
  {
    id: "album", label: "ชุดภาพ (Album)", hint: "หลายภาพเรียงเป็นเรื่อง เลื่อนดูทีละภาพ",
    apply: { format: "image", aw_type: "album", size: "", ...CLEAR_VIDEO },
    art: (<svg viewBox="0 0 52 40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="6" y="9" width="18" height="22" rx="2.5" opacity=".45"/>
      <rect x="17" y="6.5" width="18" height="27" rx="2.5" opacity=".7"/>
      <rect x="28" y="9" width="18" height="22" rx="2.5"/>
      <path d="M32 26l4-5 3 3 3-4" strokeLinecap="round" strokeLinejoin="round"/>
     </svg>),
  },
  {
    id: "video", label: "คลิป (Video)", hint: "วิดีโอ — บรีฟเป็นฉากรายวินาที",
    apply: { format: "video", aw_type: "single", ...CLEAR_ALBUM },
    art: (<svg viewBox="0 0 52 40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="10" y="7" width="32" height="20" rx="3"/>
      <path d="M23 13.5l7 3.5-7 3.5z" fill="currentColor" stroke="none"/>
      <path d="M10 33h32" strokeLinecap="round"/>
      <circle cx="16" cy="33" r="2.5" fill="currentColor" stroke="none"/>
      <circle cx="27" cy="33" r="2.5" fill="currentColor" stroke="none" opacity=".5"/>
      <circle cx="38" cy="33" r="2.5" fill="currentColor" stroke="none" opacity=".5"/>
     </svg>),
  },
];

export function CardSheet({ card, onClose }) {
  const { data, currentUser, moveCard, upsertCard, deleteCard, archiveCard, addNote, toast, approveCard, confirm } = useApp();
  const brand = brandOf(data, card.brand_id);
  const editable = canEditCard(currentUser, card, brand.default_owner);
  const stages = stagesFor(card.track);
  const curIdx = stageIndex(card.track, card.status);
  const [brief, setBrief] = useState(card.brief);
  const [selfCheck, setSelfCheck] = useState(card.self_check);
  const [draftLink, setDraftLink] = useState(card.draft_link);
  const [title, setTitle] = useState(card.title);
  const [pillar, setPillar] = useState(card.pillar);
  const [ownerId, setOwnerId] = useState(card.owner_id);
  const [brandId, setBrandId] = useState(card.brand_id);
  /* ขั้น 5-7 ตาม SOP — เก็บรายช่องทาง ตัวเลขรวมคิดจากผลบวก ไม่ได้กรอกมือ */
  const [runs, setRuns] = useState(() => channelRuns(card));
  const [planConfirmed, setPlanConfirmed] = useState(card.plan_confirmed === true);
  const [metaTab, setMetaTab] = useState("info");
  const [saveState, setSaveState] = useState("idle");
  const [lastSaved, setLastSaved] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [scrollTo, setScrollTo] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const formRef = useRef(null);
  const workingCard = {
    ...card, brief, self_check: selfCheck, draft_link: draftLink, title, pillar,
    owner_id: ownerId, brand_id: brandId,
    channel_runs: runs,
    plan_confirmed: planConfirmed,
  };
  /** ตัวเลขรวม + สรุปสถานะ = คิดจากรายช่องทางเสมอ (จุดเดียวที่คำนวณ) */
  const metrics = rollupCardMetrics({ ...card, brief, channel_runs: runs }, data.channels);
  workingCard.metrics = metrics;
  workingCard.published_checks = {
    live_ok: runs.length > 0 && runs.every((r) => r.live_ok),
    comments_handled: runs.length > 0 && runs.every((r) => r.comments_handled),
  };
  /* แถวช่องทางต้องตามบรีฟเสมอ — แก้ช่องทางในบรีฟแล้วตารางปรับตามทันที */
  const liveRuns = channelRuns({ ...card, brief, channel_runs: runs });
  const setRun = (i, patch) => {
    const next = liveRuns.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setRuns(next);
  };

  /** ความคืบหน้ารายขั้น — นับเฉพาะช่องทางที่ครบและมีหลักฐานแล้ว */
  const schedProg = runProgress(workingCard, "scheduled", data.channels);
  const pubProg = runProgress(workingCard, "published", data.channels);
  const measProg = runProgress(workingCard, "measured", data.channels);

  /** ค่าเฉลี่ย ER ของ brand — ใช้คำนวณป้ายผล (ไม่นับตัวเอง) */
  const brandAvg = useMemo(() => brandAverageER(data.cards, brandId, card.id), [data.cards, brandId, card.id]);
  /* dirty = ผู้ใช้แก้จริงเท่านั้น
   การ์ดเก่าไม่มีคีย์ของขั้น 5-7 (undefined) แต่ฟอร์มเริ่มด้วยค่าว่าง
   ถ้าเทียบ JSON ดิบ จะขึ้น "ยังไม่ได้บันทึก" ทันทีที่เปิด — เทียบหลังปรับให้ฐานเดียวกัน */
  const dirty = cardFingerprint(workingCard) !== cardFingerprint(card);
  /* ไฟล์แนบเก็บคนละตาราง — นับส่งเข้า gate เพื่อให้ Ref AW / ลิงก์ CI ผ่านได้ด้วยไฟล์แนบ
   ต้องใช้ briefRefCounts ตัวเดียวกับ Board/useApp ไม่งั้นตัวเลขไม่ตรงกัน */
  const refs = useMemo(() => briefRefCounts(card.id, data.attachments, data.reference_links, data.channels), [card.id, data.attachments, data.reference_links, data.channels]);
  const errors = useMemo(() => validateBriefForm(workingCard, submitted, undefined, refs), [workingCard, submitted, refs]);
  /* ชุดภาพ: UI กรอกทีละภาพ แต่เก็บลง brief เป็นข้อความบรรทัดละภาพเหมือนเดิม */

  const activeChannels = data.channels.filter((c) => c.active);
  const sizePresets = data.size_presets ?? [];
  const [editFrame, setEditFrame] = useState(null);
  const [editScene, setEditScene] = useState(null);
  /* ฉากของคลิป — เรียงตามเวลาเสมอ ทุกที่ที่อ่านจะได้ลำดับเดียวกับที่ผู้ใช้เห็น */
  const shotTypes = data.shot_types ?? [];
  const videoLengths = data.video_lengths ?? [];
  const tl = timelineSummary(workingCard.brief);
  const scenes = tl.scenes;
  const setScenes = (next) => setBrief({
    ...workingCard.brief,
    video_scenes: [...next].sort((a, x) => (a.from ?? 0) - (x.from ?? 0)),
  });
  const setScene = (i, patch) => setScenes(scenes.map((sc, idx) => (idx === i ? { ...sc, ...patch } : sc)));
  const addScene = () => {
    const last = scenes[scenes.length - 1];
    const from = last ? (last.to ?? 0) : 0;
    const total = workingCard.brief.video_seconds ?? 0;
    const to = total > 0 ? Math.min(total, from + 3) : from + 3;
    setScenes([...scenes, emptyScene(from, Math.max(to, from + 1))]);
    setEditScene(scenes.length);
  };
  const removeScene = (i) => { setScenes(scenes.filter((_, idx) => idx !== i)); setEditScene(null); };
  const frames = albumFrames(workingCard.brief);
  const filledFrames = albumFilledCount(workingCard.brief);
  const setFrame = (i, patch) => {
    const next = frames.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    setBrief({ ...workingCard.brief, album_frames: next });
  };
  /* ตรวจแบบเข้ม — ใช้เขียนบรรทัดสรุปของกลุ่มที่พับไว้ (ไม่โชว์แดงระหว่างพิมพ์) */
  const strictErrs = validateBriefForm(workingCard, true, undefined, refs);
  const secMissing = (k) => Object.keys(strictErrs).filter((f) => FIELD_SEC[f] === k).length;
  const gate = gateChecklist(workingCard, refs);
  const missing = gate.filter((g) => !g.done).map((g) => g.label);
  const gateDone = gate.length - missing.length;
  const nextStatus = card.status === "review" || curIdx >= stages.length - 1 ? null : stages[curIdx + 1].id;
  const transition = nextStatus
    ? validateTransition(workingCard, nextStatus, currentUser, undefined, refs)
    : null;
  const canAdvance = (transition?.ok ?? false) && editable;
  const b = brief;
  /* ชนิดชิ้นงานที่เลือกอยู่ — รวม format + aw_type เป็นค่าเดียวให้การ์ด SVG ไฮไลต์ถูกใบ */
  const currentKind = b.format === "video" ? "video" : b.aw_type === "album" ? "album" : "single";
  /* ---------- ขั้นไหนอยู่สถานะไหน ---------- */
  const stageMeta = STAGE_META[card.status];
  const phaseOf = (s) => {
    const i = stageIndex(card.track, s);
    if (i < 0)
      return "hidden"; // ขั้นนี้ไม่มีใน track นี้ (project ไม่มี scheduled/published/measured)
    if (i < curIdx)
      return "past";
    if (i === curIdx)
      return "now";
    return "next";
  };
  const phase = (k) => phaseOf(SEC_STAGE[k]);
  /** ทีละขั้นตาม SOP — ยังไม่ถึงขั้น ฟอร์มไม่โผล่ (ไม่ต้องกรอกล่วงหน้า) */
  const visible = (k) => {
    const p = phase(k);
    return p === "past" || p === "now";
  };
  /* กลุ่มที่กางอยู่ — เริ่มด้วยกลุ่มของขั้นปัจจุบัน */
  const [openSecs, setOpenSecs] = useState(() => Object.keys(SEC_STAGE).filter((k) => phaseOf(SEC_STAGE[k]) === "now"));
  const toggleSec = (k) => setOpenSecs((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  /* ตัวเลขสรุปบนหัวกลุ่มที่พับไว้ */
  // ขั้น Idea จบเมื่อ "คุ้มทำ + ระบุ Pillar" (project ไม่มี Pillar) — สรุปหัวกลุ่มต้องตรงกับ gate
  const ideaNeedPillar = card.track === "content" && pillar == null;
  const ideaOk = planConfirmed && !ideaNeedPillar;
  const ideaSummary = ideaOk
    ? pillar ? `คุ้มทำ · ${PILLAR_LABEL[pillar]}` : "ยืนยันแล้ว"
    : [!planConfirmed && "ยังไม่ยืนยัน", ideaNeedPillar && "ยังไม่ระบุ Pillar"]
      .filter(Boolean).join(" · ");
  const selfItems = selfCheckItems(workingCard.brief);
  const selfDone = selfItems.filter((it) => selfCheck[it.key]).length;
  const workCount = data.attachments.filter((a) => a.card_id === card.id && a.attachment_type === "draft_work").length;
  const liveEr = engagementRate(metrics);
  // ค่าที่กำลังแก้ (ใช้แสดงผล) — permission ยังยึดจากค่าเดิมของการ์ด
  const wBrand = brandOf(data, brandId);
  const wOwner = profileOf(data, ownerId);
  /* ---------- save ---------- */
  const doSave = () => {
    setSaveState("saving");
    try {
      /* เขียนตัวเลขรวม + สรุปสถานะที่คิดจากรายช่องทางลงการ์ดด้วย
         ทุกที่ที่อ่าน card.metrics อยู่แล้ว (Dashboard · ผลตอบรับ · insight) จึงไม่ต้องแก้ */
      upsertCard({ ...workingCard, channel_runs: liveRuns });
      setLastSaved(new Date().toISOString());
      setSaveState("saved");
      return true;
    }
    catch {
      setSaveState("error");
      toast("บันทึกไม่สำเร็จ", "bad");
      return false;
    }
  };
  const onSaveOnly = () => { if (dirty && doSave())
    toast("บันทึกแล้ว", "ok"); };
  /* เลื่อนไปช่องที่ผิด — ต้องรอให้กลุ่มที่พับกางเสร็จก่อน (หลัง render) ไม่งั้นหาไม่เจอ */
  useEffect(() => {
    if (!scrollTo)
      return;
    const el = formRef.current?.querySelector(`[data-field="${scrollTo}"]`);
    setScrollTo(null);
    if (!el)
      return;
    // หน่วงสั้นๆ ให้กลุ่มที่เพิ่งกางคำนวณความสูงเสร็จก่อน ไม่งั้น scrollIntoView กลายเป็น no-op
    // (ไม่ใช้ smooth — บาง environment ปิด smooth scroll แล้วไม่เลื่อนเลย)
    const t = setTimeout(() => el.scrollIntoView({ block: "center" }), 150);
    return () => clearTimeout(t);
  }, [scrollTo]);
  const onSaveAndAdvance = async () => {
    /* ขั้น Idea ยังไม่ต้องมี Brief — เงื่อนไขจบของขั้นนี้คือ "คุ้มทำ + ระบุ Pillar" เท่านั้น
     (ตรวจฟอร์ม Brief ตั้งแต่ขั้น Brief ขึ้นไป ไม่ไล่ให้กรอกล่วงหน้า) */
    const checkBrief = curIdx >= stageIndex(card.track, "brief");
    if (checkBrief)
      setSubmitted(true);
    const errs = checkBrief ? validateBriefForm(workingCard, true, undefined, refs) : {};
    if (Object.keys(errs).length > 0) {
      // กางกลุ่มที่มีช่องผิดก่อน ไม่งั้นบอกให้ "ดูช่องแดง" แต่ช่องนั้นถูกพับอยู่
      const need = new Set();
      Object.keys(errs).forEach((f) => need.add(FIELD_SEC[f]));
      setOpenSecs((o) => [...new Set([...o, ...need])]);
      setScrollTo(firstErrorField(errs));
      toast("ยังกรอกไม่ครบ — ดูช่องที่ขึ้นแดง", "bad");
      return;
    }
    if (!nextStatus)
      return;
    const ok = await confirm({
      title: `ส่ง Brief ไปขั้น ${stages[curIdx + 1].name}?`,
      message: `หลังจากส่งแล้ว ทีม ${stages[curIdx + 1].name} จะเริ่มทำงานจากข้อมูลชุดนี้ได้`,
      confirmLabel: `ยืนยันและไป ${stages[curIdx + 1].name}`,
      cancelLabel: "กลับไปตรวจสอบ",
    });
    if (!ok)
      return;
    if (dirty && !doSave())
      return;
    const r = await moveCard(card.id, nextStatus);
    if (r.ok)
      onClose();
  };
  /** ปิดงาน = เก็บเข้ากรุ (SOP: ตัวเลขครบ + ติดป้ายแล้ว = การ์ดจบชีวิต) */
  /* ปิดงานมี dialog ของตัวเอง (ไม่ใช่ confirm กลาง) — แถมช่อง "บทเรียน" ให้จดก่อนงานหายจากบอร์ด */
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [lesson, setLesson] = useState("");
  const onArchive = () => setArchiveAsk(true);
  const doArchive = () => {
    if (lesson.trim()) addNote(card.id, lesson, card.status, undefined, "lesson");
    archiveCard(workingCard); // เขียน audit ด้วย ไม่ใช่ upsert เฉยๆ
    toast("ปิดงานแล้ว — ดูต่อได้ที่หน้าคลัง", "ok");
    onClose();
  };
  const askDelete = async () => {
    const ok = await confirm({
      title: "ลบการ์ดนี้?", message: `"${card.title}" จะถูกลบออกจาก board — ย้อนกลับไม่ได้`,
      confirmLabel: "ลบการ์ด", danger: true,
    });
    if (ok) {
      deleteCard(card.id);
      onClose();
    }
  };
  const activeUsers = data.profiles.filter((p) => p.active && !p.id.startsWith("hist"));
  /* วันแรกที่การ์ดเข้าแต่ละขั้น — โชว์ข้างจุด stepper ให้เห็นจังหวะงานทั้งเส้น */
  const stageDates = useMemo(() => {
    const m = {};
    for (const h of (data.status_history ?? []))
      if (h.card_id === card.id && h.to_status && m[h.to_status] == null) m[h.to_status] = h.moved_at;
    return m;
  }, [data.status_history, card.id]);
  /* ของที่เกาะอยู่กับการ์ด — นับให้เห็นจากแผงซ้ายโดยไม่ต้องเลื่อนหา */
  const thingCounts = useMemo(() => {
    const atts = data.attachments.filter((a) => a.card_id === card.id);
    return {
      imgs: atts.filter((a) => a.mime_type?.startsWith("image/")).length,
      docs: atts.filter((a) => !a.mime_type?.startsWith("image/")).length,
      links: data.reference_links.filter((l) => l.card_id === card.id).length,
      notes: (data.card_notes ?? []).filter((n) => n.card_id === card.id).length,
    };
  }, [data.attachments, data.reference_links, data.card_notes, card.id]);
  /* "อีก n วัน / เกินมา n วัน" — เดดไลน์อ่านแวบเดียวรู้ว่ารีบแค่ไหน */
  const relDays = (iso) => {
    if (!iso || card.archived) return null;
    const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
    return d === 0 ? "วันนี้" : d > 0 ? `อีก ${d} วัน` : `เกินมา ${-d} วัน`;
  };
  /* ประวัติการ์ด — รวมทุกเหตุการณ์ที่เกิดกับงานใบนี้ไว้เส้นเดียว (ครอบคลุม ไม่ต้องไปดูหลายที่)
     ย้ายขั้น · ปิดงาน · Approve · ตีกลับ(+เหตุผลเต็ม) · โน้ต · บทเรียน */
  const historyRows = useMemo(() => {
    const nameOf = (id) => data.profiles.find((p) => p.id === id)?.display_name ?? "—";
    const hist = (data.status_history ?? []).filter((h) => h.card_id === card.id).map((h) => ({
      id: h.id, at: h.moved_at, who: nameOf(h.moved_by),
      kind: h.from_status === h.to_status ? "close" : "move",
      title: h.from_status === h.to_status
        ? "ปิดงาน — เก็บเข้าคลัง"
        : `${h.from_status ? STAGE_META[h.from_status]?.name ?? h.from_status : "สร้างการ์ด"} → ${STAGE_META[h.to_status]?.name ?? h.to_status}`,
    }));
    const acts = data.review_actions.filter((a) => a.card_id === card.id).map((a) => ({
      id: a.id, at: a.acted_at, who: nameOf(a.acted_by), kind: a.action,
      title: a.action === "approve" ? "Approve — ผ่านตรวจ" : "ตีกลับให้แก้",
      detail: a.action === "reject" ? a.reason : null,
      ref: a.action === "reject" ? a.direction_pack_ref : null,
      hours: a.hours_in_review,
    }));
    const notes = (data.card_notes ?? []).filter((n) => n.card_id === card.id && n.kind !== "reject").map((n) => ({
      id: n.id, at: n.created_at, who: nameOf(n.author_id),
      kind: n.kind === "lesson" ? "lesson" : "note",
      title: n.kind === "lesson" ? "จดบทเรียน" : "จดโน้ต",
      detail: n.text,
    }));
    return [...hist, ...acts, ...notes].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [data, card.id]);
  /* ================= footer ================= */
  const footer = (<div className="bf">
   <div className="bf-status">
    {card.archived && (<span className="closed-chip"><Icon name="check" size={13}/> ปิดงานแล้ว — อ่านอย่างเดียว</span>)}
    {saveState === "saving" && <><Icon name="clock" size={14}/> กำลังบันทึก…</>}
    {saveState === "error" && <span className="bad-text"><Icon name="alert" size={14}/> บันทึกไม่สำเร็จ</span>}
    {saveState !== "saving" && saveState !== "error" && dirty && (<span className="warn-text"><Icon name="alert" size={14}/> ยังไม่ได้บันทึก</span>)}
    {saveState !== "saving" && saveState !== "error" && !dirty && lastSaved && (<><Icon name="check" size={14}/> บันทึกล่าสุด {fmtClock(lastSaved)} น.</>)}
   </div>

   <div className="bf-actions">
    {!canAdvance && nextStatus && missing.length > 0 && (<span className="bf-why">ยังขาด {missing.slice(0, 2).join(", ")}{missing.length > 2 ? ` +${missing.length - 2}` : ""}</span>)}
    {editable && <button className="btn ghost" disabled={!dirty} onClick={onSaveOnly}>บันทึก</button>}
    {nextStatus && editable && (<button className="btn dark" disabled={!canAdvance} onClick={onSaveAndAdvance}>
      บันทึกและไป {stages[curIdx + 1].name}
     </button>)}
    {card.status === "review" && canDecideReview(currentUser) && (<>
      <button className="btn ghost danger-text" onClick={() => setRejectOpen(true)}>ตีกลับ</button>
      <button className="btn dark" onClick={() => { approveCard(card.id); onClose(); }}>Approve</button>
     </>)}
    {/* SOP ขั้น 7: ตัวเลขครบ + ติดป้ายแล้ว = การ์ดจบชีวิต (archive ได้) */}
    {card.status === "measured" && !card.archived && editable && (<button className="btn dark" disabled={!metricsComplete(workingCard)} onClick={onArchive}>
      ปิดงาน — เก็บเข้ากรุ
     </button>)}
   </div>
  </div>);
  /* ================= render ================= */
  return (<>
  <Sheet wide onClose={onClose} footer={footer}
   dirty={dirty}
   dirtyMessage="แก้ไขการ์ดไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดตอนนี้การแก้ทั้งหมดจะหายไป">
   <div className="brief-2col">
    {/* ---------- ซ้าย: ข้อมูลงาน (อยู่นิ่ง) ---------- */}
    <aside className="brief-meta">
     <div className="meta-code mono">{card.id}</div>
     {editable ? (<input className="meta-title-input" value={title} onChange={(e) => setTitle(e.target.value)}/>) : (<div className="meta-title-input" style={{ cursor: "default" }}>{title}</div>)}
     <div className="meta-badges">
      <span className="tag brand" style={brandFill(wBrand.color)}>{wBrand.name}</span>
      {card.track === "project" ? (<span className="tag proj">Project</span>) : pillar ? (<span className="tag pillar">{PILLAR_LABEL[pillar]}</span>) : null}
      {card.is_realtime && <span className="tag rt">Realtime</span>}
     </div>

     {/* stepper แนวตั้ง — ขั้นที่ผ่านแล้วติดวันที่จริงจากประวัติ เห็นจังหวะงานทั้งเส้น */}
     <div className="vstep">
      {stages.map((s, i) => (<div key={s.id} className={`vstep-row ${i < curIdx ? "past" : ""} ${i === curIdx ? "now" : ""}`} style={{ ["--stage"]: s.color }}>
        <span className="vstep-knot"/>
        <span className="vstep-label">{s.name}</span>
        {i === curIdx && !card.archived && <span className="vstep-owner">{s.owner}</span>}
        {i <= curIdx && stageDates[s.id] && <span className="vstep-date mono">{fmtDayMonth(stageDates[s.id])}</span>}
       </div>))}
     </div>

     {/* แท็บเล็ก: ข้อมูล / ประวัติ */}
     <div className="meta-tabs">
      <button className={metaTab === "info" ? "on" : ""} onClick={() => setMetaTab("info")}>
       <Icon name="info" size={13}/> ข้อมูล
      </button>
      <button className={metaTab === "history" ? "on" : ""} onClick={() => setMetaTab("history")}>
       <Icon name="clock" size={13}/> ประวัติ
       {historyRows.length > 0 && <span className="meta-count mono">{historyRows.length}</span>}
      </button>
     </div>

     {metaTab === "info" && <>
     <dl className="meta-list">
      <dt>แบรนด์</dt>
      <dd>
       {editable ? (<MktSelect compact value={brandId} onChange={setBrandId}
         options={data.brands.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name, dot: x.color }))}/>) : wBrand.name}
      </dd>

      {/* ขั้น Idea เลือก Pillar ในกล่องเงื่อนไขจบฝั่งขวา — ที่นี่ขึ้นตั้งแต่ขั้น Brief */}
      {card.track === "content" && card.status !== "idea" && (<>
        <dt>Pillar</dt>
        <dd>
         {editable ? (<MktSelect compact value={pillar ?? ""} onChange={(v) => setPillar(v || null)} options={[
           { value: "", label: "— ยังไม่ระบุ —" },
           ...Object.keys(PILLAR_LABEL).map((p) => ({ value: p, label: PILLAR_LABEL[p] })),
          ]}/>) : pillar ? PILLAR_LABEL[pillar] : "—"}
        </dd>
       </>)}

      <dt>ผู้ดูแล</dt>
      <dd>
       {editable ? (<div className="meta-person-edit">
         <MktSelect compact value={ownerId} onChange={(next) => {
          setOwnerId(next);
          // ผู้ดูแลไม่ต้องอยู่ในรายชื่อสมาชิกซ้ำอีก
          setMembers((ms) => ms.filter((m) => m !== next));
         }} options={activeUsers.map((p) => ({ value: p.id, label: p.display_name }))}/>
        </div>) : wOwner?.display_name}
      </dd>
      <dt>ชนิดงาน</dt>
      <dd className="meta-kind">
       <Icon name={typeIcon(b)} size={13}/> {typeText(b)}
       {typeIncomplete(b) && !card.archived && <i className="wcard-warn-dot" title="สเปคยังไม่ครบ"/>}
      </dd>

      {b.channels.length > 0 && (<>
        <dt>ช่องทาง</dt>
        <dd className="meta-chs">
         {b.channels.map((ch) => <span className="meta-ch" key={ch}>{ch}</span>)}
        </dd>
       </>)}

      <dt>กำหนดเวลา</dt>
      <dd className="meta-tl">
       <span className="meta-tl-row"><Icon name="bulb" size={12}/> เริ่ม <b>{fmtThai(card.created_at)}</b></span>
       {b.deadline_review && (<span className="meta-tl-row">
         <Icon name="eye" size={12}/> ส่งตรวจ <b>{fmtThai(b.deadline_review + "T00:00:00")}</b>
         {relDays(b.deadline_review + "T00:00:00") && <em className="meta-rel">{relDays(b.deadline_review + "T00:00:00")}</em>}
        </span>)}
       {b.publish_at && (<span className="meta-tl-row">
         <Icon name="send" size={12}/> โพสต์ <b>{fmtThai(b.publish_at)}</b>
         {relDays(b.publish_at) && <em className="meta-rel">{relDays(b.publish_at)}</em>}
        </span>)}
      </dd>

      <dt>ของในการ์ด</dt>
      <dd className="meta-things">
       <span title="รูปในการ์ด"><Icon name="image" size={13}/>{thingCounts.imgs}</span>
       <span title="ไฟล์เอกสาร"><Icon name="paperclip" size={13}/>{thingCounts.docs}</span>
       <span title="ลิงก์อ้างอิง"><Icon name="link" size={13}/>{thingCounts.links}</span>
       <span title="โน้ตการทำงาน"><Icon name="pencil" size={13}/>{thingCounts.notes}</span>
      </dd>

      {!card.archived && gate.length > 0 && (<>
        <dt>ความพร้อมขั้นนี้</dt>
        <dd className="meta-gate">
         <span className="meta-gate-bar"><i style={{ width: `${(gateDone / gate.length) * 100}%`, background: missing.length === 0 ? "var(--ok)" : "var(--stage, var(--accent))" }}/></span>
         <b className="mono">{gateDone}/{gate.length}</b>
        </dd>
       </>)}
     </dl>

     </>}

     {metaTab === "history" && (historyRows.length === 0
       ? (<div className="empty-row">ยังไม่มีการเคลื่อนไหว</div>)
       : (<ol className="mhist">
          {historyRows.map((h) => (<li key={h.id} className={`mhist-row ${h.kind}`}>
            <span className="mhist-dot"/>
            <div className="mhist-body">
             <div className="mhist-head">
              <b>{h.title}</b>
              {h.hours != null && <em>ใช้เวลาตรวจ {h.hours} ชม.</em>}
             </div>
             {h.detail && <p className="mhist-detail">{h.detail}</p>}
             {h.ref && <span className="mhist-ref">{h.ref}</span>}
             <div className="mhist-meta">{h.who} · {fmtDateTime(h.at)}</div>
            </div>
           </li>))}
         </ol>))}

     {canDeleteCard(currentUser, card) && (<div className="meta-del">
       <button className="meta-link danger-text" onClick={askDelete}>
        <Icon name="trash" size={13}/> ลบการ์ดนี้
       </button>
      </div>)}
    </aside>

    {/* ---------- ขวา: ฟอร์มทั้งหมด (เลื่อนเฉพาะฝั่งนี้) ---------- */}
    <div className="brief-form" ref={formRef}>
     {/* ปิดงานแล้ว = บันทึกถาวร — บอกชัดตั้งแต่บนสุดว่าอ่านอย่างเดียว และอะไรยังทำได้ */}
     {card.archived && (<div className="closed-banner">
       <Icon name="check" size={15}/>
       <div>
        <b>งานนี้ปิดแล้ว — เป็นบันทึกถาวรของทีม</b>
        <span>ตัวเลขและบรีฟแก้ไม่ได้ · ที่เพิ่มได้: โน้ต บทเรียน หมวด และปักเป็นต้นแบบ (หน้าคลัง)</span>
       </div>
      </div>)}
     {/* เช็คลิสต์เงื่อนไขจบขั้นนี้ — งานที่ปิดแล้วไม่ต้องโชว์ (จบไปแล้ว เงื่อนไขไม่มีความหมาย) */}
     {!card.archived && (
     <div className={`gcheck ${missing.length === 0 ? "ok" : ""}`} style={{ ["--stage"]: stageMeta.color }}>
      <div className="gcheck-stage">
       <span className="gcheck-stagename">ขั้น {stageMeta.name}</span>
       <span className="gcheck-owner">{stageMeta.owner}</span>
       <span className="gcheck-q">{stageMeta.question}</span>
      </div>
      <div className="gcheck-head">
       <span className="gcheck-title">เงื่อนไขจบขั้นนี้</span>
       <span className="gcheck-count mono">{gateDone}/{gate.length}</span>
      </div>
      <div className="gcheck-bar">
       <i style={{
      width: `${(gateDone / Math.max(1, gate.length)) * 100}%`,
      background: missing.length === 0 ? "var(--ok)" : "var(--stage, var(--accent))",
    }}/>
      </div>
      <ul className="gcheck-list">
       {gate.map((g) => (<li key={g.label} className={g.done ? "done" : ""}>
         <span className="gcheck-mark">
          {g.done ? <Icon name="check" size={11}/> : null}
         </span>
         {g.label}
        </li>))}
      </ul>
      {missing.length === 0 && nextStatus && (<div className="gcheck-ready">
        <Icon name="check" size={13}/> ครบแล้ว — พร้อมไป {stages[curIdx + 1].name}
       </div>)}
     </div>)}

     {/* ---- ขั้น Idea — Owner ยืนยันว่าคุ้มทำ (ไม่ผ่านอัตโนมัติ) ---- */}
     {visible("idea") && (<StageSection sec="idea" phase={phase("idea")} open={openSecs.includes("idea")} onToggle={() => toggleSec("idea")} title="ขั้น Idea — คุ้มทำหรือไม่" summary={ideaSummary} ok={ideaOk}>
       <div data-field="plan_confirmed" className="ff">
        <label className={`fact-card ${planConfirmed ? "on" : ""}`} onClick={() => editable && setPlanConfirmed(!planConfirmed)}>
         <span className="cbox">✓</span>
         <span>
          อยู่ใน Monthly Plan หรือเห็นว่าคุ้มทำ
          <span className="fact-sub">ยังไม่แน่ใจ = ทิ้งไว้ใน Idea หรือลบทิ้ง</span>
         </span>
        </label>
       </div>

       {/* SOP ขั้น 1: Pillar เป็นเงื่อนไขจบของขั้นนี้ → เลือกตรงนี้เลย
        ขั้นถัดไปย้ายไปอยู่แผงข้อมูลงานฝั่งซ้าย (ที่เดียว ไม่ซ้ำ) */}
       {card.track === "content" && phase("idea") === "now" && (<FormField name="pillar" label="Pillar / กลุ่มลูกค้า" required hint="ตอบไม่ได้ = ยังไม่ชัดว่าทำให้ใคร ยังไม่ต้องดันเข้า Brief">
         <div className="chips-input">
          {Object.keys(PILLAR_LABEL).map((p) => (<button key={p} className={pillar === p ? "on" : ""} disabled={!editable} onClick={() => setPillar(pillar === p ? null : p)}>
            {PILLAR_LABEL[p]}
           </button>))}
         </div>
        </FormField>)}
      </StageSection>)}

     {/* Pillar ไม่ซ้ำที่นี่ — แก้ได้ที่แผง "ข้อมูลงาน" ฝั่งซ้าย */}

     {/* ---- ส่วนที่ 1 — โจทย์ (ขั้น Brief) ---- */}
     {visible("part1") && (<StageSection sec="part1" phase={phase("part1")} open={openSecs.includes("part1")} onToggle={() => toggleSec("part1")} title="ส่วนที่ 1 — โจทย์" summary={secMissing("part1") === 0 ? "ครบ" : `ยังขาด ${secMissing("part1")} ข้อ`} ok={secMissing("part1") === 0}>

     <FormField name="who_action" label="ใคร → ให้ทำอะไร" required error={errors.who_action} hint="กลุ่มเป้าหมาย และ action เดียวที่อยากให้เกิดหลังเห็น">
      <textarea rows={2} className={errors.who_action ? "invalid" : ""} placeholder="ตัวอย่าง: เจ้าของธุรกิจ → ให้สมัครทดลองใช้ระบบ" value={b.who_action} disabled={!editable} onChange={(e) => setBrief({ ...b, who_action: e.target.value })}/>
     </FormField>

     <FormField name="hook" label="Hook" required error={errors.hook}>
      <textarea rows={2} className={errors.hook ? "invalid" : ""} placeholder="ประโยคเปิดที่ต้องดึงความสนใจ" value={b.hook} disabled={!editable} onChange={(e) => setBrief({ ...b, hook: e.target.value })}/>
     </FormField>

     <FormField name="key_message" label="Key Message" required error={errors.key_message}>
      <textarea rows={2} className={errors.key_message ? "invalid" : ""} placeholder="สารหลักที่ต้องการให้คนจดจำ" value={b.key_message} disabled={!editable} onChange={(e) => setBrief({ ...b, key_message: e.target.value })}/>
     </FormField>

     <FormField name="cta" label="CTA" required error={errors.cta}>
      <input className={`field ${errors.cta ? "invalid" : ""}`} placeholder="ตัวอย่าง: สมัครเลย / ทักแชท / ดูรายละเอียด" value={b.cta} disabled={!editable} onChange={(e) => setBrief({ ...b, cta: e.target.value })}/>
     </FormField>

     <div data-field="fact_checked">
      <label className={`fact-card ${b.fact_checked ? "on" : ""} ${errors.fact_checked ? "invalid" : ""}`} onClick={() => editable && setBrief({ ...b, fact_checked: !b.fact_checked })}>
       <span className="cbox">✓</span>
       <span>
        ตรวจสอบตัวเลขและ Claim กับ Fact Sheet แล้ว
        <span className="fact-sub">ต้องตรวจก่อนส่งเข้า {stages[curIdx + 1]?.name ?? "ขั้นถัดไป"}</span>
       </span>
      </label>
      {errors.fact_checked && <div className="field-error"><Icon name="alert" size={13}/> {errors.fact_checked}</div>}
     </div>

     </StageSection>)}

     {/* ---- ส่วนที่ 2 — ผลิต (โครงเดิมของ GRAPHIC BRIEF) ---- */}
     {visible("part2") && (<StageSection sec="part2" phase={phase("part2")} open={openSecs.includes("part2")} onToggle={() => toggleSec("part2")} title="ส่วนที่ 2 — ผลิต" summary={secMissing("part2") === 0 ? "ครบ" : `ยังขาด ${secMissing("part2")} ข้อ`} ok={secMissing("part2") === 0}>
     <div className="field-hint" style={{ marginBottom: 14 }}>
      Name / Pillar อยู่แผงข้อมูลงานฝั่งซ้าย
     </div>

     {/* เลือกชนิดชิ้นงานด้วยการ์ดที่มีภาพประกอบ — เห็นความต่าง ภาพเดี่ยว/ชุด/คลิป ทันที
         กดแล้วตั้ง format + aw_type ให้พร้อมกัน แล้วล้างข้อมูลของแบบอื่นทิ้ง (ไม่ถามซ้ำ ไม่ถามของที่ไม่เกี่ยว) */}
     <FormField name="format" label="ชนิดชิ้นงาน" required error={errors.format}
      hint="เลือกแล้วช่องด้านล่างจะเปลี่ยนตามชนิดที่เลือก">
      <div className="kindpick">
       {KIND_OPTIONS.map((k) => {
         const on = k.id === currentKind;
         return (<button key={k.id} type="button" className={`kindpick-card ${on ? "on" : ""}`}
           disabled={!editable} onClick={() => editable && setBrief({ ...b, ...k.apply })}>
          <span className="kindpick-art">{k.art}</span>
          <span className="kindpick-label">{k.label}</span>
          <span className="kindpick-hint">{k.hint}</span>
         </button>);
       })}
      </div>
     </FormField>

     {/* ---- ภาพนิ่งเดี่ยว: ขนาดภาพเดียวจบ ---- */}
     {b.format === "image" && b.aw_type !== "album" && (
      <FormField name="size" label="ขนาดภาพ" required error={errors.size} hint="เลือกจากที่ตั้งไว้ หรือกรอก pixel เอง">
       <SizePicker value={b.size} presets={sizePresets} disabled={!editable} onChange={(size) => setBrief({ ...b, size })}/>
      </FormField>)}

     {/* ---- ชุดภาพ: จำนวน + รายภาพ (ขนาดอยู่ในแต่ละภาพ) ---- */}
     {b.format === "image" && b.aw_type === "album" && (<div className="album-box">
       <FormField name="album_count" label="จำนวนภาพในชุด" required error={errors.album_count} hint="2–20 ภาพ · เปลี่ยนจำนวนแล้วรายการด้านล่างปรับตาม">
        <div className="stepper">
         <button type="button" disabled={!editable || (b.album_count ?? 0) <= 2}
          onClick={() => setBrief({ ...b, album_count: Math.max(2, (b.album_count ?? 2) - 1) })} aria-label="ลดจำนวนภาพ">−</button>
         <input className={`field ${errors.album_count ? "invalid" : ""}`} type="number" min={2} max={20}
          value={b.album_count ?? ""} disabled={!editable}
          onChange={(e) => setBrief({ ...b, album_count: e.target.value === "" ? null : Math.min(20, Math.max(1, Number(e.target.value))) })}/>
         <button type="button" disabled={!editable || (b.album_count ?? 0) >= 20}
          onClick={() => setBrief({ ...b, album_count: Math.min(20, (b.album_count ?? 1) + 1) })} aria-label="เพิ่มจำนวนภาพ">+</button>
         <span className="stepper-u">ภาพ</span>
        </div>
       </FormField>

       {(b.album_count ?? 0) >= 2 && (<FormField name="album_frames" label="รายละเอียดรายภาพ" required error={errors.album_frames}
        hint="กดไอคอนแก้ไขเพื่อใส่ข้อความ + ขนาดของภาพนั้น · ภาพแรกคือภาพที่หยุดนิ้ว ภาพสุดท้ายคือ CTA">
        <div className="frames">
         {frames.map((f, i) => {
           const first = i === 0, last = i === frames.length - 1;
           return (<div className={`frame ${frameComplete(f) ? "on" : ""}`} key={i}>
            <span className="frame-n mono">{i + 1}</span>
            <div className="frame-body">
             <div className="frame-text">{f.text || <em>ยังไม่ระบุว่าภาพนี้พูดอะไร</em>}</div>
             <div className="frame-meta">
              <span className={`fm-size mono ${meaningful(f.size) ? "" : "miss"}`}>{f.size || "ยังไม่ระบุขนาด"}</span>
              {meaningful(f.note) && <span className="fm-note" title={f.note}>มีหมายเหตุ</span>}
             </div>
            </div>
            {(first || last) && <span className="frame-tag">{first ? "ปก" : "CTA"}</span>}
            {editable && (<button className="icon-btn frame-edit" onClick={() => setEditFrame(i)} title={`แก้ไขภาพ ${i + 1}`}>
              <Icon name="pencil" size={14}/>
             </button>)}
           </div>);
         })}
        </div>
        <div className={`frames-count ${filledFrames === frames.length ? "ok" : ""}`}>
         กรอกครบ {filledFrames}/{frames.length} ภาพ
        </div>
       </FormField>)}
      </div>)}

     {/* ---- คลิป: อัตราส่วน + ความยาว + ซับ + ไทม์ไลน์ฉากรายวินาที ---- */}
     {b.format === "video" && (<div className="album-box">
       <FormField name="size" label="อัตราส่วนคลิป" required error={errors.size}>
        <SizePicker value={b.size} presets={sizePresets} disabled={!editable} ratioOnly onChange={(size) => setBrief({ ...b, size })}/>
       </FormField>
       <div className="grid2">
        <FormField name="video_seconds" label="ความยาวคลิป" required error={errors.video_seconds} hint="วินาที — ยาวเกินช่องทางกำหนดจะโดนตัด · เพิ่มค่ายอดใช้ได้ที่หน้าตั้งค่า">
         <div className="stepper">
          <input className={`field ${errors.video_seconds ? "invalid" : ""}`} type="number" min={1} max={600}
           value={b.video_seconds ?? ""} disabled={!editable}
           onChange={(e) => setBrief({ ...b, video_seconds: e.target.value === "" ? null : Number(e.target.value) })}/>
          <span className="stepper-u">วินาที</span>
         </div>
         {videoLengths.length > 0 && (<div className="chips-input tiny" style={{ marginTop: 8 }}>
           {videoLengths.map((v) => (<button key={v.id} className={b.video_seconds === v.seconds ? "on" : ""} disabled={!editable}
             title={v.note} onClick={() => setBrief({ ...b, video_seconds: v.seconds })}>{v.seconds} วิ</button>))}
          </div>)}
        </FormField>
        <FormField name="video_subtitle" label="ซับไตเติล">
         <label className={`check ${b.video_subtitle ? "on" : ""}`} onClick={() => editable && setBrief({ ...b, video_subtitle: !b.video_subtitle })}>
          <span className="cbox">✓</span>
          <span>ฝังซับไทยในคลิป</span>
         </label>
        </FormField>
       </div>

       <FormField name="video_scenes" label="ไทม์ไลน์ฉาก" required error={errors.video_scenes}
        hint="ฉากแรกเริ่มวินาที 0 = hook · ฉากสุดท้าย = CTA · กดไอคอนแก้ไขเพื่อใส่มุมกล้อง/คน/สถานที่/เสียง">
        <Timeline tl={tl} onEdit={editable ? setEditScene : null}/>
        <div className="frames scenes">
         {scenes.map((sc, i) => {
           const role = sceneRole(i, scenes.length);
           return (<div className={`frame scene ${sceneComplete(sc) ? "on" : ""}`} key={i}>
            <span className="frame-n mono">{secText(sc.from)}</span>
            <div className="frame-body">
             <div className="frame-text">{sc.what || <em>ยังไม่ระบุว่าฉากนี้เห็นอะไร</em>}</div>
             <div className="frame-meta">
              <span className="fm-size mono">{secText(sc.from)}–{secText(sc.to)} · {Math.max(0, (sc.to ?? 0) - (sc.from ?? 0))} วิ</span>
              {sc.shot && <span className="fm-note">{sc.shot}</span>}
              {sc.place && <span className="fm-note">{sc.place}</span>}
              <span className={`fm-note ${sceneDetailCount(sc) === SCENE_OPTIONAL.length ? "" : "miss"}`}>
               รายละเอียด {sceneDetailCount(sc)}/{SCENE_OPTIONAL.length}
              </span>
             </div>
            </div>
            {SCENE_ROLE_LABEL[role] && <span className="frame-tag">{SCENE_ROLE_LABEL[role]}</span>}
            {editable && (<button className="icon-btn frame-edit" onClick={() => setEditScene(i)} title={`แก้ไขฉาก ${i + 1}`}>
              <Icon name="pencil" size={14}/>
             </button>)}
           </div>);
         })}
        </div>
        <div className="frames-foot">
         {editable && (<button className="btn ghost small" onClick={addScene}>
           <Icon name="plus" size={13}/> เพิ่มฉาก
          </button>)}
         <span className={`frames-count ${tl.ok ? "ok" : ""}`}>
          กรอกครบ {tl.filled}/{tl.count} ฉาก
          {tl.total > 0 && ` · ครอบคลุม ${tl.covered}/${tl.total} วิ`}
         </span>
        </div>
       </FormField>
      </div>)}

     <FormField name="deadline_review" label="Deadline ส่งตรวจ" required error={errors.deadline_review}>
      <input className={`field ${errors.deadline_review ? "invalid" : ""}`} type="date" value={b.deadline_review ?? ""} disabled={!editable} onChange={(e) => setBrief({ ...b, deadline_review: e.target.value || null })}/>
     </FormField>

     <FormField name="channels" label="ช่องทาง" required error={errors.channels} hint="เลือกได้หลายช่องทาง · เพิ่ม/แก้ช่องทางได้ที่หน้าตั้งค่า">
      <div className="chips-input ch-chips">
       {activeChannels.map((ch) => {
        const on = b.channels.includes(ch.name);
        return (<button key={ch.id} className={on ? "on" : ""} disabled={!editable}
          style={on ? { background: ch.color, borderColor: ch.color, color: "#fff" } : { borderColor: ch.color }}
          onClick={() => setBrief({
            ...b,
            channels: on ? b.channels.filter((c) => c !== ch.name) : [...b.channels, ch.name],
          })}>
          {ch.logo
            ? <img className="ch-logo" src={ch.logo} alt=""/>
            : <i className="ch-dot" style={{ background: ch.color }}/>}
          {ch.name}
         </button>);
      })}
      </div>
     </FormField>

     <FormField name="publish_at" label="วัน–เวลาโพสต์จริง" required={card.track === "content"} error={errors.publish_at}>
      <input className={`field ${errors.publish_at ? "invalid" : ""}`} type="datetime-local" value={toLocalInput(b.publish_at)} disabled={!editable} onChange={(e) => setBrief({ ...b, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })}/>
     </FormField>

     {b.format !== "video" && (<FormField name="layout_note" label={b.aw_type === "album" ? "Layout ร่วมทุกภาพ" : "Layout sketch"} required error={errors.layout_note}
      hint={b.aw_type === "album" ? "องค์ประกอบที่ใช้ร่วมกันทุกภาพ — กรอบ/ตำแหน่งโลโก้/ที่วางตัวเลข" : "วางองค์ประกอบคร่าวๆ — อะไรอยู่ตรงไหน คนเห็นอะไรก่อน"}>
      <textarea rows={2} className={errors.layout_note ? "invalid" : ""} placeholder="เช่น ตัวเลขใหญ่กลางภาพ · โลโก้มุมล่างขวา · CTA แถบล่าง" value={b.layout_note} disabled={!editable} onChange={(e) => setBrief({ ...b, layout_note: e.target.value })}/>
     </FormField>)}

     <FormField name="mood" label="Mood" required error={errors.mood} hint="อารมณ์/โทนภาพ เช่น จริงใจ อบอุ่น">
      <input className={`field ${errors.mood ? "invalid" : ""}`} placeholder="เช่น จริงใจ อบอุ่น / คมชัด มืออาชีพ" value={b.mood} disabled={!editable} onChange={(e) => setBrief({ ...b, mood: e.target.value })}/>
     </FormField>

     <FormField name="ref_note" label="Ref AW — ระบุว่าอ้างอิงแง่ไหน" required error={errors.ref_note} hint="แนบรูป ref ด้านล่างก็ได้ แต่ต้องใส่คำอธิบายว่าอ้างแง่ไหน (layout / สี / pacing) — ไม่ใช่ลอกทั้งภาพ">
      <textarea rows={2} className={errors.ref_note ? "invalid" : ""} placeholder="เช่น อ้าง pacing ของคลิปนี้ ไม่เอาโทนสี" value={b.ref_note} disabled={!editable} onChange={(e) => setBrief({ ...b, ref_note: e.target.value })}/>
     </FormField>

     <FormField name="ci_link" label="ลิงก์ CI" required error={errors.ci_link} hint="ลิงก์ CI / Brand Guideline — หรือแนบไฟล์ Brand Guideline ด้านล่าง">
      <input className={`field ${errors.ci_link ? "invalid" : ""}`} placeholder="https://…" value={b.ci_link} disabled={!editable} onChange={(e) => setBrief({ ...b, ci_link: e.target.value })}/>
     </FormField>

     {/* ไฟล์แนบ = วัสดุของ Layout sketch / Ref AW / ลิงก์ CI → อยู่ใน ส่วนที่ 2 ที่เดียว */}
     <Attachments cardId={card.id} editable={editable} format={b.format}/>

     </StageSection>)}

     {/* ---- ขั้น Draft — งานจริง (SOP ขั้น 3) ---- */}
     {visible("draft") && (<StageSection sec="draft" phase={phase("draft")} open={openSecs.includes("draft")} onToggle={() => toggleSec("draft")} title="ขั้น Draft — งานจริง + Self-check"
       summary={`${workCount > 0 ? `แนบงาน ${workCount} รูป` : draftLink ? "มีลิงก์งาน" : "ยังไม่มีงาน"} · Self-check ${selfDone}/${selfItems.length}`}
       ok={(draftLink.trim() !== "" || workCount > 0) && selfDone === selfItems.length}>
       {/* งานจริง — แนบรูปได้หลายรูป (ตรวจง่ายโดยไม่ต้องออกไป Drive) หรือใส่ลิงก์ Drive ก็ได้ */}
       <FormField name="draft_work" label="งานที่ทำเสร็จ — แนบรูปได้หลายรูป" hint="ลากรูปงานจริงมาวางได้หลายใบ · คนตรวจจะเลื่อนดูได้เลย · คลิป/ไฟล์ใหญ่ใส่เป็นลิงก์ Drive ด้านล่าง">
        <ImageFiles cardId={card.id} items={data.attachments.filter((a) => a.card_id === card.id && a.attachment_type === "draft_work").sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))} editable={editable} group="work" title="งานที่ทำเสร็จ" note=""/>
       </FormField>
       <FormField name="draft_link" label="ลิงก์ไฟล์งาน (Drive)" hint="ไม่บังคับถ้าแนบรูปงานไว้แล้ว — ใส่ไว้สำหรับไฟล์ต้นฉบับ/คลิป">
        <input className="field" placeholder="https://drive.google.com/..." value={draftLink} disabled={!editable} onChange={(e) => setDraftLink(e.target.value)}/>
       </FormField>
       <FormField name="self_check" label="Self-check 6 ข้อ" hint="ต้องครบทุกข้อก่อนส่งตรวจ">
        {selfItems.map((it) => (<label key={it.key} className={`check ${selfCheck[it.key] ? "on" : ""} ${editable ? "" : "readonly"}`} onClick={() => editable && setSelfCheck({ ...selfCheck, [it.key]: !selfCheck[it.key] })}>
          <span className="cbox">✓</span>
          <span>{it.label}</span>
         </label>))}
       </FormField>
      </StageSection>)}

     {/* ---- ขั้น Scheduled — ตั้งเวลาจริงทีละช่องทาง (SOP ขั้น 5) ---- */}
     {visible("scheduled") && (<StageSection sec="scheduled" phase={phase("scheduled")} open={openSecs.includes("scheduled")} onToggle={() => toggleSec("scheduled")}
       title="ขั้น Scheduled — ตั้งเวลาโพสต์จริง"
       summary={`ตั้งแล้ว ${schedProg.done}/${schedProg.total} ช่องทาง`} ok={schedProg.ok}>
       <RunTable
         stage="scheduled" runs={liveRuns} card={workingCard} refs={refs} channels={data.channels}
         editable={editable} onChangeRun={setRun}
         hint="ติ๊กเมื่อตั้งโพสต์ในเครื่องมือของช่องทางนั้นจริง — ไม่ใช่ “เดี๋ยวคืนนี้ค่อยตั้ง” · ต้องแนบแคปหน้าจอเป็นหลักฐานด้วย"/>
      </StageSection>)}

     {/* ---- ขั้น Published — ลิงก์โพสต์ + ยืนยันรายช่องทาง (SOP ขั้น 6) ---- */}
     {visible("published") && (<StageSection sec="published" phase={phase("published")} open={openSecs.includes("published")} onToggle={() => toggleSec("published")}
       title="ขั้น Published — โพสต์แล้ว"
       summary={`ขึ้นจริง ${pubProg.done}/${pubProg.total} ช่องทาง`} ok={pubProg.ok}>
       <RunTable
         stage="published" runs={liveRuns} card={workingCard} refs={refs} channels={data.channels}
         editable={editable} onChangeRun={setRun}
         hint="ทุกช่องทางต้องมีลิงก์โพสต์จริง + ยืนยันว่าขึ้นถูกต้อง + ดูแลคอมเมนต์ 24 ชม.แรก · แนบแคปโพสต์ที่ขึ้นจริง"/>
      </StageSection>)}

     {/* ---- ขั้น Measured — ตัวเลขรายช่องทาง + ป้ายผล (SOP ขั้น 7) ---- */}
     {visible("measured") && (<StageSection sec="measured" phase={phase("measured")} open={openSecs.includes("measured")} onToggle={() => toggleSec("measured")}
       title="ขั้น Measured — ผลงาน"
       summary={liveEr != null ? `ER ${(liveEr * 100).toFixed(1)}% · ${measProg.done}/${measProg.total} ช่องทาง` : "ยังไม่กรอกตัวเลข"}
       ok={metricsComplete(workingCard) && measProg.ok}>
       <RunTable
         stage="measured" runs={liveRuns} card={workingCard} refs={refs} channels={data.channels}
         editable={editable} onChangeRun={setRun}
         hint="แต่ละแพลตฟอร์มถามตัวเลขคนละชุดตามชนิดช่องทาง · ต้องแนบแคปหน้า insight เป็นที่มาของตัวเลข"/>
       <MetricsSummary card={workingCard} metrics={metrics} brandAvg={brandAvg} runs={liveRuns} isAds={isAdsCard(card)}/>
      </StageSection>)}

    </div>

    {/* ---------- ขวาสุด: โน้ตประจำการ์ด (บันทึกทันที ไม่ผูกกับ dirty ของฟอร์ม) ---------- */}
    <NotesPanel card={card}/>
   </div>

   {/* ตีกลับใช้ modal ตัวเดียวกับคิวรอตรวจ — บังคับเหตุผล + อ้างข้อ Direction Pack เหมือนกัน */}
   {rejectOpen && (<RejectModal card={card} onClose={() => setRejectOpen(false)} onDone={onClose}/>)}

   {/* ปิดงาน + เก็บบทเรียน — ความรู้จากงานนี้ไม่หายไปกับคนทำ (โชว์ต่อในหน้าคลัง) */}
   {archiveAsk && (<Sheet compact title="ปิดงานและเก็บเข้าคลัง?" onClose={() => setArchiveAsk(false)}
     footer={<div className="confirm-foot">
      <button className="btn ghost" onClick={() => setArchiveAsk(false)}>ยกเลิก</button>
      <button className="btn dark" onClick={doArchive}>ปิดงาน</button>
     </div>}>
    <div className="confirm-msg">ตัวเลขครบและป้ายผลขึ้นแล้ว — การ์ดจะย้ายไปหน้า "คลัง" ให้ทีมย้อนดู/ใช้เป็นต้นแบบได้</div>
    <Field label="บทเรียนจากงานนี้ (ไม่บังคับ)" hint='จะติดเป็นโน้ต "บทเรียน" บนการ์ด — ทีมเห็นในคลังว่าครั้งหน้าควรทำอะไรต่าง'>
     <textarea rows={3} value={lesson} onChange={(e) => setLesson(e.target.value)}
      placeholder={"เช่น ภาพก่อน/หลังดัน ER ชัดมาก\nโพสต์ 19:00 คนเห็นเยอะกว่าเที่ยงเกือบเท่าตัว"}/>
    </Field>
   </Sheet>)}
  </Sheet>

  {/* popup รายภาพต้องอยู่ "นอก" sheet ใหญ่ — ไม่งั้นโดนเลย์เอาต์ 2 คอลัมน์ของ sheet.wide ทับ */}
  {editFrame != null && (<FrameSheet
    index={editFrame}
    frame={frames[editFrame]}
    total={frames.length}
    presets={sizePresets}
    onChange={(patch) => setFrame(editFrame, patch)}
    onClose={() => setEditFrame(null)}
   />)}

  {/* popup รายฉาก — เหตุผลเดียวกับรายภาพ ต้องอยู่นอก sheet ใหญ่ */}
  {editScene != null && scenes[editScene] && (<SceneSheet
    index={editScene}
    scene={scenes[editScene]}
    total={scenes.length}
    maxSeconds={workingCard.brief.video_seconds ?? 0}
    shotTypes={shotTypes}
    onChange={(patch) => setScene(editScene, patch)}
    onRemove={scenes.length > 1 ? () => removeScene(editScene) : null}
    onClose={() => setEditScene(null)}
   />)}
  </>);
}
/* ============================================================
 3 ขั้นท้ายแยกรายช่องทาง — ตาราง + popup รายช่องทาง
 ทุกขั้นใช้ตารางตัวเดียวกัน ต่างแค่คอลัมน์กลาง เพราะคนใช้จะได้ไม่ต้องเรียนรู้ใหม่ทุกขั้น
 ============================================================ */
const PROOF_TYPE = { scheduled: "schedule_proof", published: "live_proof", measured: "insight_proof" };
const PROOF_LABEL = { scheduled: "แคปตอนตั้งเวลา", published: "แคปโพสต์ที่ขึ้นจริง", measured: "แคปหน้า insight" };

function RunTable({ stage, runs, card, refs, channels, editable, onChangeRun, hint }) {
  const { data } = useApp();
  const [open, setOpen] = useState(null);   /* ช่องทางที่กางอยู่ (ทีละอัน) */
  if (runs.length === 0) {
    return <div className="empty-row">ยังไม่ได้เลือกช่องทางใน Brief — เลือกก่อนถึงจะกรอกขั้นนี้ได้</div>;
  }
  return (<>
   <div className="field-hint" style={{ marginBottom: 10 }}>{hint}</div>
   <div className="crun-list">
    {runs.map((run, i) => {
      const ch = data.channels.find((c) => c.name === run.channel);
      const kind = channelKindOf(channels, run.channel);
      const missing = runMissing(card, run, stage, channels);
      const proof = (refs.attachments ?? []).filter(
        (a) => a.channel === run.channel && a.attachment_type === PROOF_TYPE[stage],
      ).length;
      const expanded = open === run.channel;
      return (<div className={`crun ${missing.length === 0 ? "on" : ""} ${expanded ? "open" : ""}`} key={run.channel}>
       {/* หัวแถว — กดทั้งแถวเพื่อกางฟิลด์ของช่องทางนี้ในที่ (ไม่เปิด popup) */}
       <button className="crun-row" onClick={() => setOpen(expanded ? null : run.channel)}
        aria-expanded={expanded}>
        <span className="crun-ch">
         {ch?.logo
           ? <img className="ch-logo" src={ch.logo} alt=""/>
           : <i className="ch-dot" style={{ background: ch?.color ?? "var(--ink-faint)" }}/>}
         <b>{run.channel}</b>
         <em>{CHANNEL_KIND_LABEL[kind]}</em>
        </span>
        <span className="crun-mid">{runSummary(stage, run, kind)}</span>
        {proof > 0 && (<span className="crun-proof on" title={PROOF_LABEL[stage]}>
         <Icon name="image" size={12}/> แคป {proof}
        </span>)}
        {missing.length > 0 && (<span className="crun-miss">ขาด {missing.join(" · ")}</span>)}
        <Icon name="chevron" size={16} className={`crun-caret ${expanded ? "" : "-rotate-90"}`}/>
       </button>

       {/* ฟิลด์ของขั้นนี้ กางอยู่ในการ์ดช่องทางเลย */}
       {expanded && <StageFields stage={stage} run={run} card={card} editable={editable}
         onChange={(patch) => onChangeRun(i, patch)}/>}
      </div>);
    })}
   </div>
  </>);
}

/* ฟิลด์ของ "ขั้นหนึ่ง ช่องทางหนึ่ง" — กางอยู่ในสเตจของฟอร์มบรีฟเลย ไม่มี popup ซ้อน
   ใช้ซ้ำได้ทั้ง 3 ขั้น เพราะ CardSheet แยกสเตจให้อยู่แล้ว */
function StageFields({ stage, run, card, editable, onChange }) {
  const { data } = useApp();
  const ch = data.channels.find((c) => c.name === run.channel);
  const kind = channelKindOf(data.channels, run.channel);
  const tools = data.scheduler_tools ?? [];
  const fields = runMetricFields(kind, isAdsCard(card));
  const setMetric = (key, raw) => {
    const v = raw.trim() === "" ? null : Number(raw);
    onChange({
      metrics: { ...run.metrics, [key]: v != null && Number.isFinite(v) ? v : null },
      measured_at: run.measured_at ?? nowISO(),
    });
  };
  const rows = stageRows(stage, run, fields);
  return (<div className="crun-fields">
   {stage === "scheduled" && (<>
    {ch?.best_time && (<div className="tile-note" style={{ marginBottom: 12 }}>
      เวลาแนะนำของ {run.channel}: {ch.best_time}
     </div>)}
    <div className="grid2">
     <Field label="เวลาที่ตั้งไว้ในเครื่องมือ" required hint="ต่างจากวันโพสต์ในบรีฟได้ ถ้าช่องทางนี้ลงคนละเวลา">
      <input className="field" type="datetime-local" disabled={!editable}
       value={toLocalInput(run.scheduled_at)}
       onChange={(e) => onChange({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}/>
     </Field>
     <Field label="เครื่องมือที่ใช้ตั้ง" required hint="แก้รายการได้ที่หน้าตั้งค่า">
      <MktSelect value={run.scheduler_tool} disabled={!editable} placeholder="— เลือก —"
       onChange={(v) => onChange({ scheduler_tool: v })}
       options={tools.map((t) => ({ value: t, label: t }))}/>
     </Field>
    </div>
    <Field label="ลิงก์/รหัสโพสต์ในเครื่องมือ" hint="ไว้ให้คนอื่นเปิดไปดูของจริงได้ ไม่ต้องถามเจ้าของงาน">
     <input className="field" placeholder="https://business.facebook.com/..." value={run.schedule_ref}
      disabled={!editable} onChange={(e) => onChange({ schedule_ref: e.target.value })}/>
    </Field>
    <RunProof cardId={card.id} channel={run.channel} type="schedule_proof" label={PROOF_LABEL.scheduled} editable={editable}/>
   </>)}

   {stage === "published" && (<>
    <div className="grid2">
     <Field label="ลิงก์โพสต์จริง" required>
      <input className="field" placeholder="https://…" value={run.post_url}
       disabled={!editable} onChange={(e) => onChange({ post_url: e.target.value })}/>
     </Field>
     <Field label="เวลาที่ขึ้นจริง" required hint="ถ้าไม่ตรงกับที่ตั้งไว้ ให้บันทึกเวลาจริง">
      <input className="field" type="datetime-local" disabled={!editable}
       value={toLocalInput(run.posted_at)}
       onChange={(e) => onChange({ posted_at: e.target.value ? new Date(e.target.value).toISOString() : null })}/>
     </Field>
    </div>
    <Field label="คอมเมนต์แรก / ลิงก์ที่ปักไว้" hint="FB/IG ใช้ปักลิงก์สั่งซื้อ — เขียนคำจริงที่โพสต์ไป">
     <input className="field" value={run.first_comment} disabled={!editable}
      onChange={(e) => onChange({ first_comment: e.target.value })}/>
    </Field>
    <label className={`check ${run.live_ok ? "on" : ""} ${editable ? "" : "readonly"}`}
     onClick={() => editable && onChange({ live_ok: !run.live_ok })}>
     <span className="cbox">✓</span>
     <span>ขึ้นจริง แสดงผลถูกต้อง (ภาพไม่ crop เพี้ยน · ลิงก์กดได้ · แท็กครบ)</span>
    </label>
    <label className={`check ${run.comments_handled ? "on" : ""} ${editable ? "" : "readonly"}`}
     onClick={() => editable && onChange({ comments_handled: !run.comments_handled })}>
     <span className="cbox">✓</span>
     <span>ตอบคอมเมนต์/แชทใน 24 ชม.แรก — ตอบไม่ได้ (spec/ราคา) ส่งต่อ Sales ห้ามเดา</span>
    </label>
    <RunProof cardId={card.id} channel={run.channel} type="live_proof" label={PROOF_LABEL.published} editable={editable}/>
   </>)}

   {stage === "measured" && (<>
    <div className="field-hint" style={{ marginBottom: 10 }}>
     ชุดตัวเลขของ “{CHANNEL_KIND_LABEL[kind]}” — เปลี่ยนชนิดช่องทางได้ที่หน้าตั้งค่า
    </div>
    <div className="crun-metrics">
     {fields.map((f) => (<Field key={f.key} label={f.label + (f.unit ? ` (${f.unit})` : "")} required={f.req} hint={f.hint}>
       <input className="field mono" type="number" min="0" placeholder="0" disabled={!editable}
        value={run.metrics?.[f.key] ?? ""} onChange={(e) => setMetric(f.key, e.target.value)}/>
      </Field>))}
    </div>
    <Field label="หมายเหตุของช่องทางนี้" hint="อะไรผิดปกติ เช่น โดนลดการมองเห็น ยิงผิดเวลา">
     <textarea rows={2} className="field" value={run.note} disabled={!editable}
      onChange={(e) => onChange({ note: e.target.value })}/>
    </Field>
    <RunProof cardId={card.id} channel={run.channel} type="insight_proof" label={PROOF_LABEL.measured} editable={editable}/>
   </>)}

   <div className="frame-task">
    <div className="ft-head">ขั้นนี้ต้องกรอกอะไรบ้าง</div>
    {rows.map((r) => (<div className={`ft-row ${r.done ? "done" : r.req ? "miss" : ""}`} key={r.label}>
      <Icon name={r.done ? "check" : "alert"} size={13}/>
      <span className="ft-label">{r.label}{r.req && <b> *</b>}</span>
      <span className="ft-note">{r.done ? "ครบ" : r.req ? "ยังไม่กรอก" : "ไม่ใส่ก็ได้"}</span>
     </div>))}
   </div>
  </div>);
}

/** ข้อความกลางแถว — สั้นที่สุดที่ยังบอกได้ว่าช่องนี้ทำถึงไหน */
function runSummary(stage, run, kind) {
  if (stage === "scheduled") {
    return run.scheduled_at
      ? `${fmtDateTime(run.scheduled_at)} · ${run.scheduler_tool || "ยังไม่ระบุเครื่องมือ"}`
      : "ยังไม่ได้ตั้งเวลา";
  }
  if (stage === "published") {
    if (!meaningful(run.post_url)) return "ยังไม่มีลิงก์โพสต์";
    return (<a href={run.post_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      เปิดโพสต์ {run.posted_at ? `· ${fmtDateTime(run.posted_at)}` : ""}
     </a>);
  }
  const v = normalizeRunMetrics(run, kind);
  if (v.reach == null && v.engagement == null) return "ยังไม่กรอกตัวเลข";
  const er = v.reach > 0 && v.engagement != null ? (v.engagement / v.reach) * 100 : null;
  return `${kind === "short_video" ? "ยอดดู" : kind === "broadcast" ? "ส่ง" : "reach"} ${fmtNum(v.reach)}`
    + (er != null ? ` · ER ${er.toFixed(1)}%` : "")
    + (v.leads != null ? ` · ทัก ${fmtNum(v.leads)}` : "");
}
const fmtNum = (n) => (n == null ? "—" : n.toLocaleString("th-TH"));

/** แถบสรุปใต้ตารางขั้น Measured — ตัวเลขรวมคิดจากรายช่องทาง แก้มือไม่ได้ */
function MetricsSummary({ card, metrics, brandAvg, runs, isAds }) {
  const er = engagementRate(metrics);
  const label = resultLabel(card, brandAvg);
  const filled = runs.filter((r) => Object.values(r.metrics ?? {}).some((v) => v != null)).length;
  return (<div className="crun-sum">
   <div className="crun-sum-head">
    รวมทุกช่องทาง
    <span className="crun-sum-n">คิดจาก {filled}/{runs.length} ช่องทางที่กรอกแล้ว</span>
    <InfoButton label="ตัวเลขรวม" text="บวกจากตัวเลขรายช่องทางให้อัตโนมัติ แก้ตรงนี้ไม่ได้ — แก้ที่ช่องทางนั้นแทน จะได้รู้เสมอว่ายอดมาจากไหน"/>
   </div>
   <div className="crun-sum-grid">
    <div><span className="k">Reach</span><b className="mono">{fmtNum(metrics.reach)}</b></div>
    <div><span className="k">Engagement</span><b className="mono">{fmtNum(metrics.engagement)}</b></div>
    <div><span className="k">ER</span><b className="mono">{er == null ? "—" : `${(er * 100).toFixed(2)}%`}</b></div>
    <div><span className="k">ทัก / lead</span><b className="mono">{fmtNum(metrics.leads)}</b></div>
    {isAds && <div><span className="k">Spend</span><b className="mono">{fmtNum(metrics.spend)}</b></div>}
    {isAds && <div><span className="k">CPL</span><b className="mono">{metrics.cpl == null ? "—" : metrics.cpl.toFixed(0)}</b></div>}
   </div>
   <div className={`result-label ${label ?? "none"}`}>
    {label ? RESULT_LABEL_TEXT[label] : "ยังไม่มีป้าย — กรอกตัวเลขให้ครบ"}
    <InfoButton label="ป้ายผล" text="ป้ายขึ้นตามสูตรเทียบค่าเฉลี่ย ER ของแบรนด์ ไม่ได้ติ๊กมือ"/>
   </div>
  </div>);
}


/** ข้อที่ขั้นนั้นต้องกรอก — ใช้ทั้งเช็คลิสต์ในแท็บและตัวเลขขาดบนหัวแท็บ */
function stageRows(stage, run, fields) {
  if (stage === "scheduled") {
    return [
      { label: "เวลาที่ตั้งไว้ในเครื่องมือ", done: run.scheduled_at != null, req: true },
      { label: "เครื่องมือที่ใช้ตั้ง", done: meaningful(run.scheduler_tool), req: true },
      { label: "ลิงก์/รหัสโพสต์ในเครื่องมือ", done: meaningful(run.schedule_ref), req: false },
    ];
  }
  if (stage === "published") {
    return [
      { label: "ลิงก์โพสต์จริง", done: meaningful(run.post_url), req: true },
      { label: "เวลาที่ขึ้นจริง", done: run.posted_at != null, req: true },
      { label: "ยืนยันขึ้นจริง แสดงผลถูกต้อง", done: run.live_ok, req: true },
      { label: "ดูแลคอมเมนต์ 24 ชม.แรก", done: run.comments_handled, req: true },
      { label: "คอมเมนต์แรก / ลิงก์ที่ปัก", done: meaningful(run.first_comment), req: false },
    ];
  }
  return [
    ...fields.map((f) => ({ label: f.label, done: run.metrics?.[f.key] != null, req: !!f.req })),
    { label: "หมายเหตุของช่องทางนี้", done: meaningful(run.note), req: false },
  ];
}

/* ---------- กลุ่มฟอร์มของหนึ่งขั้น ----------
 past = พับไว้ โชว์บรรทัดสรุป · now = กางค้าง มีสีประจำขั้น · next = กรอกล่วงหน้าได้ */
function StageSection({ sec, phase, open, onToggle, title, summary, ok, children, }) {
  const meta = STAGE_META[SEC_STAGE[sec]];
  return (<section className={`stsec ${phase} ${open ? "open" : ""}`} style={{ ["--stage"]: meta.color }}>
   <button className="stsec-head" onClick={onToggle} aria-expanded={open}>
    <span className={`stsec-mark ${ok ? "ok" : ""}`}>
     {ok ? <Icon name="check" size={11}/> : null}
    </span>
    <span className="stsec-title">{title}</span>
    <span className="stsec-sum">{summary}</span>
    <span className={`stsec-chev ${open ? "up" : ""}`}>
     <Icon name="chevron" size={14}/>
    </span>
   </button>
   {open && <div className="stsec-body">{children}</div>}
  </section>);
}
/* ---------- Form field ---------- */
function FormField({ name, label, required, hint, error, children, }) {
  return (<div className="ff" data-field={name}>
   <div className="ff-label">
    <span>{label}{required && <span className="req"> *</span>}</span>
   </div>
   {children}
   {error ? (<div className="field-error"><Icon name="alert" size={13}/> {error}</div>) : (hint && <div className="field-hint">{hint}</div>)}
  </div>);
}
/** ลายนิ้วมือของการ์ด — ค่าว่าง/undefined ให้เท่ากัน และเรียงคีย์ให้คงที่ */
function cardFingerprint(c) {
  const flat = {
    ...c,
    plan_confirmed: c.plan_confirmed === true,
    /* การ์ดที่ยังไม่เคยบันทึกแถวช่องทาง: ฟอร์ม synthesize แถวจากบรีฟตอนเปิด
       ต้อง normalize ฝั่งการ์ดดิบด้วยตัวเดียวกัน ไม่งั้นเปิดปุ๊บ dirty ทันที (เคยเป็นบั๊ก) */
    channel_runs: channelRuns(c),
    /* metrics/published_checks เป็นค่าที่คิดจาก channel_runs — ไม่ใช่ input จึงไม่นับเป็น dirty */
    metrics: undefined, published_checks: undefined,
  };
  return JSON.stringify(flat, (_k, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
    : v);
}
function toLocalInput(iso) {
  if (!iso)
    return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------- popup แก้ไขรายภาพในชุด ----------
   บรีฟระดับภาพ: พูดอะไร · ขนาดเฉพาะภาพ (ไม่ใส่ = ใช้ขนาดชุด) · หมายเหตุคนทำ
   มีเช็คลิสต์บอกว่ากรอกอะไรไปแล้วบ้าง ให้ปิด popup แล้วรู้ว่าเหลืออะไร */
/* ---------- แถบไทม์ไลน์ 0 → ความยาวคลิป ----------
   สัดส่วนความกว้าง = เวลาจริง · ช่องว่างที่ยังไม่มีฉากรับผิดชอบขึ้นลายทาง
   สีตามบทบาท: hook = เตือน (ต้องแรง) · body = กลาง · CTA = ผ่าน (ปลายทางของคลิป) */
function Timeline({ tl, onEdit }) {
  const total = tl.total > 0 ? tl.total : Math.max(1, ...tl.scenes.map((s) => s.to ?? 0));
  const pct = (n) => `${Math.max(0, Math.min(100, (n / total) * 100))}%`;
  const gaps = tl.total > 0 ? timelineGaps({ format: "video", video_seconds: tl.total, video_scenes: tl.scenes }) : [];
  if (tl.count === 0) {
    return <div className="vtl empty">ยังไม่มีฉาก — กด “เพิ่มฉาก” เพื่อเริ่มจากวินาที 0</div>;
  }
  return (<div className="vtl">
   <div className="vtl-bar">
    {gaps.map((g, i) => (<span className="vtl-gap" key={`g${i}`}
      style={{ left: pct(g.from), width: pct(g.to - g.from) }}
      title={`ยังไม่ระบุ ${g.to - g.from} วิ`}/>))}
    {tl.scenes.map((sc, i) => {
      const role = sceneRole(i, tl.scenes.length);
      const w = (sc.to ?? 0) - (sc.from ?? 0);
      /* บล็อกที่กินพื้นที่ไม่ถึง 8% ของแถบ ใส่ตัวหนังสือไม่ลง — ซ่อน label ไว้ใน tooltip แทน */
      const narrow = w / total < 0.08;
      return (<button
        key={i} className={`vtl-blk is-${role} ${sceneComplete(sc) ? "" : "is-miss"} ${narrow ? "is-narrow" : ""}`}
        style={{ left: pct(sc.from ?? 0), width: pct(w) }}
        disabled={!onEdit}
        onClick={onEdit ? () => onEdit(i) : undefined}
        title={`${secText(sc.from)}–${secText(sc.to)} · ${sc.what || "ยังไม่ระบุ"}`}
       >
       <span>{SCENE_ROLE_LABEL[role] || i + 1}</span>
      </button>);
    })}
   </div>
   <div className="vtl-scale mono">
    <span>0:00</span>
    <span>{secText(total / 2)}</span>
    <span>{secText(total)}</span>
   </div>
   {gaps.length > 0 && (<div className="vtl-warn">
     ยังไม่มีฉากรับผิดชอบ {gaps.reduce((a, g) => a + (g.to - g.from), 0)} วินาที
    </div>)}
  </div>);
}

/* ---------- popup รายฉาก — โครงเดียวกับ FrameSheet ของชุดภาพ ---------- */
function SceneSheet({ index, scene, total, maxSeconds, shotTypes, onChange, onRemove, onClose }) {
  const { confirm } = useApp();
  const role = sceneRole(index, total);
  const dur = Math.max(0, (scene.to ?? 0) - (scene.from ?? 0));
  const rows = [
    { label: "ช่วงเวลาถูกต้อง", done: (scene.to ?? 0) > (scene.from ?? 0), required: true },
    { label: "เห็นอะไรบนจอ", done: meaningful(scene.what), required: true },
    ...SCENE_OPTIONAL.map((f) => ({ label: f.label, done: meaningful(scene[f.key]), required: false })),
    { label: "หมายเหตุกอง", done: meaningful(scene.note), required: false },
  ];
  const doneReq = rows.filter((r) => r.required).every((r) => r.done);
  const num = (v) => (v == null ? "" : String(v));
  const setSec = (k, raw) => {
    const v = raw.trim() === "" ? 0 : Math.max(0, Number(raw));
    onChange({ [k]: Number.isFinite(v) ? v : 0 });
  };
  return (<Sheet
    compact
    eyebrow={`ฉาก ${index + 1} / ${total}${SCENE_ROLE_LABEL[role] ? ` · ${SCENE_ROLE_LABEL[role]}` : ""} · ${secText(scene.from)}–${secText(scene.to)}`}
    title={scene.what || "ยังไม่ระบุว่าฉากนี้เห็นอะไร"}
    onClose={onClose}
    footer={<SheetActions primaryLabel="เสร็จ" onPrimary={onClose}
      secondaryLabel={onRemove ? "ลบฉากนี้" : undefined}
      onSecondary={onRemove ? async () => {
        /* ลบแล้วเวลาของฉากถัดไปจะไม่ต่อกัน — ต้องยืนยันก่อนเสมอ */
        const ok = await confirm({
          title: `ลบฉาก ${index + 1}?`,
          message: `${secText(scene.from)}–${secText(scene.to)} · ${scene.what || "ยังไม่ระบุว่าเห็นอะไร"}\nลบแล้วช่วงเวลานี้จะกลายเป็นช่องว่างในไทม์ไลน์`,
          confirmLabel: "ลบฉากนี้", danger: true,
        });
        if (ok) onRemove();
      } : undefined}
      help={doneReq ? `ยาว ${dur} วินาที — ครบแล้ว ปิดได้เลย` : "ยังขาดช่วงเวลาหรือสิ่งที่เห็นบนจอ"}/>}
  >
   <div className="grid2">
    <Field label="เริ่มวินาทีที่" required hint={index === 0 ? "ฉากแรกต้องเป็น 0" : undefined}>
     <input className="field" type="number" min={0} max={maxSeconds || undefined}
      value={num(scene.from)} onChange={(e) => setSec("from", e.target.value)}/>
    </Field>
    <Field label="ถึงวินาทีที่" required hint={maxSeconds ? `คลิปยาว ${maxSeconds} วิ` : undefined}>
     <input className="field" type="number" min={0} max={maxSeconds || undefined}
      value={num(scene.to)} onChange={(e) => setSec("to", e.target.value)}/>
    </Field>
   </div>

   <Field label="เห็นอะไรบนจอ" required
    hint={role === "hook" ? "3 วิแรกตัดสินว่าคนดูต่อไหม — บอกภาพแรกที่ต้องเห็น ไม่ใช่ “ทำให้น่าสนใจ”"
      : role === "cta" ? "ฉากปิด — บอกให้คนดูทำอะไรต่อ" : undefined}>
    <textarea rows={2} className="field" autoFocus value={scene.what}
     placeholder={role === "hook" ? "เช่น โคลสอัพเสื้อบนตัวคนจริง เห็นเนื้อผ้าชัด"
       : role === "cta" ? "เช่น โลโก้ + ปุ่มทัก LINE ค้างจอ 3 วิ" : "ฉากนี้เห็นอะไร"}
     onChange={(e) => onChange({ what: e.target.value })}/>
   </Field>

   <Field label="มุมกล้อง" hint="เพิ่ม/แก้รายการได้ที่หน้าตั้งค่า">
    <div className="chips-input">
     {shotTypes.map((st) => (<button key={st.id} className={scene.shot === st.name ? "on" : ""} title={st.note}
       onClick={() => onChange({ shot: scene.shot === st.name ? "" : st.name })}>{st.name}</button>))}
    </div>
   </Field>

   <div className="grid2">
    <Field label="ใครทำอะไร" hint="ระบุคน/จำนวน/การกระทำ">
     <input className="field" value={scene.who} placeholder="เช่น พนักงาน 4 คน เดินเรียงหน้ากระดาน"
      onChange={(e) => onChange({ who: e.target.value })}/>
    </Field>
    <Field label="สถานที่" hint="รวมช่วงเวลา/แสง ถ้าจำเป็น">
     <input className="field" value={scene.place} placeholder="เช่น หน้าร้าน ช่วงเช้า แสงธรรมชาติ"
      onChange={(e) => onChange({ place: e.target.value })}/>
    </Field>
   </div>

   <Field label="ข้อความบนจอ" hint="ซับ/คีย์เวิร์ดที่ต้องขึ้นในฉากนี้ — เขียนคำจริงที่จะใช้">
    <input className="field" value={scene.screen_text} placeholder="เช่น สั่ง 20 ตัวขึ้นไป แถมฟรี 1 ตัว"
     onChange={(e) => onChange({ screen_text: e.target.value })}/>
   </Field>

   <Field label="เสียง" hint="บทพูด / เพลง / SFX ของฉากนี้">
    <input className="field" value={scene.audio} placeholder="เช่น เสียงพูด: ปักอยู่ได้ 3 ปี"
     onChange={(e) => onChange({ audio: e.target.value })}/>
   </Field>

   <Field label="หมายเหตุกอง" hint="พร็อพ ข้อห้าม สิ่งที่คนถ่ายต้องรู้">
    <textarea rows={2} className="field" value={scene.note}
     placeholder="เช่น ห้ามใช้ภาพสต็อก ต้องเป็นเสื้อจริง"
     onChange={(e) => onChange({ note: e.target.value })}/>
   </Field>

   <div className="frame-task">
    <div className="ft-head">กรอกอะไรไปแล้วบ้าง</div>
    {rows.map((r) => (<div className={`ft-row ${r.done ? "done" : r.required ? "miss" : ""}`} key={r.label}>
      <Icon name={r.done ? "check" : "alert"} size={13}/>
      <span className="ft-label">{r.label}{r.required && <b> *</b>}</span>
      <span className="ft-note">{r.done ? "ครบ" : r.required ? "ยังไม่กรอก" : "ไม่ใส่ก็ได้"}</span>
     </div>))}
   </div>
  </Sheet>);
}

function FrameSheet({ index, frame, total, presets, onChange, onClose }) {
  const first = index === 0, last = index === total - 1;
  const rows = [
    { label: "ภาพนี้พูดอะไร", done: meaningful(frame.text), required: true },
    { label: "ขนาดของภาพนี้", done: meaningful(frame.size), required: true },
    { label: "หมายเหตุคนทำ", done: meaningful(frame.note), required: false },
  ];
  const doneReq = rows.filter((r) => r.required).every((r) => r.done);
  return (<Sheet
    compact
    eyebrow={`ภาพ ${index + 1} / ${total}${first ? " · ปก" : last ? " · CTA" : ""}`}
    title={frame.text || "ยังไม่ระบุว่าภาพนี้พูดอะไร"}
    onClose={onClose}
    footer={<SheetActions primaryLabel="เสร็จ" onPrimary={onClose}
      help={doneReq ? "ครบแล้ว — ปิดได้เลย" : "ยังขาดข้อความหรือขนาดของภาพนี้"}/>}
  >
   <Field label="ภาพนี้พูดอะไร" required
    hint={first ? "ภาพแรกคือภาพที่หยุดนิ้ว — พาดหัวต้องอ่านจบใน 1 วินาที" : last ? "ภาพสุดท้ายคือ CTA — บอกให้ทำอะไรต่อ" : undefined}>
    <textarea rows={2} className="field" autoFocus value={frame.text}
     placeholder={first ? "ปก — hook ที่หยุดนิ้ว" : last ? "CTA — ให้ทำอะไรต่อ" : "ภาพนี้พูดเรื่องอะไร"}
     onChange={(e) => onChange({ text: e.target.value })}/>
   </Field>

   <Field label="ขนาดของภาพนี้" required hint="ชุดภาพตั้งขนาดรายภาพ — ภาพปกใช้สัดส่วนต่างจากภาพในชุดได้">
    <SizePicker value={frame.size} presets={presets} onChange={(size) => onChange({ size })}/>
   </Field>

   <Field label="หมายเหตุคนทำ" hint="เช่น ใช้รูปจริงจากหน้างาน ห้ามใช้สต็อก">
    <textarea rows={2} className="field" value={frame.note}
     onChange={(e) => onChange({ note: e.target.value })}/>
   </Field>

   <div className="frame-task">
    <div className="ft-head">กรอกอะไรไปแล้วบ้าง</div>
    {rows.map((r) => (<div className={`ft-row ${r.done ? "done" : r.required ? "miss" : ""}`} key={r.label}>
      <Icon name={r.done ? "check" : "alert"} size={13}/>
      <span className="ft-label">{r.label}{r.required && <b> *</b>}</span>
      <span className="ft-note">{r.done ? "ครบ" : r.hint ?? (r.required ? "ยังไม่กรอก" : "ไม่ใส่ก็ได้")}</span>
     </div>))}
   </div>
  </Sheet>);
}
