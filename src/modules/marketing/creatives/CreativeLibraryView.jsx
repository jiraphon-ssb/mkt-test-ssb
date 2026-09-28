import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Image as ImageIcon, Search, Settings2, X } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { adsErrorText } from "../ads/adsSyncMessages.js";
import { StatusSnapshotNote } from "./StatusSnapshotNote.jsx";
import { analyticsCards } from "../mktAnalytics.js";
import { adsCreativeRows } from "../adsOverview.js";
import { dataCutoff, isoDay, periodRange, rangeLabel, syncedThrough } from "../adsScope.js";
import { DataPending, isDataPending } from "../ads/DataPending.jsx";
import { DAILY_RUN_LABEL } from "../../../../supabase/functions/_shared/dailySchedule.js";
import { latestSpendDay } from "../adsCampaigns.js";
import { useReportFilters } from "../ui/useReportFilters.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { fmtMoney, fmtPct, fmtNum, fmtInt } from "../dash/charts/theme.js";
import { Dropdown } from "../ui/Dropdown.jsx";
import { filterCreativeLibrary, creativeLibrarySummary, formatBreakdown, FORMAT_LABELS } from "./creativeLibrary.js";
import { RULE_STATUS_TEXT, creativeRuleSummary, evaluateCreativeRules, filterByRuleOutcome, normalizeCreativeRules, ruleTitle } from "./creativeRules.js";
import { CreativeTable } from "./CreativeTable.jsx";
import { CreativeViewer } from "./CreativeViewer.jsx";
import { CreativeCard } from "./CreativeCard.jsx";
import { campaignStatusIndex, statusSnapshotNote } from "./creativeStatus.js";
import { Pagination } from "../ui/Pagination.jsx";
import { scrollToList } from "../ui/pagination.js";
import { usePagination } from "../ui/usePagination.js";
import "../ads/adsWorkspace.css";
import { FATIGUE_LABEL, METRIC_LABEL } from "../ads/glossary.js";
import "./creativeLibrary.css";

