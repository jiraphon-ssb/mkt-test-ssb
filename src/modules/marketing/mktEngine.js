/* ============================================================
   mktEngine — โครงข้อมูล + ค่าคงที่ของ Content Pipeline (SOP v1.1)
   ตรงตาม Spec ข้อ 3 (Data Model) · พร้อมแปลงเป็นตาราง Postgres วันย้าย Supabase
   JS ล้วนแบบเดียวกับโมดูลอื่น — สัญญาของข้อมูลอยู่ใน JSDoc @typedef ด้านล่าง
   ============================================================ */

/* ---------- ค่าที่เป็นชุดจำกัด (enum-แทน) ----------
   ใช้ constant object แทน TS union type — ค่าที่ใช้จริงต้องมาจากคีย์ของ map พวกนี้ */

/** @typedef {"team_lead"|"content_owner"|"performance_marketer"} Role */
/** @typedef {"grow"|"maintain"|"rebuild"} BrandMode */
/** @typedef {"content"|"project"} Track */
/** @typedef {"idea"|"brief"|"draft"|"review"|"scheduled"|"published"|"measured"|"done"} Status */
/** @typedef {"sale_campaign"|"knowledge"|"social_proof"|"brand"} Pillar */
/** @typedef {"green"|"yellow"|"red"} ResultLabel */
/** @typedef {"brief_file"|"brief_image"|"reference"|"brand_guideline"|"other"} AttachmentType */
/** @typedef {"website"|"facebook"|"tiktok"|"youtube"|"google_drive"|"figma"|"canva"|"other"} LinkType */
/** @typedef {"approve"|"reject"} ReviewActionType */

/**
 * คนในทีม
 * @typedef {object} Profile
 * @property {string} id
 * @property {string} display_name
 * @property {Role} role
 * @property {boolean} active
 */

/**
 * แบรนด์ที่ดูแล — mode กำหนดจังหวะการลงงาน (Spec ข้อ 3)
 * @typedef {object} Brand
 * @property {string} id
 * @property {string} name
 * @property {BrandMode} mode
 * @property {string} default_owner
 * @property {string} color   สีประจำแบรนด์ (มาจากข้อมูล ไม่ใช่ token UI)
 * @property {boolean} active
 */

/**
 * Brief Template v2 — ส่วนที่ 1 โจทย์ + ส่วนที่ 2 ผลิต
 * @typedef {object} Brief
 * @property {string} who_action     ใคร → ให้ทำอะไร
 * @property {string} hook
 * @property {string} key_message
 * @property {string} cta
 * @property {boolean} fact_checked  เช็คตัวเลขกับ Fact Sheet แล้ว
 * @property {Format} format          "image" | "video"
 * @property {string} size            ขนาดภาพ (image เดี่ยว) หรืออัตราส่วนคลิป (video)
 * @property {number|null} video_seconds  ความยาวคลิปเป็นวินาที (เฉพาะ video)
 * @property {boolean} video_subtitle มีซับไทยฝังในคลิป (เฉพาะ video)
 * @property {VideoScene[]} video_scenes  ไทม์ไลน์ฉากรายวินาที (เฉพาะ video)
 * @property {string} deadline_review  YYYY-MM-DD (เผื่อแก้ ≥2 วันก่อนโพสต์)
 * @property {string[]} channels
 * @property {string|null} publish_at  ISO วัน-เวลาโพสต์
 * @property {AwType} aw_type       "single" = AW เดี่ยว · "album" = ชุดภาพหลายรูป
 * @property {number|null} album_count    จำนวนภาพในชุด (เฉพาะ album)
 * @property {AlbumFrame[]} album_frames  รายละเอียดรายภาพ ยาวเท่า album_count
 * @property {string} layout_note
 * @property {string} mood
 * @property {string} ref_note        อ้างอิงแง่ไหน
 * @property {string} ci_link
 */

/** @typedef {"image"|"video"} Format */
/** @typedef {"single"|"album"} AwType */

