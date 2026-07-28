/* ============================================================
 Business rules — ระบบบังคับกติกา SOP เอง (Spec ข้อ 4)
 ทั้งหมดเป็น pure functions → test ได้ + ย้าย backend ไม่ต้องแก้
 ============================================================ */
import {
  stagesFor, selfCheckItems, SCENE_OPTIONAL,
  CHANNEL_METRIC_FIELDS, RUN_LEAD_FIELD, RUN_ADS_FIELDS, emptyRun,
} from "./mktEngine.js";
import { isValidUrl, normalizeUrl } from "./mktAttachments.js";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/* ---------- helpers ---------- */
export function stageIndex(track, status) {
  return stagesFor(track).findIndex((s) => s.id === status);
}
export function hoursBetween(fromISO, toISO) {
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / HOUR_MS;
}
export function daysBetween(fromISO, toISO) {
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / DAY_MS;
}
const NO_REFS = { refImages: 0, refLinks: 0, workImages: 0 };
/** นับหลักฐานของการ์ดใบหนึ่งจากตารางแนบ/ลิงก์ (รับ array ตรงๆ ไม่ผูกกับ app shell) */
export function briefRefCounts(cardId, attachments, links, channels = []) {
  const mine = attachments.filter((a) => a.card_id === cardId);
  return {
    /* พก attachments/channels ไปด้วย เพราะ gate ของ 3 ขั้นท้ายต้องเช็คหลักฐานรายช่องทาง
       และต้องรู้ชนิดช่องทางเพื่อรู้ว่าตัวเลขไหนบังคับ — ไม่ต้องแก้ signature ทุกจุด */
    attachments: mine, channels,
    // รูปที่ไม่มีคำอธิบาย = ยังไม่ได้ "ระบุแง่ที่อ้าง" จึงไม่นับ
    refImages: mine.filter((a) => a.mime_type.startsWith("image/") && meaningful(a.caption)).length,
    /* รูปงานจริงที่เจ้าของแนบในขั้น Draft — ใช้เป็นทางผ่านแทนลิงก์ Drive ได้ */
    workImages: mine.filter((a) => a.attachment_type === "draft_work").length,
    refLinks: links.filter((l) => l.card_id === cardId).length +
      mine.filter((a) => a.attachment_type === "brand_guideline").length,
  };
}
/* ---------- ชุดภาพ (album) ----------
   โครงเรื่องเก็บเป็นข้อความบรรทัดละภาพ — บรรทัดที่ i คือภาพที่ i
   ต้องกรอกครบทุกภาพ เพราะภาพที่เว้นว่างคือภาพที่คนทำต้องเดาเอง */
/** รายภาพของชุด — ยาวเท่า album_count เสมอ (เติมภาพเปล่าให้ถ้าข้อมูลสั้นกว่า) */
export function albumFrames(brief) {
  const n = Math.max(0, brief.album_count ?? 0);
  const src = Array.isArray(brief.album_frames) ? brief.album_frames : [];
  return Array.from({ length: n }, (_, i) => ({
    text: src[i]?.text ?? "", size: src[i]?.size ?? "", note: src[i]?.note ?? "",
  }));
}
/** ภาพนี้ถือว่ากรอกครบหรือยัง — ชุดภาพไม่มีขนาดกลาง จึงต้องระบุขนาดรายภาพเอง */
export function frameComplete(frame) {
  return meaningful(frame?.text) && meaningful(frame?.size);
}
/** กรอกครบทุกภาพหรือยัง */
export function albumOutlineComplete(brief) {
  if (brief.aw_type !== "album") return true;
  const frames = albumFrames(brief);
  return frames.length >= 2 && frames.every(frameComplete);
}
/** จำนวนภาพที่กรอกแล้ว — ใช้โชว์ตัวนับในฟอร์ม */
export function albumFilledCount(brief) {
  return albumFrames(brief).filter(frameComplete).length;
}
/** ขนาดที่ใช้จริงของภาพนั้น (ชุดภาพระบุรายภาพ · เผื่อข้อมูลเก่าถอยไปใช้ขนาดกลาง) */
export function frameSize(brief, frame) {
  return meaningful(frame?.size) ? frame.size : brief.size;
}
/* ---------- ไทม์ไลน์ฉากของคลิป ----------
   ฉากแรกคือ hook (ต้องเริ่มวินาที 0) จึงไม่มีช่อง "3 วิแรก" แยกอีก ไม่ถามซ้ำ
   ฉากสุดท้ายคือ CTA — บทบาทคิดจากตำแหน่ง ไม่เก็บในข้อมูล ย้ายฉากแล้วป้ายตามทันที */
