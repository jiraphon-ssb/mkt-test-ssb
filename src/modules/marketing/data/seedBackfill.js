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
  /* ช่องทาง + มูลค่าออเดอร์ที่ปิดได้ = mock ไว้ให้หน้า Ads มีหลายช่องทางและคำนวณ ROAS ได้
     value = บาทต่อ 1 ลีดที่ปิดได้จริง (ต่างกันตามแบรนด์/ช่องทาง) */
  { week: 1, brandId: "b_jt", channel: "Facebook", spend: 4_500, cpl: 450, value: 1_900, title: "ads — ยูนิฟอร์มร้านอาหาร (ชุดแรก)" },
  { week: 2, brandId: "b_jt", channel: "Facebook", spend: 5_200, cpl: 430, value: 1_750, title: "ads — ยูนิฟอร์มร้านอาหาร (ทดสอบ creative)" },
  { week: 3, brandId: "b_ta", channel: "Facebook", spend: 2_400, cpl: 400, value: 2_100, title: "ads — t around ชุดทดลองช่องทางแชต" },
  { week: 4, brandId: "b_td", channel: "Facebook", spend: 3_000, cpl: 380, value: 2_600, title: "ads — เสื้อทีมองค์กร ชุดรีมาร์เก็ต" },
  { week: 5, brandId: "b_jk", channel: "Facebook", spend: 1_800, cpl: 520, value: 1_400, title: "ads — JK Design ชุดทดสอบ Reels" },
  { week: 6, brandId: "b_jt", channel: "Facebook", spend: 5_000, cpl: 320, value: 2_000, title: "ads — ยูนิฟอร์มร้าน ปรับ audience" },
  { week: 7, brandId: "b_ta", channel: "Facebook", spend: 3_100, cpl: 350, value: 1_850, title: "ads — t around ชุดวิดีโอสั้น" },
  { week: 8, brandId: "b_td", channel: "Facebook", spend: 3_800, cpl: 300, value: 2_400, title: "ads — เสื้อทีม จับกลุ่ม HR" },
  { week: 9, brandId: "b_jt", channel: "Facebook", spend: 5_600, cpl: 260, value: 2_200, title: "ads — ยูนิฟอร์ม ชุด creative ใหม่" },
  { week: 10, brandId: "b_td", channel: "Facebook", spend: 4_200, cpl: 235, value: 2_800, title: "ads — เสื้อทีม รอบสั่งผลิตปลายปี" },
  { week: 10, brandId: "b_jk", channel: "Facebook", spend: 2_200, cpl: 420, value: 1_600, title: "ads — JK Design ชุดคอลเลกชันใหม่" },
  { week: 11, brandId: "b_jt", channel: "Facebook", spend: 6_000, cpl: 220, value: 2_300, title: "ads — ยูนิฟอร์ม ขยายงบชุดที่ได้ผล" },
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
        format: "image", size: "1080x1350", channels: [plan.channel ?? "Facebook"],
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
        // ต้องมี impressions/clicks ด้วย ไม่งั้น CTR/CPM/ความถี่ รวมทั้งเดือนจะเพี้ยน
        // (ความถี่ = impressions ÷ reach ต้องไม่ต่ำกว่า 1)
        impressions: Math.round(reach * 1.35),
        clicks: Math.max(1, Math.round(reach * 1.35 * 0.018)),
        link_clicks: Math.max(1, Math.round(reach * 1.35 * 0.018)),
        spend: plan.spend,
        cpl: plan.spend / leads,
        /* mock: มูลค่าออเดอร์ที่ปิดได้จากลีดชุดนี้ — ใช้คำนวณ ROAS/%Ads ในหน้า Ads */
        revenue: plan.value == null ? null : Math.round(leads * plan.value * (0.75 + rnd() * 0.5)),
        measured_at: new Date(measuredMs).toISOString(),
      },
      created_at: new Date(publishMs - 14 * DAY).toISOString(),
      updated_at: new Date(measuredMs).toISOString(),
    });
  }
  return { cards, history };
}