/**
 * ภาพหนึ่งในชุด — บรีฟระดับภาพ ให้คนทำเปิดไฟล์เดียวก็รู้ว่าภาพนี้ต้องได้อะไร
 * size ว่าง = ใช้ขนาดหลักของชุด (brief.size) · ระบุเมื่อภาพนั้นต่างจากเพื่อน
 * @typedef {object} AlbumFrame
 * @property {string} text   ภาพนี้พูดอะไร (บังคับ)
 * @property {string} size   ขนาดเฉพาะภาพนี้ (ว่างได้)
 * @property {string} note   หมายเหตุคนทำ เช่น ต้องใช้รูปจริงจากหน้างาน (ว่างได้)
 */
/** ภาพเปล่า 1 ใบ */
export const emptyFrame = () => ({ text: "", size: "", note: "" });

/**
 * ฉากหนึ่งในคลิป — บรีฟระดับวินาที ให้คนถ่าย/ตัดต่อรู้ว่านาทีไหนต้องได้อะไร
 * ฉากแรกต้องเริ่มที่วินาที 0 (คือ hook) · ฉากสุดท้ายต้องไม่เกินความยาวคลิป
 * ลึกเท่ากับที่ album ทำกับรายภาพ: บังคับ 2 ช่อง ที่เหลือ "ควรมี" เพื่อให้กองถ่ายทำงานได้จริง
 * @typedef {object} VideoScene
 * @property {number} from          วินาทีเริ่ม
 * @property {number} to            วินาทีจบ
 * @property {string} what          เห็นอะไรบนจอ (บังคับ)
 * @property {string} shot          ขนาดภาพ/มุมกล้อง — เลือกจาก shot_types ในตั้งค่า
 * @property {string} who           ใครทำอะไรในฉากนี้
 * @property {string} place         สถานที่ / ฉากหลัง
 * @property {string} screen_text   ข้อความ/ซับที่ขึ้นจอ
 * @property {string} audio         เสียงพูด / เพลง / SFX
 * @property {string} note          พร็อพ ข้อห้าม หมายเหตุกอง
 */
export const emptyScene = (from = 0, to = 3) => ({
  from, to, what: "", shot: "", who: "", place: "", screen_text: "", audio: "", note: "",
});

/** ช่องของฉากที่ "ควรมี" — ใช้ทั้งใน checklist ของ popup และตัวนับความครบ */
export const SCENE_OPTIONAL = [
  { key: "shot", label: "มุมกล้อง" },
  { key: "who", label: "ใครทำอะไร" },
  { key: "place", label: "สถานที่" },
  { key: "screen_text", label: "ข้อความบนจอ" },
  { key: "audio", label: "เสียง" },
];

/** บทบาทของฉาก — คิดจากตำแหน่ง ไม่เก็บในข้อมูล (ฉากแรก=hook ฉากท้าย=cta) */
export const sceneRole = (i, total) => (i === 0 ? "hook" : i === total - 1 ? "cta" : "body");
export const SCENE_ROLE_LABEL = { hook: "HOOK", body: "", cta: "CTA" };

export const secText = (s) => `${Math.floor((s ?? 0) / 60)}:${String(Math.max(0, Math.round(s ?? 0)) % 60).padStart(2, "0")}`;

/**
 * ช่องทางลงงาน — ตั้งค่าได้ในหน้าตั้งค่า
 * การ์ดอ้างช่องทางด้วย "ชื่อ" (brief.channels เป็น string[]) เปลี่ยนชื่อแล้ว
 * ต้อง migrate การ์ดเก่าด้วย ไม่งั้นสถิติรายช่องทางจะขาดตอน
 * @typedef {object} Channel
 * @property {string} id
 * @property {string} name
 * @property {string} color   สีประจำช่องทาง (เลือกอิสระ)
 * @property {string} logo    URL หรือ data URL ของโลโก้ (ว่างได้)
 * @property {boolean} active
 */

