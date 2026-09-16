/* CampaignsView — หน้าตัดสินใจระดับแคมเปญ · ตัวเลขทั้งหมดมาจาก adsCampaigns.js */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Settings2 } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adChannelsByBrand, adsChannelList, filterByChannel, revenueBasisCards } from "../adsOverview.js";
import { campaignRows, campaignDecision, campaignsByBrand, withSpendShare } from "../adsCampaigns.js";
import { isoDay, periodRange, sameDatesLastMonth } from "../adsScope.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { combineTargets, normalizeTargets, periodForTargets, plansFromTargets } from "../adsTargets.js";
import { RevenueBasisToggle } from "../ui/RevenueBasisToggle.jsx";
import { CampaignsTable } from "./CampaignsTable.jsx";
import { CampaignDetail } from "./CampaignDetail.jsx";
import { adsDataHealth } from "../ads/adsDataHealth.js";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { campaignSalesSummary, combineGoalTargets, goalTargetsByBrand, plansFromSalesGoals } from "../ads/salesOverview.js";
import { SALES_BRAND_IDS } from "../ads/syncSources.js";
import "../ads/adsWorkspace.css";
import "./campaigns.css";

/* เป้ารวมจากระบบขาย: แบรนด์ที่เลือก หรือถ่วงรวมแบรนด์ที่มีแหล่งยอดขาย (แบรนด์รอเชื่อมไม่ดึงเป้ารวมเป็น null) */
function realGoalTargets(brands, selectedBrand, salesTargets, salesGoals, goalMonth) {
  if (selectedBrand !== "all") return salesTargets.get(selectedBrand) ?? {};
  const rows = new Map((salesGoals ?? []).filter((goal) => String(goal.month).slice(0, 10) === goalMonth).map((goal) => [goal.brand_id, goal]));
  return combineGoalTargets(brands.filter((b) => SALES_BRAND_IDS.includes(b.id)).map((b) => ({
    targets: salesTargets.get(b.id) ?? {},
    weights: { budget: rows.get(b.id)?.ad_budget, revenue: rows.get(b.id)?.sales_target, inquiries: rows.get(b.id)?.inquiry_target },
  })));
}

