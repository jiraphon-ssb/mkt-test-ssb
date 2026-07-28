/* ============================================================
 Seed data — 4 brands, 5 users, การ์ด ~15 ใบครอบทุกขั้น + edge cases
 วันที่ generate สัมพัทธ์กับ "วันนี้" เพื่อให้ demo ดูสดเสมอ
 ============================================================ */
import { genId } from "../mktRules.js";
import { buildBackfill } from "./seedBackfill.js";
import {
  SEED_SIZE_PRESETS, SEED_SHOT_TYPES, SEED_VIDEO_LENGTHS, ALL_SELF_CHECK_KEYS,
  SEED_SCHEDULER_TOOLS, emptyRun,
} from "../mktEngine.js";
export const DATA_VERSION = "ssb-cp-v17";  /* v17 = โปสเตอร์ mock ให้งานเด่นในคลัง — เดโมเห็นรูปโดยไม่ง้อไฟล์จริง */
const DAY = 86_400_000;
const HOUR = 3_600_000;
function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}
/** เวลาโพสต์จริงของทีม — ตรึงชั่วโมงตามเวลาแนะนำใน SOP (ไม่ใช่ "เวลาที่รันโปรแกรม")
  ใช้เวลาท้องถิ่น เพราะปฏิทิน/heatmap อ่านเป็นเวลาท้องถิ่นทั้งระบบ */