/* ============================================================
   งบ + ค่าแอด "เดือนนี้" (mock) — ตารางเดียวคุมทั้งเพดานงบและยอดใช้จริง
   ให้การ์ดเกจบนหน้า Ads โชว์ % ของงบครบทุกแบรนด์ทุกช่องทาง (แบบ reference)
   used = สัดส่วนงบที่ใช้ไปแล้ว ณ ตอนนี้ · roas/er/cpl คุมให้ตัวเลขบนการ์ดสมจริง
   ============================================================ */
/* ครีเอทีฟ mock — decay คือความเสื่อมตามวันในเดือน (CTR ตก + ความถี่ขึ้น = คนเห็นซ้ำจนล้า)
   ตั้งให้มีทั้งตัวแรงคงที่ · ตัวกำลังล้า · ตัวอ่อน เพื่อให้ leaderboard มีเรื่องเล่าจริง */
const CREATIVES = [
  { name: "วิดีโอ 15 วิ — ปัญหาลูกค้าจริง", ctr: 0.028, freq: 1.2, roasMul: 1.35, decay: 0.05 },
  { name: "คาร์รูเซล — รีวิวลูกค้า 5 ราย", ctr: 0.021, freq: 1.4, roasMul: 1.00, decay: 0.55 },
  { name: "ภาพนิ่ง — ราคาโปรโมชัน", ctr: 0.014, freq: 1.6, roasMul: 0.75, decay: 0.30 },
  { name: "วิดีโอ 30 วิ — เบื้องหลังงานผลิต", ctr: 0.019, freq: 1.3, roasMul: 0.90, decay: 0.10 },
];

/* ชื่อแคมเปญ mock ใต้แพลตฟอร์ม — ให้ชั้นแพลตฟอร์มแตกดูต่อได้ */
const CAMPAIGNS = ["Always-on — คนเคยทัก", "Prospecting — กลุ่มใหม่", "Remarketing — คนดูแล้วไม่ทัก"];

/* แคมเปญ mock ใต้แพลตฟอร์ม — objective/สถานะ + "สัดส่วน" งบของแพลตฟอร์ม
   เก็บสัดส่วนไม่ใช่จำนวนเงิน: แก้งบแพลตฟอร์มที่หน้าตั้งค่าแล้วงบแคมเปญขยับตามเอง
   (ตรงกับ ad_daily_facts.level = 'campaign' ที่จะมาจาก API) */
export const CAMPAIGN_META = {
  "Always-on — คนเคยทัก":         { objective: "messages", status: "active", share: 0.45 },
  "Prospecting — กลุ่มใหม่":      { objective: "leads",    status: "active", share: 0.35 },
  "Remarketing — คนดูแล้วไม่ทัก": { objective: "messages", status: "active", share: 0.20 },
};

/** สัดส่วนงบ/objective/สถานะ ต่อ แบรนด์×แพลตฟอร์ม×แคมเปญ ของเดือนที่ anchor อยู่ */
export function buildCampaignBudgets(anchorMs = Date.now()) {
  const month = new Date(anchorMs).toISOString().slice(0, 7);
  return MONTH_ADS.flatMap((r) => Object.entries(CAMPAIGN_META).map(([campaign, m]) => ({
    brand_id: r.brand, channel: r.channel, campaign, month, share: m.share, objective: m.objective, status: m.status,
  })));
}

const MONTH_ADS = [
  /* แพลตฟอร์มต่อแบรนด์ (mock): TEAMDEE = Meta+Google · t around, JK Design = Meta · JUNTAKARN = Meta+Shopee+TikTok */
  { brand: "b_jt", channel: "Meta Ads",   budget: 30_000, used: 0.45, cpl: 380, roas: 3.3, er: 0.030, prev: 0.88, title: "ยูนิฟอร์มร้าน — Meta Ads เดือนนี้" },
  { brand: "b_jt", channel: "Shopee Ads", budget: 8_000,  used: 0.70, cpl: 260, roas: 5.1, er: 0.015, prev: 1.20, title: "ยูนิฟอร์มร้าน — Shopee Ads เดือนนี้" },
  { brand: "b_jt", channel: "TikTok Ads", budget: 10_000, used: 0.36, cpl: 610, roas: 1.9, er: 0.042, prev: 0.80, title: "ยูนิฟอร์มร้าน — TikTok Ads เดือนนี้" },
  { brand: "b_td", channel: "Meta Ads",   budget: 24_000, used: 0.55, cpl: 300, roas: 2.8, er: 0.031, prev: 1.06, title: "เสื้อทีมองค์กร — Meta Ads เดือนนี้" },
  { brand: "b_td", channel: "Google Ads", budget: 12_000, used: 0.48, cpl: 520, roas: 3.4, er: 0.018, prev: 0.90, title: "เสื้อทีมองค์กร — Google Ads เดือนนี้" },
  { brand: "b_ta", channel: "Meta Ads",   budget: 22_000, used: 0.25, cpl: 400, roas: 4.0, er: 0.024, prev: 0.75, title: "t around — Meta Ads เดือนนี้" },
  { brand: "b_jk", channel: "Meta Ads",   budget: 9_000,  used: 0.62, cpl: 450, roas: 2.2, er: 0.020, prev: 1.12, title: "JK Design — Meta Ads เดือนนี้" },
];

