export function creativeLibrarySummary(rows = []) {
  const withMedia = rows.filter((row) => row.asset?.media?.some((item) => item.imageUrl || item.thumbnailUrl || item.videoUrl));
  const tired = rows.filter((row) => row.fatigue);
  return {
    count: rows.length,
    withMedia: withMedia.length,
    tired: tired.length,
    spend: rows.reduce((sum, row) => sum + (Number(row.spend) || 0), 0),
    // การซื้อของ Meta: นับเฉพาะชิ้นที่รู้ค่า · ไม่มีชิ้นไหนรู้เลย = null
    purchases: rows.some((row) => row.purchases != null) ? rows.reduce((sum, row) => sum + (row.purchases ?? 0), 0) : null,
  };
}

export function filterCreativeLibrary(rows = [], filters = {}) {
  const query = String(filters.query ?? "").trim().toLowerCase();
  const result = rows.filter((row) =>
    (filters.brand === "all" || !filters.brand || row.brandId === filters.brand)
    && (filters.platform === "all" || !filters.platform || row.platform === filters.platform)
    && (filters.format === "all" || !filters.format || creativeFormatOf(row) === filters.format)
    && (filters.state === "all" || !filters.state || (filters.state === "fatigue" ? row.fatigue : filters.state === "ready" ? Boolean(row.asset) : !row.asset))
    && (!query || [row.creative, row.brand, row.platform, ...(row.campaigns ?? [])].some((value) => String(value ?? "").toLowerCase().includes(query)))
  );
  const key = filters.sort ?? "spend";
  return [...result].sort((a, b) => {
    if (key === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
    if (key === "ctr") return (b.ctr ?? -1) - (a.ctr ?? -1);
    if (key === "purchases") return (b.purchases ?? -1) - (a.purchases ?? -1);
    if (key === "cpa") return (a.cpa ?? Number.POSITIVE_INFINITY) - (b.cpa ?? Number.POSITIVE_INFINITY);
    if (key === "cpl") return (a.cpl ?? Number.POSITIVE_INFINITY) - (b.cpl ?? Number.POSITIVE_INFINITY);
    if (key === "frequency") return (b.frequency ?? -1) - (a.frequency ?? -1);
    return (b.spend ?? 0) - (a.spend ?? 0);
  });
}

/* ── รูปแบบชิ้นงาน (วิดีโอ/ภาพ/อัลบั้ม/Carousel) ──
   ใช้ format ที่ดึงจาก Meta (ad_creatives) ก่อน · ไม่รู้ค่อยอ่านคำนำหน้าชื่อที่ทีมตั้งไว้ (VDO | … · PIC | … · Album_…) */
export const FORMAT_LABELS = { video: "วิดีโอ", image: "ภาพ", album: "อัลบั้ม", carousel: "Carousel", dynamic: "ไดนามิก", unknown: "ไม่ระบุ" };
const META_FORMATS = new Set(["video", "image", "carousel", "dynamic"]);

export function creativeFormatOf(row) {
  const fromMeta = row?.asset?.format;
  if (META_FORMATS.has(fromMeta)) return fromMeta;
  const name = String(row?.creative ?? "").trim();
  if (/^(vdo|video|vid|reel|clip)\b/i.test(name)) return "video";
  if (/^(pic|photo|img|image)\b/i.test(name)) return "image";
  if (/^album/i.test(name)) return "album";
  return "unknown";
}

/** สรุปตามรูปแบบ — เทียบว่าวิดีโอ/ภาพ/อัลบั้ม แบบไหนได้คนทักและการซื้อคุ้มกว่า (การซื้อ = ของ Meta · ไม่รู้ทั้งกลุ่ม = null) */
export function formatBreakdown(rows = []) {
  const total = rows.reduce((n, row) => n + (Number(row.spend) || 0), 0);
  const groups = new Map();
  for (const row of rows) {
    const format = creativeFormatOf(row);
    const g = groups.get(format) ?? { format, count: 0, spend: 0, leads: 0, clicks: 0, impressions: 0, purchases: null, purchaseSpend: 0, fatigue: 0 };
    g.count += 1;
    g.spend += Number(row.spend) || 0;
    g.leads += Number(row.leads) || 0;
    g.clicks += Number(row.clicks) || 0;
    g.impressions += Number(row.impressions) || 0;
    if (row.purchases != null) { g.purchases = (g.purchases ?? 0) + row.purchases; g.purchaseSpend += Number(row.spend) || 0; }
    if (row.fatigue) g.fatigue += 1;
    groups.set(format, g);
  }
  const ratio = (a, b) => (b > 0 ? a / b : null);
  return [...groups.values()].sort((a, b) => b.spend - a.spend).map((g) => ({
    format: g.format, label: FORMAT_LABELS[g.format], count: g.count, spend: g.spend, spendShare: ratio(g.spend, total),
    leads: g.leads, cpl: ratio(g.spend, g.leads), purchases: g.purchases, cpa: g.purchases == null ? null : ratio(g.purchaseSpend, g.purchases),
    ctr: ratio(g.clicks, g.impressions), fatigue: g.fatigue,
  }));
}