function postAt(dayOffset, hour, minute = 0) {
  const d = new Date(Date.now() + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
/* ---------- profiles ---------- */
export const SEED_PROFILES = [
  { id: "u_ta", display_name: "คุณตะ", role: "team_lead", active: true },
  { id: "u_arm", display_name: "อาร์ม", role: "content_owner", active: true },
  { id: "u_earn", display_name: "เอิร์น", role: "content_owner", active: true },
  { id: "u_neung", display_name: "หนึ่ง", role: "content_owner", active: true },
  { id: "u_fai", display_name: "ฝ้าย", role: "performance_marketer", active: true },
];
/* ---------- brands ---------- */
export const SEED_BRANDS = [
  { id: "b_td", name: "TEAMDEE", mode: "grow", default_owner: "u_arm", color: "#F26B21", logo: "", active: true },
  { id: "b_jk", name: "JK Design", mode: "maintain", default_owner: "u_earn", color: "#1F6E4A", logo: "", active: true },
  { id: "b_ta", name: "t around", mode: "maintain", default_owner: "u_neung", color: "#3E63C4", logo: "", active: true },
  { id: "b_jt", name: "JUNTAKARN", mode: "rebuild", default_owner: "u_earn", color: "#A63D7A", logo: "", active: true },
];
/* ---------- ช่องทาง (ตั้งค่าเพิ่ม/แก้สี/ใส่โลโก้ได้ในหน้าตั้งค่า) ---------- */
export const SEED_CHANNELS = [
  { id: "ch_fb", name: "Facebook", kind: "feed", tool: "Meta Business Suite", best_time: "10:00–12:00 วันทำการ", color: "#3E63C4", logo: "", active: true },
  { id: "ch_tt", name: "TikTok", kind: "short_video", tool: "TikTok Studio", best_time: "19:00–22:00", color: "#111827", logo: "", active: true },
  { id: "ch_rl", name: "Reels", kind: "short_video", tool: "Meta Business Suite", best_time: "19:00–21:00", color: "#A63D7A", logo: "", active: true },
  { id: "ch_yt", name: "YouTube Shorts", kind: "short_video", tool: "YouTube Studio", best_time: "18:00–21:00", color: "#D64545", logo: "", active: true },
  { id: "ch_line", name: "LINE OA", kind: "broadcast", tool: "LINE OA Manager", best_time: "11:00–13:00 วันทำการ", color: "#1F9D55", logo: "", active: true },
  { id: "ch_ig", name: "IG", kind: "feed", tool: "Meta Business Suite", best_time: "19:00–21:00", color: "#C9520F", logo: "", active: true },
];
/* ---------- settings ---------- */
export const SEED_SETTINGS = {
  sla_hours: 24,
  first_pass_target: 0.8,
  first_pass_window_weeks: 4,
  idea_purge_days: 60,
  flex_slot_per_week: 2,
};
/* ---------- helpers ---------- */
function brief(over = {}) {
  return {
    who_action: "", hook: "", key_message: "", cta: "", fact_checked: false,
    format: "", size: "", deadline_review: null, channels: [], publish_at: null,
    video_seconds: null, video_subtitle: false, video_scenes: [],
    aw_type: "single", album_count: null, album_frames: [],
  layout_note: "", mood: "", ref_note: "", ci_link: "", ...over,
  };
}
function check(v) {
  /* คีย์ครบทุกชนิดงาน — เปลี่ยนภาพนิ่ง↔คลิปแล้วข้อที่โผล่มาใหม่จะไม่เป็น undefined */
  return Object.fromEntries(ALL_SELF_CHECK_KEYS.map((k) => [k, v]));
}
let seq = 0;
function card(status, brand_id, owner_id, title, pillar, over = {}) {
  seq++;
  const id = `CT-${String(seq).padStart(3, "0")}`;
  return {
    id, track: "content", status, brand_id, owner_id, title, pillar,
    is_realtime: false, brief: brief(), draft_link: "", self_check: check(false),
    first_pass: null, entered_review_at: null, archived: false,
    // การ์ดที่ผ่าน Idea มาแล้วถือว่ายืนยันแผนแล้ว (override เป็น false ได้ใน over)
    plan_confirmed: true,
    created_at: iso(-20 * DAY), updated_at: iso(-1 * DAY), ...over,
  };
}
/** แถวช่องทางที่ตั้งเวลาแล้ว */
const runSched = (channel, tool, at) => ({
  ...emptyRun(channel), scheduled_at: at, scheduler_tool: tool,
  schedule_ref: `https://tools.mock/${channel.toLowerCase().replace(/\s/g, "")}/scheduled`,
});
/** แถวช่องทางที่โพสต์ขึ้นแล้ว */
const runPub = (channel, tool, at, url, over = {}) => ({
  ...runSched(channel, tool, at),
  post_url: url, posted_at: at, live_ok: true, comments_handled: true,
  ...over,
});
/** แถวช่องทางที่วัดผลแล้ว */
const runDone = (channel, tool, at, url, metrics) => ({
  ...runPub(channel, tool, at, url), metrics, measured_at: iso(-2 * DAY),
});

const fullProdBrief = (over = {}) => brief({
  format: "video", size: "9:16", video_seconds: 30, video_subtitle: true,
  video_scenes: [
    { from: 0, to: 3, what: "โคลสอัพเสื้อทีมบนตัวพนักงานจริง เห็นเนื้อผ้าชัด", shot: "โคลสอัพ",
      who: "พนักงานร้าน 2 คน", place: "หน้าร้าน", screen_text: "", audio: "เพลงจังหวะเร็ว เข้าทันทีไม่มีอินโทร",
      note: "ห้ามใช้ภาพสต็อก ต้องเป็นเสื้อจริงที่ผลิตแล้ว" },
    { from: 3, to: 12, what: "พนักงานเดินเข้าร้านพร้อมกัน ลูกค้าในร้านมองตาม", shot: "ไวด์",
      who: "ทีมงาน 4 คน เดินเรียงหน้ากระดาน", place: "ทางเดินหน้าร้าน ช่วงเช้า แสงธรรมชาติ",
      screen_text: "ใส่พร้อมกัน = ลูกค้าจำได้", audio: "เพลงเดิมต่อเนื่อง", note: "" },
    { from: 12, to: 24, what: "ตัดสลับ 3 แบรนด์ที่ใช้จริง + ขึ้นตัวเลขข้อเสนอ", shot: "มีเดียม",
      who: "", place: "หน้าร้าน 3 ที่", screen_text: "สั่ง 20 ตัวขึ้นไป แถมฟรี 1 ตัว",
      audio: "เสียงพูด: สั่ง 20 ตัวขึ้นไป แถมฟรีอีก 1", note: "ซับใหญ่กลางจอ ห้ามชิดขอบล่าง" },
    { from: 24, to: 30, what: "จบด้วยโลโก้ + ปุ่มทัก LINE ค้างจอ", shot: "ภาพนิ่ง + โมชั่น",
      who: "", place: "", screen_text: "ทัก LINE @teamdee รับสิทธิ์ก่อนเต็ม",
      audio: "เพลงเฟดลง", note: "ค้างจอ 3 วิเต็ม ให้คนกดทัน" },
  ],
  channels: ["TikTok"], layout_note: "",
  mood: "จริงใจ อบอุ่น", ref_note: "อ้าง pacing ไม่เอาโทนสี",
  // "#" นับเป็น filler แล้ว — ต้องเป็นลิงก์จริง
  ci_link: "https://drive.google.com/drive/folders/mock-ci-teamdee",
  ...over,
});
/* ============================================================
 การ์ด — ครอบทุกขั้น + edge cases
 ============================================================ */
export function buildSeedCards() {
  seq = 0;
  const cards = [
    // --- IDEA ---
    card("idea", "b_td", "u_arm", "ทำไมทีมที่มีเสื้อทีม ทำงานเข้าขากว่า (อ้างงานวิจัย)", "knowledge", {
      plan_confirmed: true, updated_at: iso(-2 * DAY),
    }),
    card("idea", "b_jt", "u_earn", 'เทรนด์เสียง "ของมันต้องมี" เวอร์ชันชุดยูนิฟอร์มร้าน', "brand", {
      is_realtime: true, pillar: "brand", plan_confirmed: true, updated_at: iso(-1 * DAY),
    }),
    // idea ค้างเกิน 60 วัน + ยังไม่ยืนยันว่าคุ้มทำ → purge due (ตรงกับกับดักใน SOP)
    card("idea", "b_ta", "u_neung", "รีวิวเสื้อรุ่นเก่าที่ยังไม่มีคนหยิบทำ", "social_proof", {
      plan_confirmed: false,
      created_at: iso(-80 * DAY), updated_at: iso(-72 * DAY),
    }),
    // --- BRIEF ---
    card("brief", "b_td", "u_arm", 'ปักหมุดทีม W2 — โพสต์นับถอยหลัง "เหลือ 12 ทีม"', "sale_campaign", {
      brief: fullProdBrief({
        who_action: "HR องค์กร 30–200 คน → ทัก LINE จองสิทธิ์",
        hook: '"เหลือ 12 ทีมสุดท้าย ก่อนปิดรอบ founding"',
        key_message: "สั่ง 20 ตัวขึ้น แถมฟรี 1 + สิทธิ์ founding",
        cta: "ทัก LINE @teamdee รับสิทธิ์", fact_checked: true,
        deadline_review: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10),
        channels: ["Facebook", "LINE OA"], publish_at: postAt(4, 11, 0),
        // ว่างโดยเจตนา — ใบนี้ผ่าน gate ด้วยรูป ref ที่มีคำอธิบาย (att_3)
        // + ไฟล์ CI/ลิงก์อ้างอิง (att_2, lnk_1/lnk_2) เพื่อโชว์ว่าไฟล์แนบนับเข้า gate จริง
        ref_note: "", ci_link: "",
      }),
      updated_at: iso(-1 * DAY),
    }),
    // brief ที่ยังไม่ครบ (fact ยังไม่ติ๊ก)
    card("brief", "b_ta", "u_neung", "t around — เบื้องหลังงานปักโลโก้คาเฟ่ 40 ตัว", "social_proof", {
      brief: fullProdBrief({
        who_action: "เจ้าของคาเฟ่ → ทักขอตัวอย่างผ้า",
        hook: "ปักโลโก้ 40 ตัว เนี้ยบทุกจุด", key_message: "งานปักคุณภาพร้านเล็กก็สั่งได้",
        cta: "ทักขอใบเสนอราคา", fact_checked: false, channels: ["Reels"],
        // ให้ขาดแค่ติ๊ก Fact Sheet ข้อเดียว เพื่อให้เดโมอ่านง่าย
        deadline_review: new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(5, 19, 15),
      }),
      updated_at: iso(-4 * DAY), // stuck > 3 วัน
    }),
    // คลิปที่ไทม์ไลน์ยังไม่จบ — มีฉากเดียว ยังไม่มีฉาก CTA (ให้เห็นสถานะเตือนจริงบนทุกจอ)
    card("brief", "b_td", "u_arm", "ปักหมุดทีม — คลิปสั้น 15 วิ ตอบคำถามที่ลูกค้าถามบ่อย", "knowledge", {
      brief: fullProdBrief({
        who_action: "HR ที่ยังลังเล → ทัก LINE ถามราคา",
        hook: "ปักแพงกว่าสกรีนจริงไหม", key_message: "ปักอยู่ได้ 3 ปี สกรีนลอกใน 6 เดือน",
        cta: "ทัก LINE ขอตัวอย่างผ้า", fact_checked: true,
        format: "video", size: "9:16", video_seconds: 15, video_subtitle: true,
        video_scenes: [
          { from: 0, to: 4, what: "มือดึงเสื้อสกรีนที่ลอกแล้วเทียบกับเสื้อปัก", shot: "โคลสอัพ",
            who: "มือช่าง", place: "โต๊ะทำงาน", screen_text: "ปักแพงกว่าจริงไหม", audio: "", note: "" },
        ],
        channels: ["TikTok"], layout_note: "",
        deadline_review: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(6, 18, 30),
      }),
      updated_at: iso(-1 * DAY),
    }),
    // --- DRAFT ---
    card("draft", "b_td", "u_arm", "ปักหมุดทีม — คลิปรีวิวทีมแรกที่จองสิทธิ์", "social_proof", {
      draft_link: "https://drive.google.com/file/mock1",
      self_check: { ...check(true), cta_clear: false },
      brief: fullProdBrief({
        who_action: "HR → ทัก LINE", hook: "ทีมแรกที่กล้าจอง", key_message: "founding member",
        cta: "ทัก LINE", fact_checked: true, deadline_review: new Date(Date.now() + DAY).toISOString().slice(0, 10),
        channels: ["TikTok"], publish_at: postAt(3, 13, 30),
      }),
    }),
    card("draft", "b_jk", "u_earn", "JK — โพสต์เอกสารจัดซื้อครบ ยื่นงบ อบต. ไม่สะดุด", "knowledge", {
      draft_link: "", self_check: check(false),
      brief: fullProdBrief({
        who_action: "เจ้าหน้าที่พัสดุ อปท. → ขอใบเสนอราคา", hook: "เอกสารครบใน 3 วัน",
        key_message: "JK ทำงานราชการ 10 ปี", cta: "ทักขอเอกสาร", fact_checked: true,
        format: "image", channels: ["Facebook"], deadline_review: new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10),
      }),
    }),
    // --- REVIEW (คิวรอตรวจ) ---
    card("review", "b_td", "u_arm", "ปักหมุดทีม W1 — โพสต์เปิดตัว Founding 20 ทีมแรก", "sale_campaign", {
      draft_link: "https://drive.google.com/file/mock2", self_check: check(true),
      entered_review_at: iso(-21 * HOUR), // ใกล้ SLA
      brief: fullProdBrief({
        who_action: "HR องค์กร 30–200 คน → ทัก LINE จองสิทธิ์",
        hook: '"เสื้อทีมที่ใส่แล้วรู้เลยว่าทีมเดียวกัน — เหลือ 20 ทีมแรก"',
        key_message: "สั่ง 20 ตัวขึ้น แถมฟรี 1 + สิทธิ์ founding member",
        cta: "ทัก LINE @teamdee รับสิทธิ์ก่อนเต็ม", fact_checked: true,
        channels: ["Facebook", "LINE OA"], deadline_review: new Date().toISOString().slice(0, 10),
        publish_at: postAt(1, 20, 45),
      }),
    }),
    // review ที่เคยถูกตีกลับ (แก้รอบ 2)
    card("review", "b_jt", "u_earn", 'JUNTAKARN — ชุดภาพ "ยูนิฟอร์มที่พนักงานอยากใส่จริง"', "brand", {
      draft_link: "https://drive.google.com/file/mock3", self_check: check(true),
      first_pass: false, entered_review_at: iso(-30 * HOUR), // เกิน SLA
      brief: fullProdBrief({
        who_action: "เจ้าของร้านอาหาร/คาเฟ่ → ขอดูตัวอย่างผ้า",
        hook: 'พนักงานลาออกเพราะ "ชุดใส่แล้วไม่มั่นใจ"', key_message: "ยูนิฟอร์มดีคือสวัสดิการที่มองเห็นได้",
        cta: "ทักขอแคตตาล็อก + ตัวอย่างผ้าฟรี", fact_checked: true, format: "image",
        // ตัวอย่างงาน "ชุดภาพ" — บรีฟต้องบอกจำนวนภาพและภาพไหนพูดอะไร
        aw_type: "album", album_count: 5, size: "",
        album_frames: [
          { text: "ปก — พนักงานใส่ชุดเดิมหน้าเบื่อ", size: "1080 × 1080 px", note: "ปกใช้สี่เหลี่ยมให้ครอปในฟีดไม่เสีย" },
          { text: "ปัญหา — ชุดไม่พอดี ร้อน ซักแล้วย้วย", size: "1080 × 1350 px", note: "" },
          { text: "ผ้าที่เลือกให้ + เหตุผล", size: "1080 × 1350 px", note: "ใช้รูปผ้าจริง ไม่เอาสต็อก" },
          { text: "ก่อน/หลัง ร้านจริง", size: "1080 × 1350 px", note: "" },
          { text: "CTA ขอแคตตาล็อก", size: "1080 × 1350 px", note: "" },
        ],
        channels: ["Facebook"], deadline_review: new Date().toISOString().slice(0, 10), publish_at: postAt(2, 18, 0),
      }),
    }),
    card("review", "b_ta", "u_neung", "t around — เสื้อรับปริญญารุ่น ปั๊มชื่อรุ่นด้านหลัง", "sale_campaign", {
      is_realtime: true, draft_link: "https://drive.google.com/file/mock4", self_check: check(true),
      entered_review_at: iso(-6 * HOUR),
      brief: fullProdBrief({
        who_action: "ตัวแทนรุ่น มหาลัย → ขอใบเสนอราคารุ่น",
        hook: '"รูปหมู่รับปริญญาปีนี้ อย่าให้เสื้อดูเหมือนซื้อตลาดนัด"',
        key_message: "สั่งยกรุ่น 50+ ตัว ต่อตัวถูกกว่าที่คิด", cta: "ทักไลน์ขอราคารุ่นวันนี้",
        fact_checked: true, channels: ["TikTok"], deadline_review: new Date().toISOString().slice(0, 10), publish_at: postAt(1, 19, 15),
      }),
    }),
    // --- SCHEDULED ---
    card("scheduled", "b_td", "u_arm", 'ปักหมุดทีม — Broadcast LINE #2 "ทำไมต้องปัก ไม่ใช่สกรีน"', "knowledge", {
      draft_link: "https://drive.google.com/file/mock5", self_check: check(true), first_pass: true,
      brief: fullProdBrief({
        who_action: "ลูกค้าเก่า → กลับมาสั่งซ้ำ", hook: "ปักอยู่ทน สกรีนหลุดลอก",
        key_message: "งานปักคุ้มกว่าระยะยาว", cta: "ทัก LINE", fact_checked: true, format: "image",
        channels: ["LINE OA"], deadline_review: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(1, 11, 30),
      }),
      // ตั้งเวลาจริงครบแล้ว + มีแคปหลักฐาน = พร้อมไป Published
      channel_runs: [runSched("LINE OA", "LINE OA Manager", postAt(1, 11, 30))],
    }),
    // --- PUBLISHED ---
    card("published", "b_ta", "u_neung", "t around — โพสต์ผ้า cotton 100% ที่ลูกค้าถามบ่อยสุด", "knowledge", {
      draft_link: "https://drive.google.com/file/mock6", self_check: check(true), first_pass: true,
      brief: fullProdBrief({
        who_action: "ลูกค้าทั่วไป → ทักถามผ้า", hook: "cotton 100% ต่างจากผสมยังไง",
        key_message: "เลือกผ้าถูกงานถูกใจ", cta: "ทักถามได้", fact_checked: true,
        channels: ["Facebook"], deadline_review: new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-3, 20, 45), // ยังไม่ครบ 7 วัน
      }),
      // ขึ้นจริงแล้ว แต่ยังไม่ได้ดูแลคอมเมนต์ = ยังไปต่อไม่ได้
      channel_runs: [runPub("Facebook", "Meta Business Suite", postAt(-3, 20, 45),
        "https://facebook.com/taround/posts/mock-cotton", { comments_handled: false })],
      updated_at: iso(-3 * DAY),
    }),
    // published ครบ 7 วันแล้ว พร้อมย้าย measured
    card("published", "b_jk", "u_earn", "JK Design — ผลงานเสื้อกีฬาสี เทศบาลตำบล", "social_proof", {
      draft_link: "https://drive.google.com/file/mock7", self_check: check(true), first_pass: true,
      brief: fullProdBrief({
        who_action: "เจ้าหน้าที่พัสดุ → ขอใบเสนอราคา", hook: "งานกีฬาสีเอกสารครบใน 3 วัน",
        key_message: "ทำงานราชการ 10 ปี", cta: "ทักขอราคา", fact_checked: true, format: "image",
        channels: ["Facebook"], deadline_review: new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-8, 13, 0),
      }),
      // ครบทุกช่องทาง = พร้อมไป Measured
      channel_runs: [runPub("Facebook", "Meta Business Suite", postAt(-8, 13, 0),
        "https://facebook.com/jkdesign/posts/mock-sport")],
      updated_at: iso(-8 * DAY),
    }),
    // --- MEASURED (จบแล้ว ติดป้าย) ---
    card("measured", "b_td", "u_arm", "TEAMDEE — โพสต์เปิดตัวรีแบรนด์", "brand", {
      draft_link: "https://drive.google.com/file/mock8", self_check: check(true), first_pass: true,
      archived: true,
      brief: fullProdBrief({
        who_action: "ตลาดทั่วไป → รับรู้แบรนด์ใหม่", hook: "TEAMDEE โฉมใหม่",
        key_message: "แบรนด์เสื้อทีมที่จริงจัง", cta: "ติดตามเพจ", fact_checked: true,
        channels: ["Facebook", "TikTok"], deadline_review: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-20, 18, 15),
      }),
      /* 2 ช่องทาง คนละชนิด — ตัวเลขคนละชุด แล้วรวมเป็น reach 52,000 / eng 2,184 / lead 31
         (ER 4.2% สูงกว่าค่าเฉลี่ย brand → ป้ายเขียว) */
      channel_runs: [
        runDone("Facebook", "Meta Business Suite", postAt(-20, 18, 15), "https://facebook.com/teamdee/posts/mock-rebrand",
          { reach: 30_000, impressions: 41_200, engagement: 1_260, saves: 88, shares: 143, comments: 61, link_clicks: 410, leads: 18 }),
        runDone("TikTok", "TikTok Studio", postAt(-20, 19, 0), "https://tiktok.com/@teamdee/video/mock-rebrand",
          { views: 22_000, avg_watch_sec: 11, watch_full_pct: 34, engagement: 924, shares: 96, saves: 145, comments: 52, follows: 61, leads: 13 }),
      ],
      metrics: { reach: 52_000, engagement: 2_184, leads: 31, spend: null, cpl: null, measured_at: iso(-2 * DAY) },
      updated_at: iso(-13 * DAY),
    }),
    // อีก 2 ใบที่วัดผลแล้ว — เป็นฐานให้ค่าเฉลี่ย brand มีความหมาย
    card("measured", "b_td", "u_arm", "TEAMDEE — เทียบผ้า 3 เกรด", "knowledge", {
      draft_link: "https://drive.google.com/file/mock9", self_check: check(true), first_pass: true,
      archived: true,
      brief: fullProdBrief({
        who_action: "คนกำลังเลือกผ้า → ทักถามรุ่น", hook: "ผ้า 3 เกรด ต่างกันตรงไหน",
        key_message: "เลือกเกรดให้ตรงงบ", cta: "ทักถามรุ่นที่เหมาะ", fact_checked: true,
        channels: ["TikTok"], deadline_review: new Date(Date.now() - 24 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-16, 19, 30),
      }),
      channel_runs: [
        runDone("TikTok", "TikTok Studio", postAt(-16, 19, 30), "https://tiktok.com/@teamdee/video/mock-fabric",
          { views: 31_000, avg_watch_sec: 7, watch_full_pct: 19, engagement: 806, shares: 61, saves: 92, comments: 44, follows: 28, leads: 9 }),
      ],
      metrics: { reach: 31_000, engagement: 806, leads: 9, spend: null, cpl: null, measured_at: iso(-3 * DAY) },
      updated_at: iso(-9 * DAY),
    }),
    // ยังไม่ archive + ยังไม่กรอกตัวเลข → เห็นขั้น Measured จริงบน board และลองกรอกได้
    card("measured", "b_ta", "u_neung", "t around — คลิปเบื้องหลังงานปักรอบล่าสุด", "social_proof", {
      draft_link: "https://drive.google.com/file/mock11", self_check: check(true), first_pass: true,
      brief: fullProdBrief({
        who_action: "เจ้าของร้าน → ทักขอตัวอย่าง", hook: "เบื้องหลังงานปัก 40 ตัว",
        key_message: "งานปักเนี้ยบทุกจุด", cta: "ทักขอตัวอย่างผ้า", fact_checked: true,
        channels: ["Reels"], deadline_review: new Date(Date.now() - 18 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-10, 11, 45),
      }),
      // โพสต์ขึ้นแล้วแต่ยังไม่กรอกตัวเลข — ลองกรอกรายช่องทางได้จริงบนเดโม
      channel_runs: [runPub("Reels", "Meta Business Suite", postAt(-10, 11, 45),
        "https://facebook.com/reel/mock-behind")],
      updated_at: iso(-2 * DAY),
    }),
    card("measured", "b_td", "u_arm", "TEAMDEE — โพสต์โปรฯ ต้นเดือน (ผลไม่ดี)", "sale_campaign", {
      draft_link: "https://drive.google.com/file/mock10", self_check: check(true), first_pass: false,
      archived: true,
      brief: fullProdBrief({
        who_action: "ลูกค้าใหม่ → กดดูโปร", hook: "โปรต้นเดือน ลดสูงสุด 20%",
        key_message: "สั่งช่วงนี้คุ้มสุด", cta: "ทักรับโปร", fact_checked: true, format: "image",
        channels: ["Facebook"], deadline_review: new Date(Date.now() - 20 * DAY).toISOString().slice(0, 10),
        publish_at: postAt(-12, 20, 0),
      }),
      // ER 0.8% — ต่ำกว่าครึ่งของค่าเฉลี่ย → ป้ายแดง
      channel_runs: [
        runDone("Facebook", "Meta Business Suite", postAt(-12, 20, 0), "https://facebook.com/teamdee/posts/mock-promo",
          { reach: 18_000, impressions: 21_400, engagement: 144, saves: 4, shares: 6, comments: 9, link_clicks: 38, leads: 1 }),
      ],
      metrics: { reach: 18_000, engagement: 144, leads: 1, spend: null, cpl: null, measured_at: iso(-4 * DAY) },
      updated_at: iso(-5 * DAY),
    }),
    // --- PROJECT track (5 ขั้น) ---
    card("brief", "b_jt", "u_fai", "JUNTAKARN — รีโครงหน้าเว็บ + ปรับ ads funnel ใหม่", null, {
      track: "project", pillar: null,
      brief: fullProdBrief({
        who_action: "ทีม → รีโครงเว็บ", hook: "หน้าเว็บใหม่ conversion ดีขึ้น",
        key_message: "rebuild แบรนด์", cta: "กดดูหน้าเว็บใหม่", fact_checked: true, format: "project",
        size: "desktop + mobile",
        channels: ["web"], deadline_review: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10),
      }),
      updated_at: iso(-2 * DAY),
    }),
  ];
  return cards;
}
/* ============================================================
 status_history + review_actions (สร้างให้ stats มีข้อมูลจริง)
 ============================================================ */