/* ---------- เป้ายอดขายรายเดือน (mock) ----------
   ใช้คู่กับบล็อก "ยอดขายเทียบเป้า" — ของจริงจะมาจากฝั่งขาย/ERP
   ตั้งให้สูงกว่ายอดที่ทำได้เล็กน้อย เพื่อให้เห็นเคส "ต่ำกว่าเป้า" จริง */
const SALES_TARGETS = [
  /* เป้ารายได้ต่อ แบรนด์ × แพลตฟอร์ม — อ่านคู่กับงบแอดของช่องทางเดียวกัน
     ("เป้าเท่านี้ ทำได้เท่าไร แล้วจ่ายค่าแอดไปเท่าไร") */
  { brand: "b_jt", channel: "Meta Ads",   amount: 280_000 },
  { brand: "b_jt", channel: "Shopee Ads", amount: 45_000 },
  { brand: "b_jt", channel: "TikTok Ads", amount: 25_000 },
  { brand: "b_td", channel: "Meta Ads",   amount: 240_000 },
  { brand: "b_td", channel: "Google Ads", amount: 60_000 },
  { brand: "b_ta", channel: "Meta Ads",   amount: 130_000 },
  { brand: "b_jk", channel: "Meta Ads",   amount: 100_000 },
];

/** เป้ายอดขายรายแบรนด์ของเดือนที่ anchor อยู่ (mock) */
export function buildSalesTargets(anchorMs = Date.now()) {
  const month = new Date(anchorMs).toISOString().slice(0, 7);
  return SALES_TARGETS.map((r, i) => ({
    id: `st_${i + 1}`, brand_id: r.brand, channel: r.channel, month, amount: r.amount,
  }));
}

/** งบราย แบรนด์×ช่องทาง ของเดือนที่ anchor อยู่ (mock) — คู่กับ MONTH_ADS ตัวเดียวกัน */
export function buildAdBudgets(anchorMs = Date.now()) {
  const month = new Date(anchorMs).toISOString().slice(0, 7);
  return MONTH_ADS.map((r, i) => ({
    id: `adb_${i + 1}`, brand_id: r.brand, channel: r.channel, month, amount: r.budget,
  }));
}

/** งานยิงแอด "เดือนนี้" หนึ่งใบต่อช่องทางในงบ — measured + archived (ไม่โผล่บอร์ด)
    spend ผูกกับงบตาม used เพื่อให้เกจตรงกับเพดานที่ตั้งไว้จริง */
