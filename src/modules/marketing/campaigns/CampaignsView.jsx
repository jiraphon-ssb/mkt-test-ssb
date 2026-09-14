/* CampaignsView — หน้าตัดสินใจระดับแคมเปญ · ตัวเลขทั้งหมดมาจาก adsCampaigns.js */
import { useMemo, useState } from "react";
import { Search, Settings2 } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsChannelList, filterByChannel, revenueBasisCards } from "../adsOverview.js";
import { campaignRows, campaignDecision, campaignsByBrand, withSpendShare } from "../adsCampaigns.js";
import { isoDay, periodRange, sameDatesLastMonth } from "../adsScope.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { RevenueBasisToggle } from "../ui/RevenueBasisToggle.jsx";
import { CampaignsTable } from "./CampaignsTable.jsx";
import { CampaignDetail } from "./CampaignDetail.jsx";
import { adsDataHealth } from "../ads/adsDataHealth.js";
import "../ads/adsWorkspace.css";
import "./campaigns.css";

export function CampaignsView() {
  const { data, inBrandScope, brandFilter } = useApp();
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
    const scopedAll = revenueBasisCards(analyticsCards(data.cards).filter(inBrandScope), revenueBasis, { mockFallback: true });
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const selectedBrand = brandSel === "all" || brands.some((b) => b.id === brandSel) ? brandSel : "all";
    const targets = data.settings?.ads_control?.targets ?? {};
    const all = campaignRows(scoped, range, {
      brands, adBudgets: data.ad_budgets ?? [], campaignBudgets: data.campaign_budgets ?? [],
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
    const rows = withSpendShare(filtered).map((r) => ({ ...r, decision: campaignDecision(r, targets[r.brandId] ?? null) }));
    const brandSums = campaignsByBrand(all);
    const dataHealth = adsDataHealth(data.settings?.ads_control ?? {});
    return {
      rows, brands, selectedBrand, byBrand: brandSums.byBrand,
      channelList: adsChannelList(scopedAll), scopeEmpty: all.length === 0, range,
      statuses: [...new Set(all.map((r) => r.status))], objectives: [...new Set(all.map((r) => r.objective ?? "unknown"))],
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
      dataHealth,
    };
  }, [data, inBrandScope, brandFilter, period, customFrom, customTo, compare, channel, brandSel, status, objective, budgetState, query, revenueBasis]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeRange = ({ period: nextPeriod, from, to }) => { setPeriod(nextPeriod); setCustomFrom(from); setCustomTo(to); };
  const advancedCount = [status, objective, budgetState].filter((x) => x !== "all").length;
  const clearAdvanced = () => { setStatus("all"); setObjective("all"); setBudgetState("all"); };

  return <main className="aw cp">
    <section className="cp-command" aria-label="ตัวกรองแคมเปญ">
      <header className="cp-page-head">
        <div><h1>แคมเปญ</h1><p>ดูผลงานและเลือกรายการที่ควรทำต่อ</p></div>
        <div className="cp-page-actions"><span className="aw-demo"><i /> Mock data</span><a className="aw-settings-link" href="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</a></div>
      </header>
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

    <section className={`cp-health cp-health--${v.dataHealth.state}`} aria-label="สุขภาพข้อมูล"><div><i /><span><strong>{v.dataHealth.label}</strong><small>{v.dataHealth.detail}</small></span></div><div className="cp-health-sources">{v.dataHealth.sources.filter((source) => source.configured || source.provider === "meta").map((source) => <span key={source.provider}>{source.name} · {source.label}</span>)}</div><a href="/mkt/ads/sync">ดูสถานะ Sync</a></section>

    <CampaignsTable rows={v.rows} compareLabel={v.compareLabel} scopeEmpty={v.scopeEmpty} revenueLabel={revenueBasis === "new" ? "ยอดใหม่" : "ยอดรวม"} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} />} />
  </main>;
}