/**
 * Self-check 6 ข้อก่อนส่งตรวจ (SOP ขั้น 3)
 * @typedef {Record<"spelling"|"numbers"|"logo"|"safe_area"|"cta"|"link", boolean>} SelfCheck
 */

/**
 * ตัวเลขผลงานหลังโพสต์ — นิยามล็อกตาม Report Template กลาง
 * @typedef {object} CardMetrics
 * @property {number|null} reach
 * @property {number|null} engagement
 * @property {number|null} leads
 * @property {number|null} spend       เฉพาะงาน ads
 * @property {number|null} cpl         งบ ÷ lead
 * @property {string|null} measured_at ISO วันที่กรอกตัวเลข
 */

/* ============================================================
 ช่องทาง — ชนิด + ตัวเลขที่ต้องเก็บ
 งานใบเดียวลงหลายช่องทาง แต่ละช่องทางวัดผลคนละแบบ (ฟีดนับ reach · คลิปสั้นนับ view ·
 LINE นับส่ง/เปิดอ่าน) จึงต้องเก็บแยกรายช่องทาง แล้วค่อยรวมเป็นตัวเลขของการ์ด
 ตัวเลขประกาศเป็น "ข้อมูล" ไม่ใช่โค้ด — เพิ่มชนิดใหม่แค่เติมในตารางนี้ ฟอร์มขึ้นเอง
 ============================================================ */
/** @typedef {"feed"|"short_video"|"broadcast"} ChannelKind */
export const CHANNEL_KINDS = [
  { id: "feed", label: "ฟีด (ภาพ/โพสต์)", hint: "Facebook · IG — วัดที่ reach" },
  { id: "short_video", label: "คลิปสั้น", hint: "TikTok · Reels · Shorts — วัดที่ยอดดู" },
  { id: "broadcast", label: "บรอดแคสต์", hint: "LINE OA — วัดที่ส่ง/เปิดอ่าน" },
];
export const CHANNEL_KIND_LABEL = Object.fromEntries(CHANNEL_KINDS.map((k) => [k.id, k.label]));

/**
 * ช่องตัวเลขของแต่ละชนิด — req = บังคับก่อนปิดงาน
 * @type {Record<ChannelKind, {key:string,label:string,unit?:string,req?:boolean,hint?:string}[]>}
 */
export const CHANNEL_METRIC_FIELDS = {
  feed: [
    { key: "reach", label: "Reach", req: true, hint: "คนที่เห็นโพสต์ (นับคนไม่นับครั้ง)" },
    { key: "impressions", label: "Impressions", hint: "จำนวนครั้งที่แสดง" },
    { key: "engagement", label: "Engagement", req: true, hint: "ไลก์ + คอมเมนต์ + แชร์ + เซฟ" },
    { key: "saves", label: "เซฟ" },
    { key: "shares", label: "แชร์" },
    { key: "comments", label: "คอมเมนต์" },
    { key: "link_clicks", label: "คลิกลิงก์" },
  ],
  short_video: [
    { key: "views", label: "ยอดดู", req: true, hint: "ตามนิยามของแพลตฟอร์มนั้น" },
    { key: "avg_watch_sec", label: "ดูเฉลี่ย", unit: "วินาที", req: true, hint: "บอกว่า hook ใช้ได้ไหม" },
    { key: "watch_full_pct", label: "ดูจนจบ", unit: "%" },
    { key: "engagement", label: "Engagement", req: true, hint: "ไลก์ + คอมเมนต์ + แชร์ + เซฟ" },
    { key: "shares", label: "แชร์" },
    { key: "saves", label: "เซฟ" },
    { key: "comments", label: "คอมเมนต์" },
    { key: "follows", label: "ผู้ติดตามใหม่" },
  ],
  broadcast: [
    { key: "delivered", label: "ส่งสำเร็จ", req: true },
    { key: "unique_open", label: "เปิดอ่าน (คน)", req: true },
    { key: "clicks", label: "คลิก" },
    { key: "blocks", label: "บล็อก/เลิกติดตาม", hint: "ยิงถี่ไปคนบล็อก — ต้องดูคู่กับยอดเปิด" },
  ],
};
/** ทุกชนิดถามเหมือนกัน — ปลายทางที่ SOP สนใจจริง */
export const RUN_LEAD_FIELD = { key: "leads", label: "จำนวนทัก / lead", req: true, hint: "ที่ attribute กลับมาที่ช่องทางนี้ได้" };
/** งาน ads (track project) ถามเพิ่มทุกช่องทาง */
export const RUN_ADS_FIELDS = [
  { key: "spend", label: "Spend", unit: "บาท", req: true },
  { key: "cpm", label: "CPM", unit: "บาท" },
  { key: "ctr", label: "CTR", unit: "%" },
];

