import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Image as ImageIcon, Search, Settings2, X } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { analyticsCards } from "../mktAnalytics.js";
import { adsCreativeRows } from "../adsOverview.js";
import { isoDay, periodRange } from "../adsScope.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { PlatformIcon } from "../ads/PlatformIcon.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { filterCreativeLibrary, creativeLibrarySummary } from "./creativeLibrary.js";
import { CreativePreview } from "./CreativePreview.jsx";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { Pagination } from "../ui/Pagination.jsx";
import { scrollToList } from "../ui/pagination.js";
import { usePagination } from "../ui/usePagination.js";
import "../ads/adsWorkspace.css";
import "./creativeLibrary.css";

const metric = (value, format = "number") => value == null ? "—" : format === "money" ? fmtMoney(value) : format === "pct" ? fmtPct(value, 2) : format === "roas" ? `${value.toFixed(1)}x` : `${value.toFixed(1)}x`;
const actionText = { Scale: "น่าขยาย", Fix: "ควรแก้", Stop: "ควรหยุด", "ติดตาม": "ติดตาม" };

const PAGE_SIZES = [12, 24, 48];   // หารลงตัวกับกริด 4 / 3 / 2 คอลัมน์ · หน้าละไม่เกิน 48 ภาพ

function CreativeCard({ row, checked, onToggle, onPreview }) {
  const links = postLinksOf(row.asset);
  return <article className={`cl-card ${row.fatigue ? "is-fatigue" : ""}`}>
    <CreativeMedia row={row} onPreview={onPreview} />
    <div className="cl-card-body">
      <header><div><span><PlatformIcon channel={row.platform} size={14} /> {row.platform}</span><strong title={row.creative}>{row.creative}</strong><small>{row.brand} · {row.campaigns.length} แคมเปญ</small></div><label className="cl-check"><input type="checkbox" checked={checked} onChange={onToggle} /><span>เทียบ</span></label></header>
      <div className="cl-metrics"><div><span>ค่าแอด</span><b>{metric(row.spend, "money")}</b></div><div><span>ROAS</span><b>{metric(row.roas, "roas")}</b></div><div><span>CPL</span><b>{metric(row.cpl, "money")}</b></div><div><span>CTR</span><b>{metric(row.ctr, "pct")}</b></div></div>
      <footer><span className={`cl-action cl-action--${row.tone}`}>{row.fatigue ? "เริ่มล้า" : actionText[row.action] ?? row.action}</span><span>ความถี่ {metric(row.frequency)}</span>{links.length > 0 && <span className="cl-links">{links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.label} ของ ${row.creative}`}>{link.key === "facebook" ? "FB" : "IG"} <ExternalLink size={11} /></a>)}</span>}</footer>
    </div>
  </article>;
}

function CompareTray({ rows, onRemove, onClear }) {
  if (rows.length < 2) return null;
  return <section className="cl-compare" aria-label="เปรียบเทียบครีเอทีฟ"><header><div><strong>เทียบ {rows.length} ชิ้น</strong><span>ดูบนฐานช่วงเวลาเดียวกัน</span></div><button type="button" onClick={onClear}>ล้างทั้งหมด</button></header><div className="cl-compare-grid">{rows.map((row) => <article key={row.key}><button type="button" aria-label={`เอา ${row.creative} ออกจากการเปรียบเทียบ`} onClick={() => onRemove(row.key)}><X size={14} /></button><strong>{row.creative}</strong><small>{row.brand} · {row.platform}</small><dl><div><dt>ค่าแอด</dt><dd>{metric(row.spend, "money")}</dd></div><div><dt>ROAS</dt><dd>{metric(row.roas, "roas")}</dd></div><div><dt>CPL</dt><dd>{metric(row.cpl, "money")}</dd></div><div><dt>CTR</dt><dd>{metric(row.ctr, "pct")}</dd></div></dl></article>)}</div></section>;
}

export function CreativeLibraryView() {
  const { data, inBrandScope, brandFilter, toast } = useApp();
  const ads = useAdsData();
  const today = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [brand, setBrand] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState("spend");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const v = useMemo(() => {
    const range = periodRange(period, from, to);
    const cards = analyticsCards(ads.cards).filter(inBrandScope);
    const brands = (data.brands ?? []).filter((item) => item.active !== false && (brandFilter === "all" || item.id === brandFilter));
    const all = adsCreativeRows(cards, range, brands);
    const platforms = [...new Set(all.map((row) => row.platform))].sort();
    const rows = filterCreativeLibrary(all, { brand, platform, state, sort, query });
    return { rows, all, brands, platforms, summary: creativeLibrarySummary(rows), range };
  }, [data, ads.cards, inBrandScope, brandFilter, period, from, to, brand, platform, state, sort, query]);
  const chosen = selected.map((key) => v.all.find((row) => row.key === key)).filter(Boolean);
  const [previewRow, setPreviewRow] = useState(null);
  const listTop = useRef(null);
  /* แบ่งหน้า: ตัวกรอง/การเรียง/ช่วงวัน/แหล่งข้อมูลเปลี่ยน → กลับหน้า 1 · ตัวเลขสรุปด้านบนนับทุกหน้า · ที่เลือกเทียบคงอยู่ข้ามหน้า */
  const pager = usePagination(v.rows, { storageKey: "ssb.creatives.pageSize", sizes: PAGE_SIZES, defaultSize: 12, resetKey: `${period}|${from}|${to}|${brand}|${platform}|${state}|${sort}|${query}|${ads.source}` });
  const toggle = (key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length >= 4 ? (toast?.("เทียบได้สูงสุด 4 ชิ้น", "bad"), current) : [...current, key]);
  const fromShown = isoDay(new Date(v.range.start));
  const toShown = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  return <main className="aw cl">
    <section className="cl-command"><header><div><h1>Creative Library</h1><p>ดูชิ้นงานที่ทำเงิน ชิ้นที่เริ่มล้า และเลือกมาเทียบกัน</p></div><div className="cl-head-actions"><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div></header><AdsSourceNotice ads={ads} />
      <div className="cl-filters"><DateRangePicker period={period} from={fromShown} to={toShown} max={today} onChange={({ period: nextPeriod, from: nextFrom, to: nextTo }) => { setPeriod(nextPeriod); setFrom(nextFrom); setTo(nextTo); }} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...v.brands.map((item) => [item.id, item.name])]} value={brand} onChange={setBrand} /><Dropdown label="ช่องทาง" options={[["all", "ทุกช่องทาง"], ...v.platforms.map((item) => [item, item])]} value={platform} onChange={setPlatform} /><Dropdown label="สถานะ" options={[["all", "ทั้งหมด"], ["fatigue", "เริ่มล้า"], ["ready", "มีสื่อแล้ว"], ["waiting", "รอสื่อ"]]} value={state} onChange={setState} /><Dropdown label="เรียง" options={[["spend", "ค่าแอดสูงสุด"], ["roas", "ROAS สูงสุด"], ["cpl", "CPL ต่ำสุด"], ["ctr", "CTR สูงสุด"], ["frequency", "เห็นซ้ำสูงสุด"]]} value={sort} onChange={setSort} /><label className="cl-search ads-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="ค้นหาครีเอทีฟ" placeholder="ค้นหาชิ้นงานหรือแคมเปญ" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
    </section>
    <section className="cl-summary"><div><span>ชิ้นงานในช่วงนี้</span><b>{v.summary.count}</b></div><div><span>ค่าแอดรวม</span><b>{metric(v.summary.spend, "money")}</b></div><div><span>มีภาพ/วิดีโอแล้ว</span><b>{v.summary.withMedia}</b></div><div className={v.summary.tired ? "warn" : ""}><span>เริ่มล้า</span><b>{v.summary.tired}</b></div></section>
    <CompareTray rows={chosen} onRemove={(key) => setSelected((current) => current.filter((item) => item !== key))} onClear={() => setSelected([])} />
    <div ref={listTop} className="cl-list-top" />
    {v.rows.length ? <><section className="cl-grid">{pager.pageItems.map((row) => <CreativeCard key={row.key} row={row} checked={selected.includes(row.key)} onToggle={() => toggle(row.key)} onPreview={ads.canPreview ? setPreviewRow : undefined} />)}</section>
      <Pagination pager={pager} sizes={PAGE_SIZES} unit="ชิ้นงาน" label="แบ่งหน้า Creative" onChange={() => scrollToList(listTop)} /></>
      : <section className="cl-empty"><ImageIcon size={28} /><strong>ไม่พบชิ้นงานในช่วงนี้</strong><span>ลองเปลี่ยนช่วงเวลาหรือล้างตัวกรอง</span></section>}
    {previewRow && <CreativePreview row={previewRow} onClose={() => setPreviewRow(null)} />}
  </main>;
}
