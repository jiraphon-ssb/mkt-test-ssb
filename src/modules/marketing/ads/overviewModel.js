/* ตัวเลขทั้งหน้า Overview จากข้อมูล + ตัวกรอง — logic ล้วน (แยกจาก component ให้เทสได้) */
import { analyticsCards } from "../mktAnalytics.js";
import { adChannelsByBrand, adsByBrandChannel, adsChannelList, adsCompanySummary, adsSalePipeline, filterByChannel, revenueBasisCards, share } from "../adsOverview.js";
import { compareRange, dataCutoff, syncedThrough, effectiveCompare, isoDay, periodRange, sameDatesLastMonth, rangeLabel } from "../adsScope.js";
import { combineTargets, goalsFor, normalizeTargets, periodForTargets, pipelineValues, plansFromTargets } from "../adsTargets.js";
import { applySalesToBrands, applySalesToSummary, cashSummary, combineGoalTargets, goalTargetsByBrand, plansFromSalesGoals, salesFactsByBrand, salesPipeline } from "./salesOverview.js";
import { FUNNEL_STAGE_KEYS, funnelStagesOf, metricCoverage } from "./salesFacts.js";
import { GOAL_FIELDS, SALES_BRAND_IDS } from "./syncSources.js";
import { monthClockAsOf, paceOf } from "./paceEngine.js";
import { brandAdvice } from "./overviewActions.js";
import { latestSpendDay } from "../adsCampaigns.js";
import { adsCreativeRows, adsDailySeries } from "../adsOverview.js";

