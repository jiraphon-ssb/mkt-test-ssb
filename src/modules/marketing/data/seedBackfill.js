/* ============================================================
 Seed backfill — งานย้อนหลัง 12 สัปดาห์ สำหรับให้ Dashboard มีเนื้อจริง
 ทุกใบ measured + archived (ไม่โผล่ Board/ปฏิทิน) พร้อม status_history เต็มเส้น
 เพื่อให้ funnel / cycle time / trend คำนวณได้จากข้อมูลจริง ไม่ใช่ค่าสมมติ

 deterministic: ใช้ mulberry32 (seed คงที่) + anchor = จันทร์ต้นสัปดาห์
 → reset ข้อมูล demo กี่ครั้งก็ได้ชุดเดิมเป๊ะ (กราฟไม่กระโดดไปมา)

 เจตนา: ไม่สร้าง review_actions เพิ่ม — first-pass rate / Review SLA
 ในหน้าสถิติคำนวณจาก review_actions ล้วน ถ้าเติมจะทำให้ตัวเลขที่ทีมคุ้นเปลี่ยน
 ส่วน Dashboard ใช้ status_history ซึ่ง backfill มีครบทุกใบ
 ============================================================ */
const DAY = 86_400_000;
const HOUR = 3_600_000;
/** PRNG 32-bit — deterministic, ไม่ใช้ Math.random */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260726;
export const BACKFILL_WEEKS = 12;
/** จันทร์ 00:00 ของสัปดาห์ที่ ms อยู่ (local time — ตรงกับปฏิทินในแอพ) */
export function mondayOf(ms) {
  const d = new Date(ms);
  const dow = (d.getDay() + 6) % 7; // 0 = จันทร์
  d.setHours(0, 0, 0, 0);
  return d.getTime() - dow * DAY;
}
const lerp = (a, b, t) => a + (b - a) * t;
const STORIES = [
  {
    // grow — ทุ่มงานเยอะ ผลไต่ขึ้นชัด
    brandId: "b_td", ownerId: "u_arm", perWeek: 2,
    erAt: (w) => lerp(0.022, 0.045, w / (BACKFILL_WEEKS - 1)),
    reachAt: (w) => lerp(15_000, 55_000, w / (BACKFILL_WEEKS - 1)),
    pillars: ["sale_campaign", "social_proof", "knowledge", "sale_campaign"],
    channels: [["Facebook", "TikTok"], ["TikTok"], ["Facebook"], ["Reels", "TikTok"]],
    titles: [
      "ปักหมุดทีม — คลิปรีวิวทีมที่จองสิทธิ์",
      "เทียบผ้า 3 เกรด ให้เห็นความต่างจริง",
      "โพสต์นับถอยหลังรอบสั่งผลิต",
      "เบื้องหลังงานปักโลโก้ทีละตัว",
      "ทีมที่ใส่เสื้อเดียวกัน ทำงานเข้าขากว่า",
    ],
  },
  {
    // rebuild — เริ่มต่ำนิ่ง 4 สัปดาห์ แล้วค่อยฟื้น
    brandId: "b_jt", ownerId: "u_earn", perWeek: 2,
    erAt: (w) => (w < 4 ? 0.006 : lerp(0.006, 0.018, (w - 4) / (BACKFILL_WEEKS - 5))),
    reachAt: (w) => lerp(4_000, 12_000, w / (BACKFILL_WEEKS - 1)),
    pillars: ["brand", "knowledge", "brand", "social_proof"],
    channels: [["Facebook"], ["Facebook", "LINE OA"], ["Reels"]],
    titles: [
      "ชุดยูนิฟอร์มร้านที่พนักงานอยากใส่จริง",
      "รีโครงหน้าเว็บ — ก่อน/หลัง",
      "เสียงจากลูกค้าที่กลับมาสั่งซ้ำ",
      "ทำไมยูนิฟอร์มมีผลกับภาพลักษณ์ร้าน",
      "งานติดตั้งป้ายหน้าร้านล่าสุด",
    ],
  },
  {
    // maintain — นิ่ง คุณภาพคงที่
    brandId: "b_jk", ownerId: "u_earn", perWeek: 1,
    erAt: () => 0.020,
    reachAt: () => 22_000,
    pillars: ["social_proof", "knowledge", "social_proof", "brand"],
    channels: [["Facebook"], ["Facebook", "LINE OA"]],
    titles: [
      "ผลงานเสื้อกีฬาสี เทศบาลตำบล",
      "โพสต์เอกสารจัดซื้อครบ ยื่นงบไม่สะดุด",
      "งานเสื้อองค์กรส่งทันกำหนด",
      "รวมแบบที่หน่วยงานราชการสั่งบ่อย",
    ],
  },
  {
    brandId: "b_ta", ownerId: "u_neung", perWeek: 1,
    erAt: () => 0.018,
    reachAt: () => 17_000,
    pillars: ["social_proof", "brand", "knowledge", "social_proof"],
    channels: [["TikTok"], ["Reels"], ["Facebook", "TikTok"]],
    titles: [
      "คลิปเบื้องหลังงานปักรอบล่าสุด",
      "ผ้า cotton 100% ที่ลูกค้าถามบ่อยสุด",
      "เสื้อรับปริญญา ปั๊มชื่อรุ่นด้านหลัง",
      "รีวิวจากร้านที่สั่งครั้งที่สาม",
    ],
  },
];
/** งาน ads (track project) — CPL ลดลงเรื่อยๆ ตามการ optimize */
const ADS_PLAN = [
  { week: 1, brandId: "b_jt", spend: 4_500, cpl: 450, title: "ads — ยูนิฟอร์มร้านอาหาร (ชุดแรก)" },
  { week: 2, brandId: "b_jt", spend: 5_200, cpl: 430, title: "ads — ยูนิฟอร์มร้านอาหาร (ทดสอบ creative)" },
  { week: 4, brandId: "b_td", spend: 3_000, cpl: 380, title: "ads — เสื้อทีมองค์กร ชุดรีมาร์เก็ต" },
  { week: 6, brandId: "b_jt", spend: 5_000, cpl: 320, title: "ads — ยูนิฟอร์มร้าน ปรับ audience" },
  { week: 8, brandId: "b_td", spend: 3_800, cpl: 300, title: "ads — เสื้อทีม จับกลุ่ม HR" },
  { week: 9, brandId: "b_jt", spend: 5_600, cpl: 260, title: "ads — ยูนิฟอร์ม ชุด creative ใหม่" },
  { week: 10, brandId: "b_td", spend: 4_200, cpl: 235, title: "ads — เสื้อทีม รอบสั่งผลิตปลายปี" },
  { week: 11, brandId: "b_jt", spend: 6_000, cpl: 220, title: "ads — ยูนิฟอร์ม ขยายงบชุดที่ได้ผล" },
];
/* ---------- ตัวช่วยสร้าง ---------- */
const selfCheck = () => ({
  visual: true, logo: true, text_ratio: true, no_forbidden: true, data_verified: true, cta_clear: true,
});
function backfillBrief(over) {
  return {
    who_action: "กลุ่มเป้าหมายหลักของแบรนด์ → ทัก LINE ขอราคา",
    hook: "ประโยคเปิดที่ทดสอบแล้วได้ผลกับกลุ่มนี้",
    key_message: "จุดขายเดียวที่อยากให้จำ",
    cta: "ทัก LINE ขอใบเสนอราคา",
    fact_checked: true,
    format: "video", size: "9:16",
    deadline_review: null, channels: ["Facebook"], publish_at: null,
    layout_note: "hook 3 วิแรก · โลโก้มุมล่างขวา",
    mood: "จริงใจ เข้าถึงง่าย",
    ref_note: "อ้าง pacing ของคลิปอ้างอิง ไม่เอาโทนสี",
    ci_link: "https://drive.google.com/drive/folders/mock-ci",
    ...over,
  };
}
/** ชั่วโมงโพสต์ — อังคาร(1)/พฤหัส(3) ช่วงเย็น (18-20 น.) คือช่วงที่ผลดีเป็นพิเศษ
  ต้องแรงพอให้ค่าเฉลี่ยของ slot ทั้งช่อง (2 ชม.) สูงกว่าค่าเฉลี่ยทีมเกิน 30%
  ไม่งั้น heatmap/insight จะไม่ชี้ช่วงทองให้เห็นทั้งที่ตั้งใจใส่เรื่องไว้ */