export function buildSeedHistoryAndActions(_cards) {
  const history = [];
  const actions = [];
  // สร้าง review_actions ย้อนหลัง 4 สัปดาห์ ให้ first-pass ของแต่ละ owner ต่างกัน
  // อาร์ม: first-pass สูง (unlock), เอิร์น: กลาง, หนึ่ง: ต่ำ
  const owners = {
    u_arm: { passRate: 0.86, count: 14 },
    u_earn: { passRate: 0.62, count: 13 },
    u_neung: { passRate: 0.71, count: 12 },
  };
  let ci = 0;
  for (const [ownerId, cfg] of Object.entries(owners)) {
    for (let i = 0; i < cfg.count; i++) {
      ci++;
      const cardId = `hist_${ownerId}_${i}`;
      // กระจายเวลาใน 4 สัปดาห์ที่ผ่านมา
      const weeksAgo = i % 4;
      const acted_at = iso(-(weeksAgo * 7 + (i % 6)) * DAY - 3 * HOUR);
      const pass = i / cfg.count < cfg.passRate;
      const hours = pass ? 6 + (i % 10) : 10 + (i % 20);
      // การ์ดจำลองสำหรับ history (owner_id ต้อง map ได้)
      history.push({
        id: genId("h"), card_id: cardId, from_status: "draft", to_status: "review",
        moved_by: ownerId, moved_at: iso(-(weeksAgo * 7 + (i % 6)) * DAY - (hours + 3) * HOUR),
      });
      actions.push({
        id: genId("a"), card_id: cardId, action: pass ? "approve" : "reject",
        reason: pass ? "" : "ตัวหนังสือบนภาพเกิน 30%", direction_pack_ref: pass ? null : "ส่วนที่ 2 — Visual: ตัวหนังสือบนภาพเกิน 30%",
        acted_by: "u_ta", acted_at, hours_in_review: hours,
      });
    }
  }
  // ต้องมี "การ์ด phantom" ให้ computeFirstPassRate map owner ได้ → เพิ่มเข้า cards เป็น archived hidden
  return { history, actions };
}
/** สร้าง phantom cards สำหรับ history (archived+hidden จาก board แต่ให้ stats คำนวณได้) */
export function buildPhantomCards(actions) {
  const seen = new Set();
  const phantom = [];
  for (const a of actions) {
    if (seen.has(a.card_id))
      continue;
    seen.add(a.card_id);
    const ownerId = a.card_id.includes("u_arm")
      ? "u_arm"
      : a.card_id.includes("u_earn")
        ? "u_earn"
        : "u_neung";
    phantom.push({
      id: a.card_id, track: "content", status: "measured", brand_id: "b_td",
      owner_id: ownerId, title: "(ประวัติ)", pillar: "knowledge", is_realtime: false,
      brief: brief(), draft_link: "x", self_check: check(true),
      first_pass: a.action === "approve", entered_review_at: null, archived: true,
      created_at: a.acted_at, updated_at: a.acted_at,
    });
  }
  return phantom;
}
/* ---------- ไฟล์แนบ + ลิงก์ตัวอย่าง (ให้ UI มีสถานะ populated ให้ดู) ----------
 demo: file_url ไม่มีไฟล์จริง — เป็น metadata ล้วน (สเปคห้ามเก็บ base64)
 ของจริงจะเป็น URL จาก storage bucket ตาม migration 0002                     */