export function buildOverviewModel({ data, ads, inBrandScope, brandFilter, filters }) {
  /* เดือนนี้มีเป้า/จังหวะ/คาดการณ์รายเดือน · ช่วงอื่นคิดเฉพาะวันที่เลือกและเทียบช่วงก่อน
     ห้ามเอายอดช่วงสั้นไปหารเป้าทั้งเดือน — AdsWorkspace แยกการนำเสนอตาม monthView */
  const { period = "mtd", from: customFrom = null, to: customTo = null, compare: chosenCompare, channel, basis: revenueBasis } = filters;
  const compare = effectiveCompare(period, chosenCompare);
    const scopedAll = revenueBasisCards(analyticsCards(ads.cards).filter(inBrandScope), revenueBasis, { mockFallback: ads.mockFallback });
    const scoped = filterByChannel(scopedAll, channel);
    const today = isoDay(new Date());
    // ข้อมูลครบถึง = วันก่อนรอบดึงสำเร็จล่าสุด · ไม่รู้เวลารอบดึง = วันล่าสุดที่มีค่าแอด (รีวิวโค้ด 28 ก.ย.)
    const dataThrough = ads?.source === "meta_pilot" ? syncedThrough(ads.pilot?.summary?.lastSuccessAt) ?? latestSpendDay(analyticsCards(ads.cards ?? [])) : null;
    /* ช่วง "ล่าสุด/นี้" จบที่วันที่มีข้อมูล แล้วช่วงเทียบคิดจากช่วงนั้น (ตรวจรอบ 28 ก.ย.: เดือนนี้ ▼5.60% ทั้งที่จริง ▲0.51%) */
    const cutoff = dataCutoff(today, dataThrough);
    const range = periodRange(period, customFrom, customTo, new Date(), cutoff);
    const before = compareRange(period, range, compare);
    const brands = (data.brands ?? []).filter((brand) => brand.active !== false && (brandFilter === "all" || brand.id === brandFilter));
    /* จังหวะคิดถึงวันที่ข้อมูลครบ (เมื่อวาน) ไม่ใช่วันนี้ — อาร์ตเคาะ 27 ก.ย. · วันที่ 1 ใช้วันนี้ (นาฬิกาหลักตอบ "ยังเร็วไป") */
    /* ข้อมูลจริงดึงวันละครั้ง 09:00 — หลังเที่ยงคืนก่อนรอบนั้น ข้อมูลยังถึงแค่ก่อนเมื่อวาน (ตรวจรอบ 27 ก.ย. ดึก)
       dataThrough = วันล่าสุดที่มีค่าแอดทั้งระบบ (ไม่ขึ้นกับแบรนด์ที่กรอง) · ข้อมูลตัวอย่างไม่มีรอบดึง ใช้เมื่อวานตามเดิม */
    const paceClock = monthClockAsOf(today, dataThrough);
    const paceDay = paceClock.asOf ?? today;
    const monthRange = periodRange("mtd", null, null, new Date(), cutoff);
    /* โหมดช่วงเวลา: "เดือนนี้" = ยอด + เป้า + จังหวะรายเดือน · ช่วงอื่น (วันนี้/7 วัน/กำหนดเอง) = ทุกยอดคิดจากช่วงที่เลือกล้วน
       และเทียบกับช่วงก่อน — เป้า/จังหวะรายเดือนไม่มีความหมายกับช่วง 1 วันหรือ 7 วัน จึงไม่แสดง */
    const monthView = period === "mtd";
    const sumRange = monthView ? monthRange : range;
    const prevRange = monthView ? sameDatesLastMonth(monthRange) : before;
    // ช่วงว่าง (สัปดาห์นี้วันจันทร์ก่อนข้อมูลเข้า) = ป้ายเป็นวันเริ่ม ไม่ใช่ "28 – 27 ก.ย."
    const shownFrom = isoDay(new Date(range.start)), shownTo = range.end > range.start ? isoDay(new Date(new Date(range.end).getTime() - 1)) : shownFrom;
    /* ช่วงว่าง: shownTo ใช้ทำป้ายเท่านั้น — ข้อมูลต้องเป็นช่วงว่างจริง ไม่ใช่วันเริ่ม 1 วัน (รีวิวโค้ด 28 ก.ย.:
       "สัปดาห์นี้" วันจันทร์ กล่อง funnel/เป้าเคยอ่านข้อมูลครึ่งวันของวันนี้) */
    const dataTo = range.end > range.start ? shownTo : isoDay(new Date(new Date(range.start).getTime() - 86_400_000));
    /* ยังไม่มีวันไหนของเดือนนี้ที่ข้อมูลครบ (วันที่ 1 · วันที่ 2 ก่อน 09:00) = เป้ายังไม่คาดหวังอะไร ไม่ใช่ 1 วัน */
    const targetPeriod = monthView && !paceClock.asOf ? { mode: "month", elapsed: 0, monthDays: paceClock.daysTotal }
      : periodForTargets({ monthView, from: shownFrom, to: dataTo, today: paceDay });
    /* ข้อมูลจริง = ยึดระบบขายของพี่ทัช: ยอดขาย · funnel · เป้า · งบ Meta มาจากระบบขายทั้งหมด (แผน 2026-09-17 ข้อ 3–4)
       ค่าแอดยังเป็นของ Meta · ระดับแพลตฟอร์ม/แคมเปญยังเป็น Meta attribute (ยอดจริงมาถึงแค่แบรนด์×วัน)
       ข้อมูลจำลอง (สาธิต) ใช้เป้าจากหน้าตั้งค่าเดิมต่อ ไม่ผสมกับยอดจริง */
    const real = ads.source === "meta_pilot";
    const goalMonth = `${(monthView ? today : shownTo).slice(0, 7)}-01`;
    const planMonth = (monthView ? today : shownTo).slice(0, 7);
    const plans = real
      ? plansFromSalesGoals({ goals: ads.salesGoals, month: planMonth, basis: revenueBasis })
      : plansFromTargets({
        targets: data.settings?.ads_control?.targets ?? {}, adBudgets: data.ad_budgets ?? [], salesTargets: data.sales_targets ?? [],
        month: planMonth, channelsByBrand: adChannelsByBrand(scopedAll, monthView ? monthRange : range),
      });
    const metaTotals = adsByBrandChannel(scopedAll, sumRange, brands, plans.adBudgets, paceDay, plans.salesTargets, prevRange);
    const dayRange = (r) => ({ from: isoDay(new Date(r.start)), to: isoDay(new Date(new Date(r.end).getTime() - 1)), today });
    const sales = real ? salesFactsByBrand(ads.sales, { ...dayRange(sumRange), today }) : null;
    const prevSales = real ? salesFactsByBrand(ads.sales, dayRange(prevRange)) : null;
    const brandTotals = real ? applySalesToBrands(metaTotals, { sales, prevSales, basis: revenueBasis, sourceBrandIds: SALES_BRAND_IDS }) : metaTotals;
    const filteredBrands = channel === "all" ? brandTotals : adsByBrandChannel(scoped, sumRange, brands, plans.adBudgets, paceDay, plans.salesTargets, prevRange);
    const filteredById = new Map(filteredBrands.map((brand) => [brand.id, brand]));
    const summary = real ? applySalesToSummary(adsCompanySummary(brandTotals, paceDay), brandTotals, paceDay) : adsCompanySummary(brandTotals, paceDay);
    const metaPipelines = Object.fromEntries(brands.map((brand) => [brand.id, adsSalePipeline(scoped.filter((card) => card.brand_id === brand.id), range, before)]));
    const metaOverall = adsSalePipeline(scoped, range, before);
    let pipelines = metaPipelines;
    let overallPipeline = metaOverall;
    let goals;
    let funnelBrandIds = null, funnelExcludedNames = [];   // กราฟแนวโน้มใช้ชุดเดียวกับกล่อง funnel (ตรวจรอบ 28 ก.ย.)
    if (real) {
      const coverage = metricCoverage(ads.sales);
      const pipeSales = salesFactsByBrand(ads.sales, { from: shownFrom, to: dataTo, today });
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
          basis: revenueBasis, depositsSince: coverage.get(brand.id)?.deposits ?? null, from: shownFrom, to: dataTo,
          waiting: !SALES_BRAND_IDS.includes(brand.id),
          // ระบบขายของบางแบรนด์ไม่มีครบทุกขั้น (JUNTAKARN ไม่มี Lead/มัดจำ) — ขั้นที่ไม่มีต้องขึ้น "—" ไม่ใช่ 0
          stages: funnelStagesOf(brand.id),
        })];
      }));
      /* ภาพรวม: รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย — ค่าแอดของแบรนด์ที่รอเชื่อมไม่นับ ไม่งั้น ROAS ภาพรวมต่ำเกินจริง */
      const mergeIds = (map, ids) => {
        const rows = ids.map((id) => map.get(id)).filter(Boolean);
        if (!rows.length) return null;
        // ตัวไหนมีแบรนด์ที่ไม่รู้ (null เช่น Lead ก่อนระบบขายเก็บจริง) ภาพรวมตัวนั้น = ไม่รู้ ไม่ใช่นับเป็น 0
        return rows.reduce((acc, row) => Object.fromEntries(Object.keys(row).map((key) => [key, acc[key] === null || row[key] == null ? null : (acc[key] ?? 0) + row[key]])), {});
      };
      /* funnel ภาพรวม: นับเฉพาะแบรนด์ที่ระบบขายเก็บครบทุกขั้น — JUNTAKARN มี 2 ขั้น (คนทัก → ยืนยันออเดอร์)
         ถ้าเอามารวม คนทักของ JK จะเข้าไปอยู่ในตัวหารแต่ Lead เป็น 0 → %Lead ภาพรวมต่ำกว่าความจริง
         (ยอดขาย · ROAS · %Ads · งบ ยังรวม JUNTAKARN ตามปกติ) */
      const funnelIds = SALES_BRAND_IDS.filter((id) => funnelStagesOf(id).length === FUNNEL_STAGE_KEYS.length);
      const funnelExcluded = SALES_BRAND_IDS.filter((id) => !funnelIds.includes(id)).map((id) => brands.find((brand) => brand.id === id)?.name).filter(Boolean);
      const sourceCards = scoped.filter((card) => funnelIds.includes(card.brand_id));
      const starts = funnelIds.map((id) => coverage.get(id)?.deposits).filter(Boolean).sort();
      const sourceRows = funnelIds.map((id) => byId.get(id)).filter(Boolean);
      const sumOf = (pick) => sourceRows.some((row) => pick(row) != null) ? sourceRows.reduce((n, row) => n + (pick(row) ?? 0), 0) : null;
      overallPipeline = salesPipeline({
        sales: mergeIds(pipeSales, funnelIds), prevSales: mergeIds(pipePrev, funnelIds),
        metaInquiries: metaInquiriesOf(adsSalePipeline(sourceCards, range, before)),
        spend: sumOf((row) => row.spend), prevSpend: sumOf((row) => row.prevSpend),
        basis: revenueBasis, depositsSince: starts[starts.length - 1] ?? null, from: shownFrom, to: dataTo,
        stages: FUNNEL_STAGE_KEYS,   // แบรนด์ที่เข้า funnel ภาพรวมเก็บครบ 4 ขั้นทุกแบรนด์
      });
      if (funnelExcluded.length) overallPipeline = { ...overallPipeline, excluded: funnelExcluded };
      funnelBrandIds = funnelIds; funnelExcludedNames = funnelExcluded;
      /* ROAS · %Ads · CAC ภาพรวมต้องนับ "ทุกแบรนด์ที่มีแหล่งยอดขาย" ตามกติกาที่เขียนไว้ใน README
         ต่างจากขั้น funnel ที่นับเฉพาะแบรนด์ที่เก็บครบ — ไม่งั้นบนหน้าเดียวกันจะมี ROAS สองค่า
         (แผงประสิทธิภาพนับ 3 แบรนด์ = 9.05× แต่กราฟแนวโน้มกับ %Ads นับ 4 แบรนด์ = 8.04×)
         CPL ไม่รวม เพราะตัวหารคือ Lead ซึ่งมีเฉพาะแบรนด์ที่เก็บครบขั้นนั้น */
      const allRows = SALES_BRAND_IDS.map((id) => byId.get(id)).filter(Boolean);
      const sumAll = (pick) => allRows.some((row) => pick(row) != null) ? allRows.reduce((n, row) => n + (pick(row) ?? 0), 0) : null;
      const allPipeline = salesPipeline({
        sales: mergeIds(pipeSales, SALES_BRAND_IDS), prevSales: mergeIds(pipePrev, SALES_BRAND_IDS),
        metaInquiries: null,
        spend: sumAll((row) => row.spend), prevSpend: sumAll((row) => row.prevSpend),
        basis: revenueBasis, depositsSince: starts[starts.length - 1] ?? null, from: shownFrom, to: dataTo,
        stages: FUNNEL_STAGE_KEYS,
      });
      const allRatios = new Map(["roas", "pctAds", "cac"].map((key) => [key, allPipeline.items.find((item) => item.key === key)]));
      overallPipeline = { ...overallPipeline, items: overallPipeline.items.map((item) => allRatios.get(item.key) ?? item) };
      const targets = goalTargetsByBrand(ads.salesGoals, goalMonth);
      const goalRows = new Map((ads.salesGoals ?? []).filter((goal) => String(goal.month).slice(0, 10) === goalMonth).map((goal) => [goal.brand_id, goal]));
      /* เป้าภาพรวมต้องนับ "ชุดแบรนด์เดียวกับตัวเลขจริงที่มันเทียบ" — ซึ่งบนการ์ดภาพรวมมีสองชุด
           · ขั้น funnel + CPL = แบรนด์ที่เก็บครบทุกขั้น (JUNTAKARN ไม่มี Lead/มัดจำ)
           · ROAS + %Ads = ทุกแบรนด์ที่มีแหล่งยอดขาย (เหมือนตัวเลขจริงที่รวม JUNTAKARN)
         ถ้าใช้ชุดเดียวกันหมด จะได้เป้าคนทัก 6,566 เทียบของจริง 2,769 หรือเป้า ROAS 8.76 เทียบของจริง 8.04 */
      const goalEntry = (id) => ({
        targets: targets.get(id) ?? {},
        weights: { budget: goalRows.get(id)?.ad_budget, revenue: goalRows.get(id)?.sales_target, inquiries: goalRows.get(id)?.inquiry_target },
      });
      const funnelTargets = combineGoalTargets(funnelIds.filter((id) => byId.has(id)).map(goalEntry));
      const allTargets = combineGoalTargets(SALES_BRAND_IDS.filter((id) => byId.has(id)).map(goalEntry));
      goals = {
        overall: goalsFor(pipelineValues(overallPipeline), { ...funnelTargets, roas: allTargets.roas, pctAds: allTargets.pctAds }, targetPeriod),
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
    /* ---------- ชั้นตัดสินใจของหน้า Overview (รื้อ 21 ก.ย. 69) ----------
       ทุกการ์ดอ่านจากชุดนี้ชุดเดียว — จังหวะ · คำแนะนำ · เรื่องที่ต้องทำวันนี้
       ค่าแอดจาก Meta มาช้ากว่ายอดขาย 1 วันเสมอ จึงตั้งเพดานความเก่าไว้ 2 วัน
       (1 วันจะทำให้จังหวะงบขึ้น "ยังตัดสินใจไม่ได้" ทุกเช้า · เกิน 2 วัน = ท่อมีปัญหาจริง) */
    const clock = paceClock;
    const spendDays = adsDailySeries(scopedAll, monthRange).filter((day) => day.spend > 0);
    const spendThrough = spendDays.length ? spendDays[spendDays.length - 1].day : null;
    const paceSet = (row) => {
      const rev = paceOf({ actual: row.revenue, target: row.revTarget, clock });
      const budget = paceOf({ actual: row.spend, target: row.budget, clock, direction: "spend", freshThrough: spendThrough, staleAfterDays: 2 });
      return { rev, budget, advice: brandAdvice({ revPace: rev, budgetPace: budget }) };
    };
    const brandRows = brandTotals.map((brand) => ({
      ...brand, revShare: share(brand.revenue, summary.revenue), spendShare: share(brand.spend, summary.spend),
      channels: filteredById.get(brand.id)?.channels ?? [], pace2: monthView ? paceSet(brand) : null,
    }));
    const overallPace = monthView ? paceSet({ revenue: summary.revenue, revTarget: summary.revTarget, spend: summary.spend, budget: summary.budget }) : null;

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
      brands: brandRows,
      pipelines,
      overallPipeline, funnelBrandIds, funnelExcluded: funnelExcludedNames,
      goals,
      clock, asOf: paceClock.asOf,
      spendThrough, dataThrough, cutoff,
      overallPace,
      /* เงินจริงจากระบบขาย (สเปก 2026-09-26) — ข้อมูลตัวอย่างไม่มีระบบขาย = null (ไม่แสดงกล่อง) */
      cash: real ? cashSummary({ sales, brands: brandTotals }) : null,
    };
}
