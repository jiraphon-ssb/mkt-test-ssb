/* CampaignsView — หน้าตัดสินใจระดับแคมเปญ · ตัวเลขทั้งหมดมาจาก adsCampaigns.js */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, Settings2 } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { CompareControl } from "../ui/CompareControl.jsx";
import { useApp } from "../useMkt.jsx";
import { isoDay, rangeLabel } from "../adsScope.js";
import { DataPending, isDataPending } from "../ads/DataPending.jsx";
import { buildCampaignsModel } from "./campaignsModel.js";
import { useReportFilters } from "../ui/useReportFilters.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { CampaignsTable } from "./CampaignsTable.jsx";
import { CampaignDetail } from "./CampaignDetail.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { adsErrorText } from "../ads/adsSyncMessages.js";
import { StatusSnapshotNote } from "../creatives/StatusSnapshotNote.jsx";
import "../ads/adsWorkspace.css";
import "./campaigns.css";


/* ตัวกรองเฉพาะหน้าแคมเปญ (อยู่ในลิงก์ ไม่ข้ามหน้า) */
const CAMPAIGN_FILTERS = {
  open: { default: "" },   /* ลิงก์จากหน้าต่างครีเอทีฟ: เปิดแผงของแคมเปญชื่อนี้ (สเปก 2026-09-25) */
  status: { default: "all" }, q: { default: "" } };   /* เป้าหมาย/งบแคมเปญถอด — ไม่มีข้อมูลจริง (สเปก 2026-09-26) */

export function CampaignsView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const ads = useAdsData();
  const todayLocal = isoDay(new Date());
  const [filters, setFilters] = useReportFilters(CAMPAIGN_FILTERS);
  const { period, compare, channel, status, q: query } = filters;
  const setCompare = (next) => setFilters({ compare: next });
  const setChannel = (next) => setFilters({ channel: next });
  const setBrandSel = (next) => setFilters({ brand: next });
  const setStatus = (next) => setFilters({ status: next });
  const setQuery = (next) => setFilters({ q: next });

  const v = useMemo(() => buildCampaignsModel({ data, ads, inBrandScope, brandFilter, filters, todayLocal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ads.cards, ads.mockFallback, ads.source, ads.pilot?.summary?.lastSuccessAt, ads.sales, ads.salesGoals, inBrandScope, brandFilter, filters, todayLocal]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = v.range.end > v.range.start ? isoDay(new Date(new Date(v.range.end).getTime() - 1)) : shownFrom;   // ช่วงว่าง = วันเริ่ม
  const changeRange = ({ period: nextPeriod, from, to }) => setFilters({ period: nextPeriod, from, to });
  const advancedCount = [status].filter((x) => x !== "all").length;
  const clearAdvanced = () => setFilters({ status: "all" });

  return <main className="aw cp">
    <section className="cp-command" aria-label="ตัวกรองแคมเปญ">
      <header className="cp-page-head">
        <div><h1>แคมเปญ</h1><p>ดูผลงานและเลือกรายการที่ควรทำต่อ</p></div>
        <div className="cp-page-actions"><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div>
      </header>
      <AdsSourceNotice ads={ads} todayOnly={period === "today"} />
      <StatusSnapshotNote note={v.statusNote} />
      <div className="cp-filters">
        <DateRangePicker period={period} from={shownFrom} to={shownTo} max={todayLocal} through={v.cutoff} onChange={changeRange} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...v.brands.map((b) => [b.id, `${b.name} · ${v.byBrand[b.id]?.count ?? 0}`])]} value={v.selectedBrand} onChange={setBrandSel} />
        <Dropdown label="ช่องทาง" options={[["all", "ทุกช่องทาง"], ...v.channelList.map((c) => [c, c])]} value={channel} onChange={setChannel} />
        <CompareControl period={period} value={compare} onChange={setCompare} />
        <details className="cp-more-filters"><summary>ตัวกรอง{advancedCount ? ` · ${advancedCount}` : ""}</summary><div>
          <label><span>สถานะ</span><Dropdown className="dd--block" ariaLabel="สถานะ" options={[["all", "ทั้งหมด"], ...v.statuses.map((x) => [x, x === "active" ? "เปิดอยู่" : "ปิดอยู่"])]} value={status} onChange={setStatus} /></label>
          {advancedCount > 0 && <button type="button" onClick={clearAdvanced}>ล้างตัวกรอง</button>}
        </div></details>
        <label className="cp-search ads-search"><Search size={14} aria-hidden="true" /><input aria-label="ค้นหาแคมเปญ" type="search" placeholder="ค้นหาชื่อแคมเปญ" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      </div>
    </section>

    {/* โหมด Meta Pilot: สถานะข้อมูลอยู่ในแถบแหล่งข้อมูลแล้ว · กล่องนี้อ่านจาก settings (ข้อมูลจำลอง) จะขัดกัน — สุขภาพจากฐานจริงทำในรอบถัดไป */}
    {/* แถบ "สุขภาพข้อมูล" ตอนเป็นข้อมูลจำลองถูกถอด (รีวิว UX 25 ก.ย.) — ซ้ำกับป้าย "ข้อมูลตัวอย่าง" บนหัวหน้า และหน้าอื่นไม่มี */}

    {/* ช่วงที่ข้อมูลยังไม่เข้า (เช่น "วันนี้") = บอกว่ามีถึงวันไหน แทน "ไม่มีข้อมูล ลองเปลี่ยนช่วง" (ตรวจรอบ 28 ก.ย.) */}
    {isDataPending({ real: ads.source === "meta_pilot", range: v.range, dataThrough: v.dataThrough, hasData: !v.scopeEmpty }) ? <DataPending label={rangeLabel(shownFrom, shownTo)} through={v.dataThrough} /> :
    <CampaignsTable rows={v.rows} audiences={v.audiences} loading={v.loading} loadError={v.loadError} onRetry={ads.reload} loadErrorText={adsErrorText(ads.pilot?.error, null)} compareLabel={v.compareLabel} scopeEmpty={v.scopeEmpty} initialOpenName={filters.open} onOpenHandled={() => setFilters({ open: "" })} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} canPreview={ads.canPreview} />} />}
  </main>;
}
