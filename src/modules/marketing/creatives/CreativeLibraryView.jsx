import { useMemo, useState } from "react";
import { ExternalLink, Film, Image as ImageIcon, Search, Settings2, X } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards } from "../mktAnalytics.js";
import { adsCreativeRows } from "../adsOverview.js";
import { isoDay, periodRange, PERIOD_PRESETS } from "../adsScope.js";
import { fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { PlatformIcon } from "../ads/PlatformIcon.jsx";
import { filterCreativeLibrary, creativeLibrarySummary } from "./creativeLibrary.js";
import "../ads/adsWorkspace.css";
import "./creativeLibrary.css";

const metric = (value, format = "number") => value == null ? "—" : format === "money" ? fmtMoney(value) : format === "pct" ? fmtPct(value, 2) : format === "roas" ? `${value.toFixed(1)}x` : `${value.toFixed(1)}x`;
const actionText = { Scale: "น่าขยาย", Fix: "ควรแก้", Stop: "ควรหยุด", "ติดตาม": "ติดตาม" };

function Media({ row }) {
  const asset = row.asset;
  const item = asset?.media?.[0];
  const src = item?.thumbnailUrl || item?.imageUrl;
  if (src) return <div className="cl-media"><img src={src} alt={asset.copy?.headline || row.creative} loading="lazy" /><span>{asset.format === "video" ? <Film size={14} /> : <ImageIcon size={14} />}{asset.format}</span></div>;
  return <div className="cl-media cl-media--empty"><ImageIcon size={26} /><strong>รอ Creative API</strong><small>จะแสดงภาพหรือวิดีโอหลัง Sync สำเร็จ</small></div>;
}

function CreativeCard({ row, checked, onToggle }) {
  return <article className={`cl-card ${row.fatigue ? "is-fatigue" : ""}`}>
    <Media row={row} />
    <div className="cl-card-body">
      <header><div><span><PlatformIcon channel={row.platform} size={14} /> {row.platform}</span><strong title={row.creative}>{row.creative}</strong><small>{row.brand} · {row.campaigns.length} แคมเปญ</small></div><label className="cl-check"><input type="checkbox" checked={checked} onChange={onToggle} /><span>เทียบ</span></label></header>
      <div className="cl-metrics"><div><span>ค่าแอด</span><b>{metric(row.spend, "money")}</b></div><div><span>ROAS</span><b>{metric(row.roas, "roas")}</b></div><div><span>CPL</span><b>{metric(row.cpl, "money")}</b></div><div><span>CTR</span><b>{metric(row.ctr, "pct")}</b></div></div>
      <footer><span className={`cl-action cl-action--${row.tone}`}>{row.fatigue ? "เริ่มล้า" : actionText[row.action] ?? row.action}</span><span>ความถี่ {metric(row.frequency)}</span>{row.asset?.permalinkUrl && <a href={row.asset.permalinkUrl} target="_blank" rel="noreferrer">ดูโพสต์ <ExternalLink size={12} /></a>}</footer>
    </div>
  </article>;
}

function CompareTray({ rows, onRemove, onClear }) {
  if (rows.length < 2) return null;
  return <section className="cl-compare" aria-label="เปรียบเทียบครีเอทีฟ"><header><div><strong>เทียบ {rows.length} ชิ้น</strong><span>ดูบนฐานช่วงเวลาเดียวกัน</span></div><button type="button" onClick={onClear}>ล้างทั้งหมด</button></header><div className="cl-compare-grid">{rows.map((row) => <article key={row.key}><button type="button" aria-label={`เอา ${row.creative} ออกจากการเปรียบเทียบ`} onClick={() => onRemove(row.key)}><X size={14} /></button><strong>{row.creative}</strong><small>{row.brand} · {row.platform}</small><dl><div><dt>ค่าแอด</dt><dd>{metric(row.spend, "money")}</dd></div><div><dt>ROAS</dt><dd>{metric(row.roas, "roas")}</dd></div><div><dt>CPL</dt><dd>{metric(row.cpl, "money")}</dd></div><div><dt>CTR</dt><dd>{metric(row.ctr, "pct")}</dd></div></dl></article>)}</div></section>;
}

export function CreativeLibraryView() {
  const { data, inBrandScope, brandFilter, toast } = useApp();
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
    const cards = analyticsCards(data.cards).filter(inBrandScope);
    const brands = (data.brands ?? []).filter((item) => item.active !== false && (brandFilter === "all" || item.id === brandFilter));
    const all = adsCreativeRows(cards, range, brands);
    const platforms = [...new Set(all.map((row) => row.platform))].sort();
    const rows = filterCreativeLibrary(all, { brand, platform, state, sort, query });
    return { rows, all, brands, platforms, summary: creativeLibrarySummary(rows), range };
  }, [data, inBrandScope, brandFilter, period, from, to, brand, platform, state, sort, query]);
  const chosen = selected.map((key) => v.all.find((row) => row.key === key)).filter(Boolean);
  const toggle = (key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length >= 4 ? (toast?.("เทียบได้สูงสุด 4 ชิ้น", "bad"), current) : [...current, key]);
  const fromShown = isoDay(new Date(v.range.start));
  const toShown = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  return <main className="aw cl">
    <section className="cl-command"><header><div><h1>Creative Library</h1><p>ดูชิ้นงานที่ทำเงิน ชิ้นที่เริ่มล้า และเลือกมาเทียบกัน</p></div><div className="cl-head-actions"><span className="aw-demo"><i /> Mock data</span><a className="aw-settings-link" href="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</a></div></header>
      <div className="cl-filters"><div className="aw-presets">{PERIOD_PRESETS.map(([key, label]) => <button type="button" key={key} className={period === key ? "active" : ""} onClick={() => setPeriod(key)}>{label}</button>)}</div><div className="aw-date-range"><label><span>จาก</span><input type="date" value={fromShown} max={toShown} onChange={(event) => { setFrom(event.target.value); setPeriod("custom"); }} /></label><b>–</b><label><span>ถึง</span><input type="date" value={toShown} min={fromShown} max={today} onChange={(event) => { setTo(event.target.value); setPeriod("custom"); }} /></label></div>
        <label><span>แบรนด์</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="all">ทุกแบรนด์</option>{v.brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>ช่องทาง</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">ทุกช่องทาง</option>{v.platforms.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>สถานะ</span><select value={state} onChange={(event) => setState(event.target.value)}><option value="all">ทั้งหมด</option><option value="fatigue">เริ่มล้า</option><option value="ready">มีสื่อแล้ว</option><option value="waiting">รอสื่อ</option></select></label><label><span>เรียงตาม</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="spend">ค่าแอดสูงสุด</option><option value="roas">ROAS สูงสุด</option><option value="cpl">CPL ต่ำสุด</option><option value="ctr">CTR สูงสุด</option><option value="frequency">เห็นซ้ำสูงสุด</option></select></label><label className="cl-search"><Search size={14} /><input type="search" aria-label="ค้นหาครีเอทีฟ" placeholder="ค้นหาชิ้นงานหรือแคมเปญ" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
    </section>
    <section className="cl-summary"><div><span>ชิ้นงานในช่วงนี้</span><b>{v.summary.count}</b></div><div><span>ค่าแอดรวม</span><b>{metric(v.summary.spend, "money")}</b></div><div><span>มีภาพ/วิดีโอแล้ว</span><b>{v.summary.withMedia}</b></div><div className={v.summary.tired ? "warn" : ""}><span>เริ่มล้า</span><b>{v.summary.tired}</b></div></section>
    <CompareTray rows={chosen} onRemove={(key) => setSelected((current) => current.filter((item) => item !== key))} onClear={() => setSelected([])} />
    {v.rows.length ? <section className="cl-grid">{v.rows.map((row) => <CreativeCard key={row.key} row={row} checked={selected.includes(row.key)} onToggle={() => toggle(row.key)} />)}</section> : <section className="cl-empty"><ImageIcon size={28} /><strong>ไม่พบชิ้นงานในช่วงนี้</strong><span>ลองเปลี่ยนช่วงเวลาหรือล้างตัวกรอง</span></section>}
  </main>;
}
