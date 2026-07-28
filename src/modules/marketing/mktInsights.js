/* ============================================================
 Insight engine — "คำแนะนำ" ของ Dashboard
 กติกาทั้งหมดเป็น pure function (มีเทส) อ่านจากข้อมูลจริงเท่านั้น
 ห้ามเดา: ทุกข้อมี evidence เป็นตัวเลขที่คำนวณได้ + ขั้นต่ำจำนวนตัวอย่าง

 InsightProvider = จุดสลับไปใช้ AI จริงภายหลัง (claudeInsightProvider)
 โดย UI เรียกผ่าน interface เดียว ไม่ต้องแก้หน้าจอ
 ============================================================ */
import { MODE_LABEL, PILLAR_LABEL, STAGE_META } from "./mktEngine.js";
import { computeFirstPassRate, daysBetween, isIdeaPurgeDue, isReviewOverdue, isStuck, nowISO, stuckDays, } from "./mktRules.js";
import { adsRollup, analyticsCards, ideaToPublishedCycle, kpiSummary, measuredInRange, publishHeatmap, rollupBy, stageFlows, } from "./mktAnalytics.js";
/* ---------- ค่าคงที่กันข้อมูลน้อย ---------- */
/** ต่ำกว่านี้ในกลุ่มใด = ไม่สรุปกลุ่มนั้น (กันฟลุ๊ค) */
export const MIN_N = 3;
/** ทั้งระบบมีงานวัดผลน้อยกว่านี้ใน 8 สัปดาห์ = ยังไม่สรุปแนวโน้มอะไรเลย */
export const MIN_TOTAL = 10;
const SEVERITY_ORDER = { critical: 0, warn: 1, good: 2, info: 3 };
/* ---------- helper ภายใน ---------- */
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const num = (x) => x.toLocaleString("th-TH");
const money = (x) => `฿${Math.round(x).toLocaleString("th-TH")}`;
const days = (x) => (x == null ? "—" : `${x.toFixed(1)} วัน`);
/** ช่วงย้อนหลัง n วันจาก now */
function backDays(n, nowClock) {
  return {
    start: new Date(new Date(nowClock).getTime() - n * 86_400_000).toISOString(),
    end: nowClock,
  };
}
/** ช่วง n วัน "ก่อนหน้า" ช่วงย้อนหลัง n วัน (เทียบ trend) */
function backDaysPrev(n, nowClock) {
  const end = new Date(new Date(nowClock).getTime() - n * 86_400_000);
  return {
    start: new Date(end.getTime() - n * 86_400_000).toISOString(),
    end: end.toISOString(),
  };
}
/* ============================================================
 computeInsights — ตัวจริงที่เทส (sync, pure)
 ============================================================ */