/**
 * งานหนึ่งใบต่อหนึ่งช่องทาง — เดิน 3 ขั้นท้ายแยกกัน
 * @typedef {object} ChannelRun
 * @property {string} channel           ชื่อช่องทาง (ตรงกับ brief.channels)
 * @property {string|null} scheduled_at ISO เวลาที่ตั้งไว้ในเครื่องมือจริง
 * @property {string} scheduler_tool    ตั้งจากเครื่องมือไหน
 * @property {string} schedule_ref      ลิงก์/รหัสโพสต์ในเครื่องมือ
 * @property {string} post_url          ลิงก์โพสต์จริง
 * @property {string|null} posted_at    ISO เวลาที่ขึ้นจริง
 * @property {boolean} live_ok          ขึ้นจริง แสดงผลถูกต้อง
 * @property {boolean} comments_handled ดูแลคอมเมนต์ 24 ชม.แรกของช่องทางนี้
 * @property {string} first_comment     คอมเมนต์แรก/ลิงก์ที่ปักไว้
 * @property {Record<string, number|null>} metrics  คีย์ตามชนิดช่องทาง
 * @property {string|null} measured_at  ISO วันที่กรอกตัวเลข
 * @property {string} note              อะไรผิดปกติของช่องทางนี้
 */
export const emptyRun = (channel) => ({
  channel,
  scheduled_at: null, scheduler_tool: "", schedule_ref: "",
  post_url: "", posted_at: null, live_ok: false, comments_handled: false, first_comment: "",
  metrics: {}, measured_at: null, note: "",
});

/** เครื่องมือตั้งเวลาตั้งต้น — แก้ได้ที่หน้าตั้งค่า (ผูกกับช่องทาง) */
export const SEED_SCHEDULER_TOOLS = [
  "Meta Business Suite", "LINE OA Manager", "TikTok Studio", "YouTube Studio", "ตั้งมือตอนถึงเวลา",
];

/**
 * @typedef {object} PublishedChecks
 * @property {boolean} live_ok           โพสต์ขึ้นจริงครบทุกช่องทาง
 * @property {boolean} comments_handled  ตอบคอมเมนต์/อินบ็อกซ์แล้ว
 */

/**
 * การ์ดงาน = หน่วยเดียวที่เดินทั้งสาย (7 ขั้น content / 5 ขั้น project)
 * @typedef {object} Card
 * @property {string} id
 * @property {Track} track
 * @property {Status} status
 * @property {string} brand_id
 * @property {string} owner_id
 * @property {Pillar|null} pillar
 * @property {string} title
 * @property {string} [description]
 * @property {boolean} is_realtime          ใช้ flex slot ประจำสัปดาห์
 * @property {boolean} [plan_confirmed]     Owner ยืนยันว่าคุ้มทำ (เงื่อนไขจบขั้น Idea)
 * @property {Brief} brief
 * @property {SelfCheck} self_check
 * @property {string|null} draft_link
 * @property {boolean|null} first_pass      null = ยังไม่เคยเข้า Review · เขียนครั้งเดียวห้ามรีเซ็ต
 * @property {string|null} entered_review_at ISO — ฐานคำนวณ SLA
 * @property {ChannelRun[]} [channel_runs]  3 ขั้นท้ายแยกรายช่องทาง — แหล่งความจริงของขั้น 5-7
 * @property {PublishedChecks} [published_checks]  สรุปรวมจาก channel_runs (คิดให้ ไม่ได้กรอกมือ)
 * @property {CardMetrics} [metrics]  ผลบวกของ channel_runs (คิดให้ ไม่ได้กรอกมือ)
 * @property {CardMetrics} [metrics]
 * @property {boolean} archived
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * ประวัติการเดินการ์ด — audit ที่ห้ามข้าม (from===to = ปิดงาน ไม่ใช่ย้ายขั้น)
 * @typedef {object} StatusHistory
 * @property {string} id
 * @property {string} card_id
 * @property {Status|null} from_status
 * @property {Status} to_status
 * @property {string} moved_by
 * @property {string} moved_at
 */

