/* ============================================================
   Ads — หน้า "ค่าแอด" ของโมดูล marketing
   ยกแนวคิดหน้าจอมาจาก ads console (dashboard ads) แต่ประกอบด้วยของแพลตฟอร์มล้วน:
   Panel/Icon ของโมดูล · ธีม zinc/emerald เดิม (หน้านี้เป็นการ์ด/เกจล้วน)
   เลขทุกตัวมาจาก adsOverview.js (pure + มีเทส) — หน้าจอไม่คิดเลขเอง
   หัว: %Ads · ROAS · Spend · Conversions (ตามช่วงเวลา + ตัวกรองช่องทาง)
   ตัวกรองช่องทาง: segmented + คลิกที่ legend โดนัทก็ได้ — กรองทั้งหน้า
   แบรนด์×ช่องทาง: การ์ดเกจงบ "เดือนนี้" ขนาดเท่ากันทุกใบ · ไอคอน+เส้นขอบสีตามแพลตฟอร์มจริง
   ============================================================ */

import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { ACTION_RULES, adsByBrandChannel, adsChannelList, adsCreativeRows, adsFunnel, adsKpis, change, filterByChannel, paceGroup, paceStatus, salesPaceStatus } from "../adsOverview.js";
import { fmtInt, fmtMoney, fmtPct, SERIES } from "../dash/charts/theme.js";
import { Panel } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";
import { PlatformIcon, platformMeta } from "./PlatformIcon.jsx";

const PERIODS = [
  { k: "today", label: "วันนี้" },
  { k: "yesterday", label: "เมื่อวาน" },
  { k: "7d", label: "7 วัน" },
  { k: "mtd", label: "เดือนนี้" },
  { k: "lastMonth", label: "เดือนก่อน" },
  { k: "custom", label: "กำหนดเอง" },
];

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

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);

/* ตัวกรองสถานะจังหวะงบ — มีผลเฉพาะการ์ดแบรนด์×ช่องทาง (จังหวะงบเป็นราย 'เดือน') */
const STATUS_OPTS = [
  { k: "all", label: "ทั้งหมด" },
  { k: "over", label: "เกิน/ใช้เร็ว" },
  { k: "onplan", label: "ตามแผน" },
  { k: "under", label: "ใช้ช้า" },
  { k: "unset", label: "ยังไม่ตั้งงบ" },
];

