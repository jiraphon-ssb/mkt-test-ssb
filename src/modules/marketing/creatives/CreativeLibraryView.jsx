import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Image as ImageIcon, Search, Settings2, X } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { analyticsCards } from "../mktAnalytics.js";
import { adsCreativeRows } from "../adsOverview.js";
import { isoDay, periodRange } from "../adsScope.js";
import { useReportFilters } from "../ui/useReportFilters.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { fmtMoney, fmtPct, fmtNum, fmtInt } from "../dash/charts/theme.js";
import { PlatformIcon } from "../ads/PlatformIcon.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { filterCreativeLibrary, creativeEvidencePace, creativeLibrarySummary, formatBreakdown, FORMAT_LABELS } from "./creativeLibrary.js";
import { PaceMeter } from "../ads/PaceMeter.jsx";
import { coveragePace } from "../ads/paceEngine.js";
import { creativeRuleSummary, evaluateCreativeRules, filterByRuleOutcome, normalizeCreativeRules, ruleTitle } from "./creativeRules.js";
import { CreativePreview } from "./CreativePreview.jsx";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { Pagination } from "../ui/Pagination.jsx";
import { scrollToList } from "../ui/pagination.js";
import { usePagination } from "../ui/usePagination.js";
import "../ads/adsWorkspace.css";
import "./creativeLibrary.css";

const metric = (value, format = "number") => value == null ? "—" : format === "money" ? fmtMoney(value) : format === "pct" ? fmtPct(value, 2) : format === "count" ? fmtInt(value) : `${fmtNum(value, 2)}x`;
const RULE_TEXT = { pass: "ผ่านกฎ", fail: "ไม่ผ่านกฎ", pending: "ยังตัดสินไม่ได้", nodata: "ไม่มีข้อมูล", na: "ไม่เข้าข่ายกฎ" };
const actionText = { Scale: "น่าขยาย", Fix: "ควรแก้", Stop: "ควรหยุด", "ติดตาม": "ติดตาม" };

const PAGE_SIZES = [12, 24, 48];   // หารลงตัวกับกริด 4 / 3 / 2 คอลัมน์ · หน้าละไม่เกิน 48 ภาพ