/**
 * ผลการตรวจของ Team Lead — ตีกลับต้องมีเหตุผล + อ้างข้อ Direction Pack
 * @typedef {object} ReviewAction
 * @property {string} id
 * @property {string} card_id
 * @property {ReviewActionType} action
 * @property {string} reason
 * @property {string} direction_pack_ref   "new" = ชี้ข้อไม่ได้ → ต้องเติมกติกา
 * @property {string} acted_by
 * @property {string} acted_at
 * @property {number} hours_in_review
 */

/**
 * กติกากลางของระบบ (แก้ที่หน้า Admin)
 * @typedef {object} Settings
 * @property {number} sla_hours
 * @property {number} first_pass_target
 * @property {number} first_pass_window_weeks
 * @property {number} idea_purge_days
 * @property {number} flex_slot_per_week
 */

/**
 * @typedef {object} BriefAttachment
 * @property {string} id
 * @property {string} card_id
 * @property {AttachmentType} attachment_type
 * @property {string} file_name
 * @property {string} mime_type
 * @property {number} file_size
 * @property {string} storage_path
 * @property {string} [caption]
 * @property {number} sort_order
 * @property {string} uploaded_by
 * @property {string} uploaded_at
 */

/**
 * @typedef {object} BriefReferenceLink
 * @property {string} id
 * @property {string} card_id
 * @property {string} url
 * @property {string} [title]
 * @property {string} [note]
 * @property {LinkType} link_type
 * @property {number} sort_order
 * @property {string} added_by
 * @property {string} added_at
 */

/**
 * ข้อมูลทั้งก้อนของแอป (เดโมเก็บใน localStorage · ของจริงมาจาก apiClient)
 * @typedef {object} AppData
 * @property {string} version
 * @property {Profile[]} profiles
 * @property {Brand[]} brands
 * @property {Card[]} cards
 * @property {StatusHistory[]} status_history
 * @property {ReviewAction[]} review_actions
 * @property {BriefAttachment[]} attachments
 * @property {BriefReferenceLink[]} reference_links
 * @property {Channel[]} channels
 * @property {{id:string,ratio:string,w:number,h:number,note:string}[]} size_presets
 * @property {Settings} settings
 */

/**
 * @typedef {object} StageMeta
 * @property {Status} id
 * @property {string} name
 * @property {string} color   CSS var ของธีม (ห้าม hex ดิบ)
 * @property {string} owner   เจ้าของขั้นตาม SOP
 * @property {string} question คำถามที่ขั้นนี้ต้องตอบ
 */