/** ฉากทั้งหมด เรียงตามเวลาเริ่ม */
export function videoScenes(brief) {
  return [...(Array.isArray(brief.video_scenes) ? brief.video_scenes : [])]
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0));
}
/** ฉากนี้กรอกครบหรือยัง — บังคับ "เห็นอะไร" + ช่วงเวลาที่ถูกต้อง */
export function sceneComplete(sc) {
  return meaningful(sc?.what) && (sc?.to ?? 0) > (sc?.from ?? 0);
}
/** กรอกช่อง "ควรมี" ไปแล้วกี่ช่อง — ใช้โชว์ความละเอียดของฉาก */
export function sceneDetailCount(sc) {
  return SCENE_OPTIONAL.filter((f) => meaningful(sc?.[f.key])).length;
}
/** วินาทีที่ฉากครอบคลุมรวมกัน (ไม่นับช่วงที่ทับกัน) */
export function scenesCoverage(brief) {
  let covered = 0, cursor = 0;
  for (const sc of videoScenes(brief)) {
    const from = Math.max(sc.from ?? 0, cursor);
    const to = sc.to ?? 0;
    if (to > from) { covered += to - from; cursor = to; }
  }
  return covered;
}
/** ช่วงเวลาที่ยังไม่มีฉากรับผิดชอบ — เตือนอย่างเดียว ไม่บล็อกการส่ง */
export function timelineGaps(brief) {
  const total = brief.video_seconds ?? 0;
  const out = [];
  let cursor = 0;
  for (const sc of videoScenes(brief)) {
    if ((sc.from ?? 0) > cursor) out.push({ from: cursor, to: sc.from });
    cursor = Math.max(cursor, sc.to ?? 0);
  }
  if (total > cursor) out.push({ from: cursor, to: total });
  return out;
}
/** ปัญหาของไทม์ไลน์ — คืนรายการข้อความ ว่างแปลว่าใช้ได้ (นี่คือกติกาที่บล็อกการส่ง) */
export function videoTimelineIssues(brief) {
  if (brief.format !== "video") return [];
  const list = videoScenes(brief);
  const out = [];
  if (list.length < 2) out.push("ต้องมีอย่างน้อย 2 ฉาก");
  if (list.length > 0 && (list[0].from ?? 0) !== 0) out.push("ฉากแรกต้องเริ่มที่วินาที 0");
  const total = brief.video_seconds ?? 0;
  if (total > 0 && list.length > 0 && (list[list.length - 1].to ?? 0) > total)
    out.push("ฉากสุดท้ายยาวเกินความยาวคลิป");
  list.forEach((sc, i) => {
    if (!sceneComplete(sc)) out.push(`ฉาก ${i + 1} ยังไม่ครบ`);
    if (i > 0 && (sc.from ?? 0) < (list[i - 1].to ?? 0)) out.push(`ฉาก ${i + 1} เวลาทับกับฉากก่อนหน้า`);
  });
  /* ฉากท้าย = CTA โดยตำแหน่ง — บังคับให้มีเนื้อหาจริง ไม่งั้นคลิปจบลอย */
  if (list.length >= 2 && !meaningful(list[list.length - 1].what))
    out.push("ฉากสุดท้าย (CTA) ต้องระบุว่าให้คนดูทำอะไรต่อ");
  return out;
}
/** ไทม์ไลน์ใช้ได้ไหม */
export function videoTimelineOk(brief) {
  return videoTimelineIssues(brief).length === 0;
}
/** สรุปไทม์ไลน์ไว้โชว์บนการ์ด/ลิสต์/ปฏิทิน — จุดเดียวที่คิด ทุกจอจะได้ตรงกัน */
export function timelineSummary(brief) {
  const scenes = videoScenes(brief);
  const total = brief.video_seconds ?? 0;
  const covered = scenesCoverage(brief);
  return {
    scenes,
    count: scenes.length,
    filled: scenes.filter(sceneComplete).length,
    total,
    covered,
    gapSeconds: Math.max(0, total - covered),
    ok: videoTimelineOk(brief),
  };
}

/** ชุดภาพหรือไม่ — video เป็นชิ้นเดียวเสมอ ไม่มีชุด */
export function isAlbum(brief) {
  return brief.format === "image" && brief.aw_type === "album";
}

/** เงื่อนไขจบของ "ขั้นปัจจุบัน" — ใช้ทั้งเช็ค transition และวาด stitch/gate */
export function gateChecklist(card, refs = NO_REFS) {
  const b = card.brief;
  switch (card.status) {
    case "idea":
      return [
        // SOP: Owner ต้องยืนยันเอง ไม่ผ่านอัตโนมัติ
        { label: "อยู่ในแผน / Owner เห็นว่าคุ้มทำ", done: card.plan_confirmed === true },
        {
          label: "ระบุ Pillar / กลุ่มลูกค้าได้",
          done: card.track === "project" ? true : card.pillar != null,
        },
      ];
    case "brief":
      return [
        // ส่วนที่ 1 — โจทย์
        { label: "ใคร → ให้ทำอะไร", done: nonEmpty(b.who_action) },
        { label: "Hook", done: nonEmpty(b.hook) },
        { label: "Key message เดียว", done: nonEmpty(b.key_message) },
        { label: "CTA", done: meaningful(b.cta) },
        { label: "เช็คตัวเลขกับ Fact Sheet", done: b.fact_checked },
        // ส่วนที่ 2 — ผลิต (SOP: "ส่วนที่ 2 ครบ")
        { label: "ประเภทไฟล์ (ภาพ/คลิป)", done: b.format === "image" || b.format === "video" },
        { label: "Deadline ส่งตรวจ (เผื่อแก้ ≥2 วัน)", done: b.deadline_review != null },
        { label: "ช่องทาง ≥ 1", done: b.channels.length >= 1 },
        // track project ไม่มีขั้น Scheduled/Published จึงไม่บังคับวันโพสต์
        ...(card.track === "content"
          ? [{ label: "วัน–เวลาโพสต์", done: b.publish_at != null }]
          : []),
        // ---- แยกตามประเภทไฟล์: ไม่ถามซ้ำ ไม่ถามของที่ไม่เกี่ยว ----
        ...(b.format === "video"
          ? [
            { label: "อัตราส่วนคลิป", done: meaningful(b.size) },
            { label: "ความยาวคลิป (วินาที)", done: (b.video_seconds ?? 0) > 0 },
            { label: "ไทม์ไลน์ฉาก (ฉากแรก = hook)", done: videoTimelineOk(b) },
          ]
          : isAlbum(b)
            ? [
              { label: "จำนวนภาพในชุด (≥2)", done: (b.album_count ?? 0) >= 2 },
              { label: "รายภาพครบ (ข้อความ + ขนาด)", done: albumOutlineComplete(b) },
              { label: "Layout ร่วมทุกภาพ", done: meaningful(b.layout_note) },
            ]
            : [
              { label: "ขนาดภาพ", done: meaningful(b.size) },
              { label: "Layout sketch", done: meaningful(b.layout_note) },
            ]),
        { label: "Mood", done: meaningful(b.mood) },
        // Ref AW / ลิงก์ CI ผ่านได้ด้วยไฟล์แนบ — ไฟล์แนบจึงนับเข้า gate จริง
        { label: "Ref AW (ระบุแง่ที่อ้าง)", done: meaningful(b.ref_note) || refs.refImages > 0 },
        { label: "ลิงก์ CI", done: meaningful(b.ci_link) || refs.refLinks > 0 },
      ];
    case "draft":
      return [
        { label: "แนบงาน — ลิงก์ Drive หรือรูปงาน", done: nonEmpty(card.draft_link) || refs.workImages > 0 },
        ...selfCheckRows(card),
      ];
    case "review":
      return [
        { label: "Team Lead กด Approve / ตีกลับ", done: false },
      ];
    /* 3 ขั้นท้ายเช็ครายช่องทาง — ช่องทางละบรรทัด บอกตรงๆ ว่าใบไหนขาดอะไร
       (เดิมเป็นบรรทัดรวม ติ๊กผ่านทั้งที่อีก 2 ช่องทางยังไม่ได้ทำ) */
    case "scheduled":
      // SOP: "โพสต์ถูกตั้งเวลาในระบบจริงแล้วทุกช่องทาง (ไม่ใช่ 'เดี๋ยวคืนนี้ค่อยตั้ง')"
      return [
        { label: "มีวัน-เวลาโพสต์ในการ์ด", done: card.brief.publish_at != null },
        ...runRows(card, "scheduled", refs),
      ];
    case "published":
      // SOP: ขึ้นจริง + ดูแลคอมเมนต์ 24 ชม.แรก + ครบ 7 วัน
      return [
        ...runRows(card, "published", refs),
        {
          label: "ครบ 7 วัน (ตัวเลขนิ่งพอวัด)",
          done: card.brief.publish_at != null &&
            daysBetween(card.brief.publish_at, nowISO()) >= 7,
        },
      ];
    case "measured":
      // SOP: ตัวเลขครบ + ติดป้ายแล้ว = การ์ดจบชีวิต (archive ได้)
      return [...runRows(card, "measured", refs), ...metricsRows(card)];
    default:
      return [];
  }
}
/* ============================================================
 3 ขั้นท้ายแยกรายช่องทาง — Scheduled · Published · Measured
 การ์ดใบเดียวลงหลายช่องทาง ตัวเลขและหลักฐานต้องแยกกัน ไม่งั้นไม่รู้ว่าช่องไหนเวิร์ค
 ตัวเลขรวมของการ์ด = ผลบวกของทุกช่องทาง (คิดให้ ไม่ได้กรอกมือ)
 ============================================================ */