export function buildMonthAds(anchorMs = Date.now()) {
  const now = new Date(anchorMs);
  const rnd = mulberry32(20260911);
  const cards = [];
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const daysInPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const dayNow = now.getDate();

  /** วันที่ออกใบในเดือนนั้น — step 1 = ทุกวัน (เดือนนี้ให้เส้นสะสมละเอียด) */
  const datesOf = (base, lastDay, step) => {
    const out = [];
    for (let d = 1; d <= lastDay; d += step) out.push(new Date(base.getFullYear(), base.getMonth(), d, 15, 0, 0));
    return out;
  };

  /** แจกยอดรวมลงวัน → แล้วแจกต่อลงแคมเปญตามสัดส่วน (CAMPAIGN_META.share) — บังคับผลรวมเท่าเดิมเป๊ะทั้งสองชั้น (เกจงบต้องไม่เพี้ยน)
      ทุกแคมเปญมีการ์ดทุกวันเหมือน daily facts จริง · วันสุดท้ายแบบ partial (วันนี้ = ครึ่งวัน) เมื่อ partialLast */
  const slug = (txt) => String(txt).replace(/[^a-z0-9]+/gi, "").toLowerCase();
  const emit = (r, dates, total, tag, partialLast = false) => {
    if (dates.length === 0 || total <= 0) return;
    const w = dates.map((_, i) => (0.7 + rnd() * 0.6) * (partialLast && i === dates.length - 1 ? 0.5 : 1));
    const sw = w.reduce((a, b) => a + b, 0);
    const campaigns = Object.entries(CAMPAIGN_META);
    let spent = 0;
    dates.forEach((date, i) => {
      const last = i === dates.length - 1;
      const daySpend = last ? total - spent : Math.round((total * w[i]) / sw);
      spent += daySpend;
      if (daySpend <= 0) return;
      /* ยิ่งปลายเดือน ครีเอทีฟที่ decay สูงจะ CTR ตกและความถี่ขึ้น */
      const wear = dates.length > 1 ? i / (dates.length - 1) : 0;
      const measuredMs = Math.min(now.getTime() - HOUR, date.getTime());
      let dayLeft = daySpend;
      campaigns.forEach(([campaign, meta], k) => {
        const spend = k === campaigns.length - 1 ? dayLeft : Math.round(daySpend * meta.share);
        dayLeft -= spend;
        if (spend <= 0) return;
        const cr = CREATIVES[(i + k) % CREATIVES.length];
        const leads = Math.max(1, Math.round(spend / r.cpl));
        const reach = Math.round(spend * 16);
        const impressions = Math.round(reach * (cr.freq + cr.decay * wear * 1.6));
        const clicks = Math.max(1, Math.round(impressions * cr.ctr * (1 - cr.decay * wear)));
        const engagement = Math.max(1, Math.round(reach * r.er));
        const revenue = Math.round(spend * r.roas * cr.roasMul);
        const newRevenue = Math.round(revenue * 0.62);
        cards.push({
          id: `ma_${tag}_${r.brand}_${slug(r.channel)}_${i}_${k}`,
          campaign,
          creative: cr.name,
          track: "project",
          status: "measured",
          brand_id: r.brand,
          owner_id: "u_fai",
          title: `ads — ${r.title}`,
          pillar: null,
          is_realtime: false,
          plan_confirmed: true,
          brief: backfillBrief({
            format: "image", size: "1080x1350", channels: [r.channel],
            publish_at: null,
            deadline_review: new Date(measuredMs - 3 * DAY).toISOString().slice(0, 10),
          }),
          draft_link: "https://drive.google.com/file/mock-ads",
          self_check: selfCheck(),
          first_pass: true,
          entered_review_at: null,
          archived: true,
          metrics: {
            reach, impressions, clicks, link_clicks: clicks, engagement, leads,
            conversions: leads,
            orders: null,
            spend,
            cpl: spend / leads,
            revenue,
            new_revenue: newRevenue,
            measured_at: new Date(measuredMs).toISOString(),
          },
          created_at: new Date(measuredMs - 10 * DAY).toISOString(),
          updated_at: new Date(measuredMs).toISOString(),
        });
      });
    });
  };

  for (const r of MONTH_ADS) {
    const total = Math.round(r.budget * r.used);
    /* เดือนนี้: ทุกวันรวมวันนี้ (ครึ่งวัน) — ผลรวมต้องเท่า budget × used พอดี (เกจอ้างอิงตัวนี้) */
    emit(r, datesOf(firstOfMonth, dayNow, 1), total, "cur", true);
    /* เดือนก่อน: ทุกวัน อัตราต่อวันเท่าเดือนนี้ × ตัวคูณของแบรนด์ → เทียบ "ณ วันเดียวกัน" ได้จริง */
    const perDay = total / Math.max(1, dayNow - 0.5);
    emit(r, datesOf(firstOfPrev, daysInPrev, 1), Math.round(perDay * (r.prev ?? 1) * daysInPrev), "prev");
  }
  return cards;
}