export const EMPTY_METRICS = {
  reach: null, engagement: null, leads: null, spend: null, cpl: null, measured_at: null,
};
export const RESULT_LABEL_TEXT = {
  green: "เกินค่าเฉลี่ย brand",
  yellow: "ตามค่าเฉลี่ย",
  red: "ต่ำกว่าครึ่งของค่าเฉลี่ย",
};
export const EMPTY_PUBLISHED_CHECKS = {
  live_ok: false, comments_handled: false,
};
export const ATTACHMENT_TYPE_LABEL = {
  brief_file: "Brief",
  brief_image: "Brief",
  draft_work: "งานจริง",
  reference: "Reference",
  brand_guideline: "Brand Guideline",
  other: "Other",
};
export const IMAGE_CATEGORIES = [
  { value: "draft_work", label: "งานจริง" },
  { value: "brief_image", label: "Brief" },
  { value: "reference", label: "Reference" },
  { value: "brand_guideline", label: "Brand Guideline" },
  { value: "other", label: "Other" },
];
export const LINK_TYPE_LABEL = {
  website: "Website",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_drive: "Google Drive",
  figma: "Figma",
  canva: "Canva",
  other: "Other",
};
export const STAGE_META = {
  idea: {
    id: "idea", icon: "bulb", name: "Idea", color: "var(--ink-soft)",
    owner: "ทุกคน", question: "คลังไอเดีย — จดกันลืม",
  },
  brief: {
    id: "brief", icon: "clipboard", name: "Brief", color: "var(--accent)",
    owner: "Owner", question: "ล็อกโจทย์ก่อนลงมือ",
  },
  draft: {
    id: "draft", icon: "pencil", name: "Draft", color: "var(--ta)",
    owner: "Owner", question: "ผลิตชิ้นงานให้จบสมบูรณ์",
  },
  review: {
    id: "review", icon: "eye", name: "Review", color: "var(--rt)",
    owner: "Team Lead", question: "ด่านตรวจ — เทียบ Direction Pack เท่านั้น",
  },
  scheduled: {
    id: "scheduled", icon: "calendar", name: "Scheduled", color: "var(--violet)",
    owner: "Owner", question: "ตั้งเวลาโพสต์จริงครบทุกช่องทาง",
  },
  published: {
    id: "published", icon: "send", name: "Published", color: "var(--ok)",
    owner: "Owner", question: "เฝ้าดู 7 วันแรกหลังโพสต์",
  },
  measured: {
    id: "measured", icon: "chart", name: "Measured", color: "var(--jk)",
    owner: "Content Owner", question: "เก็บผลและปิดงาน",
  },
  done: {
    id: "done", name: "Done", color: "var(--ink)",
    owner: "Owner", question: "จบงาน",
  },
};
export const CONTENT_STAGES = ["idea", "brief", "draft", "review", "scheduled", "published", "measured"].map((id) => STAGE_META[id]);
/** project track: idea → brief → draft → review → done */
export const PROJECT_STAGES = ["idea", "brief", "draft", "review", "done"].map((id) => STAGE_META[id]);
export const PILLAR_LABEL = {
  sale_campaign: "Sale/Campaign",
  knowledge: "Knowledge",
  social_proof: "Social Proof",
  brand: "Brand",
};
export const ROLE_LABEL = {
  team_lead: "Team Lead",
  content_owner: "Content Owner",
  performance_marketer: "Performance Marketer",
};
export const MODE_LABEL = {
  grow: "grow",
  maintain: "maintain",
  rebuild: "rebuild",
};
/* ชนิดชิ้นงาน — บรีฟคนละแบบ:
   เดี่ยว = ภาพ/คลิปเดียวจบ บอก layout ของชิ้นเดียวพอ
   ชุดภาพ = ต้องบอกจำนวนภาพ + ภาพไหนพูดอะไร ไม่งั้นคนทำเดาลำดับเอง แล้วตีกลับทั้งชุด */
/* ขนาดภาพมาตรฐานต่ออัตราส่วน — บรีฟต้องบอกเป็น pixel จริง ไม่ใช่แค่ "9:16"
   เพราะคนทำต้องตั้ง canvas ก่อนเริ่ม และคนตรวจต้องเทียบว่าส่งมาตรงสเปกไหม */