/** ชนิดของช่องทางตามที่ตั้งไว้ในหน้าตั้งค่า — ไม่รู้จักถือเป็นฟีด */
export function channelKindOf(channels, name) {
  return (channels ?? []).find((c) => c.name === name)?.kind ?? "feed";
}
/** ช่องตัวเลขที่ช่องทางนี้ต้องกรอก — ตามชนิด + lead + (ads ถ้าเป็นงาน project) */
export function runMetricFields(kind, isAds) {
  return [
    ...(CHANNEL_METRIC_FIELDS[kind] ?? CHANNEL_METRIC_FIELDS.feed),
    RUN_LEAD_FIELD,
    ...(isAds ? RUN_ADS_FIELDS : []),
  ];
}
/**
 * แถวรายช่องทางของการ์ด — ยาวเท่า brief.channels เสมอ
 * เพิ่ม/ลบช่องทางในบรีฟแล้วแถวปรับตามเอง ข้อมูลที่กรอกไว้ของช่องเดิมไม่หาย
 */
export function channelRuns(card) {
  const saved = Array.isArray(card.channel_runs) ? card.channel_runs : [];
  return (card.brief.channels ?? []).map(
    (ch) => saved.find((r) => r.channel === ch) ?? emptyRun(ch),
  );
}
/** ขั้น Scheduled ของช่องทางนี้ครบไหม (แคปหน้าจอ = แนบได้แต่ไม่บังคับ ไม่นับเป็นเงื่อนไข) */
export function runScheduled(run) {
  return run.scheduled_at != null && meaningful(run.scheduler_tool);
}
/** ขั้น Published ของช่องทางนี้ครบไหม */
export function runPublished(run) {
  return meaningful(run.post_url) && run.posted_at != null &&
    run.live_ok === true && run.comments_handled === true;
}
/** ขั้น Measured ของช่องทางนี้ครบไหม — ตัวเลขบังคับครบตามชนิด (แคปไม่บังคับ) */
export function runMeasured(run, kind, isAds) {
  const need = runMetricFields(kind, isAds).filter((f) => f.req);
  return need.every((f) => run.metrics?.[f.key] != null);
}
/** แปลงตัวเลขเฉพาะช่องเป็น 3 ตัวกลางที่ทั้งระบบใช้ (ER · ป้ายผล · Dashboard) */
export function normalizeRunMetrics(run, kind) {
  const m = run.metrics ?? {};
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (kind === "short_video") {
    return { reach: n(m.views), engagement: n(m.engagement), leads: n(m.leads), spend: n(m.spend) };
  }
  if (kind === "broadcast") {
    const open = n(m.unique_open), click = n(m.clicks);
    return {
      reach: n(m.delivered),
      engagement: open == null && click == null ? null : (open ?? 0) + (click ?? 0),
      leads: n(m.leads), spend: n(m.spend),
    };
  }
  return { reach: n(m.reach), engagement: n(m.engagement), leads: n(m.leads), spend: n(m.spend) };
}
/**
 * ตัวเลขรวมของการ์ด = ผลบวกของทุกช่องทาง
 * เขียนกลับลง card.metrics ตอนบันทึก ทุกที่ที่อ่าน c.metrics อยู่แล้วจึงไม่ต้องแก้
 * ยังไม่มีช่องทางไหนกรอกเลย → คืน null ทั้งชุด (ถือว่ายังไม่วัด)
 */