const metric = (value, format = "number", currency = "THB") => value == null ? "—" : format === "money"
  ? currency === "THB" ? fmtMoney(value) : new Intl.NumberFormat("th-TH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
  : format === "pct" ? fmtPct(value, 2) : format === "count" ? fmtInt(value) : `${fmtNum(value, 2)}×`;
const RULE_TEXT = RULE_STATUS_TEXT;

const PAGE_SIZES = [12, 24, 48];   // หารลงตัวกับกริด 4 / 3 / 2 คอลัมน์ · หน้าละไม่เกิน 48 ภาพ


function CompareTray({ rows, onRemove, onClear }) {
  if (rows.length < 2) return null;
  return <section className="cl-compare" aria-label="เปรียบเทียบครีเอทีฟ"><header><div><strong>เทียบ {rows.length} ชิ้น</strong><span>ดูบนฐานช่วงเวลาเดียวกัน</span></div><button type="button" onClick={onClear}>ล้างทั้งหมด</button></header><div className="cl-compare-grid">{rows.map((row) => <article key={row.key}><button type="button" aria-label={`เอา ${row.creative} ออกจากการเปรียบเทียบ`} onClick={() => onRemove(row.key)}><X size={14} /></button><strong>{row.creative}</strong><small>{row.brand} · {row.platform}</small><dl><div><dt>ค่าแอด</dt><dd>{metric(row.spend, "money")}</dd></div><div><dt>การซื้อ</dt><dd>{metric(row.purchases, "count")}</dd></div><div><dt>ต่อการซื้อ</dt><dd>{metric(row.cpa, "money")}</dd></div><div><dt>{METRIC_LABEL.roasMeta}</dt><dd>{metric(row.roas, "roas")}</dd></div><div><dt>ต่อผลลัพธ์ Meta</dt><dd>{metric(row.cpl, "money")}</dd></div><div><dt>{METRIC_LABEL.ctrAll}</dt><dd>{metric(row.ctr, "pct")}</dd></div><div><dt>%Ads (Meta)</dt><dd>{metric(row.revenue > 0 ? row.spend / row.revenue : null, "pct")}</dd></div><div><dt>ความถี่เฉลี่ย/วัน</dt><dd>{metric(row.frequency)}</dd></div></dl></article>)}</div></section>;
}


/* ตัวกรองเฉพาะหน้า Creative (อยู่ในลิงก์ ไม่ข้ามหน้า) · ช่วงวันและแบรนด์ใช้ร่วมกับ Overview/แคมเปญ */
const CREATIVE_FILTERS = {
  platform: { default: "all" }, state: { default: "all", allowed: ["all", "fatigue", "ready", "waiting"] },
  format: { default: "all", allowed: ["all", ...Object.keys(FORMAT_LABELS)] },
  sort: { default: "spend", allowed: ["spend", "purchases", "cpa", "roas", "cpl", "ctr", "frequency"] }, q: { default: "" },
  /* "auto" = ยังไม่ได้เลือกเอง → มีกฎพร้อมใช้ก็เปิดใช้ทุกกฎทันที (อาร์ตแจ้ง 21 ก.ย. ค่ำ:
     ตั้งกฎไว้แล้วเข้าหน้านี้กลับไม่แสดงอะไรเลย เพราะตั้งต้นเป็น "ไม่ใช้กฎ") · เลือก "ไม่ใช้กฎ" เองยังเคารพ */
  rule: { default: "auto" }, outcome: { default: "all", allowed: ["all", "fail", "pass", "pending"] },
  view: { default: "cards", allowed: ["cards", "table"] },   // เปิดมาเป็นรูปเต็มเสมอ (อาร์ตเลือก 25 ก.ย.) · ตารางผ่านลิงก์ ?view=table
};

export function CreativeLibraryView() {
  const { data, inBrandScope, brandFilter, toast } = useApp();
  const ads = useAdsData();
  const today = isoDay(new Date());
  const [filters, setFilters] = useReportFilters(CREATIVE_FILTERS);
  const { period, from, to, brand, platform, format, state, sort, q: query, rule: ruleId, outcome, view } = filters;
  const setFormat = (next) => setFilters({ format: next });
  const setBrand = (next) => setFilters({ brand: next });
  const setPlatform = (next) => setFilters({ platform: next });
  const setState = (next) => setFilters({ state: next });
  const setSort = (next) => setFilters({ sort: next });
  const setQuery = (next) => setFilters({ q: next });
  const setOutcome = (next) => setFilters({ outcome: next });
  const configuredRules = useMemo(() => normalizeCreativeRules(data.settings?.ads_control?.creativeRules), [data.settings]);
  const rules = useMemo(() => configuredRules.filter((rule) => rule.value != null), [configuredRules]);
  // กฎที่เลือกไว้ถูกลบไปแล้ว → กลับเป็นไม่ใช้กฎ
  const activeRule = ruleId === "auto" || ruleId === "all" ? (rules.length ? "all" : "none")
    : rules.some((rule) => rule.id === ruleId) ? ruleId : "none";
  const [selected, setSelected] = useState([]);
  const v = useMemo(() => {
    // ช่วง "ล่าสุด/นี้" จบที่วันที่มีข้อมูล — หลักเดียวกับภาพรวม/แคมเปญ (ตรวจรอบ 28 ก.ย.)
    const dataThrough = (ads.source === "meta_pilot" ? syncedThrough(ads.pilot?.summary?.lastSuccessAt) : null) ?? latestSpendDay(analyticsCards(ads.cards));
    const cutoff = ads.source === "meta_pilot" ? dataCutoff(today, dataThrough) : null;
    const range = periodRange(period, from, to, new Date(), cutoff);
    const cards = analyticsCards(ads.cards).filter(inBrandScope);
    const brands = (data.brands ?? []).filter((item) => item.active !== false && (brandFilter === "all" || item.id === brandFilter));
    // ข้อมูลจริง: คำแนะนำไม่ใช้ ROAS ของ Meta — หลักเดียวกับหน้าแคมเปญ (อาร์ตเคาะ 26 ก.ย.)
    const all = adsCreativeRows(cards, range, brands, undefined, { roasFromMeta: ads.source !== "meta_pilot" });
    const platforms = [...new Set(all.map((row) => row.platform))].sort();
    // แบรนด์ที่จำมาจากหน้าอื่น/ลิงก์ แต่ไม่อยู่ในขอบเขตตอนนี้ = ทุกแบรนด์ (ไม่ให้หน้าว่างโดยไม่รู้สาเหตุ)
    const brandSel = brands.some((item) => item.id === brand) ? brand : "all";
    // ตารางรูปแบบนับจากตัวกรองอื่นทั้งหมด ยกเว้นรูปแบบเอง — เห็นทุกรูปแบบเทียบกันเสมอ
    const formats = formatBreakdown(filterCreativeLibrary(all, { brand: brandSel, platform, state, sort, query }));
    const filtered = filterCreativeLibrary(all, { brand: brandSel, platform, format, state, sort, query });
    // สรุปผลกฎนับจากชิ้นที่ผ่านตัวกรองอื่นแล้ว (ก่อนกรองผลกฎ) — เห็นภาพรวมผ่าน/ไม่ผ่านของชุดที่กำลังดู
    const ruleSummary = activeRule === "none" ? null : creativeRuleSummary(filtered, rules, activeRule);
    const rows = filterByRuleOutcome(filtered, rules, activeRule, outcome);
    // สถานะเปิด/ปิดเป็นของตอนดึงเช้า — ทุกชิ้นปิดแต่เมื่อวานยังใช้เงิน = ต้องบอก (ทดสอบแบบผู้ใช้จริง 27 ก.ย.)
    const statusNote = ads.source === "meta_pilot" ? statusSnapshotNote(all, cards, today) : null;
    return { rows, all, brands, brandSel, platforms, formats, summary: creativeLibrarySummary(rows), range, ruleSummary, statusNote, dataThrough, cutoff };
  }, [data, ads.cards, ads.source, ads.pilot?.summary?.lastSuccessAt, inBrandScope, brandFilter, period, from, to, brand, platform, format, state, sort, query, rules, activeRule, outcome, today]);
  const chosen = selected.map((key) => v.all.find((row) => row.key === key)).filter(Boolean);
  const [openIndex, setOpenIndex] = useState(null);
  /* รูปแบบเดียว = ไม่มีอะไรให้เทียบ (รีวิว UX 25 ก.ย.) · กำลังกรองรูปแบบอยู่ = เปิดไว้ให้กดยกเลิกได้ */
  const showFormats = v.formats.length > 1 || format !== "all";
  const [formatsToggled, setFormatsOpen] = useState(false);
  const formatsOpen = formatsToggled || format !== "all";
  // สถานะแคมเปญจากทุกชิ้นในแคมเปญเดียวกัน — หน้าต่างครีเอทีฟใช้ในส่วน "อยู่ใน N แคมเปญ"
  const statusIndex = useMemo(() => campaignStatusIndex(v.all), [v.all]);
  const listTop = useRef(null);
  /* แบ่งหน้า: ตัวกรอง/การเรียง/ช่วงวัน/แหล่งข้อมูลเปลี่ยน → กลับหน้า 1 · ตัวเลขสรุปด้านบนนับทุกหน้า · ที่เลือกเทียบคงอยู่ข้ามหน้า */
  const pager = usePagination(v.rows, { storageKey: "ssb.creatives.pageSize", sizes: PAGE_SIZES, defaultSize: 12, resetKey: `${period}|${from}|${to}|${brand}|${platform}|${state}|${sort}|${query}|${activeRule}|${outcome}|${ads.source}` });
  const toggle = (key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length >= 4 ? (toast?.("เทียบได้สูงสุด 4 ชิ้น", "bad"), current) : [...current, key]);
  const fromShown = isoDay(new Date(v.range.start));
  const pending = isDataPending({ real: ads.source === "meta_pilot", range: v.range, dataThrough: v.dataThrough, hasData: v.all.length > 0 });
  const toShown = v.range.end > v.range.start ? isoDay(new Date(new Date(v.range.end).getTime() - 1)) : fromShown;   // ช่วงว่าง = วันเริ่ม
  // กฎที่เปิดเองอัตโนมัติ (rule=auto) ไม่นับ — ไม่งั้นแผงตัวกรองกางเองทุกครั้งที่มีกฎ (เห็นจริงบนมือถือ 25 ก.ย.)
  const loading = ads.source === "meta_pilot" && ["idle", "loading"].includes(ads.pilot?.status);
  const loadError = ads.source === "meta_pilot" && ads.pilot?.status === "error";   // ชุด A ข้อ 5 — ห้ามบอก "ไม่พบชิ้นงาน"
  const moreActive = [platform !== "all", format !== "all", state !== "all", ruleId !== "auto" && activeRule !== "none", outcome !== "all"].filter(Boolean).length;
  return <main className="aw cl">
    <section className="cl-command"><header><div><h1>คลัง Creative</h1><p>ดูชิ้นงานที่ทำเงิน ชิ้นที่เริ่มล้า และเลือกมาเทียบกัน</p></div><div className="cl-head-actions"><div className="cl-view-switch" role="group" aria-label="รูปแบบรายการ">
        <button type="button" aria-pressed={view === "cards"} onClick={() => setFilters({ view: "cards" })}>รูป</button>
        <button type="button" aria-pressed={view === "table"} onClick={() => setFilters({ view: "table" })}>ตาราง</button>
      </div><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div></header><AdsSourceNotice ads={ads} todayOnly={period === "today"} /><StatusSnapshotNote note={v.statusNote} />
      <div className="cl-filters"><DateRangePicker period={period} from={fromShown} to={toShown} max={today} through={v.cutoff} onChange={({ period: nextPeriod, from: nextFrom, to: nextTo }) => setFilters({ period: nextPeriod, from: nextFrom, to: nextTo })} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...v.brands.map((item) => [item.id, item.name])]} value={v.brandSel} onChange={setBrand} /><Dropdown label="เรียง" options={[["spend", "ค่าแอดสูงสุด"], ["purchases", "การซื้อสูงสุด"], ["cpa", "ต้นทุนต่อการซื้อต่ำสุด"], ["roas", "ROAS (Meta) สูงสุด"], ["cpl", "ต้นทุนต่อผลลัพธ์ Meta ต่ำสุด"], ["ctr", "CTR ทั้งหมด สูงสุด"], ["frequency", "ความถี่เฉลี่ยรายวันสูงสุด"]]} value={sort} onChange={setSort} /><label className="cl-search ads-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label="ค้นหาครีเอทีฟ" placeholder="ค้นหาชิ้นงานหรือแคมเปญ" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {/* ตัวกรองรองพับไว้ (รีวิว UX 25 ก.ย.: เดิม 7 ตัว + ช่องค้นหาอัดแถวเดียว) · มีตัวไหนใช้อยู่ = กางไว้และนับให้เห็น */}
        <details className="cl-more" open={moreActive > 0 || undefined}><summary>ตัวกรอง{moreActive ? ` · ${moreActive}` : ""}</summary><div className="cl-more-body"><Dropdown label="ช่องทาง" options={[["all", "ทุกช่องทาง"], ...v.platforms.map((item) => [item, item])]} value={platform} onChange={setPlatform} /><Dropdown label="รูปแบบ" options={[["all", "ทุกรูปแบบ"], ...Object.entries(FORMAT_LABELS)]} value={format} onChange={setFormat} /><Dropdown label="สภาพชิ้นงาน" options={[["all", "ทั้งหมด"], ["fatigue", FATIGUE_LABEL], ["ready", "มีสื่อแล้ว"], ["waiting", "รอสื่อ"]]} value={state} onChange={setState} /><Dropdown label="กฎ" options={[["none", "ไม่ใช้กฎ"], ...(rules.length > 1 ? [["all", "ทุกกฎ"]] : []), ...rules.map((rule) => [rule.id, ruleTitle(rule)])]} value={activeRule} onChange={(next) => setFilters(next === "none" ? { rule: next, outcome: "all" } : { rule: next })} />{activeRule !== "none" && <Dropdown label="ผล" options={[["all", "ทั้งหมด"], ["fail", "ไม่ผ่าน"], ["pass", "ผ่าน"], ["pending", "ยังตัดสินไม่ได้"]]} value={outcome} onChange={setOutcome} />}</div></details>
      </div>
    </section>
    {/* โหลดพัง/กำลังโหลด (อาร์ตเคาะ 26 ก.ย.): ระหว่างโหลดห้ามบอก "ไม่พบชิ้นงาน" หรือ ฿0.00 · ภาพพังบอกตรงๆ พร้อมลองใหม่ */}
    {ads.pilot?.creativesFailed && <div className="cl-alert" role="alert"><span><b>โหลดภาพครีเอทีฟไม่สำเร็จ</b> · ตัวเลขยังถูกต้อง แต่ชิ้นงานยังไม่มีภาพและอาจแยกเป็นหลายชิ้น</span><button type="button" onClick={ads.reload}>ลองใหม่</button></div>}
    {loadError ? <div className="cl-alert" role="alert"><span><b>โหลดตัวเลขไม่สำเร็จ{(r => r ? ` · ${r}` : "")(adsErrorText(ads.pilot?.error, null))}</b> — ยังแสดงชิ้นงานไม่ได้ ไม่ได้แปลว่าช่วงนี้ไม่มีครีเอทีฟ</span><button type="button" onClick={() => ads.reload?.()}>ลองใหม่</button></div>
    : loading ? <section className="cl-loading" role="status" aria-label="กำลังโหลด"><span>กำลังโหลดชิ้นงาน…</span><div className="cl-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="cl-skeleton" aria-hidden="true" />)}</div></section> : <>
    {/* แผงสรุป รื้อ 26 ก.ย. (อาร์ต: "รื้อมาแล้วทำดีๆหน่อย" — เดิมประโยคยาวบรรทัดเดียว ชิปล้นขวา ปุ่มเทียบรูปแบบลอยอยู่ใต้)
        ชั้นบน: ตัวเลขชุดที่กำลังดู แบบป้าย/ค่า + ปุ่มเทียบรูปแบบ · ชั้นล่าง: กรองผลกฎแบบแบ่งช่อง (มี "ทั้งหมด" ให้กดกลับ) + แก้กฎ */}
    {/* ช่วงที่ข้อมูลยังไม่เข้า = ไม่มีอะไรให้สรุป — แถบศูนย์ทั้งแถบเหนือกล่อง "ยังไม่เข้า" เป็นแค่เสียงรบกวน (ตรวจรอบ 28 ก.ย.) */}
    {!pending && <section className="cl-bar" aria-label="สรุปและผลกฎ">
      <div className="cl-bar-top">
        <div className="cl-stats" role="group" aria-label="สรุปชุดที่กำลังดู">
          <div><span>ชิ้นงาน</span><b>{fmtInt(v.summary.count)}</b></div>
          <div><span>ค่าแอด</span><b>{metric(v.summary.spend, "money")}</b></div>
          <div><span>การซื้อ (Meta)</span><b>{metric(v.summary.purchases, "count")}</b></div>
          {v.summary.tired > 0 && <div className="warn"><span>เริ่มล้า</span><b>{fmtInt(v.summary.tired)}</b></div>}
        </div>
        {showFormats && <button type="button" className="cl-bar-toggle" aria-expanded={formatsOpen} onClick={() => setFormatsOpen((open) => !open)}>เทียบตามรูปแบบ<ChevronDown size={14} aria-hidden="true" /></button>}
      </div>
      <div className="cl-bar-rules">
        {v.ruleSummary ? <>
          <div className="cl-seg" role="group" aria-label="กรองตามผลกฎ">
            <button type="button" aria-pressed={outcome === "all"} onClick={() => setOutcome("all")}>ทั้งหมด <b>{fmtInt(v.ruleSummary.pass + v.ruleSummary.fail + v.ruleSummary.pending + v.ruleSummary.nodata + v.ruleSummary.na)}</b></button>
            <button type="button" className="fail" aria-pressed={outcome === "fail"} onClick={() => setOutcome(outcome === "fail" ? "all" : "fail")}>ไม่ผ่าน <b>{fmtInt(v.ruleSummary.fail)}</b>{v.ruleSummary.failSpend ? <small>{fmtMoney(v.ruleSummary.failSpend)}</small> : null}</button>
            <button type="button" className="pass" aria-pressed={outcome === "pass"} onClick={() => setOutcome(outcome === "pass" ? "all" : "pass")}>ผ่าน <b>{fmtInt(v.ruleSummary.pass)}</b></button>
            <button type="button" aria-pressed={outcome === "pending"} onClick={() => setOutcome(outcome === "pending" ? "all" : "pending")}>ยังตัดสินไม่ได้ <b>{fmtInt(v.ruleSummary.pending + v.ruleSummary.nodata)}</b></button>
          </div>
          <Link className="cl-bar-link" to="/mkt/ads?panel=settings&tab=rules">แก้กฎ</Link>
        </>
        : configuredRules.length ? <><span className="cl-bar-note">กฎ {configuredRules.length - rules.length} ข้อยังไม่ใส่ค่าเกณฑ์</span><Link className="cl-bar-link" to="/mkt/ads?panel=settings&tab=rules">แก้กฎ</Link></>
        : <><span className="cl-bar-note muted">ยังไม่มีกฎคัดชิ้นงาน</span><Link className="cl-bar-link" to="/mkt/ads?panel=settings&tab=rules">ตั้งกฎคัดครีเอทีฟ</Link></>}
      </div>
    </section>}
    {!pending && showFormats && formatsOpen && <section className="cl-formats" aria-labelledby="cl-formats-h"><h2 id="cl-formats-h" className="ct-sr">เทียบตามรูปแบบชิ้นงาน</h2>
      <div className="aw-table-scroll"><table><thead><tr><th>รูปแบบ</th><th>ชิ้น</th><th>ค่าแอด</th><th>สัดส่วน</th><th>ต่อผลลัพธ์ Meta</th><th>การซื้อ</th><th>ต่อการซื้อ</th><th>{METRIC_LABEL.ctrAll}</th><th>เริ่มล้า</th></tr></thead>
        <tbody>{v.formats.map((f) => { const bestCpl = f.cpl != null && f.cpl === Math.min(...v.formats.filter((x) => x.cpl != null && x.count >= 3).map((x) => x.cpl)); const bestCpa = f.cpa != null && f.cpa === Math.min(...v.formats.filter((x) => x.cpa != null && x.count >= 3).map((x) => x.cpa)); return <tr key={f.format} className={format === f.format ? "is-selected" : ""}>
          <th><button type="button" aria-pressed={format === f.format} onClick={() => setFormat(format === f.format ? "all" : f.format)}>{f.label}</button></th>
          <td>{f.count}</td><td>{metric(f.spend, "money")}</td><td>{metric(f.spendShare, "pct")}</td>
          <td title={!f.resultComparable ? "รูปแบบนี้มีหลาย Meta result จึงไม่รวมต้นทุนต่อผลลัพธ์" : undefined}>{metric(f.cpl, "money")}{bestCpl && <small className="cl-best"> ต่ำสุด</small>}</td><td>{metric(f.purchases, "count")}</td>
          <td>{metric(f.cpa, "money")}{bestCpa && <small className="cl-best"> ต่ำสุด</small>}</td><td>{metric(f.ctr, "pct")}</td><td>{f.fatigue}</td></tr>; })}</tbody></table></div>
    </section>}
    <CompareTray rows={chosen} onRemove={(key) => setSelected((current) => current.filter((item) => item !== key))} onClear={() => setSelected([])} />
    <div ref={listTop} className="cl-list-top" />
    {v.rows.length ? <>
      {view === "table" ? <section className="cl-table-wrap aw-panel"><CreativeTable context="library" rows={pager.pageItems} onOpen={(i) => setOpenIndex(pager.start + i)}
        selection={{ isChecked: (key) => selected.includes(key), toggle }}
        renderExtra={activeRule === "none" ? null : (row) => { const r = evaluateCreativeRules(row, rules, activeRule); return r ? <span className={`ct-rule ct-rule--${r.status}`}>{RULE_TEXT[r.status]}</span> : null; }} /></section>
      : <section className="cl-grid">{pager.pageItems.map((row, i) => <CreativeCard key={row.key} row={row} selectable checked={selected.includes(row.key)} onToggle={() => toggle(row.key)} onOpen={() => setOpenIndex(pager.start + i)} ruleResult={evaluateCreativeRules(row, rules, activeRule)} ruleText={RULE_TEXT} />)}</section>}
      <Pagination pager={pager} sizes={PAGE_SIZES} unit="ชิ้นงาน" label="แบ่งหน้า Creative" onChange={() => scrollToList(listTop)} /></>
      : pending
        ? <DataPending label={rangeLabel(fromShown, toShown)} through={v.dataThrough} />
        : <section className="cl-empty"><ImageIcon size={28} /><strong>ไม่พบชิ้นงานในช่วงนี้</strong><span>ลองเปลี่ยนช่วงเวลาหรือล้างตัวกรอง</span></section>}
    </>}
    {/* เชิงอรรถทั้งหน้ารวมที่เดียว พับไว้ (สเปก 2026-09-26 · อาร์ตให้เอาออกจากพื้นผิวหลัก) */}
    <details className="cl-notes"><summary>สูตรและที่มา</summary><ul>
      <li>CTR ลิงก์ = คลิกลิงก์ ÷ การแสดงผล · CTR ทั้งหมดนับทุกคลิก (ไลก์ กดดูรูป) ใช้เป็นฐานของกฎเริ่มล้าและกฎคัดครีเอทีฟ</li>
      <li>ROAS = รายได้ที่ Meta เห็น ÷ ค่าแอด · Meta ไม่เห็นการซื้อ (ชิ้นทักแชท) ขึ้น "—" ไม่ใช่ 0 · ยอดขายจริงดูที่หน้าภาพรวม</li>
      <li>รูปแบบมาจาก Meta ถ้าไม่ระบุ อ่านจากคำนำหน้าชื่อ (VDO · PIC · Album) · ผลลัพธ์คนละ event ไม่รวมเป็นต้นทุนเดียว · "ต่ำสุด" เทียบเฉพาะรูปแบบที่มีตั้งแต่ 3 ชิ้น</li>
      <li>สถานะเปิด/ปิดและภาพมาจากรอบดึง {DAILY_RUN_LABEL} ทุกวัน · ชิ้นนอก 400 อันดับค่าแอดของบัญชีไม่มีภาพและสถานะ</li>
    </ul></details>
    {/* หน้าต่างเลื่อน ‹ › ได้ครบทุกชิ้น ไม่หยุดที่ขอบหน้าที่แบ่งไว้ (ชุด B ข้อ 17) */}
    {openIndex != null && <CreativeViewer rows={v.rows} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} canPreview={ads.canPreview} campaignStatus={statusIndex} ruleOf={activeRule === "none" ? null : (row) => evaluateCreativeRules(row, rules, activeRule)} />}
  </main>;
}