/** ชุดเริ่มต้น — เพิ่ม/แก้ได้ไม่จำกัดที่หน้าตั้งค่า (เก็บใน data.size_presets) */
export const SEED_SIZE_PRESETS = [
  { id: "sz_1_1", ratio: "1:1", w: 1080, h: 1080, note: "ฟีดสี่เหลี่ยม" },
  { id: "sz_4_5", ratio: "4:5", w: 1080, h: 1350, note: "ฟีดแนวตั้ง — กินพื้นที่จอมากสุด" },
  { id: "sz_9_16", ratio: "9:16", w: 1080, h: 1920, note: "สตอรี่ / Reels / TikTok" },
  { id: "sz_16_9", ratio: "16:9", w: 1920, h: 1080, note: "แนวนอน / YouTube" },
];
/** ประกอบข้อความขนาดที่เก็บลง brief.size */
/** มุมกล้องตั้งต้น — แก้/เพิ่มได้ไม่จำกัดที่หน้าตั้งค่า (เหมือนขนาดภาพ) */
export const SEED_SHOT_TYPES = [
  { id: "sh_wide", name: "ไวด์", note: "เห็นทั้งตัว/ทั้งห้อง — ใช้เปิดสถานที่" },
  { id: "sh_medium", name: "มีเดียม", note: "ครึ่งตัว — ใช้เล่าคนทำอะไร" },
  { id: "sh_close", name: "โคลสอัพ", note: "เจาะรายละเอียดสินค้า/สีหน้า" },
  { id: "sh_pov", name: "POV", note: "มุมมองบุคคลที่หนึ่ง" },
  { id: "sh_screen", name: "จอมือถือ", note: "อัดหน้าจอ — แชท/เว็บ" },
  { id: "sh_motion", name: "ภาพนิ่ง + โมชั่น", note: "ภาพนิ่งขยับ ไม่ต้องถ่ายจริง" },
];
/** ความยาวคลิปยอดใช้ — ปุ่มเดียวเติม เพิ่มเองได้ที่หน้าตั้งค่า */
export const SEED_VIDEO_LENGTHS = [
  { id: "vl_15", seconds: 15, note: "สตอรี่ / โฆษณาสั้น" },
  { id: "vl_30", seconds: 30, note: "Reels / TikTok มาตรฐาน" },
  { id: "vl_60", seconds: 60, note: "เล่าเรื่องเต็ม" },
];

export const sizeText = (w, h) => `${w} × ${h} px`;

/* ประเภทไฟล์ — เลือกก่อนทุกอย่าง เพราะเปลี่ยนว่าต้องกรอกอะไรต่อ
   image → เลือกได้ว่าเดี่ยวหรือชุดภาพ · video → เป็นชิ้นเดียวเสมอ ไม่มีชุด */
export const FORMATS = [
  { id: "image", label: "ภาพนิ่ง (image)" },
  { id: "video", label: "คลิป (video)" },
];
export const FORMAT_LABEL = { image: "ภาพนิ่ง", video: "คลิป" };

export const AW_TYPES = [
  { id: "single", label: "AW เดี่ยว", hint: "ภาพเดียวจบ" },
  { id: "album", label: "ชุดภาพ (Album)", hint: "หลายภาพเรียงเป็นเรื่อง" },
];
export const AW_TYPE_LABEL = { single: "AW เดี่ยว", album: "ชุดภาพ" };

/* Self-check — 5 ข้อร่วม + ข้อเฉพาะชนิดงาน
   เดิมเป็นลิสต์เดียวที่เขียนไว้สำหรับภาพนิ่งล้วน ("ตัวหนังสือบนภาพ ≤30%") ใช้กับคลิปไม่ได้
   จึงแยกเป็นฟังก์ชัน — ทุกที่ที่นับต้องเรียกฟังก์ชันนี้ ห้ามฮาร์ดโค้ดจำนวนข้อ */
