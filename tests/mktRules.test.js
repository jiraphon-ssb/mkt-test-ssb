import { describe, it, expect } from "vitest";
import { validateTransition, applyApprove, applyReject, validateReject, isReviewOverdue, computeFirstPassRate, computeReviewSLA, flexSlotUsage, isIdeaPurgeDue, isStuck, stuckDays, canDecideReview, canDeleteCard, canEditCard, gatePercent, gateChecklist, meaningful, validateBriefForm, firstErrorField, briefRefCounts, metricsComplete, channelRuns, runMetricFields, normalizeRunMetrics, rollupCardMetrics, runProgress, channelKindOf, albumFrames, albumFilledCount, albumOutlineComplete, frameSize, isAlbum, sceneComplete, videoTimelineIssues, videoTimelineOk,
  sceneDetailCount, scenesCoverage, timelineGaps, timelineSummary, resultLabel, brandAverageER, pendingToolboxItems, weeklyTopBottom, } from "../src/modules/marketing/mktRules.js";
import { STAGE_META, stagesFor, selfCheckItems, ALL_SELF_CHECK_KEYS } from "../src/modules/marketing/mktEngine.js";
const NOW = "2026-07-24T09:00:00.000Z";
const settings = {
  sla_hours: 24,
  first_pass_target: 0.8,
  first_pass_window_weeks: 4,
  idea_purge_days: 60,
  flex_slot_per_week: 2,
};
const lead = { id: "u_lead", display_name: "คุณตะ", role: "team_lead", active: true };
const owner = { id: "u_arm", display_name: "อาร์ม", role: "content_owner", active: true };
const emptyBrief = {
  who_action: "", hook: "", key_message: "", cta: "", fact_checked: false,
  format: "", size: "", deadline_review: null, channels: [], publish_at: null,
  video_seconds: null, video_subtitle: false, video_scenes: [],
  aw_type: "single", album_count: null, album_frames: [],
  layout_note: "", mood: "", ref_note: "", ci_link: "",
};
/** ครบทั้ง ส่วนที่ 1 และ ส่วนที่ 2 ตาม Brief Template v2 */
const fullBrief = {
  who_action: "HR → ทัก LINE", hook: "เสื้อทีมที่ใส่แล้วรู้เลย", key_message: "สั่ง 20 แถม 1",
  cta: "ทัก LINE @teamdee", fact_checked: true, format: "image", size: "1080 × 1350 px",
  deadline_review: "2026-07-20", channels: ["TikTok"], publish_at: "2026-07-22T03:00:00.000Z",
  video_seconds: null, video_subtitle: false, video_scenes: [],
  aw_type: "single", album_count: null, album_frames: [],
  layout_note: "ตัวเลขใหญ่กลางภาพ", mood: "จริงใจ อบอุ่น", ref_note: "อ้าง pacing",
  ci_link: "https://drive.google.com/ci",
};
/** ส่วนที่ 1 ครบ แต่ ส่วนที่ 2 ยังไม่ครบ */
const part1Only = {
  ...fullBrief,
  format: "", size: "", publish_at: null,
  layout_note: "", mood: "", ref_note: "", ci_link: "",
};
const fullCheck = {
  visual: true, logo: true, text_ratio: true, no_forbidden: true, data_verified: true, cta_clear: true,
};
const emptyCheck = {
  visual: false, logo: false, text_ratio: false, no_forbidden: false, data_verified: false, cta_clear: false,
};
function card(over) {
  return {
    id: "c1", track: "content", status: "idea", brand_id: "b_td", owner_id: "u_arm",
    title: "การ์ดทดสอบ", pillar: "sale_campaign", is_realtime: false, plan_confirmed: true,
    brief: { ...emptyBrief }, draft_link: "", self_check: { ...emptyCheck },
    first_pass: null, entered_review_at: null, archived: false,
    created_at: NOW, updated_at: NOW, ...over,
  };
}
describe("validateTransition — เงื่อนไขจบ", () => {
  it("idea→brief ต้องมี pillar (content)", () => {
    expect(validateTransition(card({ pillar: null }), "brief", owner, NOW).ok).toBe(false);
    expect(validateTransition(card({ pillar: "brand" }), "brief", owner, NOW).ok).toBe(true);
  });
  it("brief→draft ต้องครบโจทย์ 4 + fact + deadline + channel", () => {
    expect(validateTransition(card({ status: "brief", brief: emptyBrief }), "draft", owner, NOW).ok).toBe(false);
    const r = validateTransition(card({ status: "brief", brief: fullBrief }), "draft", owner, NOW);
    expect(r.ok).toBe(true);
  });
  it("brief→draft บอกสิ่งที่ขาดชัดเจน", () => {
    const r = validateTransition(card({ status: "brief", brief: emptyBrief }), "draft", owner, NOW);
    expect(r.missing).toContain("Hook");
    expect(r.missing).toContain("CTA");
    expect(r.missing).toContain("ติ๊กยืนยันเช็ค Fact Sheet");
  });
  it("draft→review ต้องมีงาน (ลิงก์ หรือ รูปงาน) + self-check ครบ", () => {
    // ไม่มีทั้งลิงก์และรูป = ส่งไม่ได้
    expect(validateTransition(card({ status: "draft", draft_link: "", self_check: fullCheck }), "review", owner, NOW).ok).toBe(false);
    // มีลิงก์ แต่ self-check ไม่ครบ = ส่งไม่ได้
    expect(validateTransition(card({ status: "draft", draft_link: "http://x", self_check: emptyCheck }), "review", owner, NOW).ok).toBe(false);
    // มีลิงก์ + self-check ครบ = ผ่าน
    expect(validateTransition(card({ status: "draft", draft_link: "http://x", self_check: fullCheck }), "review", owner, NOW).ok).toBe(true);
    // ไม่มีลิงก์ แต่แนบรูปงาน ≥1 + self-check ครบ = ผ่าน
    const withWork = card({ status: "draft", draft_link: "", self_check: fullCheck });
    const workRefs = { refImages: 0, refLinks: 0, workImages: 1, channels: [], attachments: [] };
    expect(validateTransition(withWork, "review", owner, NOW, workRefs).ok).toBe(true);
    // ไม่มีลิงก์ ไม่มีรูป = ส่งไม่ได้ (ย้ำ)
    const noWork = { refImages: 0, refLinks: 0, workImages: 0, channels: [], attachments: [] };
    expect(validateTransition(withWork, "review", owner, NOW, noWork).ok).toBe(false);
  });
  it("ออกจาก review ด้วย drag = บล็อก ต้องใช้ปุ่ม", () => {
    const rApprove = validateTransition(card({ status: "review" }), "scheduled", lead, NOW);
    expect(rApprove.ok).toBe(false);
    expect(rApprove.buttonOnly).toBe("approve");
    const rReject = validateTransition(card({ status: "review" }), "draft", lead, NOW);
    expect(rReject.ok).toBe(false);
    expect(rReject.buttonOnly).toBe("reject");
  });
  it("ห้ามกระโดดข้ามขั้น", () => {
    expect(validateTransition(card({ status: "idea", pillar: "brand" }), "draft", owner, NOW).ok).toBe(false);
  });
  it("ถอยหลังได้ (ยกเว้นออกจาก review)", () => {
    expect(validateTransition(card({ status: "scheduled" }), "draft", owner, NOW).ok).toBe(true);
  });
  it("published→measured เตือนถ้ายังไม่ครบ 7 วัน แต่ฝืนได้", () => {
    const runs = [pubRun("TikTok")];
    const refs = proofRefs("c1", ["TikTok"]);
    const recent = card({
      status: "published", channel_runs: runs,
      brief: { ...fullBrief, publish_at: "2026-07-22T03:00:00.000Z" },
    });
    const r = validateTransition(recent, "measured", owner, NOW, refs);
    expect(r.ok).toBe(true);
    expect(r.warnConfirm).toBeTruthy();
    const old = card({
      status: "published", channel_runs: runs,
      brief: { ...fullBrief, publish_at: "2026-07-10T03:00:00.000Z" },
    });
    const r2 = validateTransition(old, "measured", owner, NOW, refs);
    expect(r2.ok).toBe(true);
    expect(r2.warnConfirm).toBeFalsy();
  });
  it("scheduled→published ต้องมี publish_at + ตั้งเวลาครบทุกช่องทาง (แคปไม่บังคับ)", () => {
    const refs = { refImages: 0, refLinks: 0, channels: CHANNELS, attachments: [] };
    expect(validateTransition(card({ status: "scheduled", brief: emptyBrief }), "published", owner, NOW, refs).ok).toBe(false);
    // มี publish_at แต่ยังไม่ได้ตั้งเวลาในช่องทางที่ Brief ระบุ = ยังไม่ผ่าน
    expect(validateTransition(card({ status: "scheduled", brief: fullBrief }), "published", owner, NOW, refs).ok).toBe(false);
    // ตั้งครบ = ผ่านเลย ไม่ต้องแนบแคป
    const ready = card({ status: "scheduled", brief: fullBrief, channel_runs: [schedRun("TikTok")] });
    expect(validateTransition(ready, "published", owner, NOW, refs).ok).toBe(true);
  });
});
describe("SOP ขั้น 1 — Idea ต้องยืนยันว่าอยู่ในแผน", () => {
  it("ไม่ยืนยัน = เดินไป Brief ไม่ได้ แม้มี Pillar", () => {
    const c = card({ status: "idea", pillar: "brand", plan_confirmed: false });
    const r = validateTransition(c, "brief", owner, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toContain("อยู่ในแผน");
  });
  it("ยืนยันแล้ว + มี Pillar = ผ่าน", () => {
    const c = card({ status: "idea", pillar: "brand", plan_confirmed: true });
    expect(validateTransition(c, "brief", owner, NOW).ok).toBe(true);
  });
  it("gateChecklist ไม่ติ๊กเองให้ (ต้องคนยืนยัน)", () => {
    const rows = gateChecklist(card({ status: "idea", plan_confirmed: false }));
    expect(rows.find((g) => g.label.includes("อยู่ในแผน"))?.done).toBe(false);
  });
});
describe("ค้างขั้นเดิม — วัดจาก status_history ไม่ใช่ updated_at", () => {
  const hist = (cardId, to, at) => ({ id: "h" + at, card_id: cardId, from_status: null, to_status: to, moved_by: "u_arm", moved_at: at });
  it("แก้การ์ดวันนี้ แต่ค้างขั้นเดิมมา 6 วัน = ยังนับว่าติดขัด", () => {
    const c = card({ id: "c1", status: "draft", updated_at: NOW }); // เพิ่งแก้
    const h = [hist("c1", "draft", "2026-07-18T09:00:00.000Z")]; // เข้าขั้นนี้ 6 วันก่อน
    expect(isStuck(c, 3, NOW)).toBe(false); // ฐานเดิม (updated_at) = พลาด
    expect(isStuck(c, 3, NOW, h)).toBe(true); // ฐานใหม่ = จับได้
    expect(stuckDays(c, NOW, h)).toBe(6);
  });
  it("ใช้เวลาย้ายครั้งล่าสุดของขั้นนั้น", () => {
    const c = card({ id: "c1", status: "draft" });
    const h = [
      hist("c1", "draft", "2026-07-10T09:00:00.000Z"),
      hist("c1", "review", "2026-07-12T09:00:00.000Z"),
      hist("c1", "draft", "2026-07-23T09:00:00.000Z"), // ตีกลับมา draft อีกรอบ
    ];
    expect(stuckDays(c, NOW, h)).toBe(1);
  });
  it("ไม่มี history = fallback updated_at (ไม่พังของเดิม)", () => {
    const c = card({ status: "draft", updated_at: "2026-07-19T09:00:00.000Z" });
    expect(stuckDays(c, NOW)).toBe(5);
  });
});
describe("วาระเติม Direction Pack + Top/Bottom สัปดาห์", () => {
  const act = (id, ref, at = NOW) => ({
    id: "a" + id, card_id: id, action: "reject", reason: "เหตุผล " + id,
    direction_pack_ref: ref, acted_by: "u_ta", acted_at: at, hours_in_review: 5,
  });
  it('เก็บเฉพาะตีกลับที่ชี้ข้อไม่ได้ (ref = "new")', () => {
    const items = pendingToolboxItems([
      act("c1", "new"),
      act("c2", "ส่วนที่ 2 — Visual: ตัวหนังสือเกิน 30%"),
      { ...act("c3", null), action: "approve" },
      act("c4", "new", "2026-07-20T09:00:00.000Z"),
    ]);
    expect(items.map((i) => i.cardId)).toEqual(["c1", "c4"]); // ใหม่สุดก่อน
    expect(items[0].reason).toBe("เหตุผล c1");
  });
  it("Top/Bottom เอาเฉพาะการ์ดที่วัดผลใน 7 วันล่าสุด", () => {
    const mk = (id, reach, eng, measuredAt) => card({ id, metrics: { reach, engagement: eng, leads: 1, spend: null, cpl: null, measured_at: measuredAt } });
    const cards = [
      mk("hi", 1000, 200, "2026-07-24T09:00:00.000Z"), // ER .20
      mk("mid", 1000, 100, "2026-07-23T09:00:00.000Z"), // ER .10
      mk("lo", 1000, 20, "2026-07-22T09:00:00.000Z"), // ER .02
      mk("old", 1000, 900, "2026-07-01T09:00:00.000Z"), // เกิน 7 วัน ไม่นับ
      card({ id: "none" }), // ยังไม่วัด
    ];
    const r = weeklyTopBottom(cards, 7, NOW);
    expect(r.count).toBe(3);
    expect(r.top?.card.id).toBe("hi");
    expect(r.bottom?.card.id).toBe("lo");
  });
  it("มีใบเดียว = โชว์ top ไม่ซ้ำ bottom · ไม่มีเลย = null", () => {
    const one = card({ id: "solo", metrics: { reach: 100, engagement: 10, leads: 0, spend: null, cpl: null, measured_at: NOW } });
    const r = weeklyTopBottom([one], 7, NOW);
    expect(r.top?.card.id).toBe("solo");
    expect(r.bottom).toBeNull();
    expect(weeklyTopBottom([], 7, NOW).top).toBeNull();
  });
});
/* ---- ตัวช่วยของ 3 ขั้นท้าย (แยกรายช่องทาง) ---- */
const CHANNELS = [
  { id: "c1", name: "TikTok", kind: "short_video", active: true },
  { id: "c2", name: "Facebook", kind: "feed", active: true },
  { id: "c3", name: "LINE OA", kind: "broadcast", active: true },
];
/** refs ที่แนบหลักฐานให้ครบทุกช่องทาง/ทุกขั้น */
const proofRefs = (cardId, chNames, types = ["schedule_proof", "live_proof", "insight_proof"]) => ({
  refImages: 1, refLinks: 1, channels: CHANNELS,
  attachments: chNames.flatMap((ch) => types.map((t) => ({
    card_id: cardId, channel: ch, attachment_type: t, mime_type: "image/png",
  }))),
});
const schedRun = (ch) => ({
  ...emptyRunLike(ch), scheduled_at: "2026-07-20T04:00:00.000Z", scheduler_tool: "Meta Business Suite",
});
const pubRun = (ch) => ({
  ...schedRun(ch), post_url: `https://x.test/${ch}`, posted_at: "2026-07-20T04:00:00.000Z",
  live_ok: true, comments_handled: true,
});
function emptyRunLike(channel) {
  return {
    channel, scheduled_at: null, scheduler_tool: "", schedule_ref: "",
    post_url: "", posted_at: null, live_ok: false, comments_handled: false, first_comment: "",
    metrics: {}, measured_at: null, note: "",
  };
}

describe("SOP ขั้น 5-7 — Scheduled / Published / Measured", () => {
  const pubBrief = { ...fullBrief, publish_at: "2026-07-10T03:00:00.000Z" };
  it("Scheduled: เช็คลิสต์ขึ้นทีละช่องทางตามที่ Brief ระบุ", () => {
    const c = card({
      status: "scheduled",
      brief: { ...fullBrief, channels: ["TikTok", "Facebook"] },
      channel_runs: [schedRun("TikTok")],
    });
    const refs = proofRefs(c.id, ["TikTok"]);
    const rows = gateChecklist(c, refs);
    expect(rows.find((r) => r.label.includes("TikTok"))?.done).toBe(true);
    expect(rows.find((r) => r.label.includes("Facebook"))?.done).toBe(false);
    const r = validateTransition(c, "published", owner, NOW, refs);
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toContain("Facebook");
  });
  it("Published: ทุกช่องทางต้องมีลิงก์ + ยืนยันขึ้นจริง + ดูแลคอมเมนต์", () => {
    const noChecks = card({ status: "published", brief: pubBrief });
    const r = validateTransition(noChecks, "measured", owner, NOW, proofRefs("c1", ["TikTok"]));
    expect(r.ok).toBe(false);
    const text = r.missing.join(" ");
    expect(text).toContain("ลิงก์โพสต์");
    expect(text).toContain("ยืนยันขึ้นจริง");
    expect(text).toContain("ดูแลคอมเมนต์");
  });
  it("Measured: ตัวเลขต้องครบก่อนปิดงาน", () => {
    const partial = card({
      status: "measured", brief: pubBrief,
      metrics: { reach: 1000, engagement: 50, leads: null, spend: null, cpl: null, measured_at: NOW },
    });
    expect(metricsComplete(partial)).toBe(false);
    expect(validateTransition(partial, "done", owner, NOW).ok).toBe(false);
    const full = card({
      status: "measured", brief: pubBrief,
      metrics: { reach: 1000, engagement: 50, leads: 5, spend: null, cpl: null, measured_at: NOW },
    });
    expect(metricsComplete(full)).toBe(true);
  });
  it("Measured: งาน ads (track project) บังคับ spend + CPL เพิ่ม", () => {
    const base = { reach: 1000, engagement: 50, leads: 5, measured_at: NOW };
    const ads = card({
      track: "project", pillar: null, status: "measured", brief: pubBrief,
      metrics: { ...base, spend: null, cpl: null },
    });
    expect(metricsComplete(ads)).toBe(false);
    const adsFull = card({
      track: "project", pillar: null, status: "measured", brief: pubBrief,
      metrics: { ...base, spend: 3000, cpl: 600 },
    });
    expect(metricsComplete(adsFull)).toBe(true);
  });
  it("ป้ายผลตามสูตร SOP: 🟢 เกินเฉลี่ย · 🟡 ตามเฉลี่ย · 🔴 ต่ำกว่าครึ่ง", () => {
    const mk = (reach, eng) => card({ status: "measured", metrics: { reach, engagement: eng, leads: 1, spend: null, cpl: null, measured_at: NOW } });
    // ค่าเฉลี่ย brand = ER 0.10
    expect(resultLabel(mk(1000, 150), 0.1)).toBe("green"); // ER 0.15 > 0.10
    expect(resultLabel(mk(1000, 100), 0.1)).toBe("yellow"); // ER 0.10 = เฉลี่ย
    expect(resultLabel(mk(1000, 40), 0.1)).toBe("red"); // ER 0.04 < 0.05
    expect(resultLabel(mk(1000, 0), null)).toBe("yellow"); // ยังไม่มีฐานเทียบ
    // ยังไม่กรอกตัวเลข = ไม่มีป้าย
    expect(resultLabel(card({ status: "measured" }), 0.1)).toBeNull();
  });
  it("brandAverageER เฉลี่ยจากการ์ดที่วัดผลแล้วของ brand นั้น", () => {
    const m = (reach, eng) => ({ reach, engagement: eng, leads: 1, spend: null, cpl: null, measured_at: NOW });
    const cards = [
      card({ id: "a", brand_id: "b_td", metrics: m(1000, 100) }), // ER .10
      card({ id: "b", brand_id: "b_td", metrics: m(1000, 200) }), // ER .20
      card({ id: "c", brand_id: "b_other", metrics: m(1000, 900) }), // brand อื่น ไม่นับ
      card({ id: "d", brand_id: "b_td" }), // ยังไม่วัด ไม่นับ
    ];
    expect(brandAverageER(cards, "b_td")).toBeCloseTo(0.15);
    // กันเทียบกับตัวเอง
    expect(brandAverageER(cards, "b_td", "b")).toBeCloseTo(0.10);
    expect(brandAverageER(cards, "b_none")).toBeNull();
  });
});
describe("Review gate — approve / reject", () => {
  it("approve ครั้งแรก set first_pass=true และไป scheduled", () => {
    const c = card({ status: "review", first_pass: null, entered_review_at: "2026-07-24T05:00:00.000Z" });
    const { card: updated, action } = applyApprove(c, lead, NOW);
    expect(updated.status).toBe("scheduled");
    expect(updated.first_pass).toBe(true);
    expect(action.hours_in_review).toBe(4);
  });
  it("approve หลังเคยถูกตีกลับ ไม่ล้าง first_pass=false", () => {
    const c = card({ status: "review", first_pass: false, entered_review_at: NOW });
    const { card: updated } = applyApprove(c, lead, NOW);
    expect(updated.first_pass).toBe(false); // ถาวร
  });
  it("reject ครั้งแรก set first_pass=false ถาวร และกลับ draft", () => {
    const c = card({ status: "review", first_pass: null, entered_review_at: NOW });
    const { card: updated } = applyReject(c, lead, { reason: "โลโก้ผิดตำแหน่ง", direction_pack_ref: "ข้อ 3" }, NOW);
    expect(updated.status).toBe("draft");
    expect(updated.first_pass).toBe(false);
  });
  it("reject ต้องมี reason + direction_pack_ref", () => {
    expect(validateReject({ reason: "", direction_pack_ref: "" }).ok).toBe(false);
    expect(validateReject({ reason: "สั้น", direction_pack_ref: "ข้อ 1" }).ok).toBe(false);
    expect(validateReject({ reason: "โลโก้ผิดตำแหน่งครับ", direction_pack_ref: "ข้อ 3" }).ok).toBe(true);
  });
  it("content_owner กด approve ไม่ได้ (throw)", () => {
    const c = card({ status: "review", entered_review_at: NOW });
    expect(() => applyApprove(c, owner, NOW)).toThrow();
  });
  it("project track: approve → done", () => {
    const c = card({ track: "project", status: "review", pillar: null, entered_review_at: NOW });
    const { card: updated } = applyApprove(c, lead, NOW);
    expect(updated.status).toBe("done");
  });
});
describe("overdue / stuck / purge", () => {
  it("review เกิน 24 ชม = overdue", () => {
    expect(isReviewOverdue(card({ status: "review", entered_review_at: "2026-07-23T05:00:00.000Z" }), settings, NOW)).toBe(true);
    expect(isReviewOverdue(card({ status: "review", entered_review_at: "2026-07-24T05:00:00.000Z" }), settings, NOW)).toBe(false);
  });
  it("ค้างขั้นเดิม > 3 วัน = stuck", () => {
    expect(isStuck(card({ status: "draft", updated_at: "2026-07-19T09:00:00.000Z" }), 3, NOW)).toBe(true);
    expect(isStuck(card({ status: "draft", updated_at: "2026-07-23T09:00:00.000Z" }), 3, NOW)).toBe(false);
  });
  it("idea เก่ากว่า 60 วัน = purge due", () => {
    expect(isIdeaPurgeDue(card({ status: "idea", updated_at: "2026-05-01T09:00:00.000Z" }), settings, NOW)).toBe(true);
    expect(isIdeaPurgeDue(card({ status: "idea", updated_at: "2026-07-01T09:00:00.000Z" }), settings, NOW)).toBe(false);
  });
});
describe("first-pass rate + SLA + flex", () => {
  const mkAction = (card_id, action, acted_at, hours = 5) => ({
    id: "a_" + card_id + action, card_id, action, reason: "", direction_pack_ref: null,
    acted_by: "u_lead", acted_at, hours_in_review: hours,
  });
  it("first-pass นับเฉพาะการตัดสินครั้งแรกของแต่ละการ์ด", () => {
    const cards = [card({ id: "c1", owner_id: "u_arm" }), card({ id: "c2", owner_id: "u_arm" })];
    const actions = [
      mkAction("c1", "reject", "2026-07-23T09:00:00.000Z"),
      mkAction("c1", "approve", "2026-07-23T15:00:00.000Z"), // ครั้งที่ 2 ไม่นับ
      mkAction("c2", "approve", "2026-07-23T09:00:00.000Z"),
    ];
    const [stat] = computeFirstPassRate(cards, actions, settings, ["u_arm"], NOW);
    expect(stat.total).toBe(2);
    expect(stat.passed).toBe(1);
    expect(stat.rate).toBeCloseTo(0.5);
  });
  it("SLA rate = % ภายใน 24 ชม", () => {
    const actions = [mkAction("c1", "approve", NOW, 10), mkAction("c2", "approve", NOW, 30)];
    const s = computeReviewSLA(actions, settings);
    expect(s.rate).toBeCloseTo(0.5);
    expect(s.avgHours).toBe(20);
  });
  it("flex slot นับ ⚡Realtime ในสัปดาห์", () => {
    const cards = [
      card({ id: "r1", is_realtime: true, brief: { ...fullBrief, publish_at: "2026-07-21T05:00:00.000Z" } }),
      card({ id: "r2", is_realtime: true, brief: { ...fullBrief, publish_at: "2026-07-23T05:00:00.000Z" } }),
      card({ id: "r3", is_realtime: false, brief: { ...fullBrief, publish_at: "2026-07-22T05:00:00.000Z" } }),
    ];
    const u = flexSlotUsage(cards, settings, "2026-07-20T00:00:00.000Z");
    expect(u.used).toBe(2);
    expect(u.remaining).toBe(0);
  });
});
describe("permissions", () => {
  it("เฉพาะ team_lead ตัดสิน review", () => {
    expect(canDecideReview(lead)).toBe(true);
    expect(canDecideReview(owner)).toBe(false);
  });
  it("owner ลบได้เฉพาะการ์ดตัวเองใน idea/brief", () => {
    expect(canDeleteCard(owner, card({ owner_id: "u_arm", status: "idea" }))).toBe(true);
    expect(canDeleteCard(owner, card({ owner_id: "u_arm", status: "draft" }))).toBe(false);
    expect(canDeleteCard(owner, card({ owner_id: "u_other", status: "idea" }))).toBe(false);
    expect(canDeleteCard(lead, card({ owner_id: "u_other", status: "draft" }))).toBe(true);
  });
});
describe("SOP ส่วนที่ 2 — ผลิต ต้องครบก่อนไป Draft", () => {
  const briefCard = (b, over = {}) => card({ status: "brief", brief: b, ...over });
  it("ส่วนที่ 1 ครบ แต่ ส่วนที่ 2 ไม่ครบ = ไปต่อไม่ได้", () => {
    const r = validateTransition(briefCard(part1Only), "draft", owner, NOW);
    expect(r.ok).toBe(false);
  });
  it.each([
    ["format", { format: "" }, "ประเภทไฟล์"],
    ["size", { size: "" }, "ขนาดภาพ"],
    ["publish_at", { publish_at: null }, "วัน–เวลาโพสต์"],
    ["layout_note", { layout_note: "" }, "Layout sketch"],
    ["mood", { mood: "" }, "Mood"],
  ])("ขาด %s อย่างเดียวก็ไปต่อไม่ได้ และบอกชื่อที่ขาด", (_n, patch, label) => {
    const r = validateTransition(briefCard({ ...fullBrief, ...patch }), "draft", owner, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing.some((m) => m.includes(label))).toBe(true);
  });
  it("track project ไม่บังคับวันโพสต์ (ไม่มีขั้น Scheduled)", () => {
    const proj = briefCard({ ...fullBrief, publish_at: null }, { track: "project", pillar: null });
    expect(validateTransition(proj, "draft", owner, NOW).ok).toBe(true);
    // แต่ track content ยังบังคับ
    expect(validateTransition(briefCard({ ...fullBrief, publish_at: null }), "draft", owner, NOW).ok).toBe(false);
  });
  it("gateChecklist: content ได้ 14 ข้อ · project ได้ 13 ข้อ · label ไม่ซ้ำ", () => {
    const content = gateChecklist(briefCard(fullBrief));
    const proj = gateChecklist(briefCard(fullBrief, { track: "project", pillar: null }));
    expect(content).toHaveLength(14);
    expect(proj).toHaveLength(13);
    expect(content.every((g) => g.done)).toBe(true);
    // label ซ้ำจะทำให้ React key ชนกัน
    const labels = content.map((g) => g.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it('"#" นับเป็น filler — ci_link = "#" ไม่ผ่าน', () => {
    expect(meaningful("#")).toBe(false);
    const r = validateTransition(briefCard({ ...fullBrief, ci_link: "#" }), "draft", owner, NOW);
    expect(r.ok).toBe(false);
  });
});
describe("ไฟล์แนบนับเข้า gate ได้ (Ref AW / ลิงก์ CI)", () => {
  const refEv = { refImages: 1, refLinks: 0 };
  const linkEv = { refImages: 0, refLinks: 1 };
  const briefCard = (b) => card({ status: "brief", brief: b });
  it("ref_note ว่าง + ไม่มีรูป = ไม่ผ่าน · มีรูปที่มีคำอธิบาย = ผ่าน", () => {
    const c = briefCard({ ...fullBrief, ref_note: "" });
    expect(validateTransition(c, "draft", owner, NOW).ok).toBe(false);
    expect(validateTransition(c, "draft", owner, NOW, refEv).ok).toBe(true);
  });
  it("ci_link ว่าง + ไม่มีลิงก์ = ไม่ผ่าน · มีลิงก์อ้างอิง = ผ่าน", () => {
    const c = briefCard({ ...fullBrief, ci_link: "" });
    expect(validateTransition(c, "draft", owner, NOW).ok).toBe(false);
    expect(validateTransition(c, "draft", owner, NOW, linkEv).ok).toBe(true);
  });
  it("gateChecklist ติ๊ก Ref AW ให้เมื่อมีรูป", () => {
    const c = briefCard({ ...fullBrief, ref_note: "" });
    const row = (ev) => gateChecklist(c, ev).find((g) => g.label.startsWith("Ref AW"));
    expect(row().done).toBe(false);
    expect(row(refEv).done).toBe(true);
  });
  it("validateBriefForm strict ต้องเห็นด้วยกับ gate (ไม่ฟ้อง ref_note ถ้ามีรูป)", () => {
    const c = briefCard({ ...fullBrief, ref_note: "" });
    expect(validateBriefForm(c, true, NOW).ref_note).toBeTruthy();
    expect(validateBriefForm(c, true, NOW, refEv).ref_note).toBeUndefined();
  });
  it("briefRefCounts: รูปไม่มีคำอธิบายไม่นับ · brand_guideline นับเป็นลิงก์ CI", () => {
    const atts = [
      { card_id: "c1", mime_type: "image/png", attachment_type: "reference", caption: "ชอบ layout" },
      { card_id: "c1", mime_type: "image/png", attachment_type: "reference", caption: "" },
      { card_id: "c1", mime_type: "application/pdf", attachment_type: "brand_guideline" },
      { card_id: "other", mime_type: "image/png", attachment_type: "reference", caption: "ของใบอื่น" },
    ];
    const links = [{ card_id: "c1" }, { card_id: "other" }];
    const ev = briefRefCounts("c1", atts, links);
    expect(ev.refImages).toBe(1); // นับเฉพาะรูปที่มีคำอธิบาย
    expect(ev.refLinks).toBe(2); // 1 ลิงก์ + 1 brand_guideline
  });
  it("ไม่ส่งหลักฐาน = พฤติกรรมเดิม (back-compat 4 args)", () => {
    expect(validateTransition(briefCard(fullBrief), "draft", owner, NOW).ok).toBe(true);
  });
});
describe("meaningful — CTA ที่เป็น filler ไม่นับว่าครบ", () => {
  it('"-" / "—" / "n/a" / "tbd" ไม่ผ่าน', () => {
    for (const v of ["-", "—", "n/a", "N/A", "tbd", "ไม่มี", " . "]) {
      expect(meaningful(v)).toBe(false);
    }
  });
  it("ข้อความจริงผ่าน", () => {
    expect(meaningful("ทัก LINE @teamdee")).toBe(true);
  });
  it('brief→draft ไม่ผ่านถ้า CTA = "-"', () => {
    const c = card({ status: "brief", brief: { ...fullBrief, cta: "-" } });
    const r = validateTransition(c, "draft", owner, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("CTA");
  });
  it("gateChecklist ก็ต้องไม่ติ๊ก CTA ให้", () => {
    const c = card({ status: "brief", brief: { ...fullBrief, cta: "—" } });
    const cta = gateChecklist(c).find((g) => g.label === "CTA");
    expect(cta?.done).toBe(false);
  });
});
describe("validateBriefForm — inline validation", () => {
  it("strict=false ไม่ด่าช่องว่าง (ระหว่างพิมพ์)", () => {
    const e = validateBriefForm(card({ status: "brief", brief: emptyBrief }), false, NOW);
    expect(e.hook).toBeUndefined();
    expect(e.cta).toBeUndefined();
  });
  it("strict=true บังคับ required ครบ", () => {
    const e = validateBriefForm(card({ status: "brief", brief: emptyBrief }), true, NOW);
    expect(e.who_action).toBeTruthy();
    expect(e.hook).toBeTruthy();
    expect(e.cta).toBeTruthy();
    expect(e.deadline_review).toBeTruthy();
    expect(e.channels).toBeTruthy();
    expect(e.fact_checked).toBeTruthy();
  });
  it('CTA "-" ผิดแม้ strict=false', () => {
    const e = validateBriefForm(card({ status: "brief", brief: { ...fullBrief, cta: "-" } }), false, NOW);
    expect(e.cta).toBeTruthy();
  });
  it("deadline ย้อนหลังผิด (การ์ดก่อน review)", () => {
    const e = validateBriefForm(card({ status: "brief", brief: { ...fullBrief, deadline_review: "2026-07-01" } }), false, NOW);
    expect(e.deadline_review).toBeTruthy();
  });
  it("การ์ดที่ผ่าน review ไปแล้ว ไม่ถูกด่าเรื่อง deadline ย้อนหลัง", () => {
    const e = validateBriefForm(card({ status: "published", brief: { ...fullBrief, deadline_review: "2026-07-01" } }), false, NOW);
    expect(e.deadline_review).toBeUndefined();
  });
  it("วันโพสต์ก่อน deadline ส่งตรวจ = ผิด", () => {
    const e = validateBriefForm(card({
      status: "brief",
      brief: { ...fullBrief, deadline_review: "2026-07-28", publish_at: "2026-07-26T03:00:00.000Z" },
    }), false, NOW);
    expect(e.publish_at).toBeTruthy();
  });
  it("firstErrorField คืนช่องแรกตามลำดับฟอร์ม", () => {
    const e = validateBriefForm(card({ status: "brief", brief: emptyBrief }), true, NOW);
    expect(firstErrorField(e)).toBe("who_action");
  });
});
describe("gatePercent", () => {
  it("review คืน null (รอ Team Lead)", () => {
    expect(gatePercent(card({ status: "review" }))).toBeNull();
  });
  it("brief ครบ = 100", () => {
    expect(gatePercent(card({ status: "brief", brief: fullBrief }))).toBe(100);
  });
});
/* ---------- อัตลักษณ์ประจำขั้น (STAGE_META) ---------- */
describe("STAGE_META — ข้อมูลประจำขั้นครบและไม่ทำลำดับเดิมเพี้ยน", () => {
  const ALL = ["idea", "brief", "draft", "review", "scheduled", "published", "measured", "done"];
  it("ครบทุก status และมี ชื่อ/สี/เจ้าของ/โจทย์ ทุกขั้น", () => {
    for (const s of ALL) {
      const m = STAGE_META[s];
      expect(m.id).toBe(s);
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^var\(--/);
      expect(m.owner.length).toBeGreaterThan(0);
      expect(m.question.length).toBeGreaterThan(0);
    }
  });
  it("ลำดับขั้นของทั้งสอง track ไม่เปลี่ยนจากเดิม", () => {
    expect(stagesFor("content").map((s) => s.id))
      .toEqual(["idea", "brief", "draft", "review", "scheduled", "published", "measured"]);
    expect(stagesFor("project").map((s) => s.id))
      .toEqual(["idea", "brief", "draft", "review", "done"]);
    expect(stagesFor("content").map((s) => s.name))
      .toEqual(["Idea", "Brief", "Draft", "Review", "Scheduled", "Published", "Measured"]);
  });
  it("Review เป็นของ Team Lead — ตรงกับกติกาที่ระบบบังคับ", () => {
    expect(STAGE_META.review.owner).toBe("Team Lead");
  });
});
/* ---------- ขั้น Idea ไม่ต้องกรอก Brief ล่วงหน้า ---------- */
describe("Idea → Brief ต้องไม่เรียกร้อง Brief ล่วงหน้า", () => {
  const bareIdea = card({
    status: "idea", plan_confirmed: true, pillar: "knowledge", brief: emptyBrief,
  });
  it("ยืนยันคุ้มทำ + มี Pillar = เดินไป Brief ได้ แม้ Brief ยังว่างทั้งใบ", () => {
    expect(validateTransition(bareIdea, "brief", owner, NOW).ok).toBe(true);
  });
  it("ไม่ยืนยันคุ้มทำ = เดินไม่ได้ (คนต้องตัดสิน ไม่ผ่านอัตโนมัติ)", () => {
    const r = validateTransition({ ...bareIdea, plan_confirmed: false }, "brief", owner, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toContain("คุ้มทำ");
  });
  it("ไม่ระบุ Pillar = เดินไม่ได้ (เงื่อนไขจบของขั้น Idea)", () => {
    const r = validateTransition({ ...bareIdea, pillar: null }, "brief", owner, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing.join(" ")).toContain("Pillar");
  });
});

describe("ชนิดชิ้นงาน — AW เดี่ยว vs ชุดภาพ (album)", () => {
  const refs = { refImages: 1, refLinks: 1 };
  const single = card({ status: "brief", brief: { ...fullBrief } });
  const albumBare = card({ status: "brief", brief: { ...fullBrief, aw_type: "album" } });
  const albumOk = card({
    status: "brief",
    brief: {
      ...fullBrief, aw_type: "album", album_count: 3,
      album_frames: [
        { text: "ปก — hook", size: "1080 × 1080 px" },
        { text: "ปัญหา", size: "1080 × 1350 px" },
        { text: "CTA", size: "1080 × 1350 px" },
      ],
    },
  });

  it("เดี่ยวไม่ต้องกรอกจำนวนภาพ/โครงเรื่อง — ผ่าน gate ได้", () => {
    expect(gatePercent(single, refs)).toBe(100);
    expect(validateTransition(single, "draft", lead, settings, NOW).ok).toBe(true);
  });

  it("ชุดภาพที่ไม่บอกจำนวน/โครงเรื่อง ไปขั้น Draft ไม่ได้", () => {
    expect(gatePercent(albumBare, refs)).toBeLessThan(100);
    expect(validateTransition(albumBare, "draft", lead, settings, NOW).ok).toBe(false);
    const rows = gateChecklist(albumBare, refs);
    expect(rows.filter((r) => !r.done).map((r) => r.label)).toEqual([
      "จำนวนภาพในชุด (≥2)",
      "รายภาพครบ (ข้อความ + ขนาด)",
    ]);
  });

  it("ชุดภาพที่กรอกครบ ผ่าน gate เท่ากับงานเดี่ยว", () => {
    expect(gatePercent(albumOk, refs)).toBe(100);
    expect(validateTransition(albumOk, "draft", lead, settings, NOW).ok).toBe(true);
  });

  it("ชุดภาพ 1 ภาพ ไม่นับเป็นชุด", () => {
    const one = card({ status: "brief", brief: { ...albumOk.brief, album_count: 1 } });
    expect(validateBriefForm(one, true, NOW, refs).album_count).toBeTruthy();
  });

  it("กรอกโครงเรื่องไม่ครบทุกภาพ = ยังไปต่อไม่ได้", () => {
    const partial = card({
      status: "brief",
      brief: { ...albumOk.brief, album_count: 4,
        album_frames: [{ text: "ปก", size: "1080 × 1080 px" }, { text: "ปัญหา", size: "1080 × 1350 px" }] },
    });
    expect(albumFilledCount(partial.brief)).toBe(2);
    expect(albumOutlineComplete(partial.brief)).toBe(false);
    expect(validateTransition(partial, "draft", lead, settings, NOW).ok).toBe(false);
    expect(validateBriefForm(partial, true, NOW, refs).album_frames).toContain("2/4");
  });

  it("ชุดภาพต้องระบุขนาด 'รายภาพ' — ไม่มีขนาดกลางของชุดแล้ว", () => {
    const noSize = { ...albumOk.brief, album_frames: albumOk.brief.album_frames.map((f) => ({ ...f, size: "" })) };
    expect(albumOutlineComplete(noSize)).toBe(false);
    expect(albumOutlineComplete(albumOk.brief)).toBe(true);
    expect(frameSize(albumOk.brief, albumFrames(albumOk.brief)[0])).toBe("1080 × 1080 px");
  });

  it("ฟอร์มขึ้น error เฉพาะตอนเป็นชุดภาพ", () => {
    expect(validateBriefForm(albumBare, true, NOW, refs).album_frames).toBeTruthy();
    expect(validateBriefForm(single, true, NOW, refs).album_frames).toBeUndefined();
  });
});

describe("ประเภทไฟล์ — ภาพนิ่ง vs คลิป ถามคนละชุด", () => {
  const refs = { refImages: 1, refLinks: 1 };
  const videoFull = {
    ...fullBrief, format: "video", size: "9:16",
    video_seconds: 30, video_subtitle: true,
    video_scenes: [
      { from: 0, to: 5, what: "พนักงานถอดชุดเก่าโยนทิ้ง" },
      { from: 5, to: 30, what: "ใส่ชุดใหม่ + CTA" },
    ],
    layout_note: "",   // คลิปไม่ต้องมี layout sketch
  };
  const vCard = (over = {}) => card({ status: "brief", brief: { ...videoFull, ...over } });

  it("คลิปกรอกครบ ผ่าน gate โดยไม่ต้องมี Layout sketch", () => {
    expect(gatePercent(vCard(), refs)).toBe(100);
    expect(validateTransition(vCard(), "draft", lead, settings, NOW).ok).toBe(true);
  });

  it("คลิปที่ไม่บอกความยาว/ไทม์ไลน์ ไปต่อไม่ได้", () => {
    const bare = vCard({ video_seconds: null, video_scenes: [] });
    const r = validateTransition(bare, "draft", lead, settings, NOW);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("ความยาวคลิป");
    expect(r.missing.some((m) => m.includes("อย่างน้อย 2 ฉาก"))).toBe(true);
  });

  it("ไทม์ไลน์ต้องเริ่มวินาที 0 · ห้ามทับกัน · ห้ามเกินความยาวคลิป", () => {
    expect(videoTimelineIssues({ ...videoFull, video_scenes: [{ from: 2, to: 5, what: "x" }, { from: 5, to: 9, what: "y" }] }))
      .toContain("ฉากแรกต้องเริ่มที่วินาที 0");
    expect(videoTimelineIssues({ ...videoFull, video_scenes: [{ from: 0, to: 9, what: "x" }, { from: 5, to: 12, what: "y" }] })
      .some((m) => m.includes("เวลาทับ"))).toBe(true);
    expect(videoTimelineIssues({ ...videoFull, video_scenes: [{ from: 0, to: 9, what: "x" }, { from: 9, to: 99, what: "y" }] }))
      .toContain("ฉากสุดท้ายยาวเกินความยาวคลิป");
    expect(videoTimelineOk(videoFull)).toBe(true);
  });

  it("ฉากสุดท้ายคือ CTA — ต้องบอกว่าให้คนดูทำอะไรต่อ", () => {
    const v = { ...videoFull, video_scenes: [
      { from: 0, to: 5, what: "hook" }, { from: 5, to: 30, what: "   " },
    ] };
    expect(videoTimelineIssues(v).some((m) => m.includes("CTA"))).toBe(true);
  });

  it("ครอบคลุมกี่วิ + ช่องว่างที่ยังไม่มีฉากรับผิดชอบ", () => {
    const v = { ...videoFull, video_seconds: 30, video_scenes: [
      { from: 0, to: 5, what: "a" }, { from: 10, to: 20, what: "b" },
    ] };
    expect(scenesCoverage(v)).toBe(15);
    expect(timelineGaps(v)).toEqual([{ from: 5, to: 10 }, { from: 20, to: 30 }]);
    const sum = timelineSummary(v);
    expect(sum.count).toBe(2);
    expect(sum.gapSeconds).toBe(15);
  });

  it("ช่วงที่ทับกันไม่นับซ้ำในความครอบคลุม", () => {
    const v = { ...videoFull, video_seconds: 20, video_scenes: [
      { from: 0, to: 12, what: "a" }, { from: 8, to: 20, what: "b" },
    ] };
    expect(scenesCoverage(v)).toBe(20);
  });

  it("นับช่องที่ควรมีของแต่ละฉากได้", () => {
    expect(sceneDetailCount({ what: "x" })).toBe(0);
    expect(sceneDetailCount({ what: "x", shot: "ไวด์", who: "ทีม", place: "ร้าน", screen_text: "t", audio: "เพลง" })).toBe(5);
  });

  it("ภาพนิ่งไม่โดนกติกาไทม์ไลน์เลย", () => {
    expect(videoTimelineIssues({ ...fullBrief, video_scenes: [] })).toEqual([]);
    expect(videoTimelineOk({ ...fullBrief })).toBe(true);
  });

  it("ฉากที่ไม่บอกว่าเห็นอะไร = ไทม์ไลน์ยังไม่ผ่าน", () => {
    const v = { ...videoFull, video_scenes: [{ from: 0, to: 5, what: "" }, { from: 5, to: 30, what: "ok" }] };
    expect(sceneComplete(v.video_scenes[0])).toBe(false);
    expect(videoTimelineOk(v)).toBe(false);
  });

  it("ภาพนิ่งไม่ถูกถามเรื่องความยาวคลิป", () => {
    const rows = gateChecklist(card({ status: "brief", brief: fullBrief }), refs);
    expect(rows.some((r) => r.label.includes("ความยาวคลิป"))).toBe(false);
    expect(validateBriefForm(card({ status: "brief", brief: fullBrief }), true, NOW, refs).video_seconds).toBeUndefined();
  });

  it("คลิปไม่มีชุดภาพ — เลือก album ไว้ก็ไม่นับ", () => {
    const v = vCard({ aw_type: "album", album_count: 5, album_frames: [] });
    expect(isAlbum(v.brief)).toBe(false);
    expect(validateTransition(v, "draft", lead, settings, NOW).ok).toBe(true);
  });
});

/* ============================================================
 Self-check — ข้อไม่เท่ากันระหว่างภาพนิ่งกับคลิป
 ============================================================ */
describe("Self-check แยกตามชนิดงาน", () => {
  it("ภาพนิ่งถามเรื่องตัวหนังสือบนภาพ · คลิปไม่ถาม", () => {
    const img = selfCheckItems({ format: "image" }).map((i) => i.key);
    const vid = selfCheckItems({ format: "video" }).map((i) => i.key);
    expect(img).toContain("text_ratio");
    expect(vid).not.toContain("text_ratio");
  });

  it("คลิปถามเรื่องซับโดน UI บัง + ความยาวตรงไทม์ไลน์", () => {
    const vid = selfCheckItems({ format: "video" }).map((i) => i.key);
    expect(vid).toContain("sub_safe");
    expect(vid).toContain("timeline_match");
  });

  it("ข้อร่วมมีครบทั้งสองชนิด", () => {
    for (const f of ["image", "video"]) {
      const keys = selfCheckItems({ format: f }).map((i) => i.key);
      for (const k of ["visual", "logo", "no_forbidden", "data_verified", "cta_clear"]) {
        expect(keys).toContain(k);
      }
    }
  });

  it("ALL_SELF_CHECK_KEYS ครอบคีย์ของทั้งสองชนิด — การ์ดจะได้ไม่มีคีย์ undefined", () => {
    for (const f of ["image", "video"]) {
      for (const it of selfCheckItems({ format: f })) {
        expect(ALL_SELF_CHECK_KEYS).toContain(it.key);
      }
    }
  });

  it("gate ของขั้น Draft นับข้อตามชนิดงาน ไม่ใช่ 6 ข้อตายตัว", () => {
    const base = { status: "draft", track: "content", draft_link: "https://x.test/f", self_check: {} };
    const imgRows = gateChecklist({ ...base, brief: { ...fullBrief, format: "image" } });
    const vidRows = gateChecklist({ ...base, brief: { ...fullBrief, format: "video" } });
    expect(vidRows.length).toBe(imgRows.length + 1);   /* คลิปมี 2 ข้อเฉพาะ ภาพนิ่งมี 1 */
  });
});

/* ============================================================
 3 ขั้นท้ายแยกรายช่องทาง — ตัวเลข · หลักฐาน · ผลรวม
 ============================================================ */
describe("รายช่องทาง — ตัวเลขตามชนิด + ผลรวมของการ์ด", () => {
  const twoCh = { ...fullBrief, channels: ["TikTok", "LINE OA"] };

  it("แถวช่องทางยาวเท่า brief.channels เสมอ — เพิ่ม/ลบช่องทางแล้วปรับตาม", () => {
    const c = card({ brief: twoCh, channel_runs: [schedRun("TikTok")] });
    expect(channelRuns(c).map((r) => r.channel)).toEqual(["TikTok", "LINE OA"]);
    /* ตัดช่องทางออกจากบรีฟ แถวก็หายไป แต่ข้อมูลช่องที่เหลือไม่หาย */
    const one = card({ brief: { ...fullBrief, channels: ["TikTok"] }, channel_runs: c.channel_runs });
    expect(channelRuns(one)).toHaveLength(1);
    expect(channelRuns(one)[0].scheduler_tool).toBe("Meta Business Suite");
  });

  it("ช่องตัวเลขต่างกันตามชนิดช่องทาง — ไม่ถามของที่ช่องนั้นไม่มี", () => {
    const feed = runMetricFields("feed", false).map((f) => f.key);
    const vid = runMetricFields("short_video", false).map((f) => f.key);
    const cast = runMetricFields("broadcast", false).map((f) => f.key);
    expect(feed).toContain("reach");
    expect(feed).not.toContain("views");
    expect(vid).toContain("avg_watch_sec");
    expect(vid).not.toContain("reach");
    expect(cast).toContain("unique_open");
    expect(cast).not.toContain("impressions");
    /* lead ถามทุกชนิด · ads ถาม spend เพิ่ม */
    for (const set of [feed, vid, cast]) expect(set).toContain("leads");
    expect(runMetricFields("feed", true).map((f) => f.key)).toContain("spend");
  });

  it("แปลงตัวเลขเฉพาะช่องเป็น reach/engagement กลางได้ถูกต้อง", () => {
    expect(normalizeRunMetrics({ metrics: { views: 900, engagement: 30 } }, "short_video").reach).toBe(900);
    const cast = normalizeRunMetrics({ metrics: { delivered: 500, unique_open: 200, clicks: 40 } }, "broadcast");
    expect(cast.reach).toBe(500);
    expect(cast.engagement).toBe(240);      /* เปิดอ่าน + คลิก */
    expect(normalizeRunMetrics({ metrics: {} }, "feed").reach).toBeNull();
  });

  it("ตัวเลขรวมของการ์ด = ผลบวกทุกช่องทาง (คิดให้ ไม่ได้กรอกมือ)", () => {
    const c = card({
      brief: twoCh,
      channel_runs: [
        { ...pubRun("TikTok"), metrics: { views: 1000, engagement: 100, leads: 4 }, measured_at: NOW },
        { ...pubRun("LINE OA"), metrics: { delivered: 500, unique_open: 300, clicks: 20, leads: 6 }, measured_at: NOW },
      ],
    });
    const m = rollupCardMetrics(c, CHANNELS);
    expect(m.reach).toBe(1500);
    expect(m.engagement).toBe(420);         /* 100 + (300+20) */
    expect(m.leads).toBe(10);
    expect(m.measured_at).toBe(NOW);
  });

  it("ยังไม่มีช่องไหนกรอกเลย = ยังไม่ถือว่าวัดผล", () => {
    const m = rollupCardMetrics(card({ brief: twoCh }), CHANNELS);
    expect(m.reach).toBeNull();
    expect(m.leads).toBeNull();
  });

  it("ความคืบหน้ารายขั้นนับช่องที่กรอกครบ (แคปไม่นับ)", () => {
    /* ตั้งเวลาช่องเดียว = 1/2 · ครบทั้งสอง = 2/2 — ไม่ต้องมีแคป */
    const one = card({ brief: twoCh, channel_runs: [schedRun("TikTok")] });
    expect(runProgress(one, "scheduled", CHANNELS, [])).toEqual({ done: 1, total: 2, ok: false });
    const both = card({ brief: twoCh, channel_runs: [schedRun("TikTok"), schedRun("LINE OA")] });
    expect(runProgress(both, "scheduled", CHANNELS, [])).toEqual({ done: 2, total: 2, ok: true });
  });

  it("ตัวเลขบังคับของ TikTok กับ LINE OA คนละชุด — ขาดคนละอย่างกัน", () => {
    const c = card({
      status: "measured", brief: twoCh,
      channel_runs: [
        { ...pubRun("TikTok"), metrics: { views: 100, engagement: 5, leads: 1 } },   /* ขาด avg_watch_sec */
        { ...pubRun("LINE OA"), metrics: { delivered: 100, unique_open: 50, leads: 2 } },
      ],
    });
    const refs = proofRefs(c.id, ["TikTok", "LINE OA"]);
    const rows = gateChecklist(c, refs);
    const tt = rows.find((r) => r.label.includes("TikTok"));
    const line = rows.find((r) => r.label.includes("LINE OA"));
    expect(tt.done).toBe(false);
    expect(tt.label).toContain("ดูเฉลี่ย");
    expect(line.done).toBe(true);
  });

  it("ชนิดช่องทางที่ไม่รู้จักถือเป็นฟีด — ไม่พังถ้าลบช่องทางออกจากตั้งค่า", () => {
    expect(channelKindOf(CHANNELS, "ช่องที่ถูกลบ")).toBe("feed");
    expect(channelKindOf(undefined, "TikTok")).toBe("feed");
  });
});

describe("ปิดงานแล้ว = บันทึกถาวร", () => {
  const lead = { id: "u_lead", role: "team_lead" };
  const owner = { id: "u_own", role: "content_owner" };
  const closed = { id: "CT-X", owner_id: "u_own", status: "measured", archived: true };
  it("แก้ไม่ได้ทุก role รวมถึง team_lead", () => {
    expect(canEditCard(lead, closed, "u_own")).toBe(false);
    expect(canEditCard(owner, closed, "u_own")).toBe(false);
  });
  it("ลบไม่ได้ทุก role", () => {
    expect(canDeleteCard(lead, closed)).toBe(false);
    expect(canDeleteCard(owner, closed)).toBe(false);
  });
  it("ยังไม่ปิด — กติกาเดิมไม่เปลี่ยน", () => {
    const open = { ...closed, archived: false };
    expect(canEditCard(lead, open, "u_own")).toBe(true);
    expect(canEditCard(owner, open, "u_own")).toBe(true);
  });
});