export function computeInsights(input) {
  const { data, viewer } = input;
  const nowClock = input.nowClock ?? nowISO();
  const cards = analyticsCards(data.cards);
  const out = [];
  const r30 = backDays(30, nowClock);
  const r28 = backDays(28, nowClock);
  const r28prev = backDaysPrev(28, nowClock);
  const r56 = backDays(56, nowClock);
  const r84 = backDays(84, nowClock);
  /* ---- guard: ข้อมูลน้อยเกินกว่าจะสรุป ---- */
  const total56 = measuredInRange(cards, r56).length;
  if (total56 < MIN_TOTAL) {
    return [{
        id: "low-data:all",
        rule: "low-data",
        severity: "info",
        dimension: "overall",
        title: "ข้อมูลยังน้อย — ยังสรุปแนวโน้มไม่ได้",
        detail: `ต้องมีงานวัดผลแล้วอย่างน้อย ${MIN_TOTAL} ชิ้นใน 8 สัปดาห์ · กรอกตัวเลขให้ครบทุกวันศุกร์ตาม SOP`,
        evidence: [{ label: "งานวัดผลแล้ว 8 สัปดาห์", value: `${total56} ชิ้น` }],
        action: { label: "ดูงานที่รอวัดผล", screen: "board" },
      }];
  }
  const teamER = kpiSummary(cards, r30).er;
  const teamER84 = kpiSummary(cards, r84).er;
  /* ============ มิติ brand ============ */
  const brandRows = rollupBy(cards, data.cards, "brand", r30);
  const producedByBrand = brandRows.map((b) => b.n).sort((a, b) => a - b);
  const medianProduced = producedByBrand.length
    ? producedByBrand[Math.floor(producedByBrand.length / 2)]
    : 0;
  for (const brand of data.brands.filter((b) => b.active)) {
    const row = brandRows.find((x) => x.key === brand.id);
    const bCards = cards.filter((c) => c.brand_id === brand.id);
    const cur = kpiSummary(bCards, r28);
    const prev = kpiSummary(bCards, r28prev);
    const jump = { label: `ดูงานของ ${brand.name}`, screen: "board", brandId: brand.id };
    // 1) ER ต่ำกว่าทีมมาก
    if (row && row.n >= MIN_N && row.er != null && teamER != null) {
      const ratio = row.er / teamER;
      if (ratio < 0.7) {
        out.push({
          id: `brand-er-low:${brand.id}`,
          rule: "brand-er-low",
          severity: ratio < 0.5 ? "critical" : "warn",
          dimension: "brand",
          title: `${brand.name} — ER ต่ำกว่าค่าเฉลี่ยทีม ${((1 - ratio) * 100).toFixed(0)}%`,
          detail: "ทบทวน Direction Pack ของแบรนด์นี้ — hook และรูปแบบยังตรงกลุ่มไหม",
          evidence: [
            { label: `ER ${brand.name} (30 วัน)`, value: `${pct(row.er)} · ${row.n} ชิ้น` },
            { label: "ER ทีม (30 วัน)", value: pct(teamER) },
            { label: "ป้ายผล", value: `เขียว ${row.labels.green} · แดง ${row.labels.red}` },
          ],
          action: jump,
        });
      }
    }
    // 2/5) ER ขาขึ้น — rebuild ใช้ข้อความเฉพาะ
    if (cur.produced >= MIN_N && prev.produced >= MIN_N && cur.er != null && prev.er != null) {
      const growth = cur.er / prev.er;
      if (growth >= 1.2) {
        const rebuilding = brand.mode === "rebuild";
        out.push({
          id: `${rebuilding ? "brand-rebuild-on-track" : "brand-er-rising"}:${brand.id}`,
          rule: rebuilding ? "brand-rebuild-on-track" : "brand-er-rising",
          severity: "good",
          dimension: "brand",
          title: rebuilding
            ? `${brand.name} (rebuild) กำลังฟื้น — ER +${((growth - 1) * 100).toFixed(0)}%`
            : `${brand.name} — ER ขึ้น ${((growth - 1) * 100).toFixed(0)}%`,
          detail: rebuilding
            ? "ทิศทางที่แก้ได้ผล — บันทึกสิ่งที่เปลี่ยนเข้า Direction Pack"
            : "ของที่ทำอยู่ได้ผล — ขยายสัดส่วนงานแนวนี้",
          evidence: [
            { label: "ER 4 สัปดาห์ล่าสุด", value: `${pct(cur.er)} · ${cur.produced} ชิ้น` },
            { label: "ER 4 สัปดาห์ก่อน", value: `${pct(prev.er)} · ${prev.produced} ชิ้น` },
            { label: "โหมดแบรนด์", value: MODE_LABEL[brand.mode] },
          ],
          action: jump,
        });
      }
      else if (growth <= 0.75) {
        out.push({
          id: `brand-er-falling:${brand.id}`,
          rule: "brand-er-falling",
          severity: "warn",
          dimension: "brand",
          title: `${brand.name} — ER ตกลง ${((1 - growth) * 100).toFixed(0)}%`,
          detail: "เข้าวาระ Weekly Sync — ดูว่าเปลี่ยนอะไรไปในช่วงนี้",
          evidence: [
            { label: "ER 4 สัปดาห์ล่าสุด", value: `${pct(cur.er)} · ${cur.produced} ชิ้น` },
            { label: "ER 4 สัปดาห์ก่อน", value: `${pct(prev.er)} · ${prev.produced} ชิ้น` },
          ],
          action: jump,
        });
      }
    }
    // 4) โหมด grow แต่ปริมาณงานรั้งท้าย
    if (brand.mode === "grow" && brandRows.length >= 2) {
      const n = row?.n ?? 0;
      if (n < medianProduced) {
        out.push({
          id: `brand-mode-underfed:${brand.id}`,
          rule: "brand-mode-underfed",
          severity: "warn",
          dimension: "brand",
          title: `${brand.name} อยู่โหมด grow แต่ผลิตน้อยกว่าค่ากลางทีม`,
          detail: "โหมด grow ควรได้จำนวนงานมากที่สุด — ทบทวนการจัดสรรใน Monthly Plan",
          evidence: [
            { label: `งาน ${brand.name} (30 วัน)`, value: `${n} ชิ้น` },
            { label: "ค่ากลางทุกแบรนด์", value: `${medianProduced} ชิ้น` },
          ],
          action: jump,
        });
      }
    }
  }
  /* ============ มิติ pillar ============ */
  const pillarRows = rollupBy(cards, data.cards, "pillar", r28);
  const pillarTotal = pillarRows.reduce((a, x) => a + x.n, 0);
  if (pillarTotal >= 8) {
    for (const row of pillarRows) {
      const share = row.n / pillarTotal;
      if (share > 0.5) {
        out.push({
          id: `pillar-concentration:${row.key}`,
          rule: "pillar-concentration",
          severity: "info",
          dimension: "pillar",
          title: `งานกระจุกที่ ${PILLAR_LABEL[row.key] ?? row.key} ${(share * 100).toFixed(0)}%`,
          detail: "เสี่ยงหน้าเพจซ้ำแนว — กระจายให้ครบ 4 pillar ตาม Monthly Plan",
          evidence: [{ label: "สัดส่วน", value: `${row.n}/${pillarTotal} ชิ้น` }],
          action: { label: "ดูสัดส่วนงาน", screen: "results" },
        });
      }
    }
    // pillar ที่หายไปทั้งที่ 8 สัปดาห์ก่อนเคยมี
    const older = rollupBy(cards, data.cards, "pillar", r28prev);
    for (const p of Object.keys(PILLAR_LABEL)) {
      const now = pillarRows.find((x) => x.key === p);
      const before = older.find((x) => x.key === p);
      if (!now && before && before.n >= 2) {
        out.push({
          id: `pillar-missing:${p}`,
          rule: "pillar-concentration",
          severity: "info",
          dimension: "pillar",
          title: `${PILLAR_LABEL[p]} หายไปจากงาน 4 สัปดาห์ล่าสุด`,
          detail: "ถ้าไม่ได้ตั้งใจหยุด ควรใส่กลับใน Monthly Plan",
          evidence: [{ label: "4 สัปดาห์ก่อน", value: `${before.n} ชิ้น` }, { label: "รอบนี้", value: "0 ชิ้น" }],
          action: { label: "ดูสัดส่วนงาน", screen: "results" },
        });
      }
    }
  }
  // pillar ดาวเด่น
  const pillarRows30 = rollupBy(cards, data.cards, "pillar", r30);
  if (teamER != null) {
    for (const row of pillarRows30) {
      if (row.n < MIN_N || row.er == null)
        continue;
      if (row.er >= teamER * 1.3) {
        out.push({
          id: `pillar-star:${row.key}`,
          rule: "pillar-star",
          severity: "good",
          dimension: "pillar",
          title: `${PILLAR_LABEL[row.key] ?? row.key} ทำผลดีกว่าค่าเฉลี่ย ${((row.er / teamER - 1) * 100).toFixed(0)}%`,
          detail: "เพิ่มสัดส่วน pillar นี้ในเดือนถัดไป",
          evidence: [
            { label: "ER pillar", value: `${pct(row.er)} · ${row.n} ชิ้น` },
            { label: "ER ทีม", value: pct(teamER) },
          ],
          action: { label: "ดูสัดส่วน pillar", screen: "results" },
        });
      }
    }
  }
  /* ============ มิติ channel ============ */
  if (teamER != null) {
    for (const row of rollupBy(cards, data.cards, "channel", r30, data.channels)) {
      if (row.n < MIN_N || row.er == null)
        continue;
      const ratio = row.er / teamER;
      if (ratio >= 1.3) {
        out.push({
          id: `channel-star:${row.key}`,
          rule: "channel-star",
          severity: "good",
          dimension: "channel",
          title: `${row.key} เป็นช่องทางที่ได้ผลที่สุด`,
          detail: "เทงานที่อยากดันไปช่องนี้ก่อน",
          evidence: [
            { label: `ER ${row.key}`, value: `${pct(row.er)} · ${row.n} ชิ้น` },
            { label: "ER ทีม", value: pct(teamER) },
          ],
          action: { label: "ดูรายช่องทาง", screen: "results" },
        });
      }
      else if (ratio < 0.6) {
        out.push({
          id: `channel-weak:${row.key}`,
          rule: "channel-weak",
          severity: "warn",
          dimension: "channel",
          title: `${row.key} ได้ผลต่ำกว่าช่องอื่นชัดเจน`,
          detail: "ปรับรูปแบบให้เข้ากับช่องนี้ หรือย้ายแรงไปช่องที่ได้ผล",
          evidence: [
            { label: `ER ${row.key}`, value: `${pct(row.er)} · ${row.n} ชิ้น` },
            { label: "ER ทีม", value: pct(teamER) },
          ],
          action: { label: "ดูรายช่องทาง", screen: "results" },
        });
      }
    }
  }
  /* ============ มิติคน (first-pass) ============ */
  const ownerIds = data.profiles.filter((p) => p.active).map((p) => p.id);
  const fpStats = computeFirstPassRate(data.cards, data.review_actions, data.settings, ownerIds, nowClock);
  for (const st of fpStats) {
    if (st.rate == null || st.total < 5)
      continue;
    // content_owner เห็นได้เฉพาะของตัวเอง — คะแนนรายคนของคนอื่นเป็นเรื่องของ Team Lead
    if (viewer?.role === "content_owner" && st.ownerId !== viewer.id)
      continue;
    if (st.rate < data.settings.first_pass_target - 0.15) {
      const name = data.profiles.find((p) => p.id === st.ownerId)?.display_name ?? st.ownerId;
      out.push({
        id: `owner-first-pass-low:${st.ownerId}`,
        rule: "owner-first-pass-low",
        severity: "warn",
        dimension: "owner",
        title: `${name} — first-pass ${pct(st.rate)} ต่ำกว่าเป้า ${pct(data.settings.first_pass_target)}`,
        detail: "ดูเหตุผลตีกลับที่ซ้ำบ่อย แล้วเติมเข้า Direction Pack ก่อนสอนรายคน",
        evidence: [
          { label: "first-pass", value: `${st.passed}/${st.total} (${pct(st.rate)})` },
          { label: "เป้า", value: pct(data.settings.first_pass_target) },
        ],
        action: { label: "ดู first-pass รายคน", tile: "first-pass" },
      });
    }
  }
  /* ============ กระบวนการ ============ */
  const overdue = cards.filter((c) => isReviewOverdue(c, data.settings, nowClock));
  if (overdue.length > 0) {
    const worst = Math.max(...overdue.map((c) => daysBetween(c.entered_review_at, nowClock) * 24 - data.settings.sla_hours));
    out.push({
      id: "review-sla-breach:now",
      rule: "review-sla-breach",
      severity: "critical",
      dimension: "process",
      title: `มีงานรอตรวจเกิน SLA ${overdue.length} ชิ้น`,
      detail: "คิวตรวจค้างทำให้ทุกขั้นถัดไปเลื่อนตามทั้งสาย",
      evidence: [
        { label: "เกิน SLA", value: `${overdue.length} ชิ้น` },
        { label: "เกินมากสุด", value: `${worst.toFixed(0)} ชม.` },
      ],
      action: { label: "ไปหน้ารอตรวจ", screen: "review" },
    });
  }
  const stuck = cards.filter((c) => isStuck(c, 3, nowClock, data.status_history));
  if (stuck.length >= 3) {
    const worstDays = Math.max(...stuck.map((c) => stuckDays(c, nowClock, data.status_history)));
    out.push({
      id: "stuck-pileup:now",
      rule: "stuck-pileup",
      severity: worstDays > 7 ? "critical" : "warn",
      dimension: "process",
      title: `งานติดขั้นเดิม ${stuck.length} ชิ้น`,
      detail: "เคลียร์ก่อนรับงานใหม่ ไม่งั้นคิวบวมขึ้นเรื่อยๆ",
      evidence: [
        { label: "ติดขัด", value: `${stuck.length} ชิ้น` },
        { label: "นานสุด", value: `${worstDays} วัน` },
      ],
      action: { label: "ดูบอร์ด", screen: "board" },
    });
  }
  const cycleNow = ideaToPublishedCycle(cards, data.status_history, r28);
  const cyclePrev = ideaToPublishedCycle(cards, data.status_history, r28prev);
  if (cycleNow.n >= MIN_N && cyclePrev.n >= MIN_N && cycleNow.avgDays != null && cyclePrev.avgDays != null
    && cycleNow.avgDays > cyclePrev.avgDays * 1.3) {
    out.push({
      id: "cycle-slowdown:overall",
      rule: "cycle-slowdown",
      severity: "warn",
      dimension: "process",
      title: `เวลาจากไอเดียถึงโพสต์ยาวขึ้น ${((cycleNow.avgDays / cyclePrev.avgDays - 1) * 100).toFixed(0)}%`,
      detail: "ดูไทล์เวลาต่อขั้นว่าขั้นไหนกินเวลาเพิ่ม แล้วแก้ที่คอขวดนั้น",
      evidence: [
        { label: "4 สัปดาห์ล่าสุด", value: `${days(cycleNow.avgDays)} · ${cycleNow.n} ชิ้น` },
        { label: "4 สัปดาห์ก่อน", value: `${days(cyclePrev.avgDays)} · ${cyclePrev.n} ชิ้น` },
      ],
    });
  }
  // ขั้นที่กินเวลาเกิน 4 วันเฉลี่ย = คอขวด
  for (const f of stageFlows(cards, data.status_history, r28)) {
    if (f.entered < MIN_N || f.avgDays == null || f.avgDays <= 4)
      continue;
    if (f.status === "published")
      continue; // ขั้นนี้รอครบ 7 วันตาม SOP อยู่แล้ว ไม่ใช่คอขวด
    out.push({
      id: `stage-bottleneck:${f.status}`,
      rule: "cycle-slowdown",
      severity: "warn",
      dimension: "process",
      title: `ขั้น ${STAGE_META[f.status].name} กินเวลาเฉลี่ย ${days(f.avgDays)}`,
      detail: `เป็นคอขวดของสาย — เจ้าของขั้นคือ ${STAGE_META[f.status].owner}`,
      evidence: [
        { label: "เฉลี่ย", value: days(f.avgDays) },
        { label: "การ์ดที่เข้าขั้นนี้", value: `${f.entered} ใบ` },
      ],
      action: { label: "ดูบอร์ด", screen: "board" },
    });
  }
  /* ============ ads ============ */
  const adsNow = adsRollup(cards, r30);
  const adsPrev = adsRollup(cards, backDaysPrev(30, nowClock));
  if (adsNow.rows.length >= 2 && adsPrev.rows.length >= 2 && adsNow.cpl != null && adsPrev.cpl != null) {
    const ratio = adsNow.cpl / adsPrev.cpl;
    if (ratio > 1.25) {
      out.push({
        id: "ads-cpl-trend:up",
        rule: "ads-cpl-trend",
        severity: "warn",
        dimension: "ads",
        title: `CPL แพงขึ้น ${((ratio - 1) * 100).toFixed(0)}%`,
        detail: "เช็คว่า audience อิ่มตัวหรือ creative ล้า ก่อนเพิ่มงบ",
        evidence: [
          { label: "CPL 30 วันล่าสุด", value: `${money(adsNow.cpl)} · ${adsNow.rows.length} ชุด` },
          { label: "CPL 30 วันก่อน", value: money(adsPrev.cpl) },
          { label: "งบที่ใช้", value: money(adsNow.spend) },
        ],
        action: { label: "ดูงานยิงแอด", screen: "results" },
      });
    }
    else if (ratio < 0.8) {
      out.push({
        id: "ads-cpl-trend:down",
        rule: "ads-cpl-trend",
        severity: "good",
        dimension: "ads",
        title: `CPL ถูกลง ${((1 - ratio) * 100).toFixed(0)}%`,
        detail: "ชุด creative/targeting ปัจจุบันคุ้ม — ขยายงบได้ ระวังเพดาน",
        evidence: [
          { label: "CPL 30 วันล่าสุด", value: `${money(adsNow.cpl)} · ${adsNow.rows.length} ชุด` },
          { label: "CPL 30 วันก่อน", value: money(adsPrev.cpl) },
          { label: "lead ที่ได้", value: `${num(adsNow.leads)} ราย` },
        ],
        action: { label: "ดูงานยิงแอด", screen: "results" },
      });
    }
  }
  /* ============ ช่วงเวลาโพสต์ ============ */
  if (teamER84 != null) {
    const cells = publishHeatmap(cards, r84).filter((c) => c.n >= MIN_N && c.avgER != null);
    const best = cells
      .filter((c) => c.avgER >= teamER84 * 1.3)
      .sort((a, b) => b.avgER - a.avgER)[0];
    if (best) {
      const DOW = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
      const from = 8 + best.slot * 2;
      out.push({
        id: `timing-hotspot:${best.dow}-${best.slot}`,
        rule: "timing-hotspot",
        severity: "info",
        dimension: "timing",
        title: `ช่วงทอง: ${DOW[best.dow]} ${from}:00–${from + 2}:00`,
        detail: "จัดคิวงานสำคัญมาลงช่วงนี้",
        evidence: [
          { label: "ER ช่วงนี้", value: `${pct(best.avgER)} · ${best.n} ชิ้น` },
          { label: "ER รวม 12 สัปดาห์", value: pct(teamER84) },
        ],
        action: { label: "ไปตั้งเวลาในปฏิทิน", screen: "cal" },
      });
    }
  }
  /* ============ idea ค้างคลัง ============ */
  const purge = cards.filter((c) => isIdeaPurgeDue(c, data.settings, nowClock));
  if (purge.length > 0) {
    out.push({
      id: "idea-backlog:now",
      rule: "idea-backlog",
      severity: "info",
      dimension: "process",
      title: `ไอเดียค้างคลังเกิน ${data.settings.idea_purge_days} วัน ${purge.length} ใบ`,
      detail: "ตาม SOP ให้เคลียร์ทุกไตรมาส — ตัดสินใจว่าจะทำหรือลบ",
      evidence: [{ label: "ค้างเกินกำหนด", value: `${purge.length} ใบ` }],
      action: { label: "ดูคลัง Idea", screen: "board" },
    });
  }
  /* ---- เรียง: ความรุนแรงก่อน แล้วชื่อเพื่อความคงที่ ---- */
  return out.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return s !== 0 ? s : a.id.localeCompare(b.id);
  });
}
/* ============================================================
 Provider — จุดสลับไป AI จริง
 ============================================================ */
export const ruleInsightProvider = {
  kind: "rules",
  generate: async (input) => computeInsights(input),
};
/* วันที่จะต่อ Claude API จริง:
 1) เพิ่มช่องเก็บ API key ใน Settings (Admin)
 2) สร้าง claudeInsightProvider ที่ส่งสรุปตัวเลข (ไม่ส่งข้อมูลดิบทั้งก้อน)
   แล้ว parse คำตอบเป็น Insight[] — ถ้า error ให้ fallback มา ruleInsightProvider
 3) หน้า Dashboard เปลี่ยนแค่ provider ตัวเดียว ไม่ต้องแก้ UI                    */
/** ตัวช่วยสำหรับ UI: นับ insight ตามความรุนแรง */
export function countBySeverity(list) {
  const out = { critical: 0, warn: 0, good: 0, info: 0 };
  for (const i of list)
    out[i.severity] += 1;
  return out;
}