export function rollupCardMetrics(card, channels) {
  const runs = channelRuns(card);
  const sums = { reach: 0, engagement: 0, leads: 0, spend: 0 };
  const seen = { reach: false, engagement: false, leads: false, spend: false };
  let measuredAt = null;
  for (const run of runs) {
    const v = normalizeRunMetrics(run, channelKindOf(channels, run.channel));
    for (const k of ["reach", "engagement", "leads", "spend"]) {
      if (v[k] != null) { sums[k] += v[k]; seen[k] = true; }
    }
    if (run.measured_at && (measuredAt == null || run.measured_at > measuredAt)) measuredAt = run.measured_at;
  }
  const spend = seen.spend ? sums.spend : null;
  const leads = seen.leads ? sums.leads : null;
  return {
    reach: seen.reach ? sums.reach : null,
    engagement: seen.engagement ? sums.engagement : null,
    leads,
    spend,
    cpl: spend != null && leads ? spend / leads : null,
    measured_at: measuredAt,
  };
}
/** สรุปความคืบหน้ารายช่องทางของขั้นหนึ่ง — ใช้ทั้งหัวกลุ่ม การ์ดบอร์ด และลิสต์ */
export function runProgress(card, stage, channels) {
  const runs = channelRuns(card);
  const isAds = isAdsCard(card);
  const done = runs.filter((run) => {
    if (stage === "scheduled") return runScheduled(run);
    if (stage === "published") return runPublished(run);
    return runMeasured(run, channelKindOf(channels, run.channel), isAds);
  }).length;
  return { done, total: runs.length, ok: runs.length > 0 && done === runs.length };
}
/** สิ่งที่ช่องทางนี้ยังขาดในขั้นนั้น — ข้อความสั้นๆ ไว้โชว์ในตารางและใน gate */
export function runMissing(card, run, stage, channels) {
  const out = [];
  if (stage === "scheduled") {
    if (run.scheduled_at == null) out.push("เวลาที่ตั้ง");
    if (!meaningful(run.scheduler_tool)) out.push("เครื่องมือ");
  } else if (stage === "published") {
    if (!meaningful(run.post_url)) out.push("ลิงก์โพสต์");
    if (run.posted_at == null) out.push("เวลาที่ขึ้นจริง");
    if (!run.live_ok) out.push("ยืนยันขึ้นจริง");
    if (!run.comments_handled) out.push("ดูแลคอมเมนต์");
  } else {
    const kind = channelKindOf(channels, run.channel);
    for (const f of runMetricFields(kind, isAdsCard(card)).filter((x) => x.req)) {
      if (run.metrics?.[f.key] == null) out.push(f.label);
    }
  }
  return out;
}

/** ข้อความ "ขาดอะไร" ของทุกช่องทางรวมกัน — ใช้ตอนกันไม่ให้เดินขั้น */
function runMissingAll(card, stage, refs) {
  const out = [];
  for (const run of channelRuns(card)) {
    const miss = runMissing(card, run, stage, refs.channels, refs.attachments);
    if (miss.length > 0) out.push(`${run.channel}: ${miss.join(" · ")}`);
  }
  return out;
}

/** เช็คลิสต์ของขั้นหนึ่ง แตกเป็นช่องทางละบรรทัด */
function runRows(card, stage, refs) {
  const label = { scheduled: "ตั้งเวลาจริง", published: "โพสต์ขึ้นจริง", measured: "ตัวเลข" }[stage];
  return channelRuns(card).map((run) => {
    const missing = runMissing(card, run, stage, refs.channels, refs.attachments);
    return {
      label: missing.length === 0
        ? `${label}: ${run.channel}`
        : `${label}: ${run.channel} — ขาด ${missing.join(" · ")}`,
      done: missing.length === 0,
    };
  });
}

