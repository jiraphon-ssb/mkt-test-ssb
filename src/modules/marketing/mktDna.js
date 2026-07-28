/* ============================================================
   mktDna.js — Content DNA & Success Pattern Matcher Engine
   Pure JavaScript Engine (No External API / No Cost)
   คำนวณและเทียบดีเอ็นเอของ Content กับ Benchmark สถิติป้ายเขียวเดิมในเครื่อง
   ============================================================ */

/**
 * สกัด DNA จากการ์ด 1 ใบ
 * @param {object} card 
 * @returns {object} DNA metrics
 */
export function extractContentDna(card) {
  const b = card.brief ?? {};
  const isAlbum = b.format === "image" && b.aw_type === "album";

  // 1. Hook Ratio & Pacing (สำหรับคลิป)
  const totalSec = b.video_seconds ?? 0;
  const scenes = Array.isArray(b.video_scenes) ? b.video_scenes : [];
  const hookScene = scenes.length > 0 ? scenes[0] : null;
  const hookSec = hookScene ? (hookScene.to - hookScene.from) : 0;
  const hookRatio = totalSec > 0 ? (hookSec / totalSec) : 0;
  const scenePacing = totalSec > 0 ? (scenes.length / (totalSec / 10)) : 0; // ฉากต่อ 10 วิ

  // 2. Visual & Text Structure
  const frameCount = isAlbum ? (b.album_count ?? 0) : 1;
  const hasCta = Boolean(b.cta && b.cta.trim().length > 0);
  const hasRefNote = Boolean(b.ref_note && b.ref_note.trim().length > 0);
  const hasCiLink = Boolean(b.ci_link && b.ci_link.trim().length > 0);

  return {
    format: b.format || "single_image",
    size: b.size || "1:1",
    totalSec,
    hookSec,
    hookRatio,
    scenePacing,
    frameCount,
    hasCta,
    hasRefNote,
    hasCiLink,
    channelCount: (b.channels || []).length,
  };
}

/**
 * วิเคราะห์ Benchmark สถิติดีเอ็นเอป้ายเขียว (Green Label) ของแบรนด์จากคลังข้อมูล
 * @param {Array} cards 
 * @param {string} brandId 
 * @returns {object} Benchmark Metrics
 */
export function calculateBrandBenchmark(cards, brandId) {
  const brandCards = cards.filter((c) => c.brand_id === brandId && c.status === "measured");
  // ดึงเฉพาะการ์ดที่ได้ผลลัพธ์ดี (ER สูง หรือมีป้ายเขียว/metrics reach สูง)
  const topCards = brandCards.filter((c) => {
    const m = c.metrics ?? {};
    return (m.engagement ?? 0) > 0 || (m.reach ?? 0) > 5000;
  });

  const source = topCards.length >= 2 ? topCards : brandCards;
  if (source.length === 0) {
    // Default Fallback Benchmark
    return {
      idealHookSecMax: 3.5,
      idealPacingMin: 1.2,
      idealFrameCount: 4,
      reqCtaPct: 1.0,
      sampleCount: 0,
    };
  }

  let totalHookSec = 0;
  let totalPacing = 0;
  let videoCount = 0;

  source.forEach((c) => {
    const dna = extractContentDna(c);
    if (dna.format === "video") {
      totalHookSec += dna.hookSec;
      totalPacing += dna.scenePacing;
      videoCount++;
    }
  });

  return {
    idealHookSecMax: videoCount > 0 ? Number((totalHookSec / videoCount).toFixed(1)) : 3.0,
    idealPacingMin: videoCount > 0 ? Number((totalPacing / videoCount).toFixed(1)) : 1.5,
    idealFrameCount: 4,
    reqCtaPct: 1.0,
    sampleCount: source.length,
  };
}

/**
 * แมตช์ DNA ของการ์ดกับ Benchmark แล้วให้คะแนน Match Score (0-100%) พร้อมคำแนะนำ
 * @param {object} card 
 * @param {object} benchmark 
 * @returns {object} Match Result
 */
export function matchContentDna(card, benchmark) {
  const dna = extractContentDna(card);
  const advice = [];
  let score = 100;

  // 1. ตรวจ Hook (สำหรับ Video)
  if (dna.format === "video") {
    if (dna.hookSec === 0) {
      score -= 25;
      advice.push({ type: "critical", msg: "ยังไม่ได้กำหนดเวลาฉาก Hook (ควรอยู่ระหว่าง 1.5 - 3.5 วินาที)" });
    } else if (dna.hookSec > (benchmark.idealHookSecMax || 3.5)) {
      score -= 15;
      advice.push({ type: "warn", msg: `ฉาก Hook ยาว ${dna.hookSec} วิ (ยาวกว่าค่าเฉลี่ยปัง ${benchmark.idealHookSecMax} วิ ของแบรนด์นี้)` });
    } else {
      advice.push({ type: "good", msg: `ความยาว Hook (${dna.hookSec} วิ) ตรงตามทองคำของแบรนด์` });
    }

    if (dna.scenePacing < (benchmark.idealPacingMin || 1.0)) {
      score -= 10;
      advice.push({ type: "info", msg: "จังหวะการสลับฉากค่อนข้างช้า ลองเพิ่มฉากย่อยเพื่อเพิ่ม Pacing" });
    }
  }

  // 2. ตรวจ CTA & Ref
  if (!dna.hasCta) {
    score -= 20;
    advice.push({ type: "critical", msg: "ยังไม่มีคำ Call To Action (CTA) ในการ์ด" });
  }

  if (!dna.hasRefNote && !dna.hasCiLink) {
    score -= 10;
    advice.push({ type: "warn", msg: "ขาดข้อมูลอ้างอิง Mood/CI ซึ่งอาจทำให้ Visual หลุดทิศทาง" });
  }

  const finalScore = Math.max(0, score);
  let statusClass = "good";
  if (finalScore < 60) statusClass = "bad";
  else if (finalScore < 80) statusClass = "warn";

  return {
    score: finalScore,
    statusClass,
    dna,
    advice,
  };
}
