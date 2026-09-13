/* CampaignsView — หน้าตัดสินใจระดับแคมเปญ · ตัวเลขทั้งหมดมาจาก adsCampaigns.js */
import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsChannelList, filterByChannel } from "../adsOverview.js";
import { campaignRows, campaignDecision, campaignsByBrand, withSpendShare } from "../adsCampaigns.js";
import { isoDay, periodRange, sameDatesLastMonth, PERIOD_PRESETS } from "../adsScope.js";
import { CampaignsTable } from "./CampaignsTable.jsx";
import { CampaignDetail } from "./CampaignDetail.jsx";
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
  const [query, setQuery] = useState("");

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
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
    return {
      rows, brands, selectedBrand, byBrand: brandSums.byBrand,
      channelList: adsChannelList(scopedAll), scopeEmpty: all.length === 0, range,
      statuses: [...new Set(all.map((r) => r.status))], objectives: [...new Set(all.map((r) => r.objective ?? "unknown"))],
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
    };
  }, [data, inBrandScope, brandFilter, period, customFrom, customTo, compare, channel, brandSel, status, objective, budgetState, query]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeFrom = (next) => { setCustomFrom(next); setCustomTo(next > shownTo ? next : shownTo); setPeriod("custom"); };
  const changeTo = (next) => { setCustomTo(next); setCustomFrom(next < shownFrom ? next : shownFrom); setPeriod("custom"); };
  const advancedCount = [status, objective, budgetState].filter((x) => x !== "all").length;
  const clearAdvanced = () => { setStatus("all"); setObjective("all"); setBudgetState("all"); };

  return <main className="aw cp">
    <section className="cp-command" aria-label="ตัวกรองแคมเปญ">
      <header className="cp-page-head">
        <div><h1>แคมเปญ</h1><p>ดูผลงานและเลือกรายการที่ควรทำต่อ</p></div>
        <div className="cp-page-actions"><span className="aw-demo"><i /> Mock data</span><a className="aw-settings-link" href="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</a></div>
      </header>
      <div className="cp-filters">
        <div className="aw-presets" role="group" aria-label="ช่วงเวลาด่วน">{PERIOD_PRESETS.map(([key, label]) => <button type="button" key={key} className={period === key ? "active" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
        <div className="aw-date-range"><label><span>จาก</span><input aria-label="วันที่เริ่มต้น" type="date" value={shownFrom} max={shownTo} onChange={(e) => changeFrom(e.target.value)} /></label><b>–</b><label><span>ถึง</span><input aria-label="วันที่สิ้นสุด" type="date" value={shownTo} min={shownFrom} max={todayLocal} onChange={(e) => changeTo(e.target.value)} /></label></div>
        <label className="cp-select"><span>แบรนด์</span><select value={v.selectedBrand} onChange={(e) => setBrandSel(e.target.value)}><option value="all">ทุกแบรนด์</option>{v.brands.map((b) => <option key={b.id} value={b.id}>{b.name} · {v.byBrand[b.id]?.count ?? 0}</option>)}</select></label>
        <label className="cp-select"><span>ช่องทาง</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="all">ทุกช่องทาง</option>{v.channelList.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="cp-select cp-compare"><span>เทียบ</span><select value={compare} onChange={(e) => setCompare(e.target.value)}><option value="previous">ช่วงก่อน</option><option value="lastMonth">เดือนก่อน</option></select></label>
        <details className="cp-more-filters"><summary>ตัวกรอง{advancedCount ? ` · ${advancedCount}` : ""}</summary><div>
          <label><span>สถานะ</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">ทั้งหมด</option>{v.statuses.map((x) => <option key={x} value={x}>{x === "active" ? "กำลังรัน" : x === "paused" ? "พักอยู่" : "ไม่ระบุ"}</option>)}</select></label>
          <label><span>เป้าหมาย</span><select value={objective} onChange={(e) => setObjective(e.target.value)}><option value="all">ทั้งหมด</option>{v.objectives.map((x) => <option key={x} value={x}>{x === "unknown" ? "ไม่ระบุ" : x}</option>)}</select></label>
          <label><span>งบแคมเปญ</span><select value={budgetState} onChange={(e) => setBudgetState(e.target.value)}><option value="all">ทั้งหมด</option><option value="set">ตั้งงบแล้ว</option><option value="missing">ยังไม่ตั้งงบ</option></select></label>
          {advancedCount > 0 && <button type="button" onClick={clearAdvanced}>ล้างตัวกรอง</button>}
        </div></details>
        <label className="cp-search"><span className="ads-sr-only">ค้นหา</span><input aria-label="ค้นหาแคมเปญ" type="search" placeholder="ค้นหาชื่อแคมเปญ" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
    </section>

    <CampaignsTable rows={v.rows} compareLabel={v.compareLabel} scopeEmpty={v.scopeEmpty} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} />} />
  </main>;
}