/* ---------- ขั้น Measured: ตัวเลข + ป้ายผล ---------- */
/** ตัวเลขที่ทุกชิ้นต้องมี · spend/CPL บังคับเฉพาะงาน ads (track project ของ Performance Marketer) */
function metricsRows(card) {
  const m = card.metrics;
  const rows = [
    { label: "Reach", done: m?.reach != null },
    { label: "Engagement", done: m?.engagement != null },
    { label: "จำนวนทัก / lead", done: m?.leads != null },
  ];
  if (isAdsCard(card)) {
    rows.push({ label: "Spend (ads)", done: m?.spend != null });
    rows.push({ label: "CPL (ads)", done: m?.cpl != null });
  }
  // ป้ายผลขึ้นเองตามสูตรเมื่อตัวเลขครบ — ไม่ต้องติ๊กมือ
  rows.push({ label: "ป้ายผลขึ้นตามสูตร", done: metricsComplete(card) });
  return rows;
}
/** งาน ads = track project (Performance Marketer วัดฝั่ง ads ตาม SOP ขั้น 7) */
export function isAdsCard(card) {
  return card.track === "project";
}
export function metricsComplete(card) {
  const m = card.metrics;
  if (!m)
    return false;
  const base = m.reach != null && m.engagement != null && m.leads != null;
  if (!isAdsCard(card))
    return base;
  return base && m.spend != null && m.cpl != null;
}
/** Engagement rate = engagement / reach */
export function engagementRate(m) {
  if (!m || m.reach == null || m.engagement == null || m.reach <= 0)
    return null;
  return m.engagement / m.reach;
}
/** ค่าเฉลี่ย ER ของ brand — จากการ์ดที่วัดผลแล้วเท่านั้น */
export function brandAverageER(cards, brandId, excludeCardId) {
  const rates = cards
    .filter((c) => c.brand_id === brandId && c.id !== excludeCardId)
    .map((c) => engagementRate(c.metrics))
    .filter((r) => r != null);
  if (rates.length === 0)
    return null;
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}
/**
* ป้ายผลตาม SOP: 🟢 เกินค่าเฉลี่ย brand · 🟡 ตามค่าเฉลี่ย · 🔴 ต่ำกว่าครึ่งของค่าเฉลี่ย
* ไม่เก็บลง DB — คำนวณสดจากค่าเฉลี่ยล่าสุดเสมอ
*/
export function resultLabel(card, brandAvgER) {
  const er = engagementRate(card.metrics);
  if (er == null)
    return null;
  if (brandAvgER == null || brandAvgER <= 0)
    return "yellow"; // ยังไม่มีฐานเทียบ
  if (er > brandAvgER)
    return "green";
  if (er < brandAvgER / 2)
    return "red";
  return "yellow";
}
function selfCheckRows(card) {
  /* ข้อไม่เท่ากันระหว่างภาพนิ่ง/คลิป — อ่านจาก selfCheckItems จุดเดียว
     ถ้าฮาร์ดโค้ดไว้ที่นี่ เปลี่ยนประเภทไฟล์แล้ว gate จะนับข้อที่ไม่มีอยู่จริง */
  return selfCheckItems(card.brief).map((it) => ({
    label: `Self-check: ${it.label}`,
    done: card.self_check?.[it.key] === true,
  }));
}
/** ข้อความบอกสถานะความพร้อมบน progress bar — บอกว่ารออะไร */
export function gateReason(card, refs = NO_REFS) {
  if (card.status === "review")
    return "รอ Team Lead ตรวจ";
  const pct = gatePercent(card, refs);
  if (pct === 100) {
    const stages = stagesFor(card.track);
    const i = stageIndex(card.track, card.status);
    const next = i >= 0 && i < stages.length - 1 ? stages[i + 1].name : null;
    return next ? `พร้อมไปยัง ${next}` : "จบครบแล้ว";
  }
  // ยังไม่ครบ — บอกสิ่งที่ขาดชิ้นแรก (สั้นๆ)
  switch (card.status) {
    case "idea":
      return "รอระบุ Pillar";
    case "brief":
      return "รอกรอก Brief ให้ครบ";
    case "draft":
      return "รอไฟล์งาน + Self-check";
    case "scheduled":
      return "รอตั้งเวลาให้ครบทุกช่องทาง";
    case "published":
      return "รอยืนยันโพสต์ + ครบ 7 วัน";
    case "measured":
      return "รอกรอกตัวเลขผลงาน";
    default:
      return "กำลังทำ";
  }
}
/** % ความพร้อมของขั้นปัจจุบัน (สำหรับ stitch readiness line) */
export function gatePercent(card, refs = NO_REFS) {
  if (card.status === "review")
    return null; // รอ Team Lead
  const rows = gateChecklist(card, refs);
  if (rows.length === 0)
    return 100;
  const done = rows.filter((r) => r.done).length;
  return Math.round((done / rows.length) * 100);
}
/**
* ตรวจว่าการ์ดขยับจาก card.status ไป `to` ได้ไหม
* clock ฉีดได้เพื่อ test (default = ตอนนี้)
*/
export function validateTransition(card, to, _actor, nowClock = nowISO(), refs = NO_REFS) {
  const stages = stagesFor(card.track);
  const fromIdx = stageIndex(card.track, card.status);
  const toIdx = stages.findIndex((s) => s.id === to);
  if (toIdx === -1)
    return { ok: false, missing: [`สเตจ "${to}" ไม่มีใน track นี้`] };
  if (toIdx === fromIdx)
    return { ok: false, missing: ["อยู่สเตจเดิม"] };
  // --- ออกจาก Review: ปุ่มเท่านั้น ห้าม drag (กติกาเหล็กข้อ 1) ---
  if (card.status === "review") {
    if (to === "draft")
      return { ok: false, missing: ["ตีกลับต้องผ่านปุ่ม + ระบุเหตุผล"], buttonOnly: "reject" };
    return { ok: false, missing: ["ออกจาก Review ได้ทางปุ่ม Approve เท่านั้น"], buttonOnly: "approve" };
  }
  const backwards = toIdx < fromIdx;
  // --- ถอยหลัง: อนุญาต (งานเลื่อน/แก้แผน) ยกเว้นออกจาก review (จับไปแล้วข้างบน) ---
  if (backwards)
    return { ok: true, missing: [] };
  // --- ต้องขยับทีละขั้น (กันกระโดด) ---
  if (toIdx !== fromIdx + 1)
    return { ok: false, missing: ["ต้องเดินทีละขั้น ห้ามกระโดดข้าม"] };
  // --- เข้า review ต้องผ่านปุ่มของ team_lead ---
  if (to === "scheduled" || (to === "done" && card.track === "project")) {
    // ขั้นก่อนคือ review — มาถึงตรงนี้เฉพาะกรณี card.status !== review ซึ่งเป็นไปไม่ได้
  }
  switch (`${card.status}->${to}`) {
    case "idea->brief": {
      const missing = [];
      if (card.plan_confirmed !== true)
        missing.push("ยืนยันว่าอยู่ในแผน / คุ้มทำ");
      if (card.track === "content" && card.pillar == null)
        missing.push("ต้องระบุ Pillar ก่อน");
      return { ok: missing.length === 0, missing };
    }
    case "brief->draft": {
      const b = card.brief;
      const missing = [];
      // ส่วนที่ 1 — โจทย์
      if (!nonEmpty(b.who_action))
        missing.push("โจทย์ข้อ 1 (ใคร→ทำอะไร)");
      if (!nonEmpty(b.hook))
        missing.push("Hook");
      if (!nonEmpty(b.key_message))
        missing.push("Key message");
      if (!meaningful(b.cta))
        missing.push("CTA");
      if (!b.fact_checked)
        missing.push("ติ๊กยืนยันเช็ค Fact Sheet");
      // ส่วนที่ 2 — ผลิต (SOP: "ส่วนที่ 2 ครบ")
      if (b.format !== "image" && b.format !== "video")
        missing.push("ประเภทไฟล์ (ภาพ/คลิป)");
      if (b.deadline_review == null)
        missing.push("Deadline ส่งตรวจ");
      if (b.channels.length < 1)
        missing.push("ช่องทางอย่างน้อย 1");
      if (card.track === "content" && b.publish_at == null)
        missing.push("วัน–เวลาโพสต์");
      if (b.format === "video") {
        if (!meaningful(b.size)) missing.push("อัตราส่วนคลิป");
        if ((b.video_seconds ?? 0) <= 0) missing.push("ความยาวคลิป");
        for (const issue of videoTimelineIssues(b)) missing.push(`ไทม์ไลน์: ${issue}`);
      }
      else if (isAlbum(b)) {
        if ((b.album_count ?? 0) < 2)
          missing.push("จำนวนภาพในชุด (≥2)");
        if (!albumOutlineComplete(b))
          missing.push(`รายภาพยังไม่ครบ (${albumFilledCount(b)}/${b.album_count ?? 0} ภาพ)`);
        if (!meaningful(b.layout_note)) missing.push("Layout ร่วมทุกภาพ");
      }
      else {
        if (!meaningful(b.size)) missing.push("ขนาดภาพ");
        if (!meaningful(b.layout_note)) missing.push("Layout sketch");
      }
      if (!meaningful(b.mood))
        missing.push("Mood");
      if (!meaningful(b.ref_note) && refs.refImages === 0)
        missing.push("Ref AW (ระบุแง่ที่อ้าง หรือแนบรูป ref พร้อมคำอธิบาย)");
      if (!meaningful(b.ci_link) && refs.refLinks === 0)
        missing.push("ลิงก์ CI (หรือแนบไฟล์ CI / ลิงก์อ้างอิง)");
      return { ok: missing.length === 0, missing };
    }
    case "draft->review": {
      const missing = [];
      if (!nonEmpty(card.draft_link) && refs.workImages === 0)
        missing.push("แนบงาน — ลิงก์ Drive หรือรูปงานอย่างน้อย 1 รูป");
      const sc = card.self_check;
      const scDone = Object.values(sc).every(Boolean);
      if (!scDone)
        missing.push("Self-check ครบ 6 ข้อ");
      return { ok: missing.length === 0, missing };
    }
    case "scheduled->published": {
      const missing = [];
      if (card.brief.publish_at == null)
        missing.push("วัน-เวลาโพสต์จริง");
      // SOP: ต้องตั้งเวลาในระบบจริงครบทุกช่องทางที่ Brief ระบุ + มีหลักฐาน
      missing.push(...runMissingAll(card, "scheduled", refs));
      return { ok: missing.length === 0, missing };
    }
    case "published->measured": {
      if (card.brief.publish_at == null)
        return { ok: false, missing: ["ไม่มี publish_at"] };
      // SOP: ยืนยันขึ้นจริง + ดูแลคอมเมนต์ 24 ชม.แรก ก่อนปิดรอบ — ครบทุกช่องทาง
      const missing = runMissingAll(card, "published", refs);
      if (missing.length > 0)
        return { ok: false, missing };
      const days = daysBetween(card.brief.publish_at, nowClock);
      if (days < 7)
        return {
          ok: true,
          missing: [],
          warnConfirm: `เพิ่งโพสต์ ${Math.max(0, Math.floor(days))} วัน — ยังไม่ครบ 7 วัน ตัวเลขอาจยังไม่นิ่ง ยืนยันย้ายก่อน?`,
        };
      return { ok: true, missing: [] };
    }
    case "measured->done": {
      // SOP: ตัวเลขครบ + ติดป้ายแล้ว = จบชีวิตการ์ด — ครบทุกช่องทาง พร้อมแคป insight
      const missing = runMissingAll(card, "measured", refs);
      if (missing.length === 0 && !metricsComplete(card))
        missing.push("กรอกตัวเลขผลงานให้ครบก่อนปิดงาน");
      return { ok: missing.length === 0, missing };
    }
    default:
      return { ok: true, missing: [] };
  }
}
/** ลำดับช่องในฟอร์ม (ตาม Brief Template v2) — ใช้หาช่องแรกที่ผิด */
export const BRIEF_FIELD_ORDER = [
  // ส่วนที่ 1 — โจทย์
  "who_action",
  "hook",
  "key_message",
  "cta",
  "fact_checked",
  // ส่วนที่ 2 — ผลิต
  "format",
  "size",
  "deadline_review",
  "publish_at",
  "channels",
  "layout_note",
  "mood",
  "ref_note",
  "ci_link",
];
/**
* ตรวจค่าที่กรอกในฟอร์ม Brief
* @param strict true = ตรวจแบบตอนจะส่งไปขั้นถัดไป (บังคับ required ครบ)
*               false = ตรวจเฉพาะค่าที่ "กรอกมาแล้วแต่ผิด" (ระหว่างพิมพ์ ไม่ด่าช่องว่าง)
*/
export function validateBriefForm(card, strict, nowClock = nowISO(), refs = NO_REFS) {
  const b = card.brief;
  const e = {};
  const today = new Date(nowClock);
  today.setHours(0, 0, 0, 0);
  if (strict) {
    // ส่วนที่ 1 — โจทย์
    if (!nonEmpty(b.who_action))
      e.who_action = "ต้องระบุว่าใคร แล้วให้ทำอะไร";
    if (!nonEmpty(b.hook))
      e.hook = "ต้องมี Hook";
    if (!nonEmpty(b.key_message))
      e.key_message = "ต้องมี Key message";
    if (!nonEmpty(b.cta))
      e.cta = "ต้องมี CTA";
    // ส่วนที่ 2 — ผลิต (SOP บังคับให้ครบ)
    if (b.format !== "image" && b.format !== "video")
      e.format = "เลือกว่าเป็นภาพนิ่งหรือคลิป";
    if (b.format === "video") {
      if (!meaningful(b.size)) e.size = "ต้องระบุอัตราส่วนคลิป";
      if ((b.video_seconds ?? 0) <= 0) e.video_seconds = "ต้องระบุความยาวคลิป";
      const issues = videoTimelineIssues(b);
      if (issues.length > 0) e.video_scenes = issues[0];
    }
    else if (!isAlbum(b) && !meaningful(b.size))
      e.size = "ต้องระบุขนาดภาพ";
    if (card.track === "content" && b.publish_at == null)
      e.publish_at = "ต้องระบุวัน–เวลาโพสต์";
    // ชุดภาพ: ต้องรู้ว่ากี่ภาพและภาพไหนพูดอะไร ก่อนส่งให้คนทำ
    if (b.aw_type === "album") {
      if ((b.album_count ?? 0) < 2)
        e.album_count = "ชุดภาพต้องมีอย่างน้อย 2 ภาพ";
      if (!albumOutlineComplete(b))
        e.album_frames = `ยังกรอกไม่ครบ — ${albumFilledCount(b)}/${b.album_count ?? 0} ภาพ`;
    }
    if (b.format !== "video" && !meaningful(b.layout_note))
      e.layout_note = isAlbum(b) ? "ต้องระบุ Layout ที่ใช้ร่วมกันทุกภาพ" : "ต้องระบุ Layout sketch";
    if (!meaningful(b.mood))
      e.mood = "ต้องระบุ Mood";
    if (!meaningful(b.ref_note) && refs.refImages === 0)
      e.ref_note = "ระบุว่าอ้างอิงแง่ไหน หรือแนบรูป ref พร้อมคำอธิบายอย่างน้อย 1 รูป";
    if (!meaningful(b.ci_link) && refs.refLinks === 0)
      e.ci_link = "ใส่ลิงก์ CI หรือแนบไฟล์ CI / ลิงก์อ้างอิงอย่างน้อย 1 รายการ";
    if (b.deadline_review == null)
      e.deadline_review = "ต้องระบุ Deadline ส่งตรวจ";
    if (b.channels.length < 1)
      e.channels = "เลือกอย่างน้อย 1 ช่องทาง";
    if (!b.fact_checked)
      e.fact_checked = "ต้องยืนยันว่าเช็คกับ Fact Sheet แล้ว";
  }
  // CTA เป็น "-" / filler = ไม่นับว่าครบ (ตรวจทั้ง strict และไม่ strict)
  if (nonEmpty(b.cta) && !meaningful(b.cta)) {
    e.cta = 'CTA ต้องเป็นคำสั่งจริง ไม่ใช่ "-"';
  }
  // deadline ต้องไม่ย้อนหลัง — เฉพาะการ์ดที่ยังไม่ผ่านขั้น review
  const beforeReview = stageIndex(card.track, card.status) <= stageIndex(card.track, "draft");
  if (b.deadline_review && beforeReview) {
    const d = new Date(b.deadline_review + "T00:00:00");
    if (d < today)
      e.deadline_review = "Deadline ย้อนหลัง — เลือกวันที่ตั้งแต่วันนี้ขึ้นไป";
  }
  // วันโพสต์จริงไม่ควรก่อน deadline ส่งตรวจ
  if (b.publish_at && b.deadline_review) {
    const pub = new Date(b.publish_at);
    const dl = new Date(b.deadline_review + "T00:00:00");
    if (pub < dl)
      e.publish_at = "วันโพสต์อยู่ก่อน Deadline ส่งตรวจ";
  }
  // ลิงก์ CI ถ้ากรอกมาต้องเป็น URL ที่ใช้ได้ (ตรวจทั้ง strict และไม่ strict)
  if (nonEmpty(b.ci_link) && !isValidUrl(normalizeUrl(b.ci_link))) {
    e.ci_link = "ลิงก์ CI ไม่ใช่ URL ที่ถูกต้อง";
  }
  return e;
}
export function firstErrorField(errors) {
  return BRIEF_FIELD_ORDER.find((k) => errors[k]) ?? null;
}
export function applyApprove(card, actor, nowClock = nowISO()) {
  assertTeamLead(actor);
  if (card.status !== "review")
    throw new Error("การ์ดไม่ได้อยู่ขั้น Review");
  const hours = card.entered_review_at
    ? Math.max(0, hoursBetween(card.entered_review_at, nowClock))
    : 0;
  const next = card.track === "project" ? "done" : "scheduled";
  const updated = {
    ...card,
    status: next,
    // first_pass เขียนครั้งเดียว — approve ครั้งแรก (ยัง null) = true
    first_pass: card.first_pass === null ? true : card.first_pass,
    entered_review_at: null,
    updated_at: nowClock,
  };
  return {
    card: updated,
    action: {
      card_id: card.id,
      action: "approve",
      reason: "",
      direction_pack_ref: null,
      acted_by: actor.id,
      acted_at: nowClock,
      hours_in_review: round1(hours),
    },
  };
}
export function validateReject(input) {
  const missing = [];
  if (!input.direction_pack_ref)
    missing.push("ต้องอ้างข้อใน Direction Pack");
  if (input.reason.trim().length < 5)
    missing.push("เหตุผล (อย่างน้อย 5 ตัวอักษร)");
  return { ok: missing.length === 0, missing };
}
export function applyReject(card, actor, input, nowClock = nowISO()) {
  assertTeamLead(actor);
  if (card.status !== "review")
    throw new Error("การ์ดไม่ได้อยู่ขั้น Review");
  const v = validateReject(input);
  if (!v.ok)
    throw new Error(v.missing.join(", "));
  const hours = card.entered_review_at
    ? Math.max(0, hoursBetween(card.entered_review_at, nowClock))
    : 0;
  const updated = {
    ...card,
    status: "draft",
    // reject ครั้งแรก (ยัง null) = false ถาวร — ผ่านทีหลังไม่นับรอบแรก
    first_pass: card.first_pass === null ? false : card.first_pass,
    entered_review_at: null,
    updated_at: nowClock,
  };
  return {
    card: updated,
    action: {
      card_id: card.id,
      action: "reject",
      reason: input.reason.trim(),
      direction_pack_ref: input.direction_pack_ref,
      acted_by: actor.id,
      acted_at: nowClock,
      hours_in_review: round1(hours),
    },
  };
}
/* ============================================================
 Overdue / stuck / idea purge / flex slot
 ============================================================ */