function CreativeCard({ row, checked, onToggle, onPreview, ruleResult }) {
  const links = postLinksOf(row.asset);
  const evidence = creativeEvidencePace(row);
  return <article className={`cl-card ${row.fatigue ? "is-fatigue" : ""}`}>
    <CreativeMedia row={row} onPreview={onPreview} />
    <div className="cl-card-body">
      <header><div><span><PlatformIcon channel={row.platform} size={14} /> {row.platform}</span><strong title={row.creative}>{row.creative}</strong><small>{row.brand} · {row.campaigns.length} แคมเปญ</small></div><label className="cl-check"><input type="checkbox" checked={checked} onChange={onToggle} /><span>เทียบ</span></label></header>
      <div className="cl-metrics"><div><span>ค่าแอด</span><b>{metric(row.spend, "money")}</b></div><div><span>การซื้อ</span><b title={row.purchases == null ? "บัญชีนี้ Meta ไม่ได้วัดการซื้อ" : undefined}>{metric(row.purchases, "count")}</b></div><div><span>ต่อการซื้อ</span><b>{metric(row.cpa, "money")}</b></div><div><span>ROAS</span><b>{metric(row.roas, "roas")}</b></div><div><span>CPL</span><b>{metric(row.cpl, "money")}</b></div><div><span>CTR</span><b>{metric(row.ctr, "pct")}</b></div></div>
      <div className="cl-evidence"><PaceMeter pace={evidence} label={evidence.label} detail={evidence.detail} compact /></div>
      {ruleResult && <p className={`cl-rule cl-rule--${ruleResult.status}`}><b>{RULE_TEXT[ruleResult.status]}</b>{ruleResult.text && <span>{ruleResult.text}</span>}</p>}
      <footer><span className={`cl-action cl-action--${row.tone}`}>{row.fatigue ? "เริ่มล้า" : actionText[row.action] ?? row.action}</span><span>ความถี่ {metric(row.frequency)}</span>{links.length > 0 && <span className="cl-links">{links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.label} ของ ${row.creative}`}>{link.key === "facebook" ? "FB" : "IG"} <ExternalLink size={11} /></a>)}</span>}</footer>
    </div>
  </article>;
}

function CompareTray({ rows, onRemove, onClear }) {
  if (rows.length < 2) return null;
  return <section className="cl-compare" aria-label="เปรียบเทียบครีเอทีฟ"><header><div><strong>เทียบ {rows.length} ชิ้น</strong><span>ดูบนฐานช่วงเวลาเดียวกัน</span></div><button type="button" onClick={onClear}>ล้างทั้งหมด</button></header><div className="cl-compare-grid">{rows.map((row) => <article key={row.key}><button type="button" aria-label={`เอา ${row.creative} ออกจากการเปรียบเทียบ`} onClick={() => onRemove(row.key)}><X size={14} /></button><strong>{row.creative}</strong><small>{row.brand} · {row.platform}</small><dl><div><dt>ค่าแอด</dt><dd>{metric(row.spend, "money")}</dd></div><div><dt>การซื้อ</dt><dd>{metric(row.purchases, "count")}</dd></div><div><dt>ต่อการซื้อ</dt><dd>{metric(row.cpa, "money")}</dd></div><div><dt>ROAS</dt><dd>{metric(row.roas, "roas")}</dd></div><div><dt>CPL</dt><dd>{metric(row.cpl, "money")}</dd></div><div><dt>CTR</dt><dd>{metric(row.ctr, "pct")}</dd></div></dl></article>)}</div></section>;
}

/* ตัวกรองเฉพาะหน้า Creative (อยู่ในลิงก์ ไม่ข้ามหน้า) · ช่วงวันและแบรนด์ใช้ร่วมกับ Overview/แคมเปญ */
const CREATIVE_FILTERS = {
  platform: { default: "all" }, state: { default: "all", allowed: ["all", "fatigue", "ready", "waiting"] },
  format: { default: "all", allowed: ["all", ...Object.keys(FORMAT_LABELS)] },
  sort: { default: "spend", allowed: ["spend", "purchases", "cpa", "roas", "cpl", "ctr", "frequency"] }, q: { default: "" },
  rule: { default: "none" }, outcome: { default: "all", allowed: ["all", "fail", "pass", "pending"] },
};

export function CreativeLibraryView() {
  const { data, inBrandScope, brandFilter, toast } = useApp();
  const ads = useAdsData();
  const today = isoDay(new Date());
  const [filters, setFilters] = useReportFilters(CREATIVE_FILTERS);
  const { period, from, to, brand, platform, format, state, sort, q: query, rule: ruleId, outcome } = filters;
  const setFormat = (next) => setFilters({ format: next });
  const setBrand = (next) => setFilters({ brand: next });
  const setPlatform = (next) => setFilters({ platform: next });
  const setState = (next) => setFilters({ state: next });
  const setSort = (next) => setFilters({ sort: next });
  const setQuery = (next) => setFilters({ q: next });
  const setOutcome = (next) => setFilters({ outcome: next });
  const rules = useMemo(() => normalizeCreativeRules(data.settings?.ads_control?.creativeRules).filter((rule) => rule.value != null), [data.settings]);
  // กฎที่เลือกไว้ถูกลบไปแล้ว → กลับเป็นไม่ใช้กฎ
  const activeRule = ruleId === "all" ? (rules.length ? "all" : "none") : rules.some((rule) => rule.id === ruleId) ? ruleId : "none";
  const [selected, setSelected] = useState([]);
  const v = useMemo(() => {
    const range = periodRange(period, from, to);
    const cards = analyticsCards(ads.cards).filter(inBrandScope);
    const brands = (data.brands ?? []).filter((item) => item.active !== false && (brandFilter === "all" || item.id === brandFilter));
    const all = adsCreativeRows(cards, range, brands);
    const platforms = [...new Set(all.map((row) => row.platform))].sort();
    // แบรนด์ที่จำมาจากหน้าอื่น/ลิงก์ แต่ไม่อยู่ในขอบเขตตอนนี้ = ทุกแบรนด์ (ไม่ให้หน้าว่างโดยไม่รู้สาเหตุ)
    const brandSel = brands.some((item) => item.id === brand) ? brand : "all";
    // ตารางรูปแบบนับจากตัวกรองอื่นทั้งหมด ยกเว้นรูปแบบเอง — เห็นทุกรูปแบบเทียบกันเสมอ
    const formats = formatBreakdown(filterCreativeLibrary(all, { brand: brandSel, platform, state, sort, query }));
    const filtered = filterCreativeLibrary(all, { brand: brandSel, platform, format, state, sort, query });
    // สรุปผลกฎนับจากชิ้นที่ผ่านตัวกรองอื่นแล้ว (ก่อนกรองผลกฎ) — เห็นภาพรวมผ่าน/ไม่ผ่านของชุดที่กำลังดู
    const ruleSummary = activeRule === "none" ? null : creativeRuleSummary(filtered, rules, activeRule);
    const rows = filterByRuleOutcome(filtered, rules, activeRule, outcome);
    return { rows, all, brands, brandSel, platforms, formats, summary: creativeLibrarySummary(rows), range, ruleSummary };
  }, [data, ads.cards, inBrandScope, brandFilter, period, from, to, brand, platform, format, state, sort, query, rules, activeRule, outcome]);
  const chosen = selected.map((key) => v.all.find((row) => row.key === key)).filter(Boolean);
  const [previewRow, setPreviewRow] = useState(null);
  const listTop = useRef(null);
  /* แบ่งหน้า: ตัวกรอง/การเรียง/ช่วงวัน/แหล่งข้อมูลเปลี่ยน → กลับหน้า 1 · ตัวเลขสรุปด้านบนนับทุกหน้า · ที่เลือกเทียบคงอยู่ข้ามหน้า */
  const pager = usePagination(v.rows, { storageKey: "ssb.creatives.pageSize", sizes: PAGE_SIZES, defaultSize: 12, resetKey: `${period}|${from}|${to}|${brand}|${platform}|${state}|${sort}|${query}|${activeRule}|${outcome}|${ads.source}` });
  const toggle = (key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length >= 4 ? (toast?.("เทียบได้สูงสุด 4 ชิ้น", "bad"), current) : [...current, key]);
  const fromShown = isoDay(new Date(v.range.start));
  const toShown = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  return <main className="aw cl">
    <section className="cl-command"><header><div><h1>Creative Library</h1><p>ดูชิ้นงานที่ทำเงิน ชิ้นที่เริ่มล้า และเลือกมาเทียบกัน</p></div><div className="cl-head-actions"><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div></header><AdsSourceNotice ads={ads} />
      <div className="cl-filters"><DateRangePicker period={period} from={fromShown} to={toShown} max={today} onChange={({ period: nextPeriod, from: nextFrom, to: nextTo }) => setFilters({ period: nextPeriod, from: nextFrom, to: nextTo })} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...v.brands.map((item) => [item.id, item.name])]} value={v.brandSel} onChange={setBrand} /><Dropdown label="ช่องทาง" options={[["all", "ทุกช่องทาง"], ...v.platforms.map((item) => [item, item])]} value={platform} onChange={setPlatform} /><Dropdown label="รูปแบบ" options={[["all", "ทุกรูปแบบ"], ...Object.entries(FORMAT_LABELS)]} value={format} onChange={setFormat} /><Dropdown label="สถานะ" options={[["all", "ทั้งหมด"], ["fatigue", "เริ่มล้า"], ["ready", "มีสื่อแล้ว"], ["waiting", "รอสื่อ"]]} value={state} onChange={setState} /><Dropdown label="กฎ" options={[["none", "ไม่ใช้กฎ"], ...(rules.length > 1 ? [["all", "ทุกกฎ"]] : []), ...rules.map((rule) => [rule.id, ruleTitle(rule)])]} value={activeRule} onChange={(next) => setFilters(next === "none" ? { rule: next, outcome: "all" } : { rule: next })} />{activeRule !== "none" && <Dropdown label="ผล" options={[["all", "ทั้งหมด"], ["fail", "ไม่ผ่าน"], ["pass", "ผ่าน"], ["pending", "ยังตัดสินไม่ได้"]]} value={outcome} onChange={setOutcome} />}<Dropdown label="เรียง" options={[["spend", "ค่าแอดสูงสุด"], ["purchases", "การซื้อสูงสุด"], ["cpa", "ต้นทุนต่อการซื้อต่ำสุด"], ["roas", "ROAS สูงสุด"], ["cpl", "CPL ต่ำสุด"], ["ctr", "CTR สูงสุด"], ["frequency", "เห็นซ้ำสูงสุด"]]} value={sort} onChange={setSort} /><label className="cl-search ads-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="ค้นหาครีเอทีฟ" placeholder="ค้นหาชิ้นงานหรือแคมเปญ" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      </div>
    </section>
    {!rules.length && <p className="cl-rule-hint">ยังไม่มีกฎคัดครีเอทีฟ · <Link to="/mkt/ads?panel=settings&tab=rules">ตั้งกฎ</Link> เช่น ต้นทุนต่อการซื้อไม่เกินเท่าไร แล้วกรองชิ้นที่ไม่คุ้มได้จากตัวกรอง "กฎ"</p>}
    {v.ruleSummary && <section className="cl-rule-summary" aria-label="ผลตามกฎ"><button type="button" aria-pressed={outcome === "fail"} className="fail" onClick={() => setOutcome(outcome === "fail" ? "all" : "fail")}><span>ไม่ผ่าน</span><b>{v.ruleSummary.fail}</b><small>ค่าแอด {fmtMoney(v.ruleSummary.failSpend)}</small></button><button type="button" aria-pressed={outcome === "pass"} className="pass" onClick={() => setOutcome(outcome === "pass" ? "all" : "pass")}><span>ผ่าน</span><b>{v.ruleSummary.pass}</b></button><button type="button" aria-pressed={outcome === "pending"} onClick={() => setOutcome(outcome === "pending" ? "all" : "pending")}><span>ยังตัดสินไม่ได้</span><b>{v.ruleSummary.pending + v.ruleSummary.nodata}</b><small>{v.ruleSummary.nodata ? `ไม่มีข้อมูล ${v.ruleSummary.nodata}` : "ใช้เงินยังไม่ถึงเกณฑ์"}</small></button>{v.ruleSummary.na > 0 && <div><span>ไม่เข้าข่ายกฎ</span><b>{v.ruleSummary.na}</b><small>กฎของแบรนด์อื่น</small></div>}<Link to="/mkt/ads?panel=settings&tab=rules">แก้กฎ</Link></section>}
    {v.formats.length > 0 && <section className="cl-formats" aria-labelledby="cl-formats-h"><h2 id="cl-formats-h">เทียบตามรูปแบบชิ้นงาน</h2>
      <div className="aw-table-scroll"><table><thead><tr><th>รูปแบบ</th><th>ชิ้น</th><th>ค่าแอด</th><th>สัดส่วน</th><th>CPL (Meta)</th><th>การซื้อ</th><th>ต่อการซื้อ</th><th>CTR</th><th>เริ่มล้า</th></tr></thead>
        <tbody>{v.formats.map((f) => { const bestCpl = f.cpl != null && f.cpl === Math.min(...v.formats.filter((x) => x.cpl != null && x.count >= 3).map((x) => x.cpl)); const bestCpa = f.cpa != null && f.cpa === Math.min(...v.formats.filter((x) => x.cpa != null && x.count >= 3).map((x) => x.cpa)); return <tr key={f.format} className={format === f.format ? "is-selected" : ""}>
          <th><button type="button" aria-pressed={format === f.format} onClick={() => setFormat(format === f.format ? "all" : f.format)}>{f.label}</button></th>
          <td>{f.count}</td><td>{metric(f.spend, "money")}</td><td>{metric(f.spendShare, "pct")}</td>
          <td>{metric(f.cpl, "money")}{bestCpl && <small className="cl-best"> ต่ำสุด</small>}</td><td>{metric(f.purchases, "count")}</td>
          <td>{metric(f.cpa, "money")}{bestCpa && <small className="cl-best"> ต่ำสุด</small>}</td><td>{metric(f.ctr, "pct")}</td><td>{f.fatigue}</td></tr>; })}</tbody></table></div>
      <p className="aw-key">รูปแบบมาจาก Meta ถ้า Meta ไม่ระบุ อ่านจากคำนำหน้าชื่อชิ้นงาน (VDO · PIC · Album) · "ต่ำสุด" เทียบเฉพาะรูปแบบที่มีตั้งแต่ 3 ชิ้น · กดชื่อรูปแบบเพื่อกรอง</p>
    </section>}
    <section className="cl-summary"><div><span>ชิ้นงานในช่วงนี้</span><b>{v.summary.count}</b></div><div><span>ค่าแอดรวม</span><b>{metric(v.summary.spend, "money")}</b></div><div><span>การซื้อ (Meta)</span><b>{metric(v.summary.purchases, "count")}</b></div><div><span>สื่อพร้อมใช้</span><b>{v.summary.withMedia}/{v.summary.count}</b><PaceMeter pace={coveragePace(v.summary.withMedia, v.summary.count)} compact /></div><div className={v.summary.tired ? "warn" : ""}><span>เริ่มล้า</span><b>{v.summary.tired}</b></div></section>
    <CompareTray rows={chosen} onRemove={(key) => setSelected((current) => current.filter((item) => item !== key))} onClear={() => setSelected([])} />
    <div ref={listTop} className="cl-list-top" />
    {v.rows.length ? <><section className="cl-grid">{pager.pageItems.map((row) => <CreativeCard key={row.key} row={row} checked={selected.includes(row.key)} onToggle={() => toggle(row.key)} onPreview={ads.canPreview ? setPreviewRow : undefined} ruleResult={evaluateCreativeRules(row, rules, activeRule)} />)}</section>
      <Pagination pager={pager} sizes={PAGE_SIZES} unit="ชิ้นงาน" label="แบ่งหน้า Creative" onChange={() => scrollToList(listTop)} /></>
      : <section className="cl-empty"><ImageIcon size={28} /><strong>ไม่พบชิ้นงานในช่วงนี้</strong><span>ลองเปลี่ยนช่วงเวลาหรือล้างตัวกรอง</span></section>}
    {previewRow && <CreativePreview row={previewRow} onClose={() => setPreviewRow(null)} />}
  </main>;
}
