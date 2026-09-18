/* ตัวเลขทั้งหน้า Overview จากข้อมูล + ตัวกรอง — logic ล้วน (แยกจาก component ให้เทสได้) */
import { analyticsCards } from "../mktAnalytics.js";
import { adChannelsByBrand, adsByBrandChannel, adsChannelList, adsCompanySummary, adsSalePipeline, filterByChannel, revenueBasisCards, share } from "../adsOverview.js";
import { compareRange, effectiveCompare, isoDay, periodRange, sameDatesLastMonth, rangeLabel } from "../adsScope.js";
import { combineTargets, goalsFor, normalizeTargets, periodForTargets, pipelineValues, plansFromTargets } from "../adsTargets.js";
import { applySalesToBrands, applySalesToSummary, channelFunnel, combineGoalTargets, goalTargetsByBrand, plansFromSalesGoals, salesFactsByBrand, salesPipeline } from "./salesOverview.js";
import { FUNNEL_STAGE_KEYS, funnelStagesOf, metricCoverage } from "./salesFacts.js";
import { SALES_BRAND_IDS } from "./syncSources.js";

export function buildOverviewModel({ data, ads, inBrandScope, brandFilter, filters }) {
  const { period, from: customFrom, to: customTo, compare: chosenCompare, channel, basis: revenueBasis } = filters;
  const compare = effectiveCompare(period, chosenCompare);
    const scopedAll = revenueBasisCards(analyticsCards(ads.cards).filter(inBrandScope), revenueBasis, { mockFallback: ads.mockFallback });
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compareRange(period, range, compare);
    const brands = (data.brands ?? []).filter((brand) => brand.active !== false && (brandFilter === "all" || brand.id === brandFilter));
    const today = isoDay(new Date());
    const monthRange = periodRange("mtd", null, null);
    /* โหมดช่วงเวลา: "เดือนนี้" = ยอด + เป้า + จังหวะรายเดือน · ช่วงอื่น (วันนี้/7 วัน/กำหนดเอง) = ทุกยอดคิดจากช่วงที่เลือกล้วน
       และเทียบกับช่วงก่อน — เป้า/จังหวะรายเดือนไม่มีความหมายกับช่วง 1 วันหรือ 7 วัน จึงไม่แสดง */
    const monthView = period === "mtd";
    const sumRange = monthView ? monthRange : range;
    const prevRange = monthView ? sameDatesLastMonth(monthRange) : before;
    const shownFrom = isoDay(new Date(range.start)), shownTo = isoDay(new Date(new Date(range.end).getTime() - 1));
    const targetPeriod = periodForTargets({ monthView, from: shownFrom, to: shownTo, today });
    /* ข้อมูลจริง = ยึดระบบขายของพี่ทัช: ยอดขาย · funnel · เป้า · งบ Meta มาจากระบบขายทั้งหมด (แผน 2026-09-17 ข้อ 3–4)
       ค่าแอดยังเป็นของ Meta · ระดับแพลตฟอร์ม/แคมเปญยังเป็น Meta attribute (ยอดจริงมาถึงแค่แบรนด์×วัน)
       ข้อมูลจำลอง (สาธิต) ใช้เป้าจากหน้าตั้งค่าเดิมต่อ ไม่ผสมกับยอดจริง */
    const real = ads.source === "meta_pilot";
    const goalMonth = `${(monthView ? today : shownTo).slice(0, 7)}-01`;
    const plans = real
      ? plansFromSalesGoals({ goals: ads.salesGoals, month: today.slice(0, 7), basis: revenueBasis })
      : plansFromTargets({
        targets: data.settings?.ads_control?.targets ?? {}, adBudgets: data.ad_budgets ?? [], salesTargets: data.sales_targets ?? [],
        month: today.slice(0, 7), channelsByBrand: adChannelsByBrand(scopedAll, monthRange),
      });
    const metaTotals = adsByBrandChannel(scopedAll, sumRange, brands, plans.adBudgets, today, plans.salesTargets, prevRange);
    const dayRange = (r) => ({ from: isoDay(new Date(r.start)), to: isoDay(new Date(new Date(r.end).getTime() - 1)), today });
    const sales = real ? salesFactsByBrand(ads.sales, dayRange(sumRange)) : null;
    const prevSales = real ? salesFactsByBrand(ads.sales, dayRange(prevRange)) : null;
    const brandTotals = real ? applySalesToBrands(metaTotals, { sales, prevSales, basis: revenueBasis, sourceBrandIds: SALES_BRAND_IDS }) : metaTotals;
    const filteredBrands = channel === "all" ? brandTotals : adsByBrandChannel(scoped, sumRange, brands, plans.adBudgets, today, plans.salesTargets, prevRange);
    const filteredById = new Map(filteredBrands.map((brand) => [brand.id, brand]));
    const summary = real ? applySalesToSummary(adsCompanySummary(brandTotals, today), brandTotals, today) : adsCompanySummary(brandTotals, today);
    const metaPipelines = Object.fromEntries(brands.map((brand) => [brand.id, adsSalePipeline(scoped.filter((card) => card.brand_id === brand.id), range, before)]));
    const metaOverall = adsSalePipeline(scoped, range, before);
    let pipelines = metaPipelines;
    let overallPipeline = metaOverall;
    let goals;
    let channelFunnels = null;
    if (real) {
      const coverage = metricCoverage(ads.sales);
      const pipeSales = salesFactsByBrand(ads.sales, { from: shownFrom, to: shownTo, today });
      const pipePrev = salesFactsByBrand(ads.sales, dayRange(before));
      const metaInquiriesOf = (pipeline) => pipeline?.items?.find((item) => item.key === "inquiries")?.value ?? null;
      const byId = new Map(brandTotals.map((brand) => [brand.id, brand]));
      /* ค่าแอดใช้ยอดระดับแบรนด์ที่คิดไว้แล้ว (ทุกแพลตฟอร์ม) — ยอดขายจริงไม่มีมิติแพลตฟอร์มโฆษณาให้แยก */
      pipelines = Object.fromEntries(brands.map((brand) => {
        const row = byId.get(brand.id);
        return [brand.id, salesPipeline({
          sales: pipeSales.get(brand.id) ?? null, prevSales: pipePrev.get(brand.id) ?? null,
          metaInquiries: metaInquiriesOf(metaPipelines[brand.id]),
          spend: row?.spend ?? null, prevSpend: row?.prevSpend ?? null,
          basis: revenueBasis, depositsSince: coverage.get(brand.id)?.deposits ?? null, from: shownFrom, to: shownTo,
          waiting: !SALES_BRAND_IDS.includes(brand.id),
          // ระบบขายของบางแบรนด์ไม่มีครบทุกขั้น (JUNTAKARN ไม่มี Lead/มัดจำ) — ขั้นที่ไม่มีต้องขึ้น "—" ไม่ใช่ 0
          stages: funnelStagesOf(brand.id),
        })];
      }));
      /* ภาพรวม: รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย — ค่าแอดของแบรนด์ที่รอเชื่อมไม่นับ ไม่งั้น ROAS ภาพรวมต่ำเกินจริง */
      const merge = (map) => {
        const rows = SALES_BRAND_IDS.map((id) => map.get(id)).filter(Boolean);
        if (!rows.length) return null;
        // ตัวไหนมีแบรนด์ที่ไม่รู้ (null เช่น Lead ก่อนระบบขายเก็บจริง) ภาพรวมตัวนั้น = ไม่รู้ ไม่ใช่นับเป็น 0
        return rows.reduce((acc, row) => Object.fromEntries(Object.keys(row).map((key) => [key, acc[key] === null || row[key] == null ? null : (acc[key] ?? 0) + row[key]])), {});
      };
      const sourceCards = scoped.filter((card) => SALES_BRAND_IDS.includes(card.brand_id));
      const starts = SALES_BRAND_IDS.map((id) => coverage.get(id)?.deposits).filter(Boolean).sort();
      const sourceRows = SALES_BRAND_IDS.map((id) => byId.get(id)).filter(Boolean);
      const sumOf = (pick) => sourceRows.some((row) => pick(row) != null) ? sourceRows.reduce((n, row) => n + (pick(row) ?? 0), 0) : null;
      overallPipeline = salesPipeline({
        sales: merge(pipeSales), prevSales: merge(pipePrev),
        metaInquiries: metaInquiriesOf(adsSalePipeline(sourceCards, range, before)),
        spend: sumOf((row) => row.spend), prevSpend: sumOf((row) => row.prevSpend),
        basis: revenueBasis, depositsSince: starts[starts.length - 1] ?? null, from: shownFrom, to: shownTo,
        stages: FUNNEL_STAGE_KEYS,   // ภาพรวมรวมหลายแบรนด์ จึงยังมีครบ 4 ขั้น
      });
      /* funnel แยกช่องทางที่ลูกค้าทัก (FB / LINE) — ภาพรวมรวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย */
      const sourceIds = SALES_BRAND_IDS.filter((id) => brands.some((brand) => brand.id === id));
      channelFunnels = {
        overall: channelFunnel(ads.sales, { brandIds: sourceIds, from: shownFrom, to: shownTo, depositsSince: starts[starts.length - 1] ?? null }),
        byBrand: Object.fromEntries(sourceIds.map((id) => [id, channelFunnel(ads.sales, { brandIds: [id], from: shownFrom, to: shownTo, depositsSince: coverage.get(id)?.deposits ?? null })])),
      };
      const targets = goalTargetsByBrand(ads.salesGoals, goalMonth);
      const goalRows = new Map((ads.salesGoals ?? []).filter((goal) => String(goal.month).slice(0, 10) === goalMonth).map((goal) => [goal.brand_id, goal]));
      goals = {
        overall: goalsFor(pipelineValues(overallPipeline), combineGoalTargets(SALES_BRAND_IDS.filter((id) => byId.has(id)).map((id) => ({
          targets: targets.get(id) ?? {}, weights: { budget: goalRows.get(id)?.ad_budget, revenue: goalRows.get(id)?.sales_target, inquiries: goalRows.get(id)?.inquiry_target },
        }))), targetPeriod),
        byBrand: Object.fromEntries(brandTotals.map((brand) => [brand.id, goalsFor(pipelineValues(pipelines[brand.id]), targets.get(brand.id) ?? {}, targetPeriod)])),
      };
    } else {
      /* ข้อมูลจำลอง: เป้าจากหน้าตั้งค่าเดิม */
      const savedTargets = data.settings?.ads_control?.targets ?? {};
      goals = {
        overall: goalsFor({ ...pipelineValues(overallPipeline), pctAds: share(summary.spend, summary.revenue) }, combineTargets(brands.map((brand) => savedTargets[brand.id])), targetPeriod),
        byBrand: Object.fromEntries(brandTotals.map((brand) => [brand.id, goalsFor({ ...pipelineValues(pipelines[brand.id]), pctAds: brand.pctAds }, normalizeTargets(savedTargets[brand.id]), targetPeriod)])),
      };
    }
    return {
      scoped,
      scopedAll, // ทุกช่องทาง — กราฟแนวโน้มแท็บที่ใช้ระบบขายหารด้วยค่าแอดทุกช่องทาง (ยอดขายไม่แยกตามแพลตฟอร์มโฆษณา)
      range,
      before,
      monthView,
      rangeLabel: rangeLabel(shownFrom, shownTo),
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
      revenueBasis,
      channelList: adsChannelList(scopedAll),
      summary,
      brands: brandTotals.map((brand) => ({ ...brand, revShare: share(brand.revenue, summary.revenue), spendShare: share(brand.spend, summary.spend), channels: filteredById.get(brand.id)?.channels ?? [] })),
      pipelines,
      overallPipeline,
      goals,
      channelFunnels,
    };
}