export function isReviewOverdue(card, settings, nowClock = nowISO()) {
  if (card.status !== "review" || !card.entered_review_at)
    return false;
  return hoursBetween(card.entered_review_at, nowClock) > settings.sla_hours;
}
export function hoursWaitingInReview(card, nowClock = nowISO()) {
  if (card.status !== "review" || !card.entered_review_at)
    return 0;
  return Math.max(0, hoursBetween(card.entered_review_at, nowClock));
}
/**
* เวลาที่การ์ด "เข้ามาอยู่ขั้นปัจจุบัน" — ฐานที่ถูกต้องของคำว่า "ค้างขั้นเดิม"
* ใช้ status_history เป็นหลัก เพราะ updated_at ถูกรีเซ็ตทุกครั้งที่แก้การ์ด
* (แก้ typo ในบรีฟก็จะดูเหมือนงานเพิ่งขยับ ทั้งที่ยังค้างขั้นเดิม)
*/
export function stuckSince(card, history) {
  const arrived = (Array.isArray(history) ? history : [])
    .filter((h) => h.card_id === card.id && h.to_status === card.status)
    .map((h) => h.moved_at)
    .sort();
  return arrived.length > 0 ? arrived[arrived.length - 1] : card.updated_at;
}
/** ค้างขั้นเดิม > n วัน (default 3) — ขึ้นวาระ Weekly Sync */
export function isStuck(card, days = 3, nowClock = nowISO(), history = []) {
  if (card.archived)
    return false;
  if (card.status === "measured" || card.status === "done")
    return false;
  return daysBetween(stuckSince(card, history), nowClock) > days;
}
export function stuckDays(card, nowClock = nowISO(), history = []) {
  return Math.floor(daysBetween(stuckSince(card, history), nowClock));
}
/**
* ตีกลับที่ผู้ตรวจ "ชี้ข้อไม่ได้" (direction_pack_ref === "new")
* = กติกายังไม่มีในเอกสาร ต้องเติมเข้า Direction Pack ก่อน แล้วค่อยอ้างข้อใหม่
*/
export function pendingToolboxItems(actions) {
  return actions
    .filter((a) => a.action === "reject" && a.direction_pack_ref === "new")
    .sort((a, b) => new Date(b.acted_at).getTime() - new Date(a.acted_at).getTime())
    .map((a) => ({ cardId: a.card_id, reason: a.reason, actedBy: a.acted_by, actedAt: a.acted_at }));
}
/** การ์ดที่กรอกตัวเลขภายใน n วันล่าสุด เรียงตาม ER — คืน top/bottom สำหรับ Weekly Sync */
export function weeklyTopBottom(cards, days = 7, nowClock = nowISO()) {
  const since = new Date(nowClock).getTime() - days * DAY_MS;
  const ranked = cards
    .filter((c) => c.metrics?.measured_at != null && new Date(c.metrics.measured_at).getTime() >= since)
    .map((c) => ({ card: c, er: engagementRate(c.metrics) }))
    .filter((r) => r.er != null)
    .sort((a, b) => b.er - a.er);
  if (ranked.length === 0)
    return { top: null, bottom: null, count: 0 };
  return {
    top: ranked[0],
    // มีใบเดียวก็ไม่ต้องโชว์ bottom ซ้ำกับ top
    bottom: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    count: ranked.length,
  };
}
/** idea ค้างเก่ากว่า idea_purge_days → ป้ายกวาดล้าง (คนลบเอง) */
export function isIdeaPurgeDue(card, settings, nowClock = nowISO()) {
  if (card.status !== "idea")
    return false;
  return daysBetween(card.updated_at, nowClock) > settings.idea_purge_days;
}
/**
* คำนวณ first-pass rate จาก review_actions
* นับ "การตัดสินครั้งแรกของแต่ละการ์ด" (approve แรก=ผ่าน, reject แรก=ไม่ผ่าน)
* แยกตาม owner ของการ์ด
*/
export function computeFirstPassRate(cards, actions, settings, ownerIds, nowClock = nowISO()) {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const windowWeeks = settings.first_pass_window_weeks;
  const target = settings.first_pass_target;
  // การตัดสินครั้งแรกต่อการ์ด (เรียงตามเวลา)
  const sorted = [...actions].sort((a, b) => new Date(a.acted_at).getTime() - new Date(b.acted_at).getTime());
  const firstDecision = new Map();
  for (const a of sorted)
    if (!firstDecision.has(a.card_id))
      firstDecision.set(a.card_id, a);
  return ownerIds.map((ownerId) => {
    const decisions = [...firstDecision.values()].filter((a) => {
      const card = cardById.get(a.card_id);
      return card?.owner_id === ownerId;
    });
    const windowStart = new Date(nowClock).getTime() - windowWeeks * 7 * DAY_MS;
    const inWindow = decisions.filter((a) => new Date(a.acted_at).getTime() >= windowStart);
    const passed = inWindow.filter((a) => a.action === "approve").length;
    const total = inWindow.length;
    const rate = total > 0 ? passed / total : null;
    // แยกเป็นสัปดาห์
    const weekHits = [];
    for (let w = windowWeeks - 1; w >= 0; w--) {
      const wEnd = new Date(nowClock).getTime() - w * 7 * DAY_MS;
      const wStart = wEnd - 7 * DAY_MS;
      const wk = decisions.filter((a) => {
        const t = new Date(a.acted_at).getTime();
        return t >= wStart && t < wEnd;
      });
      if (wk.length === 0) {
        weekHits.push(false);
      }
      else {
        const p = wk.filter((a) => a.action === "approve").length / wk.length;
        weekHits.push(p >= target);
      }
    }
    const unlocked = weekHits.length === windowWeeks && weekHits.every(Boolean);
    return { ownerId, rate, total, passed, weekHits, unlocked };
  });
}
export function computeReviewSLA(actions, settings) {
  if (actions.length === 0)
    return { withinSLA: 0, total: 0, rate: null, avgHours: null };
  const within = actions.filter((a) => a.hours_in_review <= settings.sla_hours).length;
  const avg = actions.reduce((s, a) => s + a.hours_in_review, 0) / actions.length;
  return {
    withinSLA: within,
    total: actions.length,
    rate: within / actions.length,
    avgHours: round1(avg),
  };
}
/** นับการ์ด ⚡Realtime ที่ publish_at อยู่ในสัปดาห์ [weekStart, weekStart+7) */
export function flexSlotUsage(cards, settings, weekStartISO) {
  const start = new Date(weekStartISO).getTime();
  const end = start + 7 * DAY_MS;
  const used = cards.filter((c) => {
    if (!c.is_realtime || !c.brief.publish_at)
      return false;
    const t = new Date(c.brief.publish_at).getTime();
    return t >= start && t < end;
  }).length;
  const limit = settings.flex_slot_per_week;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
/* ---------- permissions (Spec ข้อ 2) ---------- */
export function canDecideReview(actor) {
  return actor.role === "team_lead";
}
export function canEditCard(actor, card, brandOwnerId) {
  // ปิดงานแล้ว = บันทึกถาวรของทีม — ห้ามแก้ทุก role (ที่เพิ่มได้มีแค่โน้ต/บทเรียน/หมวด/ดาว)
  if (card.archived)
    return false;
  if (actor.role === "team_lead")
    return true;
  // content_owner / performance_marketer แก้ได้เฉพาะการ์ดตัวเอง / brand ตัวเอง
  return card.owner_id === actor.id || brandOwnerId === actor.id;
}
export function canDeleteCard(actor, card) {
  // ปิดงานแล้วลบไม่ได้เช่นกัน — ตัวเลข/บทเรียนในคลังต้องไม่หาย
  if (card.archived)
    return false;
  if (actor.role === "team_lead")
    return true;
  // เจ้าของ ลบได้เฉพาะการ์ดตัวเองที่ยังอยู่ Idea/Brief
  return card.owner_id === actor.id && (card.status === "idea" || card.status === "brief");
}
export function canManageAdmin(actor) {
  return actor.role === "team_lead";
}
/* ---------- utils ---------- */
function nonEmpty(s) {
  return !!s && s.trim().length > 0;
}
/**
* ค่าที่ "มีความหมายจริง" — เข้มกว่า nonEmpty
* กัน placeholder ขี้เกียจอย่าง "-", "—", "n/a", "tbd" ให้ไม่นับว่าครบ
*/
const FILLER = new Set(["-", "—", "–", "n/a", "na", "tbd", "ไม่มี", "?", ".", "#"]);
export function meaningful(s) {
  if (!nonEmpty(s))
    return false;
  return !FILLER.has(s.trim().toLowerCase());
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
export function nowISO() {
  return new Date().toISOString();
}
function assertTeamLead(actor) {
  if (actor.role !== "team_lead")
    throw new Error("เฉพาะ Team Lead เท่านั้นที่ตัดสิน Review ได้");
}
export function genId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
