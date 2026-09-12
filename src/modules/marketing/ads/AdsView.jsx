import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsByBrandChannel, adsChannelList, adsCompanySummary, adsSalePipeline, change, filterByChannel, paceStatus } from "../adsOverview.js";
import { fmtCompact, fmtInt, fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";
import { PlatformIcon, platformMeta } from "./PlatformIcon.jsx";
import { AdsWorkspace } from "./AdsWorkspace.jsx";

const isoDay = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const atMidnight = (s) => new Date(`${s}T00:00:00`).toISOString();
const addDaysLocal = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function periodRange(key, from, to, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = day, end = addDaysLocal(day, 1);
  if (key === "yesterday") { start = addDaysLocal(day, -1); end = day; }
  if (key === "7d") start = addDaysLocal(day, -6);
  if (key === "mtd") start = new Date(day.getFullYear(), day.getMonth(), 1);
  if (key === "lastMonth") { start = new Date(day.getFullYear(), day.getMonth() - 1, 1); end = new Date(day.getFullYear(), day.getMonth(), 1); }
  if (key === "custom" && from && to) return { start: atMidnight(from), end: atMidnight(isoDay(addDaysLocal(new Date(`${to}T00:00:00`), 1))) };
  return { start: start.toISOString(), end: end.toISOString() };
}
function sameDatesLastMonth(range) {
  const start = new Date(range.start), end = new Date(range.end);
  start.setMonth(start.getMonth() - 1); end.setMonth(end.getMonth() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const fmtRoas = (value) => value == null ? "—" : `${value.toFixed(1)}x`;
const GAUGE_TONE = { emerald: "var(--ok)", amber: "var(--warn)", rose: "var(--bad)", zinc: "var(--ink-soft)" };

const fmtMetric = (fmt, v) => {
  if (v == null) return "—";
  if (fmt === "money") return fmtMoney(v);
  if (fmt === "int") return fmtInt(v);
  if (fmt === "compact") return fmtCompact(v);
  if (fmt === "pct2") return fmtPct(v, 2);
  if (fmt === "pct1") return fmtPct(v, 1);
  if (fmt === "roas") return `${v.toFixed(1)}x`;
  if (fmt === "freq") return `${v.toFixed(1)}x`;
  return String(v);
};

/** การ์ดตัวชี้วัดหนึ่งใบ — สรุปไม่ได้ = ขีด พร้อมเหตุผล ไม่ใช่ศูนย์
    ใบที่มีข้อมูลกดได้ → เปิดกราฟรายวันเต็มตัวใต้กริด */
function SalePipeline({ items, worstKey = null, row = false, title = true }) {
  return (
    <div className={`ads-pipe ${row ? "ads-pipe--row" : ""}`}>
      {!row && title && <span className="ads-pipe-title">Sale pipeline</span>}
      {items.map((it) => {
        const d = change(it.value, it.before);
        const good = d == null || d === 0 ? null : it.sense === "lower" ? d < 0 : d > 0;
        /* ฐานเล็ก (ต่ำกว่า 10) — % แกว่งแรงจากส่วนต่างไม่กี่หน่วย อย่าให้สีตะโกน */
        const tiny = it.fmt === "int" && (it.value ?? 0) < 10 && (it.before ?? 0) < 10;
        return (
          <div className="ads-pipe-item" key={it.key}>
            <span className="ads-pipe-label">{it.label}</span>
            <b className="mono">{fmtMetric(it.fmt, it.value)}</b>
            <span className="ads-pipe-delta">
              {d == null ? (
                <span className="ads-muted">เทียบไม่ได้</span>
              ) : (
                <span className={tiny || good == null ? "ads-muted" : good ? "ads-good" : "ads-over"}>
                  {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%{good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}{tiny ? " · ฐานเล็ก" : ""}
                </span>
              )}
            </span>
            {/* อัตราแปลงจากขั้นก่อน — ขั้นที่แปลงต่ำสุดคือคอขวดของเส้นทางขาย */}
            {it.conv != null ? (
              <span className={`ads-pipe-conv ${worstKey === it.key ? "ads-pipe-conv--worst" : ""}`}>
                {fmtPct(it.conv, 0)} {worstKey === it.key ? "· หล่นแรงสุด" : "จากขั้นก่อน"}
              </span>
            ) : it.convPlaceholder ? (
              <span className="ads-pipe-conv">{it.convPlaceholder}</span>
            ) : null}
            {it.sub && <span className="ads-pipe-sub">{it.sub}</span>}
          </div>
        );
      })}
    </div>
  );
}

function forecastNote(pace) {
  if (pace.forecastOver == null) return `คาดสิ้นเดือน ${fmtMoney(pace.forecast)}`;
  if (pace.forecastOver > 0) return `คาดเกินงบ ${fmtMoney(pace.forecastOver)}`;
  return `คาดพอดีงบ · เหลือ ${fmtMoney(-pace.forecastOver)}`;
}

function Sparkline({ values, tone = "zinc", lower = false, word = true }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return <span className="ads-spark-none">ข้อมูลยังไม่พอวาดแนวโน้ม</span>;
  const vs = pts.map((p) => p.v);
  const min = Math.min(...vs), max = Math.max(...vs), span = max - min || 1;
  const W = 92, H = 22;
  const x = (i) => (i / Math.max(1, values.length - 1)) * W;
  const y = (v) => H - 2 - ((v - min) / span) * (H - 4);
  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const first = vs[0], last = vs[vs.length - 1];
  const better = lower ? last < first : last > first;
  return (
    <span className="ads-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={d} fill="none" stroke={GAUGE_TONE[tone]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <circle cx={x(pts[pts.length - 1].i)} cy={y(last)} r="1.8" fill={GAUGE_TONE[tone]} />
      </svg>
      {word && <b className={better ? "ads-good" : "ads-over"}>{better ? "ดีขึ้น" : "แย่ลง"}</b>}
    </span>
  );
}

function ChannelCard({ c }) {
  const st = paceStatus(c.pace);
  const meta = platformMeta(c.key);
  const [openDetail, setOpenDetail] = useState(false);
  const d = c.delivery;
  return (
    <div className="ads-chan-card" style={{ borderTopColor: meta.color }}>
      <div className="ads-chan-head">
        <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        <span className={`ads-badge ads-badge--${st.tone}`}>{st.text}</span>
      </div>
      {/* ชั้นนี้ตอบคำถามเดียว: เงินที่จ่ายไปคุ้มไหม — ยอดขาย/เป้าอยู่ชั้นแบรนด์ ไม่ซ้ำกัน
          ใช้ Bullet chart ตาม charts.csv (Performance vs Target แบบ compact: หลาย KPI เรียงกัน
          ในที่แคบ) — เกจสงวนไว้ให้การ์ดแบรนด์ซึ่งเป็น "KPI เดี่ยวที่ต้องเน้น" */}
      <div className="ads-chan-main">
        <div className="ads-chan-top">
          <span className="ads-chan-spend mono">
            ค่าแอด <b>{fmtMoney(c.spend)}</b>
            <span className="ads-muted"> จากงบ {c.budget != null ? fmtMoney(c.budget) : "ยังไม่ตั้งงบ"}</span>
          </span>
          <span className="ads-chan-pct mono">
            <span className="ads-chan-pctads">%Ads <b>{c.pctAds != null ? fmtPct(c.pctAds, 1) : "—"}</b></span>
            {c.pace.used != null && <> · {Math.round(c.pace.used * 100)}% ของงบ</>}
          </span>
        </div>

        {c.budget != null ? (
          <div className="ads-bullet" role="img"
            aria-label={`ใช้ไป ${fmtMoney(c.spend)} จากงบ ${fmtMoney(c.budget)} · ควรใช้ ${fmtMoney(c.pace.expectedSpend)} ณ วันนี้`}>
            {/* ช่วงคุณภาพ: ก่อนขีด = ยังตามจังหวะ · หลังขีด = เร็วกว่าจังหวะ (มีคำกำกับใต้แถบ) */}
            <span className="ads-bullet-range ads-bullet-range--ok" style={{ width: `${Math.round(c.pace.expected * 100)}%` }} />
            <span className="ads-bullet-range ads-bullet-range--warn" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
            <i className="ads-bullet-fill" style={{ width: `${Math.min(100, Math.round(c.pace.used * 100))}%`, background: GAUGE_TONE[st.tone] }} />
            <span className="ads-bullet-marker" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
          </div>
        ) : (
          <div className="empty-row">ยังไม่ตั้งงบช่องทางนี้ — เทียบจังหวะไม่ได้</div>
        )}

        {/* บรรทัดเอก: สรุปให้เลยว่าเร็ว/ช้ากว่าจังหวะกี่บาท คนอ่านไม่ต้องลบเลขเอง */}
        {c.pace.vsPace != null && (
          <p className="ads-chan-verdict">
            <b className={c.pace.vsPace > 0 ? "ads-over" : "ads-good"}>
              {c.pace.vsPace > 0
                ? <>ใช้เร็วกว่าจังหวะ {fmtMoney(c.pace.vsPace)}</>
                : <>ใช้ช้ากว่าจังหวะ {fmtMoney(-c.pace.vsPace)}</>}
            </b>
            <span className="ads-muted"> · ควรใช้ตอนนี้ {fmtMoney(c.pace.expectedSpend)} · {forecastNote(c.pace)}</span>
          </p>
        )}

        <p className="ads-chan-support ads-muted">
          เหลือ {c.pace.remaining != null ? fmtMoney(Math.abs(c.pace.remaining)) : "—"}
          {c.pace.remaining != null && c.pace.remaining < 0 ? " (เกินงบ)" : ""} ·
          เฉลี่ย/วัน {fmtMoney(c.pace.average)} · ผ่านไป {fmtPct(c.pace.expected, 0)} ของเดือน เหลือ {c.pace.daysLeft} วัน
        </p>
      </div>

      {/* พับเดียว เปิดทีเดียวเห็นหมด — เดิมแยกสองปุ่ม แต่ละฝั่งได้ความกว้างครึ่งเดียว
          เนื้อหาเลยอัดเป็นคอลัมน์เดียวจนอ่านไม่ออกในการ์ดแคบ */}
      <div className="ads-detail">
        <button type="button" className="ads-detail-toggle" onClick={() => setOpenDetail((o) => !o)} aria-expanded={openDetail}>
          <Icon name="chevron" size={12} />
          {openDetail ? "ซ่อนรายละเอียด" : `ดูรายละเอียด · 6 ตัวชี้วัด${c.campaigns.length ? ` · ${c.campaigns.length} แคมเปญ` : ""}`}
        </button>

        {openDetail && (
          <div className="ads-detail-body">
            <dl className="ads-metrics">
              <div><dt>ROAS</dt><dd className="mono">{fmtRoas(c.roas)}</dd></div>
              <div><dt>CPL</dt><dd className="mono">{c.cpl != null ? fmtMoney(c.cpl) : "—"}</dd></div>
              <div><dt>CTR</dt><dd className="mono">{d.ctr != null ? fmtPct(d.ctr, 2) : "—"}</dd></div>
              <div><dt>CPC</dt><dd className="mono">{d.cpc != null ? fmtMoney(d.cpc) : "—"}</dd></div>
              <div><dt>CPM</dt><dd className="mono">{d.cpm != null ? fmtMoney(d.cpm) : "—"}</dd></div>
              <div><dt>ความถี่</dt><dd className="mono">{d.frequency != null ? `${d.frequency.toFixed(1)}x` : "—"}</dd></div>
            </dl>

            <div className="ads-chan-spark">
              <span className="ads-muted">CPL ในเดือน</span>
              <Sparkline values={c.cplSeries} tone={st.tone} lower />
            </div>

            {c.campaigns.length > 0 && (
              <div className="ads-camp-list">
                <h4>แคมเปญ {c.campaigns.length} ชุด</h4>
                {/* ลิสต์แทนตาราง — การ์ดกว้างราว 330px ตารางสี่คอลัมน์จะตัดคำจนอ่านยาก */}
                <ul>
                  {c.campaigns.map((cp) => (
                    <li key={cp.name}>
                      <span className="ads-camp-name">{cp.name}</span>
                      <span className="ads-camp-nums mono">
                        {fmtMoney(cp.spend)}
                        <span className="ads-muted"> · CPL {cp.cpl != null ? fmtMoney(cp.cpl) : "—"} · ROAS {fmtRoas(cp.roas)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


export function AdsView() {
  const { data, inBrandScope, brandFilter, updateAdsControl, toast } = useApp();
  const todayLocal = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [customFrom, setCustomFrom] = useState(todayLocal.slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(todayLocal);
  const [compare, setCompare] = useState("previous");
  const [channel, setChannel] = useState("all");

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((brand) => brand.active !== false && (brandFilter === "all" || brand.id === brandFilter));
    const today = isoDay(new Date());
    const monthRange = periodRange("mtd", null, null);
    const brandTotals = adsByBrandChannel(scopedAll, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredBrands = channel === "all" ? brandTotals : adsByBrandChannel(scoped, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredById = new Map(filteredBrands.map((brand) => [brand.id, brand]));
    return {
      scoped,
      range,
      before,
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า",
      channelList: adsChannelList(scopedAll),
      summary: adsCompanySummary(brandTotals, today),
      brands: brandTotals.map((brand) => ({ ...brand, channels: filteredById.get(brand.id)?.channels ?? [] })),
      pipelines: Object.fromEntries(brands.map((brand) => [brand.id, adsSalePipeline(scoped.filter((card) => card.brand_id === brand.id), range, before)])),
    };
  }, [data, inBrandScope, period, customFrom, customTo, compare, brandFilter, channel]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeFrom = (next) => {
    setCustomFrom(next);
    setCustomTo(next > shownTo ? next : shownTo);
    setPeriod("custom");
  };
  const changeTo = (next) => {
    setCustomTo(next);
    setCustomFrom(next < shownFrom ? next : shownFrom);
    setPeriod("custom");
  };

  return <AdsWorkspace v={v} ChannelCard={ChannelCard} SalePipeline={SalePipeline} settings={data.settings} updateAdsControl={updateAdsControl} toast={toast} controls={<>
    <div className="aw-presets" role="group" aria-label="ช่วงเวลาด่วน">{[["today","วันนี้"],["7d","7 วัน"],["mtd","เดือนนี้"]].map(([key,label]) => <button type="button" key={key} className={period === key ? "active" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
    <div className="aw-date-range"><label><span>จาก</span><input aria-label="วันที่เริ่มต้น" type="date" value={shownFrom} max={shownTo} onChange={(event) => changeFrom(event.target.value)} /></label><b>–</b><label><span>ถึง</span><input aria-label="วันที่สิ้นสุด" type="date" value={shownTo} min={shownFrom} max={todayLocal} onChange={(event) => changeTo(event.target.value)} /></label></div>
    <label className="aw-filter"><span>ช่องทาง</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">ทั้งหมด</option>{v.channelList.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label className="aw-filter"><span>เทียบ</span><select value={compare} onChange={(event) => setCompare(event.target.value)}><option value="previous">ช่วงก่อน</option><option value="lastMonth">เดือนก่อน</option></select></label>
  </>} />;
}