/** ตัวเลข + ส่วนต่างเทียบช่วงก่อน — ทิศทางดี/แย่บอกด้วยคำ ไม่ใช้สีอย่างเดียว */
function KpiTile({ label, hint, icon, color, value, stat }) {
  const d = change(stat.value, stat.before);
  const good = d == null ? null : stat.lower ? d < 0 : d > 0;
  return (
    <div className="kpi-tile" style={{ "--kpi-color": color }}>
      <div className="kpi-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon-badge">
          <Icon name={icon} size={16} />
        </div>
      </div>
      <div className="kpi-value mono">{value}</div>
      <div className="kpi-foot" style={{ marginTop: 6 }}>
        {d == null ? (
          <span className="kpi-delta none">เทียบช่วงก่อนไม่ได้</span>
        ) : (
          <span className={`kpi-delta ${good ? "up" : "down"}`}>
            <Icon name="chevron" size={11} />
            {Math.abs(d).toFixed(0)}% {good ? "ดีขึ้น" : "แย่ลง"}
          </span>
        )}
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

const GAUGE_TONE = { emerald: "var(--ok)", amber: "var(--warn)", rose: "var(--bad)", zinc: "var(--ink-soft)" };

/** เกจครึ่งวงกลม — % งบที่ใช้ + ขีดจังหวะเดือน (ควรอยู่ตรงไหน ณ วันนี้) */
function Gauge({ used, expected, tone }) {
  const r = 42, cx = 52, cy = 50;
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const shown = used == null ? 0 : Math.min(1, Math.max(0, used));
  const ang = Math.PI * (1 - Math.min(1, Math.max(0, expected)));
  const tx = cx + Math.cos(ang) * r, ty = cy - Math.sin(ang) * r;
  const ix = cx + Math.cos(ang) * (r - 10), iy = cy - Math.sin(ang) * (r - 10);
  const color = GAUGE_TONE[tone] ?? GAUGE_TONE.zinc;
  return (
    <svg className="ads-gauge" viewBox="0 0 104 62" role="img"
      aria-label={used == null ? "ยังไม่ตั้งงบช่องทางนี้" : `ใช้งบ ${fmtPct(used, 0)} เทียบจังหวะเดือน ${fmtPct(expected, 0)}`}>
      <path d={path} className="ads-gauge-track" pathLength={100} />
      {used != null && <path d={path} className="ads-gauge-fill" pathLength={100} strokeDasharray={`${shown * 100} 100`} style={{ stroke: color }} />}
      <line className="ads-gauge-tick" x1={ix} y1={iy} x2={tx} y2={ty} />
      <text className="ads-gauge-value" x={cx} y={cy - 5} textAnchor="middle">{used == null ? "—" : `${Math.round(used * 100)}%`}</text>
      <text className="ads-gauge-unit" x={cx} y={cy + 8} textAnchor="middle">ของงบเดือน</text>
    </svg>
  );
}

/* เกจจังหวะทำยอด — สเกล 0–120% ของ "ที่ควรได้วันนี้"
   โซน: <70 ช้ากว่าแผน · 70–95 ใกล้เป้า · >95 ตามแผน · โซนที่เข็มชี้จะเข้มกว่าโซนอื่น */
const PACE_ZONES = [
  { to: 0.70, tone: "rose" },
  { to: 0.95, tone: "amber" },
  { to: 1.20, tone: "emerald" },
];
const PACE_MAX = 1.2;

function PaceGauge({ pct, tone }) {
  const cx = 100, cy = 100, r = 76;
  const path = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const active = pct == null ? -1 : PACE_ZONES.findIndex((z) => pct < z.to);
  const activeIdx = active === -1 ? PACE_ZONES.length - 1 : active;
  let from = 0;
  const segs = PACE_ZONES.map((z, i) => {
    const len = ((z.to - from) / PACE_MAX) * 100;
    const offset = -(from / PACE_MAX) * 100;
    from = z.to;
    return { len, offset, tone: z.tone, on: i === activeIdx };
  });
  const clamped = Math.min(PACE_MAX, Math.max(0, pct ?? 0));
  const ang = Math.PI * (1 - clamped / PACE_MAX);
  const nx = cx + Math.cos(ang) * (r - 26), ny = cy - Math.sin(ang) * (r - 26);
  const deg = 90 - (ang * 180) / Math.PI;
  return (
    <svg className="ads-pace-gauge" viewBox="0 0 200 116" role="img"
      aria-label={pct == null ? "ยังประเมินจังหวะทำยอดไม่ได้" : `ทำได้ ${fmtPct(pct, 0)} ของที่ควรได้วันนี้`}>
      {segs.map((sg) => (
        <path key={sg.tone} d={path} className={`ads-pace-zone ads-pace-zone--${sg.tone} ${sg.on ? "on" : ""}`}
          pathLength={100} strokeDasharray={`${sg.len} 100`} strokeDashoffset={sg.offset} />
      ))}
      {pct != null && (
        <polygon className="ads-pace-needle" points="0,-9 7,6 -7,6"
          transform={`translate(${nx} ${ny}) rotate(${deg})`} />
      )}
      <text className={`ads-pace-pct ads-pace-pct--${tone}`} x={cx} y={cy - 6} textAnchor="middle">
        {pct == null ? "—" : `${Math.round(pct * 100)}%`}
      </text>
      <text className="ads-pace-unit" x={cx} y={cy + 10} textAnchor="middle">ของที่ควรได้วันนี้</text>
    </svg>
  );
}

/** ข้อความคาดการณ์สิ้นเดือน — run-rate เชิงเส้น */
function forecastNote(pace) {
  if (pace.forecastOver == null) return `คาดสิ้นเดือน ${fmtMoney(pace.forecast)}`;
  if (pace.forecastOver > 0) return `คาดเกินงบ ${fmtMoney(pace.forecastOver)}`;
  return `คาดพอดีงบ · เหลือ ${fmtMoney(-pace.forecastOver)}`;
}

/** เส้นจิ๋วบอกทิศทางย้อนหลังในเดือน — ค่า null คือวันที่คำนวณไม่ได้ ข้ามไปไม่ลากเส้นผ่าน */
function Sparkline({ values, tone = "zinc", lower = false }) {
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
      <b className={better ? "ads-good" : "ads-over"}>{better ? "ดีขึ้น" : "แย่ลง"}</b>
    </span>
  );
}

/** การ์ดช่องทาง — ขนาดเท่ากันทุกใบ · ไอคอน+เส้นขอบสีตามแพลตฟอร์ม · เกจ/ป้าย = สีสถานะ */
function ChannelCard({ c }) {
  const st = paceStatus(c.pace);
  const meta = platformMeta(c.key);
  const [openCamp, setOpenCamp] = useState(false);
  const d = c.delivery;
  return (
    <div className="ads-chan-card" style={{ borderTopColor: meta.color }}>
      <div className="ads-chan-head">
        <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        <span className={`ads-badge ads-badge--${st.tone}`}>{st.text}</span>
      </div>
      {/* ชั้นนี้ตอบคำถามเดียว: เงินที่จ่ายไปคุ้มไหม — ยอดขาย/เป้าอยู่ชั้นแบรนด์ ไม่ซ้ำกัน */}
      <div className="ads-chan-body">
        <div className="ads-chan-chart"><Gauge used={c.pace.used} expected={c.pace.expected} tone={st.tone} /></div>
        <div className="ads-chan-pace">
          <div className="ads-chan-money mono">
            ค่าแอด {fmtMoney(c.spend)}<span className="ads-muted"> / {c.budget != null ? fmtMoney(c.budget) : "ยังไม่ตั้งงบ"}</span>
          </div>
          <div className="ads-chan-bar">
            <i style={{ width: `${Math.min(100, Math.round((c.pace.used ?? 0) * 100))}%`, background: GAUGE_TONE[st.tone] }} />
            <span className="ads-chan-bar-tick" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
          </div>
          <div className="ads-chan-line mono">
            {c.pace.remaining != null
              ? <span className={c.pace.remaining < 0 ? "ads-over" : ""}>{c.pace.remaining < 0 ? "เกิน" : "เหลือ"} {fmtMoney(Math.abs(c.pace.remaining))}</span>
              : <span className="ads-muted">—</span>}
            <span className="ads-muted">เฉลี่ย/วัน {fmtMoney(c.pace.average)}</span>
          </div>
          <div className="ads-chan-fc ads-muted">{forecastNote(c.pace)}</div>
        </div>
      </div>

      {/* ตัวเลขคุ้มค่า + การส่ง (delivery) — มีเฉพาะชั้นแพลตฟอร์ม */}
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

      {/* แคมเปญย่อย — ชั้นลึกสุด เปิดดูเมื่ออยากรู้ว่าเงินลงตัวไหน */}
      {c.campaigns.length > 0 && (
        <div className="ads-camp">
          <button type="button" className="ads-camp-toggle" onClick={() => setOpenCamp((o) => !o)} aria-expanded={openCamp}>
            <Icon name="chevron" size={12} /> แคมเปญ {c.campaigns.length} ชุด
          </button>
          {openCamp && (
            <table className="ads-camp-table">
              <thead><tr><th>แคมเปญ</th><th>ค่าแอด</th><th>CPL</th><th>ROAS</th></tr></thead>
              <tbody>
                {c.campaigns.map((cp) => (
                  <tr key={cp.name}>
                    <td>{cp.name}</td>
                    <td className="mono">{fmtMoney(cp.spend)}</td>
                    <td className="mono">{cp.cpl != null ? fmtMoney(cp.cpl) : "—"}</td>
                    <td className="mono">{fmtRoas(cp.roas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function AdsView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const todayLocal = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [customFrom, setCustomFrom] = useState(todayLocal.slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(todayLocal);
  const [compare, setCompare] = useState("previous");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [creativeSort, setCreativeSort] = useState("action");

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const today = isoDay(new Date());
    const monthRange = periodRange("mtd", null, null);
    const brandTotals = adsByBrandChannel(scopedAll, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredBrands = channel === "all" ? brandTotals : adsByBrandChannel(scoped, monthRange, brands, data.ad_budgets ?? [], today, data.sales_targets ?? [], sameDatesLastMonth(monthRange));
    const filteredById = new Map(filteredBrands.map((b) => [b.id, b]));
    return {
      scoped, range, today,
      channelList: adsChannelList(scopedAll),
      kpis: adsKpis(scoped, range, before),
      brands: brandTotals.map((b) => ({ ...b, channels: filteredById.get(b.id)?.channels ?? [] })),
      funnel: adsFunnel(scoped, range, before),
      creatives: adsCreativeRows(scoped, range, brands),
    };
  }, [data, inBrandScope, period, customFrom, customTo, compare, brandFilter, channel]);

  const hasSpend = v.kpis.spend.value != null && v.kpis.spend.value > 0;

  /* กรองการ์ดแบรนด์×ช่องทางตามสถานะจังหวะงบ (คนละมิติกับตัวกรองช่องทาง) */
  const shownBrands = status === "all"
    ? v.brands
    : v.brands
      .map((b) => ({ ...b, channels: b.channels.filter((c) => paceGroup(c.pace) === status) }))
      .filter((b) => b.channels.length > 0);

  const statusTools = (
    <div className="ads-seg" role="tablist" aria-label="กรองตามจังหวะงบ">
      {STATUS_OPTS.map((s) => (
        <button key={s.k} className={`ads-seg-btn ${status === s.k ? "active" : ""}`} onClick={() => setStatus(s.k)} role="tab" aria-selected={status === s.k}>
          {s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="dash-linear-shell">
      <div className="ads-unified-filters" aria-label="ตัวกรองค่าแอด">
        <label>ช่วงเวลา
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((r) => <option value={r.k} key={r.k}>{r.label}</option>)}
          </select>
        </label>
        {period === "custom" && (
          <div className="ads-date-fields">
            <label>จาก <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} /></label>
            <label>ถึง <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} /></label>
          </div>
        )}
        {/* มีแพลตฟอร์มเดียว (ช่วงแรกยิงแค่ Meta) ก็ไม่ต้องมีตัวเลือกให้กด — โผล่เองเมื่อเปิดช่องทางเพิ่ม */}
        {v.channelList.length > 1 && (
          <label>ช่องทาง
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="all">ทุกช่องทาง</option>
              {v.channelList.map((ch) => <option value={ch} key={ch}>{ch}</option>)}
            </select>
          </label>
        )}
        <label>เทียบกับ
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="previous">ช่วงก่อนหน้า</option>
            <option value="lastMonth">วันเดียวกันเดือนก่อน</option>
          </select>
        </label>
        <div className="ads-filter-range">
          <span>ข้อมูลช่วง</span>
          <b className="mono">{new Date(v.range.start).toLocaleDateString("th-TH")} – {new Date(new Date(v.range.end).getTime() - 1).toLocaleDateString("th-TH")}</b>
        </div>
      </div>

      {/* ── KPI แถวบน — ตัวเลขบริหาร 3 ตัวตามลำดับที่ใช้ตัดสินใจ ── */}
      <section className="dash-card dash-kpi-bar-card">
        <div className="kpi-row">
          <KpiTile label="%Ads" hint="ค่าแอด ÷ รายได้ · ยิ่งต่ำยิ่งดี" icon="target" color={SERIES.blue}
            value={v.kpis.pctAds.value != null ? fmtPct(v.kpis.pctAds.value, 1) : "—"} stat={v.kpis.pctAds} />
          <KpiTile label="ROAS" hint="รายได้ ÷ ค่าแอด" icon="chart" color={SERIES.green}
            value={fmtRoas(v.kpis.roas.value)} stat={v.kpis.roas} />
          <KpiTile label="ค่าแอดรวม" hint="Spend ในช่วงที่เลือก" icon="wallet" color={SERIES.orange}
            value={hasSpend ? fmtMoney(v.kpis.spend.value) : "—"} stat={v.kpis.spend} />
        </div>
      </section>

      {!hasSpend && (
        <section className="dash-card">
          <div className="empty-row">{v.kpis.quality.rows > 0 ? "มีรายการในช่วงนี้ แต่ข้อมูล Spend ยังไม่ครบ" : "ยังไม่มีค่าแอดในเงื่อนไขนี้ · ลองเปลี่ยนแพลตฟอร์มหรือช่วงเวลา"}</div>
        </section>
      )}

      {/* ── งบรายแบรนด์และช่องทาง — แบรนด์หนึ่งแถว การ์ดช่องทางพร้อมเกจ ── */}
      <section className="dash-card">
        <Panel title="งบและจังหวะใช้เงินรายแบรนด์ (เดือนปัจจุบัน)" tools={statusTools} info={{ label: "แบรนด์ × ช่องทาง", text: "ซ้ายคือยอดรวมแบรนด์ · การ์ดคือแต่ละช่องทาง · เกจเทียบสัดส่วนงบที่ใช้กับวันที่ผ่านไปของเดือน" }}>
          {shownBrands.length === 0 ? (
            <div className="empty-row">ไม่มีช่องทางที่ตรงกับตัวกรองจังหวะงบ</div>
          ) : (
            <div className={`ads-brand-blocks ${shownBrands.length <= 2 ? "ads-brand-blocks--wide" : ""}`}>
              {shownBrands.map((b) => {
                const rst = salesPaceStatus(b.revPace.pctOfExpected);
                return (
                  <div className="ads-brand-block" key={b.id}>
                    <div className="ads-brand-side">
                      <h3>{b.name}</h3>
                      {/* จังหวะทำยอดของแบรนด์ — ชุดเดียวกับเกจรวมด้านล่าง อ่านก่อนแล้วค่อยดูค่าแอด */}
                      <div className="ads-brand-pace">
                        <PaceGauge pct={b.revPace.pctOfExpected} tone={rst.tone} />
                        <span className={`ads-badge ads-badge--${rst.tone}`}>{rst.text}</span>
                        {b.revPace.behind != null && (
                          <span className="ads-brand-gap">
                            {b.revPace.behind > 0
                              ? <>ช้ากว่าแผน {fmtMoney(b.revPace.behind)}</>
                              : <>เร็วกว่าแผน {fmtMoney(-b.revPace.behind)}</>}
                          </span>
                        )}
                      </div>
                      {/* ชั้นนี้ตอบคำถามเดียว: ทำยอดได้ตามเป้าไหม — ค่าแอด/งบอยู่การ์ดแพลตฟอร์ม ไม่ซ้ำกัน */}
                      <div className="ads-brand-amount mono">{fmtMoney(b.revenue)}</div>
                      <div className="ads-brand-sub">
                        จากเป้า {b.revTarget != null ? fmtMoney(b.revTarget) : "—"}
                        {b.revPct != null && <> · ทำได้ {fmtPct(b.revPct, 0)}</>}
                      </div>
                      <div className="ads-brand-compare">
                        {b.revChangePct != null
                          ? <span className={b.revChangePct >= 0 ? "ads-good" : "ads-over"}>
                              {b.revChangePct >= 0 ? "▲" : "▼"} {Math.abs(b.revChangePct).toFixed(0)}% เทียบเดือนก่อน
                            </span>
                          : <span className="ads-muted">เดือนก่อนไม่มีข้อมูลให้เทียบ</span>}
                      </div>
                      <div className="ads-brand-spark">
                        <span className="ads-muted">ROAS ในเดือน</span>
                        <Sparkline values={b.roasSeries} tone={rst.tone} />
                      </div>
                    </div>
                    <div className="ads-chan-cards">
                      {b.channels.length === 0 ? <div className="empty-row">ไม่มีค่าแอดในช่องทางที่เลือก</div> : b.channels.map((c) => <ChannelCard key={c.key} c={c} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </section>


      {/* ── ครีเอทีฟ: ตัวไหนเวิร์ค + ควรทำอะไรต่อ ──
           รวมสองคำถามไว้ตารางเดียว เพราะเป็นข้อมูลชุดเดียวกัน แค่เรียงคนละแบบ
           (แยกสองตารางเมื่อไร ตัวเลขชุดเดิมจะโผล่สองที่ทันที) */}
      <section className="dash-card">
        <Panel
          title="ครีเอทีฟ — ตัวไหนเวิร์ค และควรทำอะไรต่อ"
          tools={
            <div className="ads-seg" role="tablist" aria-label="วิธีเรียงครีเอทีฟ">
              {[{ k: "action", label: "ควรทำก่อน" }, { k: "roas", label: "ผลงานดีสุด" }].map((o) => (
                <button key={o.k} className={`ads-seg-btn ${creativeSort === o.k ? "active" : ""}`}
                  onClick={() => setCreativeSort(o.k)} role="tab" aria-selected={creativeSort === o.k}>
                  {o.label}
                </button>
              ))}
            </div>
          }
          info={{ label: "Scale / Fix / Stop", text: `เกณฑ์: ROAS ตั้งแต่ ${ACTION_RULES.scaleRoas}x = Scale · ต่ำกว่า ${ACTION_RULES.fixRoas}x = Fix · ต่ำกว่า ${ACTION_RULES.stopRoas}x หรือใช้เงินแล้วไม่มีผลลัพธ์ = Stop · ความถี่เกิน ${ACTION_RULES.fatigueFreq}x หรือ CTR ครึ่งหลังตกเกิน ${Math.round(ACTION_RULES.fatigueCtrDrop * 100)}% = เริ่มล้า ต้องเปลี่ยนชิ้นงาน` }}
        >
          {v.creatives.length === 0 ? (
            <div className="empty-row">ยังไม่มีชิ้นงานโฆษณาในช่วงที่เลือก</div>
          ) : (
            <div className="ads-table-wrap">
              <table className="ads-decision-table ads-creative-table">
                <thead>
                  <tr>
                    <th>ชิ้นงาน</th><th>แบรนด์ / แพลตฟอร์ม</th><th>ค่าแอด</th>
                    <th>CTR</th><th>ความถี่</th><th>CPL</th><th>ROAS</th>
                    <th>ควรทำอะไรต่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {[...v.creatives]
                    .sort((a, b) => (creativeSort === "roas" ? (b.roas ?? -1) - (a.roas ?? -1) : 0))
                    .slice(0, 12)
                    .map((r) => (
                      <tr key={r.key}>
                        <td>
                          <b>{r.creative}</b>
                          <small>{r.campaigns.join(" · ")}</small>
                        </td>
                        <td>{r.brand}<small>{r.platform}</small></td>
                        <td className="mono">{fmtMoney(r.spend)}</td>
                        <td className="mono">
                          {r.ctr != null ? fmtPct(r.ctr, 2) : "—"}
                          {r.ctrDrop != null && r.ctrDrop > 0.05 && (
                            <small className="ads-over">▼ {Math.round(r.ctrDrop * 100)}% ครึ่งหลัง</small>
                          )}
                        </td>
                        <td className="mono">
                          {r.frequency != null ? `${r.frequency.toFixed(1)}x` : "—"}
                          {r.fatigue && <small className="ads-over">เริ่มล้า</small>}
                        </td>
                        <td className="mono">{r.cpl != null ? fmtMoney(r.cpl) : "—"}</td>
                        <td className="mono">{fmtRoas(r.roas)}</td>
                        <td>
                          <span className={`ads-badge ads-badge--${r.tone} ads-action`}>{r.action}</span>
                          <small className="ads-why">{r.why}</small>
                          <small className="ads-next">→ {r.next}</small>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      {/* ── Funnel เชิงธุรกิจตามขั้นขาย ── */}
      <section className="dash-card">
        <Panel title="คนทัก → Lead → มัดจำ → ออเดอร์ปิดแล้ว" info={{ label: "Funnel", text: "จำนวน Conversion และต้นทุนต่อขั้นจากค่าแอดในช่วงที่เลือก" }}>
          {v.funnel.stages[0].value == null || v.funnel.stages[0].value === 0 ? (
            <div className="empty-row">ยังไม่มีข้อมูลคนทักในช่วงนี้</div>
          ) : (
            <div className="ads-sales-funnel">
              {v.funnel.stages.map((s, i) => (
                <div className="ads-sales-stage" key={s.key}>
                  <div className="ads-sales-head"><span>{s.label}</span></div>
                  <b className="ads-sales-value mono">{fmtInt(s.value)}</b>
                  <span className="ads-sales-hint">{s.hint}</span>
                  <div className="ads-sales-bar"><i style={{ width: `${Math.max(2, (s.value / v.funnel.stages[0].value) * 100)}%` }} /></div>
                  <strong>{i === 0 ? "ฐานเริ่มต้น 100%" : `${fmtPct(s.rate, 1)} จากขั้นก่อน`}</strong>
                  <small>ต้นทุนต่อขั้น {s.cost == null ? "—" : fmtMoney(s.cost)}</small>
                  <small>{s.before == null ? "เทียบช่วงก่อนไม่ได้" : `${change(s.value, s.before) >= 0 ? "เพิ่ม" : "ลด"}จากช่วงก่อน ${Math.abs(change(s.value, s.before)).toFixed(0)}%`}</small>
                  {i > 0 && <span className="ads-sales-lost">หลุดจากขั้นก่อน {fmtInt(s.lost)}</span>}
                </div>
              ))}
              {v.funnel.estimated && (
                <div className="ads-funnel-note">
                  <Icon name="info" size={13} /> Lead, มัดจำ และออเดอร์เป็นข้อมูลจำลองจากคนทัก จนกว่าจะเชื่อม CRM
                </div>
              )}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
