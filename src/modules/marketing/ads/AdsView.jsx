import { useMemo, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { change } from "../adsOverview.js";
import { paceFlag, paceTone, trendPaceState } from "./paceEngine.js";
import { fmtCompact, fmtInt, fmtMoney, fmtPct, fmtNum } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";
import { PlatformIcon, platformMeta } from "./PlatformIcon.jsx";
import { AdsWorkspace } from "./AdsWorkspace.jsx";
import { Dropdown } from "../ui/Dropdown.jsx";
import { InfoTip } from "../ui/InfoTip.jsx";
import { PaceGauge } from "./PaceGauge.jsx";
import { CompareControl } from "../ui/CompareControl.jsx";
import { DateRangePicker } from "../ui/DateRangePicker.jsx";
import { RevenueBasisToggle } from "../ui/RevenueBasisToggle.jsx";
import { isoDay } from "../adsScope.js";
import { useReportFilters } from "../ui/useReportFilters.js";
import { buildOverviewModel } from "./overviewModel.js";
import { useAdsData } from "./useAdsData.js";
import { GoalLine } from "../ui/GoalLine.jsx";

const fmtRoas = (value) => value == null ? "—" : `${fmtNum(value, 2)}x`;
const GAUGE_TONE = { emerald: "var(--ok)", amber: "var(--warn)", rose: "var(--bad)", zinc: "var(--ink-soft)" };

const fmtMetric = (fmt, v) => {
  if (v == null) return "—";
  if (fmt === "money") return fmtMoney(v);
  if (fmt === "int") return fmtInt(v);
  if (fmt === "compact") return fmtCompact(v);
  if (fmt === "pct2") return fmtPct(v, 2);
  if (fmt === "pct1") return fmtPct(v, 1);
  if (fmt === "roas") return `${fmtNum(v, 2)}x`;
  if (fmt === "freq") return `${fmtNum(v, 2)}x`;
  return String(v);
};

/** การ์ดตัวชี้วัดหนึ่งใบ — สรุปไม่ได้ = ขีด พร้อมเหตุผล ไม่ใช่ศูนย์
    ใบที่มีข้อมูลกดได้ → เปิดกราฟรายวันเต็มตัวใต้กริด */
export function SalePipeline({ items, worstKey = null, row = false, title = true, goals = null, gauge = false }) {   // export ไว้ให้เทสระดับหน้าจอเรียกตรงได้
  return (
    <div className={`ads-pipe ${row ? "ads-pipe--row" : ""}`}>
      {!row && title && <span className="ads-pipe-title">Sale pipeline</span>}
      {items.map((it) => {
        const d = change(it.value, it.before);
        const good = d == null || d === 0 ? null : it.sense === "lower" ? d < 0 : d > 0;
        /* ฐานเล็ก (ต่ำกว่า 10) — % แกว่งแรงจากส่วนต่างไม่กี่หน่วย อย่าให้สีตะโกน */
        const tiny = it.fmt === "int" && (it.value ?? 0) < 10 && (it.before ?? 0) < 10;
        const deltaText = d == null ? "เทียบไม่ได้"
          : `${d >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(d), 2)}% เทียบช่วงก่อน${good == null ? "" : good ? " (ดีขึ้น)" : " (แย่ลง)"}${tiny ? " · ฐานเล็ก" : ""}`;
        const convText = it.conv != null ? `${fmtPct(it.conv, 0)} จากขั้นก่อน` : it.convPlaceholder ?? null;
        const goal = goals?.[it.key] ?? null;
        /* โหมด gauge (หน้า Overview): บนจอเหลือแค่ค่าของขั้น + จังหวะ — บริบทที่เหลือย้ายมาอยู่ในไอคอน i
           (อาร์ต 21 ก.ย. 69: "ข้อมูลไม่จำเป็นเยอะเกิน เอาไปอยู่ในไอคอน i เพื่ออธิบายแทน") */
        if (gauge) {
          const paceValue = goal ? (goal.kind === "higher" ? goal.pace : goal.pct) : null;
          /* บริบทที่ไม่ใช้ตัดสินใจ อยู่ในไอคอน i (อาร์ต 21 ก.ย. 69: "ข้อมูลไม่จำเป็นเยอะเกิน") */
          const tip = [it.sub, convText,
            goal?.pct != null ? `ทำได้ ${fmtNum(goal.pct * 100, 2)}% ของเป้าเดือน` : null,
          ].filter(Boolean);
          return (
            <div className="ads-pipe-item aw-metric ads-stage" key={it.key}>
              <div className="aw-metric-head ads-stage-head">
                <b><span className="ads-stage-name">{it.label}</span><InfoTip label={it.label} lines={tip} /></b>
                {worstKey === it.key && <span className="ads-stage-worst">หล่นแรงสุด</span>}
              </div>
              <div className="aw-metric-body">
                <b className="aw-metric-num mono">{fmtMetric(it.fmt, it.value)}
                  {goal?.target != null && <small> / {fmtMetric(it.fmt, goal.monthTarget ?? goal.target)}</small>}</b>
                {goal?.paceState && <PaceGauge mini width={86} caption="" showValue={false} showState={false}
                  kind={goal.kind ?? "higher"} title={`จังหวะ ${it.label}`}
                  pace={{ value: paceValue, state: goal.paceState, direction: goal.kind ?? "higher" }} />}
              </div>
              <div className="aw-metric-foot">
                {goal?.state === "set"
                  ? <span className={goal.tone}>จังหวะ <b>{fmtNum((paceValue ?? 0) * 100, 2)}%</b> {goal.text}</span>
                  : <span className="zinc">{goal?.state === "nodata" ? "ยังไม่มีข้อมูล" : "ยังไม่ตั้งเป้า"}</span>}
                {/* ดีขึ้น/แย่ลงเทียบเดือนก่อน (อาร์ตขอ 21 ก.ย. ค่ำ) — ฐานเล็ก/เทียบไม่ได้ = สีจาง ไม่ตะโกน */}
                <span className={d == null || tiny || good == null ? "ads-muted" : good ? "ads-good" : "ads-over"}>
                  {d == null ? "เทียบเดือนก่อนไม่ได้" : `เทียบเดือนก่อน ${d >= 0 ? "▲" : "▼"} ${fmtNum(Math.abs(d), 2)}%${good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}${tiny ? " · ฐานเล็ก" : ""}`}
                </span>
              </div>
            </div>
          );
        }
        return (
          <div className="ads-pipe-item" key={it.key}>
            <span className="ads-pipe-label">{it.label}</span>
            <b className="mono">{fmtMetric(it.fmt, it.value)}</b>
            <span className="ads-pipe-delta">
              {d == null ? (
                <span className="ads-muted">เทียบไม่ได้</span>
              ) : (
                <span className={tiny || good == null ? "ads-muted" : good ? "ads-good" : "ads-over"}>
                  {d >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(d), 2)}%{good == null ? "" : good ? " ดีขึ้น" : " แย่ลง"}{tiny ? " · ฐานเล็ก" : ""}
                </span>
              )}
            </span>
            {it.conv != null ? (
              <span className={`ads-pipe-conv ${worstKey === it.key ? "ads-pipe-conv--worst" : ""}`}>
                {fmtPct(it.conv, 0)} {worstKey === it.key ? "· หล่นแรงสุด" : "จากขั้นก่อน"}
              </span>
            ) : it.convPlaceholder ? (
              <span className="ads-pipe-conv">{it.convPlaceholder}</span>
            ) : null}
            {it.sub && <span className="ads-pipe-sub">{it.sub}</span>}
            {goal && <GoalLine metric={it.key} goal={goal} />}
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

/* การ์ดแพลตฟอร์มโหมด "ช่วงที่เลือก": ยอดของช่วงล้วน ไม่มีงบ/จังหวะรายเดือน (ไม่มีความหมายกับช่วงสั้น) */
function ChannelCardRange({ c }) {
  const meta = platformMeta(c.key);
  const d = c.delivery;
  return (
    <div className="ads-chan-card" style={{ borderTopColor: meta.color }}>
      <div className="ads-chan-head">
        <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        <span className="ads-badge ads-badge--zinc">ช่วงที่เลือก</span>
      </div>
      <div className="ads-chan-main">
        <div className="ads-chan-top">
          <span className="ads-chan-spend mono">ค่าแอด <b>{fmtMoney(c.spend)}</b></span>
          <span className="ads-chan-pct mono"><span className="ads-chan-pctads">%Ads <b>{c.pctAds != null ? fmtPct(c.pctAds, 1) : "—"}</b></span></span>
        </div>
        <dl className="ads-metrics">
          <div><dt>ยอดขาย</dt><dd className="mono">{fmtMoney(c.revenue)}</dd></div>
          <div><dt>ROAS</dt><dd className="mono">{fmtRoas(c.roas)}</dd></div>
          <div><dt>ลีด</dt><dd className="mono">{fmtInt(c.leads)}</dd></div>
          <div><dt>CPL</dt><dd className="mono">{c.cpl != null ? fmtMoney(c.cpl) : "—"}</dd></div>
          <div><dt>CTR</dt><dd className="mono">{d.ctr != null ? fmtPct(d.ctr, 2) : "—"}</dd></div>
          <div><dt>ความถี่</dt><dd className="mono">{d.frequency != null ? `${fmtNum(d.frequency, 2)}x` : "—"}</dd></div>
        </dl>
        <p className="ads-chan-support ads-muted">งบ/จังหวะรายเดือนดูได้เมื่อเลือกช่วง "เดือนนี้"</p>
      </div>
    </div>
  );
}

export function ChannelCard({ c, monthView = true }) {    // export ให้เทสระดับหน้าจอเรียกตรงได้
  const [openDetail, setOpenDetail] = useState(false);
  const meta = platformMeta(c.key);
  if (!monthView) return <ChannelCardRange c={c} />;
  const d = c.delivery;
  /* รื้อ 21 ก.ย. ค่ำ (อาร์ตขอ "ทำให้ครบเหมือนที่เคยแก้ๆมา") — ภาษาเดียวกับการ์ดงบ/tile ทั้งหน้า:
     ตัวเลขใหญ่ ค่าจริง/งบ · หน้าปัด mini · facts แถวเดียว · จังหวะ+คำสถานะจาก engine · ป้ายเฉพาะเมื่อมีเรื่อง */
  const ratio = c.pace.used != null && c.pace.expected > 0 ? c.pace.used / c.pace.expected : null;
  const state = trendPaceState({ ratio, direction: "spend", overTarget: c.pace.remaining != null && c.pace.remaining < 0 });
  const tone = paceTone(state);
  const flag = paceFlag(state, "spend");
  return (
    <div className="ads-chan-card" style={{ borderTopColor: meta.color }}>
      <div className="ads-chan-head">
        <span className="ads-chan-name"><PlatformIcon channel={c.key} size={15} /><b>{c.key}</b></span>
        {flag && <span className={`aw-flag aw-flag--${flag.tone}`}>{flag.text}</span>}
      </div>
      {/* สองคอลัมน์แบบ hero (อาร์ตเคาะ 21 ก.ย. ค่ำ): เนื้อหาซ้าย · คอลัมน์ pace ขวาใช้หน้าปัดใหญ่
          พร้อมประโยคเงินใต้หน้าปัด — เรื่องจังหวะทั้งหมดอยู่ที่เดียว ไม่กระจายเป็นเศษประโยคท้ายการ์ด */}
      <div className="ads-chan-main">
        <div className="aw-card-grid">
          <div>
            <span className="ads-chan-num">
              <b className="aw-metric-num mono">{fmtMoney(c.spend)}{c.budget != null && <small> / {fmtMoney(c.budget)}</small>}</b>
              {/* งบระดับช่องทางไม่ได้มีใครกรอก — ระบบแบ่งจากงบของแบรนด์ตามสัดส่วนแผนก่อนหน้า */}
              <InfoTip label={`งบ ${c.key}`} lines={[c.budget != null ? "งบแพลตฟอร์ม = แบ่งจากงบของแบรนด์ตามสัดส่วนแผนก่อนหน้า ไม่ใช่งบที่ตั้งรายแพลตฟอร์ม" : "ยังไม่ตั้งงบแบรนด์ จึงยังแบ่งงบให้แพลตฟอร์มนี้ไม่ได้", c.pace.used != null ? `ใช้ไป ${fmtPct(c.pace.used)} ของงบ` : null]}/>
            </span>

            {c.budget != null ? (
              <div className="ads-bullet" role="img"
                aria-label={`ใช้ไป ${fmtMoney(c.spend)} จากงบ ${fmtMoney(c.budget)} · ควรใช้ ${fmtMoney(c.pace.expectedSpend)} ณ วันนี้`}>
                {/* ช่วงคุณภาพ: ก่อนขีด = ยังตามจังหวะ · หลังขีด = เร็วกว่าจังหวะ (มีคำกำกับใต้แถบ) */}
                <span className="ads-bullet-range ads-bullet-range--ok" style={{ width: `${Math.round(c.pace.expected * 100)}%` }} />
                <span className="ads-bullet-range ads-bullet-range--warn" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
                <i className="ads-bullet-fill" style={{ width: `${Math.min(100, Math.round(c.pace.used * 100))}%`, background: GAUGE_TONE[tone] }} />
                <span className="ads-bullet-marker" style={{ left: `${Math.round(c.pace.expected * 100)}%` }} />
              </div>
            ) : (
              <div className="empty-row">ยังไม่ตั้งงบช่องทางนี้ — เทียบจังหวะไม่ได้</div>
            )}

            {c.budget != null && (
              <dl className="aw-facts">
                <div><dt>ควรใช้วันนี้</dt><dd>{fmtMoney(c.pace.expectedSpend)}</dd></div>
                <div><dt>งบคงเหลือ</dt><dd>{c.pace.remaining != null ? fmtMoney(c.pace.remaining) : "—"}</dd></div>
                <div><dt>คาดใช้สิ้นเดือน</dt><dd>{c.pace.forecast != null ? fmtMoney(c.pace.forecast) : "—"}</dd></div>
                <div><dt>เฉลี่ย/วัน</dt><dd>{c.pace.average != null ? fmtMoney(c.pace.average) : "—"}</dd></div>
                <div><dt>เหลือเวลา</dt><dd>{c.pace.daysLeft != null ? `${c.pace.daysLeft} วัน` : "—"}</dd></div>
                <div><dt>%Ads</dt><dd>{c.pctAds != null ? fmtPct(c.pctAds, 1) : "—"}</dd></div>
              </dl>
            )}

            {/* ประโยคเงินอยู่ฝั่งซ้ายใต้ facts (อาร์ต 21 ก.ย. ค่ำ) — เติมที่ว่างให้การ์ดไม่สูงโปร่ง
                สี bold ตามเนื้อความ ไม่ใช่สถานะรวม (สถานะ ontrack แต่พูดว่า "คาดเกินงบ" แล้วย้อมเขียว = สับสน) */}
            {c.pace.vsPace != null && <p className="aw-decide aw-decide--left">
              <b className={c.pace.vsPace > 0 ? "ads-over" : "ads-good"}>
                {c.pace.vsPace > 0 ? `ใช้เร็วกว่าจังหวะ ${fmtMoney(c.pace.vsPace)}` : `ใช้ช้ากว่าจังหวะ ${fmtMoney(-c.pace.vsPace)}`}</b>
              <span> · {forecastNote(c.pace)}</span>
            </p>}
          </div>

          {ratio != null && state !== "unknown" && (
            <div className="aw-hero-side">
              <PaceGauge width={178} kind="spend" title="จังหวะใช้งบ" caption="ของงบที่ควรใช้วันนี้"
                pace={{ value: ratio, state, direction: "spend" }}/>
            </div>
          )}
        </div>
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
              <div><dt>ความถี่</dt><dd className="mono">{d.frequency != null ? `${fmtNum(d.frequency, 2)}x` : "—"}</dd></div>
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
  const ads = useAdsData();
  const todayLocal = isoDay(new Date());
  /* ตัวกรองอยู่ในลิงก์และใช้ร่วมกับหน้าแคมเปญ/Creative (useReportFilters) */
  const [filters, setFilters] = useReportFilters();
  const { period, compare, channel, basis: revenueBasis } = filters;
  const setCompare = (next) => setFilters({ compare: next });
  const setChannel = (next) => setFilters({ channel: next });
  const setRevenueBasis = (next) => setFilters({ basis: next });

  const v = useMemo(() => buildOverviewModel({ data, ads, inBrandScope, brandFilter, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, ads.cards, ads.mockFallback, ads.source, ads.sales, ads.salesGoals, inBrandScope, brandFilter, filters]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeRange = ({ period: nextPeriod, from, to }) => setFilters({ period: nextPeriod, from, to });

  return <AdsWorkspace v={v} ads={ads} selected={filters.brand === "all" ? null : filters.brand} onSelect={(id) => setFilters({ brand: id ?? "all" })} ChannelCard={ChannelCard} SalePipeline={SalePipeline} settings={data.settings} updateAdsControl={updateAdsControl} toast={toast} controls={<>
    {/* หน้านี้เป็นเดือนปัจจุบันเสมอ — ไม่มีตัวเลือกช่วงและตัวเทียบ (ยังอยู่ในหน้าแคมเปญ/Creative) */}
    <span className="aw-period">เดือนนี้ · {v.rangeLabel}</span>
    <RevenueBasisToggle value={revenueBasis} onChange={setRevenueBasis} />
    <Dropdown label="ช่องทาง" options={[["all", "ทั้งหมด"], ...v.channelList.map((item) => [item, item])]} value={channel} onChange={setChannel} />
  </>} />;
}