/** โปสเตอร์ mock เป็น data-URI SVG — ให้เดโมเห็น "รูปหน้าปกจากไฟล์แนบ" จริง ไม่ง้อเน็ต
   ของจริงจะเป็นรูปที่อัปโหลด หรือ thumbnail จากลิงก์ไดร์ฟ */
function mockPoster(top, bottom, c1, c2) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400'>`
    + `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>`
    + `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>`
    + `<rect width='600' height='400' fill='url(#g)'/>`
    + `<text x='300' y='185' font-family='Noto Sans Thai,sans-serif' font-size='64' font-weight='800' fill='#fff' text-anchor='middle'>${top}</text>`
    + `<text x='300' y='250' font-family='Noto Sans Thai,sans-serif' font-size='30' fill='#ffffffcc' text-anchor='middle'>${bottom}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function buildSeedAttachments(cards = []) {
  /* หลักฐานรายช่องทางสร้างจากตัวการ์ดเอง — ไม่ฮาร์ดโค้ดรหัสการ์ด
     (เพิ่ม/สลับการ์ดใน seed แล้วรหัสเลื่อน หลักฐานจะไม่หลุดไปผูกใบผิด)
     ขั้นไหนทำถึงแล้วก็มีแคปของขั้นนั้น — ตรงกับกติกาที่บังคับแนบทุกขั้น */
  let pn = 0;
  const proofs = [];
  for (const c of cards) {
    for (const run of c.channel_runs ?? []) {
      const slug = run.channel.toLowerCase().replace(/\s+/g, "-");
      const add = (type, tag, days) => proofs.push({
        id: `att_p${++pn}`, card_id: c.id, channel: run.channel, attachment_type: type,
        file_name: `${slug}-${tag}.png`, file_url: "", mime_type: "image/png", file_size: 240_000,
        sort_order: 0, uploaded_by: c.owner_id, created_at: iso(-days * DAY),
      });
      if (run.scheduled_at) add("schedule_proof", "scheduled", 5);
      if (run.post_url) add("live_proof", "live", 3);
      if (Object.values(run.metrics ?? {}).some((v) => v != null)) add("insight_proof", "insight", 2);
    }
  }

  /* รูปงานจริงที่เจ้าของแนบในขั้น Draft — การ์ดรอตรวจมีหลายรูปให้คนตรวจเลื่อนดู */
  const work = [
    { card: "CT-009", brand: ["#F26B21", "#B23c10"], name: "TEAMDEE",
      shots: ["เวอร์ชัน A — ทีมยืนหน้าร้าน", "เวอร์ชัน B — โคลสอัพเสื้อ", "แคปชัน + CTA"] },
    { card: "CT-010", brand: ["#A63D7A", "#6E2350"], name: "JUNTAKARN",
      shots: ["ปก — พนักงานใส่ชุดใหม่", "ภาพ 2 — ก่อน/หลัง", "ภาพ 3 — รายละเอียดผ้า", "ภาพ 4 — โลโก้ปัก", "CTA — ขอแคตตาล็อก"] },
    { card: "CT-011", brand: ["#3E63C4", "#24407e"], name: "t around",
      shots: ["เฟรมเปิด — รูปหมู่รุ่น", "ปั๊มชื่อรุ่นด้านหลัง", "CTA ทักไลน์"] },
  ];
  let wn = 0;
  const workAtts = work.flatMap((w) => w.shots.map((cap, i) => ({
    id: `att_w${++wn}`, card_id: w.card, attachment_type: "draft_work",
    file_name: `work-${w.card}-${i + 1}.png`,
    file_url: mockPoster(`งาน ${i + 1}`, `${w.name} · ${w.shots.length} รูป`, w.brand[0], w.brand[1]),
    mime_type: "image/png", file_size: 320_000, caption: cap, sort_order: i,
    uploaded_by: "u_arm", created_at: iso(-1 * DAY),
  })));

  return [
    ...proofs,
    ...workAtts,
    {
      id: "att_1", card_id: "CT-004", attachment_type: "brief_file",
      file_name: "brief-ปักหมุดทีม-W2.pdf", file_url: "", mime_type: "application/pdf",
      file_size: 482_000, uploaded_by: "u_arm", created_at: iso(-3 * DAY),
    },
    {
      id: "att_2", card_id: "CT-004", attachment_type: "brand_guideline",
      file_name: "TEAMDEE-brand-guideline.pdf", file_url: "", mime_type: "application/pdf",
      file_size: 2_140_000, uploaded_by: "u_ta", created_at: iso(-6 * DAY),
    },
    {
      id: "att_3", card_id: "CT-004", attachment_type: "reference",
      file_name: "ref-layout-countdown.png", file_url: mockPoster("เหลือ 12 ทีม", "TEAMDEE · countdown", "#F26B21", "#B23c10"), mime_type: "image/png",
      file_size: 356_000, caption: "ชอบ layout แบบนี้ — ตัวเลขใหญ่กลางภาพ",
      sort_order: 0, uploaded_by: "u_arm", created_at: iso(-2 * DAY),
    },
    // การ์ดที่รอตรวจ — ให้ Team Lead เห็นวัสดุอ้างอิงตอนตัดสิน
    {
      id: "att_4", card_id: "CT-009", attachment_type: "reference",
      file_name: "ref-founding-hero.png", file_url: mockPoster("Founding 20", "TEAMDEE · เปิดตัว", "#F26B21", "#B23c10"), mime_type: "image/png",
      file_size: 412_000, caption: "อ้างการจัดวางหัวข้อ ไม่เอาโทนสี",
      sort_order: 0, uploaded_by: "u_arm", created_at: iso(-2 * DAY),
    },
    {
      id: "att_6", card_id: "CT-010", attachment_type: "reference",
      file_name: "ref-uniform-set.png", file_url: mockPoster("ยูนิฟอร์ม", "JUNTAKARN · ชุดภาพ", "#A63D7A", "#6E2350"),
      mime_type: "image/png", caption: "อ้างการจัดหน้าปกชุด", sort_order: 0, uploaded_by: "u_earn", created_at: iso(-2 * DAY),
    },
    {
      id: "att_7", card_id: "CT-011", attachment_type: "reference",
      file_name: "ref-grad-shirt.png", file_url: mockPoster("รับปริญญา", "t around · รุ่น", "#3E63C4", "#24407e"),
      mime_type: "image/png", caption: "อ้าง pacing คลิป", sort_order: 0, uploaded_by: "u_neung", created_at: iso(-1 * DAY),
    },
    {
      id: "att_5", card_id: "CT-009", attachment_type: "brand_guideline",
      file_name: "TEAMDEE-CI-2026.pdf", file_url: "", mime_type: "application/pdf",
      file_size: 1_820_000, uploaded_by: "u_ta", created_at: iso(-9 * DAY),
    },
  ];
}
function buildSeedLinks() {
  return [
    {
      id: "lnk_1", card_id: "CT-004", title: "โพสต์เดิมที่ทำผลดี",
      url: "https://www.facebook.com/teamdee/posts/123", link_type: "facebook",
      note: "ยอดทัก 40+ ใน 2 วัน", created_by: "u_arm", created_at: iso(-3 * DAY),
    },
    {
      id: "lnk_2", card_id: "CT-004", title: "ไฟล์ออกแบบใน Figma",
      url: "https://figma.com/file/mock-teamdee-w2", link_type: "figma",
      created_by: "u_arm", created_at: iso(-2 * DAY),
    },
    {
      id: "lnk_3", card_id: "CT-008", title: "CI ล่าสุดใน Drive",
      url: "https://drive.google.com/drive/folders/mock-ci-teamdee", link_type: "google_drive",
      created_by: "u_arm", created_at: iso(-2 * DAY),
    },
  ];
}
/* ---------- โน้ตประจำการ์ด — คุยงานกันตรงนี้ ไม่ต้องไปตามหาในแชท ----------
   ตัวอย่างชุดเดียวกับการ์ดรอตรวจ (CT-009/010/011 มีรูปงานจริง) ให้เดโมเห็นภาพ */
const SEED_NOTES = [
  { id: "note_1", card_id: "CT-010", stage: "draft", author_id: "u_earn", pinned: true,
    text: "ลูกค้าขอเน้นภาพ \"ก่อน/หลัง\" เป็นภาพที่ 2 เสมอ — เคยเลื่อนไปท้ายแล้วยอด engage ตก", created_at: iso(-2.2 * DAY) },
  { id: "note_2", card_id: "CT-010", stage: "review", author_id: "u_ta", pinned: false,
    text: "โลโก้ปักในภาพ 4 ยังเบลอ ขอไฟล์คมกว่านี้ก่อน approve", created_at: iso(-0.4 * DAY) },
  { id: "note_3", card_id: "CT-009", stage: "brief", author_id: "u_arm", pinned: false,
    text: "อ้างอิงโทนจากโพสต์ Founding 10 ทีมแรก (ER 5.2%) — ใช้มุมกล้องเดิม แต่เปลี่ยนเสื้อเป็นรุ่นใหม่", created_at: iso(-3 * DAY) },
  { id: "note_4", card_id: "CT-011", stage: "draft", author_id: "u_neung", pinned: false,
    text: "รอคอนเฟิร์มชื่อรุ่นจากตัวแทนรุ่น ถ้าไม่ทันวันโพสต์ให้ใช้เวอร์ชันไม่ปั๊มชื่อไปก่อน", created_at: iso(-1.1 * DAY) },
];
export function buildSeed() {
  const cards = buildSeedCards();
  const { history, actions } = buildSeedHistoryAndActions(cards);
  const phantoms = buildPhantomCards(actions);
  // งานย้อนหลัง 12 สัปดาห์ (archived ทั้งหมด) — ให้ Dashboard มี trend/funnel จริง
  const backfill = buildBackfill();
  /* คลัง: ติดดาว "ต้นแบบ" + บทเรียนตัวอย่างให้ 2 งานที่ ER สูงสุด — เดโมเปิดมาเห็นภาพเลย
     เลือกแบบ deterministic จากข้อมูล backfill เอง ไม่ฮาร์ดโค้ดรหัส (รหัสเลื่อนแล้วไม่หลุด) */
  const allCards = [...cards, ...phantoms, ...backfill.cards];
  const topClosed = allCards
    .filter((c) => c.archived && c.metrics?.reach > 0 && c.metrics?.engagement != null)
    .sort((a, b) => (b.metrics.engagement / b.metrics.reach) - (a.metrics.engagement / a.metrics.reach))
    .slice(0, 2);
  for (const c of topClosed) c.starred = true;
  /* โปสเตอร์ให้งานคลัง ER สูงสุด 10 ใบ — คลัง/ปฏิทิน/popup มีรูปให้เลื่อนดูจริงตอนพรีเซนต์ */
  const BRAND_GRAD = { b_td: ["#F26B21", "#B23c10"], b_jt: ["#A63D7A", "#6E2350"], b_ta: ["#3E63C4", "#24407e"], b_jk: ["#1F6E4A", "#124430"] };
  const showcase = allCards
    .filter((c) => c.archived && c.metrics?.reach > 0 && c.metrics?.engagement != null)
    .sort((a, b) => (b.metrics.engagement / b.metrics.reach) - (a.metrics.engagement / a.metrics.reach))
    .slice(0, 10);
  const posters = showcase.map((c, i) => {
    const g = BRAND_GRAD[c.brand_id] ?? ["#5a6472", "#2b323c"];
    const bname = SEED_BRANDS.find((x) => x.id === c.brand_id)?.name ?? "";
    const er = ((c.metrics.engagement / c.metrics.reach) * 100).toFixed(1);
    return {
      id: `att_show${i + 1}`, card_id: c.id, attachment_type: "draft_work",
      file_name: `showcase-${c.id}.png`,
      file_url: mockPoster(`ER ${er}%`, `${bname} · ${c.title.slice(0, 22)}`, g[0], g[1]),
      mime_type: "image/png", file_size: 300_000, sort_order: 0,
      uploaded_by: c.owner_id, created_at: c.updated_at,
    };
  });
  const lessonNotes = topClosed.map((c, i) => ({
    id: `note_ls${i + 1}`, card_id: c.id, stage: "measured", kind: "lesson", author_id: c.owner_id, pinned: false,
    text: i === 0
      ? "Hook ที่เปิดด้วยคำถามลูกค้าจริงดัน ER แรงมาก — รอบหน้าเก็บคำถามจากคอมเมนต์มาใช้ต่อ"
      : "โพสต์ช่วง 19:00 คนเห็นเยอะกว่าเที่ยงเกือบเท่าตัว — งานสายนี้ล็อกเวลาค่ำไว้ก่อน",
    created_at: iso(-6 * DAY),
  }));
  return {
    version: DATA_VERSION,
    profiles: SEED_PROFILES,
    brands: SEED_BRANDS,
    cards: allCards,
    status_history: [...history, ...backfill.history],
    review_actions: actions,
    attachments: [...buildSeedAttachments(cards), ...posters],
    card_notes: [...SEED_NOTES, ...lessonNotes],
    reference_links: buildSeedLinks(),
    channels: SEED_CHANNELS,
    size_presets: SEED_SIZE_PRESETS,
    shot_types: SEED_SHOT_TYPES,
    scheduler_tools: SEED_SCHEDULER_TOOLS,
    video_lengths: SEED_VIDEO_LENGTHS,
    settings: SEED_SETTINGS,
  };
}
