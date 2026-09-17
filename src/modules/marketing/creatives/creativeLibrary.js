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
