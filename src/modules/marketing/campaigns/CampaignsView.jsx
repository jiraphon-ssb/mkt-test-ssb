/* CampaignsView — หน้าตัดสินใจระดับแคมเปญ · ตัวเลขทั้งหมดมาจาก adsCampaigns.js */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, Settings2 } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { useApp } from "../useMkt.jsx";
import { isoDay } from "../adsScope.js";
import { buildCampaignsModel } from "./campaignsModel.js";
import { useReportFilters } from "../ui/useReportFilters.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { RevenueBasisToggle } from "../ui/RevenueBasisToggle.jsx";
import { CampaignsTable } from "./CampaignsTable.jsx";
import { CampaignDetail } from "./CampaignDetail.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import "../ads/adsWorkspace.css";
import "./campaigns.css";


/* ตัวกรองเฉพาะหน้าแคมเปญ (อยู่ในลิงก์ ไม่ข้ามหน้า) */
const CAMPAIGN_FILTERS = { status: { default: "all" }, objective: { default: "all" }, budget: { default: "all", allowed: ["all", "set", "missing"] }, q: { default: "" } };

export function CampaignsView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const ads = useAdsData();
  const todayLocal = isoDay(new Date());
  const [filters, setFilters] = useReportFilters(CAMPAIGN_FILTERS);
  const { period, compare, channel, status, objective, budget: budgetState, basis: revenueBasis, q: query } = filters;
  const setCompare = (next) => setFilters({ compare: next });
  const setChannel = (next) => setFilters({ channel: next });
  const setBrandSel = (next) => setFilters({ brand: next });
  const setStatus = (next) => setFilters({ status: next });
  const setObjective = (next) => setFilters({ objective: next });
  const setBudgetState = (next) => setFilters({ budget: next });
  const setRevenueBasis = (next) => setFilters({ basis: next });
  const setQuery = (next) => setFilters({ q: next });

  const v = useMemo(() => buildCampaignsModel({ data, ads, inBrandScope, brandFilter, filters, todayLocal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ads.cards, ads.mockFallback, ads.source, ads.sales, ads.salesGoals, inBrandScope, brandFilter, filters, todayLocal]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeRange = ({ period: nextPeriod, from, to }) => setFilters({ period: nextPeriod, from, to });
  const advancedCount = [status, objective, budgetState].filter((x) => x !== "all").length;
  const clearAdvanced = () => setFilters({ status: "all", objective: "all", budget: "all" });

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
