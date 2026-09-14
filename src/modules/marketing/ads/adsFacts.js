/* ============================================================
   adsFacts — ยอดจริงจาก ad_daily_facts → "การ์ดแอด" รูปเดียวกับ mock (pure · มีเทส)
   ทุกหน้า ads คำนวณจากการ์ด → ต่อข้อมูลจริงได้โดยไม่เขียนตัวคำนวณใหม่
   กติกา: ไม่ผสมยอดจำลองกับยอดจริง · null ≠ 0 · วันนี้ยังไม่จบ = provisional
   ============================================================ */
export const ADS_SOURCE_OPTIONS = [["mock", "ข้อมูลจำลอง"], ["meta_pilot", "Meta Pilot"]];
export const normalizeAdsSource = (value) => ADS_SOURCE_OPTIONS.some(([key]) => key === value) ? value : "mock";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
/* เที่ยงวันตามเวลาเครื่อง: inRange ของหน้าจอใช้ช่วงเวลาท้องถิ่น → วันของ fact ไม่เลื่อนข้ามวัน */
const localNoonISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0).toISOString(); };

/* ใบงาน ads ทุกใบ (track project) — ตรงกับ isAdsCard ที่ adsRollup ใช้ · ตัดทั้งหมดในโหมดข้อมูลจริง */
const isAdCard = (card) => card?.track === "project";

export function factsToAdCards(facts = [], connections = [], { today } = {}) {
  const live = new Map(connections.filter((c) => c.status !== "disabled").map((c) => [c.id, c]));
  const tracksValue = new Set(facts.filter((f) => f.attributed_value != null).map((f) => f.connection_id));
  const cards = [];
  for (const f of facts) {
    const connection = live.get(f.connection_id);
    if (!connection || !ISO.test(f.fact_date ?? "")) continue;
    const spend = num(f.spend), leads = num(f.leads);
    const value = num(f.attributed_value);
    const campaign = f.campaign_name || f.campaign_id || null;
    cards.push({
      id: `mf_${f.connection_id}_${f.fact_date}_${f.ad_id}`,
      source: "meta",
      ad_platform: "Meta Ads",
      track: "project",
      status: "measured",
      archived: true,
      brand_id: connection.brand_id,
      owner_id: null,
      pillar: null,
      title: `ads — ${campaign ?? "ไม่ระบุแคมเปญ"}`,
      campaign,
      campaign_id: f.campaign_id ?? "",
      ad_group: f.ad_group_name || f.ad_group_id || null,
      ad_id: f.ad_id ?? "",
      creative: f.ad_name || f.ad_id || null,
      account_id: connection.external_account_id,
      fact_date: f.fact_date,
      provisional: f.fact_date === today,
      is_realtime: false,
      plan_confirmed: true,
      brief: { channels: ["Meta Ads"], publish_at: null, format: null },
      metrics: {
        spend, impressions: num(f.impressions), reach: num(f.reach), clicks: num(f.clicks), link_clicks: num(f.link_clicks),
        leads, conversions: leads, orders: null, engagement: null,
        cpl: spend != null && leads > 0 ? spend / leads : null,
        // Meta ไม่ส่ง action_values ที่เป็นศูนย์ → บัญชีที่วัด purchase ได้ แถวที่ไม่มี = 0 · บัญชีที่ไม่เคยมี = ไม่รู้ (null)
        revenue: value ?? (tracksValue.has(f.connection_id) ? 0 : null),
        new_revenue: null,
        measured_at: localNoonISO(f.fact_date),
      },
    });
  }
  return cards;
}

export function adsCardsForSource(cards = [], source = "mock", realCards = []) {
  if (normalizeAdsSource(source) === "mock") return cards;
  return [...cards.filter((card) => !isAdCard(card)), ...realCards];
}

export function pilotSummary(connections = [], facts = [], { today } = {}) {
  const live = connections.filter((c) => c.status !== "disabled");
  const lastSuccessAt = live.map((c) => c.last_success_at).filter(Boolean).sort().at(-1) ?? null;
  const dates = facts.map((f) => f.fact_date).filter(Boolean).sort();
  return {
    accounts: live.length, lastSuccessAt, from: dates[0] ?? null, to: dates.at(-1) ?? null, rows: facts.length,
    provisionalToday: dates.at(-1) === today, empty: facts.length === 0,
  };
}

/** โหลดย้อนหลัง 200 วัน: ครอบ backfill สูงสุด 180 วัน + ช่วงเทียบเดือนก่อน */
export function factsLoadRange(today, days = 200) {
  const [y, m, d] = today.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, d) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to: today };
}
