/* หน้ารายงานประชุม — เปิดบนจอในที่ประชุมแล้วเลื่อนตอบคำถามทีละข้อ
   ตัวเลขชุดเดียวกับ Overview · แคมเปญ · Creative (ใช้ model เดียวกัน) · ตัวกรองอยู่ในลิงก์ ส่งต่อแล้วเห็นเหมือนกัน */
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Link2, Settings2 } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { useAdsData } from "../ads/useAdsData.js";
import { AdsSourceControl, AdsSourceNotice } from "../ads/AdsSourceControl.jsx";
import { buildOverviewModel } from "../ads/overviewModel.js";
import { buildCampaignsModel } from "../campaigns/campaignsModel.js";
import { adsCreativeRows, filterByChannel, revenueBasisCards } from "../adsOverview.js";
import { analyticsCards } from "../mktAnalytics.js";
import { isoDay } from "../adsScope.js";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { RevenueBasisToggle } from "../ui/RevenueBasisToggle.jsx";
import { useReportFilters } from "../ui/useReportFilters.js";
import { fmtInt, fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { CREATIVE_MIN_SPEND, reportCampaigns, reportCreatives, reportDrivers, reportEfficiency, reportFunnel, reportHeadline, reportSales } from "./meetingReport.js";
import "../ads/adsWorkspace.css";
import "./meetingReport.css";

const QUICK = [["wtd", "สัปดาห์นี้"], ["lastWeek", "สัปดาห์ก่อน"], ["mtd", "เดือนนี้"], ["lastMonth", "เดือนก่อน"]];
const format = (fmt, value) => value == null ? "—" : fmt === "money" ? fmtMoney(value) : fmt === "roas" ? `${fmtNum(value, 2)}×` : fmt?.startsWith("pct") ? fmtPct(value) : fmtInt(value);
const signedMoney = (n) => n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "-" : ""}${fmtMoney(Math.abs(n))}`;

/** % เปลี่ยน พร้อมบอกว่าดีหรือแย่ (ค่าแอด/CPL/%Ads ขึ้น = แย่) — สีไม่ใช่ทางเดียวที่บอก มีลูกศรและคำ */
function Change({ value, sense = "higher", label }) {
  if (value == null) return <span className="mr-change zinc">เทียบไม่ได้</span>;
  const good = sense === "lower" ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`mr-change ${good ? "emerald" : "rose"}`}><Icon size={13} aria-hidden="true" />{value > 0 ? "+" : ""}{fmtNum(value, 2)}% <em>{value === 0 ? "เท่าเดิม" : good ? "ดีขึ้น" : "แย่ลง"}</em>{label ? <small> {label}</small> : null}</span>;
}

function Question({ n, title, answer, link, children }) {
  return <section className="mr-q" aria-labelledby={`mr-q${n}`}>
    <header><span className="mr-q-n">{n}</span><div><h2 id={`mr-q${n}`}>{title}</h2>{answer && <p>{answer}</p>}</div>{link && <Link className="mr-more" to={link.to}>{link.label} <ArrowRight size={13} aria-hidden="true" /></Link>}</header>
    {children}
  </section>;
}

export function MeetingReportView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const ads = useAdsData();
  const { search } = useLocation();
  const [rawFilters, setFilters] = useReportFilters();
  /* เดือนนี้: Overview คิดยอดกับวันเดียวกันของเดือนก่อน แต่ funnel/ROAS/แคมเปญใช้ช่วงก่อนหน้า (ยาวเท่ากัน) — คนละฐาน
     รายงานประชุมบังคับฐานเดียวทั้งหน้า = วันเดียวกันเดือนก่อน ไม่ให้เอาตัวเลขต่างฐานมาวางคู่กัน */
  const filters = useMemo(() => rawFilters.period === "mtd" ? { ...rawFilters, compare: "lastMonth" } : rawFilters, [rawFilters]);
  const [copied, setCopied] = useState(false);
  const todayLocal = isoDay(new Date());
  const scopeBrand = filters.brand !== "all" ? filters.brand : brandFilter;
  // ตัวเลือกแบรนด์ใช้ขอบเขตกลาง (ไม่ใช่แบรนด์ที่เลือกอยู่) — เลือกแล้วยังสลับไปแบรนด์อื่นได้
  const brandOptions = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));

  const r = useMemo(() => {
    const overview = buildOverviewModel({ data, ads, inBrandScope, brandFilter: scopeBrand, filters });
    const campaigns = buildCampaignsModel({ data, ads, inBrandScope, brandFilter: scopeBrand, filters: { ...filters, brand: "all" }, todayLocal });
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (scopeBrand === "all" || b.id === scopeBrand));
    const cards = filterByChannel(revenueBasisCards(analyticsCards(ads.cards).filter(inBrandScope), filters.basis, { mockFallback: ads.mockFallback }), filters.channel)
      .filter((card) => scopeBrand === "all" || card.brand_id === scopeBrand);
    const creativeRows = adsCreativeRows(cards, overview.range, brands);
    const parts = {
      sales: reportSales(overview), efficiency: reportEfficiency(overview), funnel: reportFunnel(overview), drivers: reportDrivers(overview),
      campaigns: reportCampaigns(campaigns.rows), creatives: reportCreatives(creativeRows),
    };
    return { overview, ...parts, headline: reportHeadline({ ...parts, compareLabel: overview.compareLabel }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ads.cards, ads.mockFallback, ads.source, ads.sales, ads.salesGoals, inBrandScope, scopeBrand, filters, todayLocal]);

  const { overview, sales, efficiency, funnel, drivers, campaigns, creatives, headline } = r;
  const real = ads.source === "meta_pilot";
  const shownFrom = isoDay(new Date(overview.range.start));
  const shownTo = isoDay(new Date(new Date(overview.range.end).getTime() - 1));
  const query = search || "";
  const brandName = scopeBrand === "all" ? "ทุกแบรนด์" : brandOptions.find((b) => b.id === scopeBrand)?.name ?? "แบรนด์ที่เลือก";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* เบราว์เซอร์ไม่ให้คัดลอก — คัดลอกจากแถบที่อยู่ได้ */ }
  };
  const maxRevenueDelta = Math.max(1, ...drivers.revenue.map((d) => Math.abs(d.delta)));
  const maxSpendDelta = Math.max(1, ...drivers.spend.map((d) => Math.abs(d.delta)));

  return <main className="aw mr">
    <section className="aw-toolbar" aria-label="ตัวกรองรายงาน">
      <header className="aw-header"><div><h1>รายงานประชุม</h1><p>{brandName} · {overview.rangeLabel} · เทียบ{overview.compareLabel}</p></div>
        <div className="aw-header-actions"><button type="button" className="mr-copy" onClick={copyLink}>{copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์รายงาน"}</button><AdsSourceControl ads={ads} /><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</Link></div></header>
      <AdsSourceNotice ads={ads} />
      <div className="aw-controls">
        <div className="aw-presets" role="group" aria-label="รอบรายงาน">{QUICK.map(([key, label]) => <button key={key} type="button" aria-pressed={filters.period === key} className={filters.period === key ? "active" : ""} onClick={() => setFilters({ period: key })}>{label}</button>)}</div>
        <DateRangePicker period={filters.period} from={shownFrom} to={shownTo} max={todayLocal} onChange={({ period, from, to }) => setFilters({ period, from, to })} />
        <Dropdown label="แบรนด์" options={[["all", "ทุกแบรนด์"], ...brandOptions.map((b) => [b.id, b.name])]} value={brandOptions.some((b) => b.id === filters.brand) ? filters.brand : "all"} onChange={(brand) => setFilters({ brand })} />
        {filters.period === "mtd" ? <span className="mr-fixed-compare">เทียบ · วันเดียวกันเดือนก่อน</span> : <Dropdown label="เทียบ" options={[["previous", filters.period === "wtd" ? "สัปดาห์ก่อน" : "ช่วงก่อน"], ["lastMonth", "เดือนก่อน"]]} value={filters.compare} onChange={(compare) => setFilters({ compare })} />}
        <RevenueBasisToggle value={filters.basis} onChange={(basis) => setFilters({ basis })} />
      </div>
    </section>

    <section className="mr-headline" aria-labelledby="mr-summary"><h2 id="mr-summary">สรุป 1 นาที</h2>
      {headline.length ? <ul>{headline.map((line) => <li key={line.key} className={line.tone}><i aria-hidden="true" />{line.text}</li>)}</ul> : <p className="aw-key">ยังไม่มีข้อมูลในช่วงนี้</p>}
    </section>

    <Question n={1} title="ยอดขายเป็นยังไง ถึงเป้าไหม" link={{ to: `/mkt/ads${query}`, label: "ดูใน Overview" }}
      answer={sales.monthView ? (sales.target == null ? "ยังไม่ตั้งเป้ายอดขายเดือนนี้ในระบบขาย" : `ทำได้ ${fmtPct(sales.pctOfTarget)} ของเป้า ${fmtMoney(sales.target)}`) : "เป้าและคาดการณ์รายเดือนดูได้เมื่อเลือก \"เดือนนี้\""}>
      <div className="mr-kpis">
        <div className="mr-kpi mr-kpi--lead"><span>ยอดขาย{real ? " · ระบบขาย" : ""}</span><b>{fmtMoney(sales.revenue)}</b><Change value={sales.change} label={`เทียบ ${fmtMoney(sales.prevRevenue)}`} /></div>
        {sales.monthView && <><div className="mr-kpi"><span>ควรได้ถึงวันนี้</span><b>{fmtMoney(sales.expectedToDate)}</b></div>
          <div className="mr-kpi"><span>คาดสิ้นเดือน</span><b>{fmtMoney(sales.forecast)}</b>{sales.forecastGap != null && <span className={`mr-change ${sales.forecastGap < 0 ? "rose" : "emerald"}`}>{sales.forecastGap < 0 ? "ต่ำกว่าเป้า" : "เหนือเป้า"} {fmtMoney(Math.abs(sales.forecastGap))}</span>}</div></>}
      </div>
      {sales.excluded.length > 0 && <p className="aw-key">ไม่รวม {sales.excluded.join(" · ")} (รอเชื่อมแหล่งข้อมูลยอดขาย)</p>}
      <div className="aw-table-scroll"><table className="mr-table"><thead><tr><th>แบรนด์</th><th>ยอดขาย</th><th>เทียบ{overview.compareLabel}</th>{sales.monthView && <th>ของเป้า</th>}<th>ค่าแอด</th><th>%Ads</th></tr></thead>
        <tbody>{overview.brands.map((b) => <tr key={b.id}><th>{b.name}</th><td>{b.salesSource === "waiting" ? <small>รอเชื่อมแหล่งข้อมูล</small> : fmtMoney(b.revenue)}</td><td><Change value={b.salesSource === "waiting" ? null : b.revChangePct} /></td>{sales.monthView && <td>{b.revPct == null ? "—" : fmtPct(b.revPct)}</td>}<td>{fmtMoney(b.spend)}</td><td>{b.pctAds == null ? "—" : fmtPct(b.pctAds)}</td></tr>)}</tbody></table></div>
    </Question>

    <Question n={2} title="ใช้งบไปเท่าไร คุ้มไหม" link={{ to: `/mkt/ads${query}`, label: "ดูใน Overview" }} answer={real ? "ค่าแอดจาก Meta · ROAS %Ads CPL CAC หารด้วยยอดจากระบบขาย" : null}>
      <div className="mr-metrics">{efficiency.map((row) => <div key={row.key} className="mr-metric">
        <span>{row.label}</span><b>{format(row.fmt, row.value)}</b>
        <Change value={row.change} sense={row.sense} />
        <small className={row.goal ? row.goal.tone : "zinc"}>{row.goal ? `${row.goal.text} · เป้า ${format(row.fmt, row.goal.target)}` : row.key === "spend" && overview.monthView && overview.summary.budget != null ? `งบเดือน ${fmtMoney(overview.summary.budget)}` : "ยังไม่ตั้งเป้า"}</small>
      </div>)}</div>
    </Question>

    <Question n={3} title="ลูกค้าหล่นตรงไหน" link={{ to: `/mkt/ads${query}`, label: "ดูใน Overview" }}
      answer={funnel.worst ? `หล่นมากสุดช่วง ${funnel.worst.from} → ${funnel.worst.label} ผ่าน ${fmtPct(funnel.worst.conv)}` : "ยังคำนวณอัตราผ่านแต่ละขั้นไม่ได้"}>
      <ol className="mr-funnel">{funnel.stages.map((stage, i) => <li key={stage.key} className={funnel.worst?.label === stage.label ? "worst" : ""}>
        {i > 0 && <span className="mr-conv" aria-label={`ผ่านจากขั้นก่อน ${stage.conv == null ? "ไม่ทราบ" : fmtPct(stage.conv)}`}>{stage.conv == null ? "—" : fmtPct(stage.conv)}</span>}
        <span>{stage.label}</span><b>{format("int", stage.value)}</b><Change value={stage.change} />{stage.sub && <small>{stage.sub}</small>}
      </li>)}</ol>
    </Question>

    <Question n={4} title="อะไรทำให้ตัวเลขเปลี่ยน" answer={drivers.revenueTotalDelta != null ? `ยอดขายรวม ${signedMoney(drivers.revenueTotalDelta)} · ค่าแอดรวม ${signedMoney(drivers.spendTotalDelta)} เทียบ${overview.compareLabel}` : `ยังเทียบกับ${overview.compareLabel}ไม่ได้`}>
      <div className="mr-drivers">
        <div><h3>ยอดขายรายแบรนด์</h3>{drivers.revenue.length ? <ul>{drivers.revenue.map((d) => <li key={d.id}><span>{d.name}</span><span className="mr-bar"><i className={d.delta < 0 ? "rose" : "emerald"} style={{ width: `${Math.abs(d.delta) / maxRevenueDelta * 100}%` }} /></span><b className={d.delta < 0 ? "rose" : "emerald"}>{signedMoney(d.delta)}</b></li>)}</ul> : <p className="aw-key">ไม่มีข้อมูลเทียบ</p>}</div>
        <div><h3>ค่าแอดรายแบรนด์</h3>{drivers.spend.length ? <ul>{drivers.spend.map((d) => <li key={d.id}><span>{d.name}</span><span className="mr-bar"><i className="zinc" style={{ width: `${Math.abs(d.delta) / maxSpendDelta * 100}%` }} /></span><b>{signedMoney(d.delta)}</b></li>)}</ul> : <p className="aw-key">ไม่มีข้อมูลเทียบ</p>}</div>
        <div><h3>แคมเปญที่ค่าแอดเปลี่ยนมากสุด</h3>{campaigns.movers.length ? <ul>{campaigns.movers.map((c) => <li key={c.key} className="plain"><span title={c.name}>{c.name}<small>{c.brand}</small></span><b>{signedMoney(c.delta)}</b></li>)}</ul> : <p className="aw-key">ไม่มีข้อมูลเทียบ</p>}</div>
      </div>
    </Question>

    <Question n={5} title="แคมเปญไหนต้องทำอะไร" link={{ to: `/mkt/campaigns${query}`, label: "ดูแคมเปญทั้งหมด" }}
      answer={campaigns.actionCount ? `ควรตัดสินใจ ${fmtInt(campaigns.actionCount)} แคมเปญ ค่าแอดรวม ${fmtMoney(campaigns.actionSpend)}` : "ไม่มีแคมเปญที่ควรหยุดหรือแก้ตามกฎ"}>
      <div className="mr-chips">{[["stop", "พิจารณาหยุด", "rose"], ["fix", "ตรวจแก้", "amber"], ["gate", "ติด Gate", "amber"], ["scale", "พิจารณาสเกล", "emerald"], ["watch", "ติดตาม", "zinc"], ["wait", "รอข้อมูล", "zinc"]].map(([tag, label, tone]) => <span key={tag} className={`mr-chip ${tone}`}>{label} <b>{fmtInt(campaigns.counts[tag] ?? 0)}</b></span>)}</div>
      {campaigns.actions.length > 0 && <div className="aw-table-scroll"><table className="mr-table mr-actions"><thead><tr><th>แคมเปญ</th><th>ค่าแอด</th><th>CPL</th><th>คำแนะนำ</th><th>ทำไม · ทำอะไรต่อ</th></tr></thead>
        <tbody>{campaigns.actions.map((c) => <tr key={c.key}><th>{c.name}<small>{c.brand}</small></th><td>{fmtMoney(c.spend)}</td><td>{fmtMoney(c.cpl)}</td><td><span className={`mr-chip ${c.decision.tone}`}>{c.decision.label}</span></td><td>{c.decision.why}<small>{c.decision.next}</small></td></tr>)}</tbody></table></div>}
      {campaigns.topSpend.length > 0 && <><h3 className="mr-sub">ใช้ค่าแอดมากสุด</h3><div className="aw-table-scroll"><table className="mr-table mr-actions"><thead><tr><th>แคมเปญ</th><th>ค่าแอด</th><th>CPL (Meta)</th><th>คำแนะนำ</th><th>ทำไม</th></tr></thead>
        <tbody>{campaigns.topSpend.map((c) => <tr key={c.key}><th>{c.name}<small>{c.brand}</small></th><td>{fmtMoney(c.spend)}</td><td>{fmtMoney(c.cpl)}</td><td><span className={`mr-chip ${c.decision?.tone ?? "zinc"}`}>{c.decision?.label ?? "—"}</span></td><td>{c.decision?.why ?? "—"}</td></tr>)}</tbody></table></div></>}
    </Question>

    <Question n={6} title="ครีเอทีฟไหนคุ้ม ไหนเปลือง" link={{ to: `/mkt/creatives${query}`, label: "ดู Creative ทั้งหมด" }}
      answer={creatives.tracksPurchases ? "การซื้อและต้นทุนต่อการซื้อเป็นของ Meta" : "บัญชีในขอบเขตนี้ Meta ไม่ได้วัดการซื้อ"}>
      <div className="mr-drivers">
        <div><h3>ต้นทุนต่อการซื้อต่ำสุด</h3>{creatives.best.length ? <ul>{creatives.best.map((c) => <li key={c.key} className="plain"><span title={c.creative}>{c.creative}<small>{c.brand} · ซื้อ {fmtInt(c.purchases)}</small></span><b className="emerald">{fmtMoney(c.cpa)}</b></li>)}</ul> : <p className="aw-key">ยังไม่มีชิ้นที่ใช้เงินเกิน ฿{fmtInt(CREATIVE_MIN_SPEND)} และมีการซื้อ</p>}</div>
        <div><h3>ใช้เงินแต่ยังไม่มีการซื้อ</h3>{creatives.noPurchase.length ? <><ul>{creatives.noPurchase.map((c) => <li key={c.key} className="plain"><span title={c.creative}>{c.creative}<small>{c.brand} · CPL {fmtMoney(c.cpl)}</small></span><b className="rose">{fmtMoney(c.spend)}</b></li>)}</ul><p className="aw-key">ทั้งหมด {fmtInt(creatives.noPurchaseCount)} ชิ้น รวม {fmtMoney(creatives.noPurchaseSpend)} · บางชิ้นอาจตั้งใจหาคนทัก ไม่ได้หาการซื้อ</p></> : <p className="aw-key">ไม่มีชิ้นที่ใช้เงินเกิน ฿{fmtInt(CREATIVE_MIN_SPEND)} แล้วยังไม่มีการซื้อ</p>}</div>
        <div><h3>เริ่มล้า</h3><p className="mr-big">{fmtInt(creatives.fatigue.count)} <small>ชิ้น · ค่าแอด {fmtMoney(creatives.fatigue.spend)}</small></p><p className="aw-key">ความถี่สูง หรือ CTR ครึ่งหลังของช่วงตกแรง</p></div>
      </div>
    </Question>

    <Question n={7} title="ตัวเลขเชื่อได้แค่ไหน" link={{ to: "/mkt/ads/sync", label: "ดูสถานะ Sync" }}>
      <ul className="mr-notes">
        {real ? <>
          <li>ข้อมูล Meta อัปเดตล่าสุด {ads.pilot?.summary?.lastSuccessAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ads.pilot.summary.lastSuccessAt)) : "—"}{ads.pilot?.summary?.provisionalToday ? " · วันนี้ยังไม่สิ้นสุด ยอดยังเปลี่ยนได้" : ""}</li>
          <li>ยอดขาย เป้า และ funnel มาจากระบบขาย · ค่าแอดและคนทักจากแอดมาจาก Meta</li>
          <li>ยอดขายยังไม่แยกตามแคมเปญ · ROAS และการซื้อรายแคมเปญ/ครีเอทีฟเป็นของ Meta (นับเฉพาะที่ Meta เห็น)</li>
          {sales.excluded.length > 0 && <li>{sales.excluded.join(" · ")} ยังไม่มีแหล่งยอดขาย · ค่าแอดนับรวม แต่ยอดขายและ ROAS ภาพรวมไม่รวม</li>}
        </> : <li>กำลังดูข้อมูลจำลอง ตัวเลขใช้สาธิตเท่านั้น</li>}
      </ul>
    </Question>
  </main>;
}