const SELF_CHECK_SHARED = [
  { key: "visual", label: "สี/font ตรง Visual Direction" },
  { key: "logo", label: "โลโก้ถูกตำแหน่ง ขนาดไม่เกิน" },
  { key: "no_forbidden", label: "ไม่ติดข้อห้าม (TD: ไม่พ้อง Finix/Fenix)" },
  { key: "data_verified", label: "Spec/ตัวเลขตรง Fact Sheet" },
  { key: "cta_clear", label: "Caption มี CTA ชัด (ทัก LINE / inbox / คลิก)" },
];
const SELF_CHECK_IMAGE = [
  { key: "text_ratio", label: "ตัวหนังสือบนภาพ ≤30% อ่านออกบนมือถือ" },
];
const SELF_CHECK_VIDEO = [
  { key: "sub_safe", label: "ซับ/ข้อความไม่โดน UI ของแพลตฟอร์มบัง" },
  { key: "timeline_match", label: "ความยาวจริง + ลำดับฉาก ตรงไทม์ไลน์ที่บรีฟ" },
];
/** ข้อ Self-check ของงานชิ้นนี้ — ภาพนิ่ง 6 ข้อ · คลิป 7 ข้อ */
export function selfCheckItems(brief) {
  return [...SELF_CHECK_SHARED, ...(brief?.format === "video" ? SELF_CHECK_VIDEO : SELF_CHECK_IMAGE)];
}
/** ทุกคีย์ที่เป็นไปได้ — ใช้ตั้งค่าเริ่มต้นของการ์ด */
export const ALL_SELF_CHECK_KEYS = [...SELF_CHECK_SHARED, ...SELF_CHECK_IMAGE, ...SELF_CHECK_VIDEO].map((i) => i.key);
/** ข้อกติกาใน Direction Pack — dropdown บังคับตอนตีกลับ
    เรียงตามส่วนของเอกสาร ครอบคลุมเหตุตีกลับที่เจอจริง — คนตรวจชี้ข้อได้เสมอ
    ไม่ต้องเลือก "ชี้ไม่ได้" ทั้งที่กติกามีอยู่ */
export const DIRECTION_PACK_RULES = [
  "ส่วนที่ 1 — Tone of voice หลุดจาก 3 คำใช่/ไม่ใช่",
  "ส่วนที่ 1 — ภาษา/มุกไม่เข้ากับกลุ่มลูกค้าของ brand",
  "ส่วนที่ 2 — Visual: ตัวหนังสือบนภาพเกิน 30%",
  "ส่วนที่ 2 — Visual: สี/font ไม่ตรง Direction ของ brand",
  "ส่วนที่ 2 — Visual: โลโก้ผิดตำแหน่ง/ขนาด",
  "ส่วนที่ 2 — Visual: ขนาด/สัดส่วนไม่ตรงสเปคของช่องทาง",
  "ส่วนที่ 2 — Visual: ไฟล์ไม่คม / ภาพเบลอ / ครอปเสีย",
  "ส่วนที่ 3 — เนื้อหาไม่ตรง pillar ที่ระบุใน Brief",
  "ส่วนที่ 3 — ตัวเลข/ข้อมูลไม่ตรง Fact Sheet",
  "ส่วนที่ 3 — สะกดผิด / ภาษาไม่เรียบร้อย",
  "ส่วนที่ 4 — ข้อห้าม: claim ที่ห้ามใช้ / แตะราคานอก Price Sheet",
  "ส่วนที่ 4 — ข้อห้าม: ใช้ภาพ/เพลงที่ไม่มีสิทธิ์ หรือไม่ให้เครดิต",
  "ส่วนที่ 4 — ข้อห้าม: ภาพลูกค้า/พนักงานที่ยังไม่ได้ขออนุญาต",
  "ส่วนที่ 5 — ไม่ผ่านเกณฑ์ตรวจ: Hook/CTA ไม่ตรง Brief",
  "ส่วนที่ 5 — ชิ้นงานไม่ครบตาม Brief (จำนวนภาพ/ความยาวคลิป/ฉากขาด)",
  "ส่วนที่ 5 — แคปชัน/แฮชแท็ก/ช่องทางไม่ตรงแผน",
];
export function stagesFor(track) {
  return track === "project" ? PROJECT_STAGES : CONTENT_STAGES;
}