export function CampaignsView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const ads = useAdsData();
  const todayLocal = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [customFrom, setCustomFrom] = useState(todayLocal.slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(todayLocal);
  const [compare, setCompare] = useState("previous");
  const [channel, setChannel] = useState("all");
  const [brandSel, setBrandSel] = useState("all");
  const [status, setStatus] = useState("all");
  const [objective, setObjective] = useState("all");
  const [budgetState, setBudgetState] = useState("all");
  const [revenueBasis, setRevenueBasis] = useState("total");
  const [query, setQuery] = useState("");

  const v = useMemo(() => {
    const scopedAll = revenueBasisCards(analyticsCards(ads.cards).filter(inBrandScope), revenueBasis, { mockFallback: ads.mockFallback });
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const selectedBrand = brandSel === "all" || brands.some((b) => b.id === brandSel) ? brandSel : "all";
    const month = isoDay(new Date()).slice(0, 7);
    const shownFrom = isoDay(new Date(range.start)), shownTo = isoDay(new Date(new Date(range.end).getTime() - 1));
    /* ข้อมูลจริง = เป้าและงบ Meta จากระบบขายของพี่ทัช (แท็บเป้าของเราถอดแล้ว) · ข้อมูลจำลอง = ค่าที่เคยบันทึกไว้ในตั้งค่า (สาธิตอย่างเดียว) */
    const real = ads.source === "meta_pilot";
    const goalMonth = `${(period === "mtd" ? todayLocal : shownTo).slice(0, 7)}-01`;
    const salesTargets = real ? goalTargetsByBrand(ads.salesGoals, goalMonth) : null;
    const targets = real ? Object.fromEntries(salesTargets) : data.settings?.ads_control?.targets ?? {};
    const { adBudgets } = real
      ? plansFromSalesGoals({ goals: ads.salesGoals, month })
      : plansFromTargets({ targets, adBudgets: data.ad_budgets ?? [], month, channelsByBrand: adChannelsByBrand(scopedAll, periodRange("mtd", null, null)) });
    const all = campaignRows(scoped, range, {
      brands, adBudgets, campaignBudgets: data.campaign_budgets ?? [],
      today: isoDay(new Date()), prevRange: before,
    });
    const q = query.trim().toLowerCase();
    const filtered = all.filter((r) =>
      (selectedBrand === "all" || r.brandId === selectedBrand)
      && (status === "all" || r.status === status)
      && (objective === "all" || (r.objective ?? "unknown") === objective)
      && (budgetState === "all" || (budgetState === "set" ? r.budget != null : r.budget == null))
      && (!q || r.name.toLowerCase().includes(q))
    );
    /* ข้อมูลจริง: ตัดสินรายแคมเปญด้วยเพดาน CPL จากระบบขายเท่านั้น — ROAS เป้าเป็นยอดจริงระดับแบรนด์ ส่วน ROAS แคมเปญเป็นยอดที่ Meta เห็น
       เทียบกันตรงๆ จะติด "ตรวจแก้" ทุกแคมเปญ · ไม่มีเพดาน = กฎกลาง */
    const decisionTargets = (brandId) => real ? (targets[brandId]?.cpl != null ? { cpl: targets[brandId].cpl } : null) : targets[brandId] ?? null;
    const rows = withSpendShare(filtered).map((r) => ({ ...r, decision: campaignDecision(r, decisionTargets(r.brandId)) }));
    const brandSums = campaignsByBrand(all);
    const dataHealth = adsDataHealth(data.settings?.ads_control ?? {});
    return {
      rows, brands, selectedBrand, byBrand: brandSums.byBrand,
      /* เป้า: แบรนด์ที่เลือก หรือรวมทุกแบรนด์ในขอบเขต — ตัวเลขจริงเทียบใน CampaignsTable (ตามมุมมองที่กรองอยู่) */
      goalTargets: real ? realGoalTargets(brands, selectedBrand, salesTargets, ads.salesGoals, goalMonth)
        : selectedBrand === "all" ? combineTargets(brands.map((b) => targets[b.id])) : normalizeTargets(targets[selectedBrand]),
      targetPeriod: periodForTargets({ monthView: period === "mtd", from: shownFrom, to: shownTo, today: todayLocal }),
      salesSummary: real ? campaignSalesSummary({
        sales: ads.sales, from: shownFrom, to: shownTo, sourceBrandIds: SALES_BRAND_IDS,
        brandIds: (selectedBrand === "all" ? brands : brands.filter((b) => b.id === selectedBrand)).map((b) => b.id),
        names: Object.fromEntries(brands.map((b) => [b.id, b.name])),
        spendByBrand: Object.fromEntries(brands.map((b) => [b.id, filtered.filter((r) => r.brandId === b.id).reduce((n, r) => n + (r.spend ?? 0), 0)])),
      }) : null,
      channelList: adsChannelList(scopedAll), scopeEmpty: all.length === 0, range,
      statuses: [...new Set(all.map((r) => r.status))], objectives: [...new Set(all.map((r) => r.objective ?? "unknown"))],
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
      dataHealth,
    };
  }, [data, ads.cards, ads.mockFallback, ads.source, ads.sales, ads.salesGoals, inBrandScope, brandFilter, period, customFrom, customTo, compare, channel, brandSel, status, objective, budgetState, query, revenueBasis, todayLocal]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeRange = ({ period: nextPeriod, from, to }) => { setPeriod(nextPeriod); setCustomFrom(from); setCustomTo(to); };
  const advancedCount = [status, objective, budgetState].filter((x) => x !== "all").length;
  const clearAdvanced = () => { setStatus("all"); setObjective("all"); setBudgetState("all"); };

  return <main className="aw cp">
    <section className="cp-command" aria-label="ตัวกรองแคมเปญ">
      <header className="cp-page-head">
        <div><h1>แคมเปญ</h1><p>ดูผลงานและเลือกรายการที่ควรทำต่อ</p></div>
        <div className="cp-page-actions"><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div>
      </header>
      <AdsSourceNotice ads={ads} />
      <div className="cp-filters">
        <DateRangePicker period={period} from={shownFrom} to={shownTo} max={todayLocal} onChange={changeRange} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...v.brands.map((b) => [b.id, `${b.name} · ${v.byBrand[b.id]?.count ?? 0}`])]} value={v.selectedBrand} onChange={setBrandSel} />
        <Dropdown label="ช่องทาง" options={[["all", "ทุกช่องทาง"], ...v.channelList.map((c) => [c, c])]} value={channel} onChange={setChannel} />
        <Dropdown label="เทียบ" options={[["previous", "ช่วงก่อน"], ["lastMonth", "เดือนก่อน"]]} value={compare} onChange={setCompare} />
        <RevenueBasisToggle value={revenueBasis} onChange={setRevenueBasis} />
        <details className="cp-more-filters"><summary>ตัวกรอง{advancedCount ? ` · ${advancedCount}` : ""}</summary><div>
          <label><span>สถานะ</span><Dropdown className="dd--block" ariaLabel="สถานะ" options={[["all", "ทั้งหมด"], ...v.statuses.map((x) => [x, x === "active" ? "กำลังรัน" : x === "paused" ? "พักอยู่" : "ไม่ระบุ"])]} value={status} onChange={setStatus} /></label>
          <label><span>เป้าหมาย</span><Dropdown className="dd--block" ariaLabel="เป้าหมาย" options={[["all", "ทั้งหมด"], ...v.objectives.map((x) => [x, x === "unknown" ? "ไม่ระบุ" : x])]} value={objective} onChange={setObjective} /></label>
          <label><span>งบแคมเปญ</span><Dropdown className="dd--block" ariaLabel="งบแคมเปญ" options={[["all", "ทั้งหมด"], ["set", "ตั้งงบแล้ว"], ["missing", "ยังไม่ตั้งงบ"]]} value={budgetState} onChange={setBudgetState} /></label>
          {advancedCount > 0 && <button type="button" onClick={clearAdvanced}>ล้างตัวกรอง</button>}
        </div></details>
        <label className="cp-search ads-search"><Search size={14} aria-hidden="true" /><input aria-label="ค้นหาแคมเปญ" type="search" placeholder="ค้นหาชื่อแคมเปญ" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
    </section>

    {/* โหมด Meta Pilot: สถานะข้อมูลอยู่ในแถบแหล่งข้อมูลแล้ว · กล่องนี้อ่านจาก settings (ข้อมูลจำลอง) จะขัดกัน — สุขภาพจากฐานจริงทำในรอบถัดไป */}
    {ads.source === "mock" && <section className={`cp-health cp-health--${v.dataHealth.state}`} aria-label="สุขภาพข้อมูล"><div><i /><span><strong>{v.dataHealth.label}</strong><small>{v.dataHealth.detail}</small></span></div><div className="cp-health-sources">{v.dataHealth.sources.filter((source) => source.configured || source.provider === "meta").map((source) => <span key={source.provider}>{source.name} · {source.label}</span>)}</div><Link to="/mkt/ads/sync">ดูสถานะ Sync</Link></section>}

    <CampaignsTable rows={v.rows} compareLabel={v.compareLabel} scopeEmpty={v.scopeEmpty} revenueLabel={revenueBasis === "new" ? "ยอดใหม่" : "ยอดรวม"} goalTargets={v.goalTargets} targetPeriod={v.targetPeriod} salesSummary={v.salesSummary} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} canPreview={ads.canPreview} />} />
  </main>;
}
