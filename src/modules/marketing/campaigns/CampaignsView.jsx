/* CampaignsView — หน้า "แคมเปญ" สำหรับคนยิงแอด · reuse ภาษา UI ของ AdsWorkspace (class aw-*)
   ตัวเลขทั้งหมดมาจาก adsCampaigns.js · หน้า Overview ไม่ถูกแตะ */
import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsChannelList, filterByChannel } from "../adsOverview.js";
import { campaignRows, campaignDecision } from "../adsCampaigns.js";
import { isoDay, periodRange, sameDatesLastMonth, PERIOD_PRESETS } from "../adsScope.js";
import { fmtMoney } from "../dash/charts/theme.js";
import { BrandMark } from "../ads/BrandMark.jsx";
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
  const [query, setQuery] = useState("");

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const targets = data.settings?.ads_control?.targets ?? {};
    const all = campaignRows(scoped, range, { brands, adBudgets: data.ad_budgets ?? [], campaignBudgets: data.campaign_budgets ?? [], today: isoDay(new Date()), prevRange: before })
      .map((r) => ({ ...r, decision: campaignDecision(r, targets[r.brandId] ?? null) }));
    const byBrand = Object.fromEntries(brands.map((b) => [b.id, { count: 0, spend: 0 }]));
    for (const r of all) if (byBrand[r.brandId]) { byBrand[r.brandId].count += 1; byBrand[r.brandId].spend += r.spend; }
    const q = query.trim().toLowerCase();
    const rows = all.filter((r) => (brandSel === "all" || r.brandId === brandSel) && (!q || r.name.toLowerCase().includes(q)));
    return { rows, all, range, before, brands, byBrand, channelList: adsChannelList(scopedAll),
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า" };
  }, [data, inBrandScope, brandFilter, period, customFrom, customTo, compare, channel, brandSel, query]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeFrom = (next) => { setCustomFrom(next); setCustomTo(next > shownTo ? next : shownTo); setPeriod("custom"); };
  const changeTo = (next) => { setCustomTo(next); setCustomFrom(next < shownFrom ? next : shownFrom); setPeriod("custom"); };
  const totalSpend = v.all.reduce((n, r) => n + r.spend, 0);

  return <main className="aw cp">
    <section className="aw-toolbar" aria-label="ตัวกรองแคมเปญ">
      <header className="aw-header"><h1>แคมเปญ</h1><a className="aw-settings-link" href="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</a></header>
      <div className="aw-controls">
        <div className="aw-presets" role="group" aria-label="ช่วงเวลาด่วน">{PERIOD_PRESETS.map(([key, label]) => <button type="button" key={key} className={period === key ? "active" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
        <div className="aw-date-range"><label><span>จาก</span><input aria-label="วันที่เริ่มต้น" type="date" value={shownFrom} max={shownTo} onChange={(e) => changeFrom(e.target.value)} /></label><b>–</b><label><span>ถึง</span><input aria-label="วันที่สิ้นสุด" type="date" value={shownTo} min={shownFrom} max={todayLocal} onChange={(e) => changeTo(e.target.value)} /></label></div>
        <label className="aw-filter"><span>ช่องทาง</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="all">ทั้งหมด</option>{v.channelList.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="aw-filter"><span>เทียบ</span><select value={compare} onChange={(e) => setCompare(e.target.value)}><option value="previous">ช่วงก่อน</option><option value="lastMonth">เดือนก่อน</option></select></label>
        <label className="aw-filter cp-search"><span>ค้นหา</span><input type="search" placeholder="ชื่อแคมเปญ" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <span className="aw-demo"><i /> Mock data</span>
      </div>
    </section>
    <div className="aw-layout">
      <aside className="aw-brands">
        <div className="aw-section-label">แบรนด์ <span>{v.brands.length}</span></div>
        <button type="button" className={`aw-brand ${brandSel === "all" ? "selected" : ""}`} aria-pressed={brandSel === "all"} onClick={() => setBrandSel("all")}><div><strong>ทุกแบรนด์</strong></div><b>{fmtMoney(totalSpend)}</b><small> ค่าแอด {v.all.length} แคมเปญ</small></button>
        {v.brands.map((b) => <button key={b.id} type="button" className={`aw-brand ${brandSel === b.id ? "selected" : ""}`} aria-pressed={brandSel === b.id} onClick={() => setBrandSel(b.id)}><div><BrandMark brand={b} /><strong>{b.name}</strong></div><div><b>{fmtMoney(v.byBrand[b.id]?.spend ?? 0)}</b><small>{v.byBrand[b.id]?.count ?? 0} แคมเปญ</small></div></button>)}
      </aside>
      <div className="aw-content">
        <CampaignsTable rows={v.rows} compareLabel={v.compareLabel} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} />} />
      </div>
    </div>
  </main>;
}