const HOUR_POOL = [11, 13, 18, 19, 20];
const isHotspot = (dow, hour) => (dow === 1 || dow === 3) && (hour === 18 || hour === 19);
const HOTSPOT_BONUS = 1.55;
/**
* สร้างงานย้อนหลัง 12 สัปดาห์
* @param anchorMs เวลา "ปัจจุบัน" (จะถูก quantize เป็นจันทร์ต้นสัปดาห์)
*/
export function buildBackfill(anchorMs = Date.now()) {
  const rnd = mulberry32(SEED);
  const thisMonday = mondayOf(anchorMs);
  const cards = [];
  const history = [];
  /** สัปดาห์ w (0 = เก่าสุด, 11 = สัปดาห์ที่จบล่าสุด) เริ่มเมื่อไร
    ไม่แตะสัปดาห์ปัจจุบัน — งานที่เพิ่งโพสต์ยังวัดผลไม่ได้ (SOP รอ 7 วัน) */
  const weekStart = (w) => thisMonday - (BACKFILL_WEEKS - w) * 7 * DAY;
  const push = (id, cardId, from, to, at, by) => {
    history.push({
      id, card_id: cardId,
      from_status: from,
      to_status: to,
      moved_by: by, moved_at: new Date(at).toISOString(),
    });
  };
  /** เขียนเส้นทางชีวิตการ์ด (เดินถอยจากวันโพสต์) + คืนวันวัดผล */
  function writeHistory(cardId, ownerId, publishMs, rejected) {
    const draftDays = 2 + rnd() * 2; // ผลิตงาน 2-4 วัน
    const reviewHours = 6 + rnd() * 24; // รอตรวจ 6-30 ชม.
    const scheduledDays = 0.5 + rnd(); // ตั้งเวลาแล้วรอโพสต์
    let t = publishMs - scheduledDays * DAY; // เข้า scheduled
    const reviewOut = t;
    let reviewIn = reviewOut - reviewHours * HOUR; // เข้า review รอบสุดท้าย
    const marks = [];
    if (rejected) {
      // ตีกลับ: review → draft → review อีกครั้ง
      const fixDays = 1 + rnd();
      const firstReviewIn = reviewIn - fixDays * DAY - 12 * HOUR;
      const draftIn2 = firstReviewIn + 12 * HOUR;
      marks.push({ from: "review", to: "draft", at: draftIn2 });
      marks.push({ from: "draft", to: "review", at: reviewIn });
      reviewIn = firstReviewIn;
    }
    const draftIn = reviewIn - draftDays * DAY;
    const briefIn = draftIn - (1 + rnd()) * DAY;
    const ideaIn = briefIn - (1 + rnd()) * DAY;
    push(`bf_h_${cardId}_1`, cardId, null, "idea", ideaIn, ownerId);
    push(`bf_h_${cardId}_2`, cardId, "idea", "brief", briefIn, ownerId);
    push(`bf_h_${cardId}_3`, cardId, "brief", "draft", draftIn, ownerId);
    push(`bf_h_${cardId}_4`, cardId, "draft", "review", reviewIn, ownerId);
    marks.forEach((m, i) => push(`bf_h_${cardId}_r${i}`, cardId, m.from, m.to, m.at, m.to === "draft" ? "u_ta" : ownerId));
    push(`bf_h_${cardId}_5`, cardId, "review", "scheduled", reviewOut, "u_ta");
    push(`bf_h_${cardId}_6`, cardId, "scheduled", "published", publishMs, ownerId);
    t = publishMs + (7 + rnd() * 2) * DAY; // SOP: วัดผลหลังโพสต์ 7 วัน
    push(`bf_h_${cardId}_7`, cardId, "published", "measured", t, ownerId);
    // audit ปิดงาน (from === to ตามธรรมเนียมของ archiveCard)
    push(`bf_h_${cardId}_8`, cardId, "measured", "measured", t + rnd() * DAY, ownerId);
    return t;
  }
  /* ---------- งาน content ตามเส้นเรื่องของแต่ละ brand ---------- */
  for (let w = 0; w < BACKFILL_WEEKS; w++) {
    for (const story of STORIES) {
      for (let k = 0; k < story.perWeek; k++) {
        const idx = w * story.perWeek + k;
        const id = `bf_w${String(w).padStart(2, "0")}_${story.brandId}_${k}`;
        // วันโพสต์: จันทร์-เสาร์
        const dow = Math.floor(rnd() * 6);
        const hour = HOUR_POOL[Math.floor(rnd() * HOUR_POOL.length)];
        const publishMs = weekStart(w) + dow * DAY + hour * HOUR;
        // ตัวเลขตามเส้นเรื่อง + noise ±15% (+ โบนัสถ้าโพสต์ช่วงทอง)
        const noise = 0.85 + rnd() * 0.3;
        const bonus = isHotspot(dow, hour) ? HOTSPOT_BONUS : 1;
        const er = story.erAt(w) * noise * bonus;
        const reach = Math.round(story.reachAt(w) * (0.85 + rnd() * 0.3));
        const engagement = Math.max(1, Math.round(reach * er));
        const leads = Math.max(0, Math.round(engagement * (0.008 + rnd() * 0.012)));
        const rejected = rnd() < 0.2; // ~20% เคยถูกตีกลับ
        const measuredMs = writeHistory(id, story.ownerId, publishMs, rejected);
        cards.push({
          id,
          track: "content",
          status: "measured",
          brand_id: story.brandId,
          owner_id: story.ownerId,
          title: `${story.titles[idx % story.titles.length]} (W${w + 1})`,
          pillar: story.pillars[idx % story.pillars.length],
          is_realtime: false,
          plan_confirmed: true,
          brief: backfillBrief({
            channels: story.channels[idx % story.channels.length],
            publish_at: new Date(publishMs).toISOString(),
            deadline_review: new Date(publishMs - 3 * DAY).toISOString().slice(0, 10),
          }),
          draft_link: "https://drive.google.com/file/mock-backfill",
          self_check: selfCheck(),
          // ตรงกับเส้น history: ถูกตีกลับ = ไม่ผ่านรอบแรก ถาวร
          first_pass: !rejected,
          entered_review_at: null,
          archived: true,
          /* งานย้อนหลังบันทึกไว้ก่อนแยกตัวเลขรายช่องทาง — เก็บแค่ว่าลงช่องไหนบ้าง
             ยอดรวมยังอยู่ที่ metrics แล้วให้ rollupByChannel เฉลี่ยลงแต่ละช่องเอง */
          channel_runs: story.channels[idx % story.channels.length].map((ch) => ({
            channel: ch,
            scheduled_at: new Date(publishMs).toISOString(), scheduler_tool: "Meta Business Suite", schedule_ref: "",
            post_url: "https://facebook.com/mock/posts/backfill", posted_at: new Date(publishMs).toISOString(),
            live_ok: true, comments_handled: true, first_comment: "",
            metrics: {}, measured_at: new Date(measuredMs).toISOString(), note: "",
          })),
          metrics: {
            reach, engagement, leads,
            spend: null, cpl: null,
            measured_at: new Date(measuredMs).toISOString(),
          },
          created_at: new Date(publishMs - 14 * DAY).toISOString(),
          updated_at: new Date(measuredMs).toISOString(),
        });
      }
    }
  }
  /* ---------- งาน ads ---------- */
  for (const [i, plan] of ADS_PLAN.entries()) {
    const id = `bf_ads_${String(i).padStart(2, "0")}`;
    const dow = Math.floor(rnd() * 5);
    const hour = HOUR_POOL[Math.floor(rnd() * HOUR_POOL.length)];
    const publishMs = weekStart(plan.week) + dow * DAY + hour * HOUR;
    const leads = Math.max(1, Math.round(plan.spend / plan.cpl));
    const reach = Math.round(plan.spend * (14 + rnd() * 6));
    const engagement = Math.max(1, Math.round(reach * (0.012 + rnd() * 0.01)));
    const rejected = rnd() < 0.2;
    const measuredMs = writeHistory(id, "u_fai", publishMs, rejected);
    cards.push({
      id,
      track: "project",
      status: "measured",
      brand_id: plan.brandId,
      owner_id: "u_fai",
      title: `${plan.title} (W${plan.week + 1})`,
      pillar: null,
      is_realtime: false,
      plan_confirmed: true,
      brief: backfillBrief({
        format: "image", size: "1080x1350", channels: ["Facebook"],
        // งาน ads ไม่ผูกวันโพสต์ในปฏิทิน content — Dashboard จึงใช้ measured_at เป็นหลัก
        publish_at: null,
        deadline_review: new Date(publishMs - 3 * DAY).toISOString().slice(0, 10),
      }),
      draft_link: "https://drive.google.com/file/mock-ads",
      self_check: selfCheck(),
      // ต้องตรงกับเส้น history: ถูกตีกลับ = ไม่ผ่านรอบแรก
      first_pass: !rejected,
      entered_review_at: null,
      archived: true,
      metrics: {
        reach, engagement, leads,
        spend: plan.spend,
        cpl: plan.spend / leads,
        measured_at: new Date(measuredMs).toISOString(),
      },
      created_at: new Date(publishMs - 14 * DAY).toISOString(),
      updated_at: new Date(measuredMs).toISOString(),
    });
  }
  return { cards, history };
}
