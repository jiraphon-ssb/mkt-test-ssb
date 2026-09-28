import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { BrandMark } from './BrandMark.jsx';
import { fmtMoney, fmtPct, fmtNum, fmtInt } from '../dash/charts/theme.js';
import { change, share } from '../adsOverview.js';
import './adsWorkspace.css';
import { WorkspaceTrends } from './WorkspaceTrends.jsx';
import { AdsControlCenter } from './AdsControlCenter.jsx';
import { GoalLine, fmtTarget } from '../ui/GoalLine.jsx';
import { AdsSourceControl, AdsSourceNotice } from './AdsSourceControl.jsx';
import { adsErrorText } from './adsSyncMessages.js';
import { PaceGauge } from './PaceGauge.jsx';
import { paceFlag, paceLabel, paceReason, paceTone } from './paceEngine.js';
import { byUrgency, overviewDigest } from './overviewActions.js';
import { DataPending, isDataPending } from './DataPending.jsx';
import { trendOf } from './glossary.js';

/* ป้ายมุมการ์ด — ระบบเดียวทั้งหน้า (hero · งบ · กล่องตัวชี้วัด) ตระกูลเดียวกับ "หล่นแรงสุด" ของ funnel */
const Flag = ({ flag }) => flag ? <span className={`aw-flag aw-flag--${flag.tone}`}>{flag.text}</span> : null;

const money = n => n == null ? '—' : fmtMoney(n);
const pct = n => n == null ? '—' : fmtPct(n, 2);

/* กล่องเงินจริง (สเปก 2026-09-26 overview-cash) — เงินเข้าจากระบบขายเทียบยอดขายรวมและค่าแอด
   ยกเลิก/คืนเงินขึ้นเฉพาะเมื่อมี (ข้อมูลจริงแทบเป็นศูนย์) · ระบบ TMK ไม่มีเงินเข้า = บอกตรงๆ */
function CashPanel({ c }) {
  // ภาพรวม: รายชื่อแบรนด์ที่กรอกไม่ครบ · รายแบรนด์: จำนวนวันของแบรนด์นั้น
  const partial = c.partial?.length ? c.partial.map((p) => `${p.name} ${p.days}/${p.total} วัน`).join(' · ')
    : c.cashDays != null && c.cashDaysTotal != null && c.cashDays < c.cashDaysTotal ? `${c.cashDays}/${c.cashDaysTotal} วัน` : null;
  const cancelLine = (c.cancelled > 0 || c.cancelledValue > 0 || c.refunds > 0)
    // ยกเลิกขึ้นเฉพาะเมื่อมีจริง — คืนเงินอย่างเดียวเคยขึ้น "ยกเลิก 0 รายการ" (รีวิวโค้ด 28 ก.ย.)
    ? [c.cancelled > 0 ? `ยกเลิก ${fmtInt(c.cancelled)} รายการ` : null, c.cancelledValue > 0 ? money(c.cancelledValue) : null, c.refunds > 0 ? `คืนเงิน ${money(c.refunds)}` : null,
      c.excluded?.length ? 'นับทุกแบรนด์' : null].filter(Boolean).join(' · ') : null;   // ยกเลิกมีทุกระบบ — ป้าย "ไม่รวม" ของกล่องหมายถึงเงินเข้า/มัดจำเท่านั้น   // มูลค่า 0 = ระบบขายไม่ได้ใส่ ไม่ขึ้น ฿0.00
  return <section className="aw-panel aw-cash" role="group" aria-label="เงินจริง">
    <div className="aw-section-label">เงินจริง <span className="zinc">จากระบบขาย</span>{c.excluded?.length > 0 && <span className="aw-chip">เงินเข้า/มัดจำไม่รวม {c.excluded.join(' · ')}</span>}</div>
    {!c.tracked ? <p className="aw-cash-none">ระบบขายของแบรนด์นี้ยังไม่ส่งข้อมูลเงินเข้าและมัดจำ</p> : <>
      <div className="aw-spend">{money(c.cash)} <small>เงินเข้าแล้ว</small></div>
      <p className={`aw-cash-gap${c.gap < 0 ? ' amber' : ''}`}>{c.gap == null ? null
        /* บอกฐานที่เทียบเมื่อไม่รวมบางแบรนด์ (ชุด A ข้อ 7) — ยอดขายใหญ่ด้านบนรวมทุกแบรนด์ ลบกันเองจะได้คนละคำตอบ */
        : c.excluded?.length ? (c.gap < 0 ? `ยังเก็บเงินไม่ครบ ${money(-c.gap)} จากยอดขายของแบรนด์ที่มีข้อมูลเงินเข้า (${money(c.revenue)})`
          : c.gap > 0 ? `เงินเข้าเกินยอดขายของแบรนด์ที่มีข้อมูลเงินเข้า (${money(c.revenue)}) อยู่ ${money(c.gap)} · รวมมัดจำงานที่ยังไม่ปิด` : `เท่ายอดขายของแบรนด์ที่มีข้อมูลเงินเข้า (${money(c.revenue)})`)
        : partial ? (c.gap < 0 ? `ยังเก็บเงินไม่ครบ ${money(-c.gap)} จากยอดขายของวันที่กรอก (${money(c.revenue)})`
          : c.gap > 0 ? `เงินเข้าเกินยอดขายของวันที่กรอก (${money(c.revenue)}) อยู่ ${money(c.gap)} · รวมมัดจำงานที่ยังไม่ปิด` : 'เท่ายอดขายของวันที่กรอก')
        : c.gap < 0 ? `ยังเก็บเงินไม่ครบ ${money(-c.gap)} จากยอดขายรวม`
        : c.gap > 0 ? `เงินเข้าเกินยอดขาย ${money(c.gap)} · รวมมัดจำงานที่ยังไม่ปิด` : 'เท่ายอดขายรวม'}</p>
      {/* กรอกเงินเข้าไม่ครบทุกวัน (อาร์ตเคาะ 27 ก.ย.) — รวมเฉพาะวันที่กรอก ต้องบอกจำนวนวัน ไม่งั้นอ่านเป็นยอดทั้งช่วง */}
      {partial && <p className="aw-key">นับเฉพาะวันที่ระบบขายกรอกเงินเข้า · {partial}</p>}
      <dl className="aw-facts">
        {/* ตัวเลขเดียวกับขั้น "ได้ออเดอร์" ใน funnel — ชื่อต้องตรงกัน (ชุด C ข้อ 12 · เดิม "มัดจำ 474" กับ "ได้ออเดอร์ 474") */}
        <div><dt>ได้ออเดอร์ (จ่ายมัดจำ)</dt><dd>{c.deposits == null ? '—' : `${fmtInt(c.deposits)} ราย`}</dd></div>
        <div><dt>มูลค่ามัดจำ</dt><dd>{money(c.depositValue)}</dd></div>
        <div><dt>เงินเข้าต่อค่าแอด</dt><dd>{c.cashPerSpend == null ? '—' : `${fmtNum(c.cashPerSpend, 2)}×`}</dd></div>
      </dl>
    </>}
    {cancelLine && <p className="aw-cash-cancel">{cancelLine}</p>}
  </section>;
}
const pace = n => n == null ? '—' : `${fmtNum(n * 100, 2)}%`;
/* หน้าปัด 3 อันบนหน้าเดียว (อาร์ตเคาะ 21 ก.ย. 69) — ต้องขนาดเท่ากันทุกอัน ไม่งั้นอันใหญ่จะกลายเป็นตัวชี้นำโดยไม่ตั้งใจ */
const GAUGE_W = 178;

/* จังหวะแบบย่อในฝั่งซ้าย — 1 บรรทัดต่อ 1 เรื่อง (ยอด · ค่าแอด) ดูปราดเดียวว่าเรื่องไหนหลุด
   ใช้ Pace Engine ตัวเดียวกับการ์ดยอดขายและตารางแบรนด์ คำกับสีจึงตรงกันทั้งหน้า */
/* กล่องตัวชี้วัดของการ์ดประสิทธิภาพ — ตัวเลขกับเป้าอยู่ซ้าย หน้าปัดอยู่ขวาเสมอ
   หน้าปัดเป็นเจ้าของ "ทำได้กี่ %" และคำสถานะแต่ผู้เดียว บรรทัดซ้ายบอกแค่เป้า (เดิมพูดซ้ำสามรอบ
   และหน้าปัดสองอันลอยคนละระดับเพราะข้อความข้างบนยาวไม่เท่ากัน) */
/* item = แถวจาก pipeline (มี value/before/sense) ไว้บอกดีขึ้น/แย่ลงเทียบเดือนก่อน (อาร์ตขอ 21 ก.ย. ค่ำ)
   sense "lower" = ยิ่งน้อยยิ่งดี (%Ads) — ลูกศรลงต้องแปลว่าดีขึ้น ไม่ใช่แย่ลง */
function Metric({ name, sub, value, goal, metric, empty, item }) {
  const kind = goal?.kind ?? (metric === 'pctAds' ? 'rate_lower' : 'rate_higher');
  const tone = paceTone(goal?.paceState);
  const d = item ? change(item.value, item.before) : null;
  const { good, word: trendWord } = trendOf(d, item?.sense ?? (metric === 'pctAds' ? 'lower' : 'higher'));   // < 5% = ทรงตัว (ตรวจรอบ 28 ก.ย.)
  const flag = empty ? null : paceFlag(goal?.paceState, kind);
  return <div className="aw-metric">
    <div className="aw-metric-head">
      <div><b>{name}</b><small>{sub}</small></div>
      {flag && <Flag flag={flag}/>}
    </div>
    <div className="aw-metric-body">
      {/* ค่าจริง / เป้า แบบเดียวกับ funnel (อาร์ตเคาะ 21 ก.ย. ค่ำ) — คง ≥/≤ ไว้ ไม่งั้น %Ads ที่เป็นเพดานจะอ่านกลับทาง */}
      <b className="aw-metric-num">{value}{!empty && goal?.target != null && <small> / {kind === 'rate_lower' ? '≤' : '≥'} {fmtTarget(metric, goal.target)}</small>}</b>
      {!empty && goal?.paceState && <PaceGauge mini width={86} caption="" kind={kind} showValue={false} showState={false}
        pace={{ value: goal.pct, state: goal.paceState, direction: kind }} title={`${name} เทียบเป้า`}/>}
    </div>
    {/* สองประโยคเต็ม มีประธานครบ (direct-labeling) — เป้าย้ายขึ้นตัวเลขใหญ่แล้ว บรรทัดนี้ไม่พูดซ้ำ */}
    {empty ? <small className="aw-key">{empty}</small> : <div className="aw-metric-foot">
      {/* ไม่มีเป้า = พูดตรงๆ (รีวิว UX 25 ก.ย.: เดิมขึ้น "ทำได้ — ยังตัดสินใจไม่ได้" อ่านไม่รู้เรื่อง) */}
      {goal?.pct == null ? <span className="zinc">ยังไม่ตั้งเป้า</span>
        /* ตัวที่ยิ่งน้อยยิ่งดี (%Ads) ห้ามขึ้น "ทำได้ 146% เกินเป้า" — อ่านเป็นข่าวดี (ทดสอบแบบผู้ใช้จริง 27 ก.ย.) → บอกว่าเป็นกี่ % ของเพดาน */
        : <span>{kind === 'rate_lower' ? null : <span className="zinc">ทำได้ </span>}<b className={tone}>{pace(goal?.pct)}</b> <span className="zinc">{kind === 'rate_lower' ? 'ของเพดาน' : 'ของเป้า'} · </span><span className={tone}>{paceLabel(goal?.paceState, kind)}</span></span>}
      <span className={d == null || good == null ? 'ads-muted' : good ? 'ads-good' : 'ads-over'}>
        {d == null ? 'เทียบเดือนก่อนไม่ได้' : `เทียบเดือนก่อน ${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d), 2)}%${trendWord ? ` ${trendWord}` : ''}`}
      </span>
    </div>}
  </div>;
}

/* การ์ดฝั่งซ้าย = ตัวเลือกแบรนด์ ไม่ใช่แดชบอร์ดย่อ (รื้อ 21 ก.ย. ค่ำ — เดิมหน้าปัด 2 อัน/การ์ด
   รวม 10 อันในราง 250px การ์ดสูงจนต้องเลื่อนหาแบรนด์ หน้าที่หลักพัง)
   ยอดพูดเสมอหนึ่งบรรทัด · ค่าแอดพูดเฉพาะเมื่อมีเรื่อง — แบรนด์ที่งบตามแผนไม่ต้องเปลืองบรรทัด */
function BrandStatus({ pace2 }) {
  const rev = pace2?.rev, budget = pace2?.budget;
  const revTone = paceTone(rev?.state);
  const alert = budget && budget.state !== 'unknown' && budget.state !== 'ontrack';
  return <>
    {/* "จังหวะ" = เทียบกับที่ควรได้ถึงวันนี้ — คนละตัวหารกับ "% ของเป้าเดือน" ข้างบน (รีวิว UX 25 ก.ย.: เดิมขึ้นต้น "ยอด" อ่านปนกัน) */}
    <small className={`aw-brand-line ${revTone}`}>จังหวะ <b>{pace(rev?.value)}</b> · {paceLabel(rev?.state)}</small>
    {alert && <small className={`aw-brand-line ${paceTone(budget.state)}`}>ค่าแอด {paceLabel(budget.state, 'spend')} · <b>{pace(budget.value)}</b></small>}
  </>;
}

/* บรรทัดสรุปผู้บริหาร (ทดสอบแบบใช้งานจริง 27 ก.ย.) — เปิดมาต้องรู้ใน 1 บรรทัด: เดือนนี้คาดขาดเท่าไร เกินงบกี่แบรนด์ ดูใครก่อน
   ส่วนไหนยังไม่รู้ (ไม่มีเป้า/ไม่มีเรื่อง) ไม่พูด — ไม่เขียน "—" ในประโยค */
function Digest({ g, onPick }) {
  if (!g) return null;
  const parts = [];
  if (g.shortfall != null) parts.push(g.shortfall > 0 ? <>คาดขาดเป้า <b className="rose">{money(g.shortfall)}</b></> : <>คาดถึงเป้า <b className="emerald">เกิน {money(-g.shortfall)}</b></>);
  if (g.companyOver) parts.push(<><b className="rose">ค่าแอดเกินงบรวมแล้ว</b>{g.overBudget > 0 && ` (เกิน ${g.overBudget} แบรนด์)`}</>);
  else if (g.overBudget > 0) parts.push(<>ค่าแอดเกินงบ <b className="rose">{g.overBudget} แบรนด์</b></>);
  if (g.first) parts.push(<>เรื่องแรก: <button type="button" onClick={() => onPick(g.first.id)}>{g.first.name}</button> — {g.first.action}</>);
  if (!parts.length) return null;
  return <p className="aw-digest">{parts.map((part, i) => <span key={i}>{i > 0 && ' · '}{part}</span>)}</p>;
}

/* แถบเป้า (bullet bar) — ขีดคือจังหวะที่ควรถึงวันนี้ ไม่ใช่เส้นตกแต่ง */
function Track({ value, expected, label, tone, asOfText = 'วันนี้' }) {
  return <div className="aw-track" role="img" aria-label={`${label}: ${pct(value)} · จังหวะถึง${asOfText === 'วันนี้' ? '' : ' '}${asOfText} ${pct(expected)}`}><i className={tone} style={{width:`${Math.max(0,Math.min(100,(value ?? 0)*100))}%`}} />{expected != null && <em style={{left:`${Math.min(100,expected*100)}%`}} />}</div>;
}

/* ช่วงที่ไม่ใช่เดือนนี้ต้องพูดด้วยภาษาของ “ช่วงที่เลือก” เท่านั้น
   ไม่มีเป้ารายเดือน หน้าปัด pace หรือคาดปิดเดือน เพราะจะเอายอด 1/7/30 วันไปเทียบเป้าทั้งเดือนไม่ได้ */
/* ยังไม่มีตัวเลขจริงให้แสดง (กำลังโหลด / โหลดพัง) — ห้ามโชว์ ฿0.00 · "ยังไม่ตั้งเป้า" · หน้าปัด 0 (ชุด A ข้อ 5)
   แถบที่มาด้านบนบอกสถานะอยู่แล้ว · ตอนพังใส่ปุ่มลองใหม่ตรงที่คนกำลังมองด้วย */
/* ยอดขาย/เป้าโหลดพัง = ภาพรวมที่เหลือจะอ่านผิด ("ยังไม่ตั้งเป้า") → ขึ้นกล่องแจ้งแทนทั้งหน้า (ทดสอบละเอียดรอบ 2 · 27 ก.ย.)
   หน้าแคมเปญ/Creative ใช้แค่ค่าแอด Meta จึงยังดูได้ */
const salesBroken = (ads) => ads.source === 'meta_pilot' && ads.pilot?.status === 'ready' && (ads.pilot?.salesFailed || ads.pilot?.goalsFailed);
const notReady = (ads) => (ads.source === 'meta_pilot' && ['idle', 'loading', 'error'].includes(ads.pilot?.status)) || salesBroken(ads);
/* ช่วงที่เลือกเริ่มก่อนวันแรกที่ระบบมีค่าแอด (ทดสอบละเอียดรอบ 2: 1–30 มิ.ย. แต่ค่าแอดเริ่ม 18 มิ.ย. → ROAS 32.35× สูงเกินจริง ไม่มีคำเตือน)
   → บอกชัด และไม่แสดงตัวที่หารด้วยค่าแอด (ROAS · %Ads) เพราะยอดขายนับทั้งช่วงแต่ค่าแอดนับไม่ครบ */
const thDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
const localIso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const spendFrom = (v, ads) => { const from = ads.source === 'meta_pilot' ? ads.pilot?.summary?.from : null; return from && v.range?.start && localIso(v.range.start) < from ? from : null; };
function SpendStartNote({ from }) {
  const label = new Date(`${from}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return <p className="aw-partial-spend" role="alert"><span><b>ระบบมีข้อมูลค่าแอดตั้งแต่ {label}</b> — ช่วงที่เลือกเริ่มก่อนนั้น ค่าแอดจึงนับไม่ครบ · ROAS และ %Ads ไม่แสดง (ยอดขายนับทั้งช่วง หารกันจะสูงเกินจริง)</span></p>;
}
function LoadBlock({ ads }) {
  if (salesBroken(ads)) return <div className="aw-load-failed" role="alert">
    <p><b>โหลดยอดขายและเป้าไม่สำเร็จ</b> — ภาพรวมจึงยังไม่แสดง ไม่ได้แปลว่ายังไม่มียอดขายหรือยังไม่ตั้งเป้า · หน้าแคมเปญและ Creative ยังดูได้</p>
    <button type="button" onClick={() => ads.reload?.()}>ลองใหม่</button>
  </div>;
  if (ads.pilot?.status === 'error') return <div className="aw-load-failed" role="alert">
    <p><b>โหลดตัวเลขไม่สำเร็จ{(r => r ? ` · ${r}` : '')(adsErrorText(ads.pilot.error, null))}</b> — ยังแสดงยอดขาย ค่าแอด และจังหวะไม่ได้ ไม่ได้แปลว่าไม่มีข้อมูล</p>
    <button type="button" onClick={() => ads.reload?.()}>ลองใหม่</button>
  </div>;
  // แถบบนเงียบตอนโหลดแล้ว (ไม่ซ้อนสองที่) — กล่องนี้ต้องบอกเองว่ากำลังโหลด
  return <div role="status"><p className="aw-key">กำลังโหลดตัวเลขจริง…</p><div className="aw-loading" aria-hidden="true"><i/><i/><i/></div></div>;
}

function RangeWorkspace({ v, ads, controls, selected, setSelected, picked, head, ChannelCard, SalePipeline, todayOnly = false }) {
  const overview = !picked;
  const s = v.summary;
  const real = ads.source === 'meta_pilot';
  const revenueLabel = v.revenueBasis === 'new' ? 'ยอดใหม่' : 'ยอดรวม';
  const pipeline = overview ? v.overallPipeline : v.pipelines[picked.id];
  const partialFrom = spendFrom(v, ads);
  const roas = partialFrom ? null : pipeline?.items.find(x => x.key === 'roas')?.value;
  const pctAds = partialFrom ? null : head.pctAds !== undefined ? head.pctAds : share(head.spend, head.revenue);
  const deltaText = (value) => value == null ? `เทียบ${v.compareLabel}ไม่ได้` : `${value >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(value), 2)}% เทียบ${v.compareLabel}`;
  const deltaTone = (value, lower = false) => value == null || value === 0 ? 'zinc' : (lower ? value < 0 : value > 0) ? 'emerald' : 'rose';
  const todayPending = isDataPending({ real, range: v.range, dataThrough: v.dataThrough, hasData: s.spend > 0 || s.revenue > 0 });

  return <main className="aw aw--range">
    <section className="aw-toolbar" aria-label="ตัวกรองรายงาน">
      <header className="aw-header"><div><h1>ภาพรวมโฆษณา</h1><p>{v.rangeLabel} · ยอดขาย ค่าแอด และประสิทธิภาพตามช่วงที่เลือก</p></div>
        <div className="aw-header-actions"><AdsSourceControl ads={ads}/><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15}/> ตั้งค่า</Link></div></header>
      {/* กล่องรอข้อมูลวันนี้บอกเรื่องเดียวกับธงบนแถบแล้ว — ไม่พูดซ้ำสองที่ */}
      {!salesBroken(ads) && <AdsSourceNotice ads={ads} todayOnly={todayOnly && !todayPending}/>}<div className="aw-controls">{controls}</div>
    </section>

    {notReady(ads) ? <LoadBlock ads={ads}/> : todayPending ? <DataPending label={v.rangeLabel} through={v.dataThrough}/> :
    <div className="aw-layout">
      <aside className="aw-brands">
        <div className="aw-section-label">พอร์ตแบรนด์ <span>{v.brands.length}</span></div>
        <p>{revenueLabel} · {v.rangeLabel}</p>
        <button type="button" className={`aw-brand ${overview ? 'selected' : ''}`} aria-pressed={overview} onClick={() => setSelected(null)}>
          <div><strong>ภาพรวมทุกแบรนด์</strong><span>↗</span></div><b>{money(s.revenue)}</b><small> {revenueLabel}ในช่วงนี้</small>
          <small className={deltaTone(s.revChangePct)}>{deltaText(s.revChangePct)}</small>
        </button>
        {v.brands.map(x => <button key={x.id} type="button" className={`aw-brand ${x.id === picked?.id ? 'selected' : ''}`} aria-pressed={x.id === picked?.id} onClick={() => setSelected(x.id)}>
          <div><BrandMark brand={x}/><strong>{x.name}</strong><span>↗</span></div>
          <div><b>{money(x.revenue)}</b><small>{pct(x.revShare)} ของยอดรวม</small></div>
          <small className={deltaTone(x.revChangePct)}>{deltaText(x.revChangePct)}</small>
        </button>)}
      </aside>

      <div className="aw-content">
        {partialFrom && <SpendStartNote from={partialFrom}/>}
        <section className="aw-hero">
          <div className="aw-hero-top"><div className="aw-brand-title">{!overview && <BrandMark brand={head}/>}<h2>{head.name}</h2></div><span className="aw-status">ช่วงที่เลือก</span></div>
          <div className="aw-hero-grid">
            <div>
              <span className="aw-eyebrow">{revenueLabel} · {v.rangeLabel}{real ? ' · จากระบบขาย' : ''}</span>
              <div className="aw-revenue">{money(head.revenue)}</div>
              <p className={deltaTone(head.revChangePct)}>{deltaText(head.revChangePct)}</p>
              <dl className="aw-facts">
                <div><dt>{revenueLabel}{v.compareLabel}</dt><dd>{money(head.prevRevenue)}</dd></div>
                <div><dt>สัดส่วนของยอดรวม</dt><dd>{overview ? '100%' : pct(head.revShare)}</dd></div>
              </dl>
            </div>
            <div className="aw-forecast">
              <span>ค่าแอดในช่วงนี้</span><h3>{money(head.spend)}</h3>
              <strong className={deltaTone(head.spendChangePct, true)}>{deltaText(head.spendChangePct)}</strong>
              <small>ค่าแอด{v.compareLabel} {money(head.prevSpend)}</small>
            </div>
          </div>
        </section>

        <div className="aw-middle aw-range-summary">
          <section className="aw-panel"><div className="aw-section-label">ประสิทธิภาพ <span>{v.rangeLabel}</span></div>
            <dl className="aw-facts aw-range-facts">
              <div><dt>ROAS</dt><dd>{roas == null ? '—' : `${fmtNum(roas, 2)}×`}</dd></div>
              <div><dt>{real ? '%Ads ต่อยอดลูกค้าใหม่' : '%Ads'}</dt><dd>{pct(pctAds)}</dd></div>
              <div><dt>ยอดขาย</dt><dd>{money(head.revenue)}</dd></div>
              <div><dt>ค่าแอด</dt><dd>{money(head.spend)}</dd></div>
            </dl>
            <details className="aw-formula"><summary>สูตรที่ใช้</summary><p>{real ? <>ROAS = ยอดขายจริง ÷ ค่าแอด Meta<br/>%Ads = ค่าแอด Meta ÷ ยอดลูกค้าใหม่</> : <>ROAS = ยอดขาย ÷ ค่าแอด<br/>%Ads = ค่าแอด ÷ ยอดขาย</>}</p></details>
          </section>
        </div>

        <section className="aw-panel aw-journey">
          <div className="aw-section-label">จากความสนใจ สู่ยอดขาย <span>{v.rangeLabel}</span></div>
          <SalePipeline row items={(pipeline?.items ?? []).slice(0, 4)} worstKey={pipeline?.worstKey}/>
          {real && overview && pipeline?.excluded?.length > 0 && <p className="aw-key">ไม่รวม {pipeline.excluded.join(' · ')} ใน funnel เพราะระบบขายยังเก็บขั้นไม่ครบ</p>}
        </section>

        {overview && <section className="aw-panel" aria-labelledby="aw-range-brands-title">
          <div className="aw-section-label" id="aw-range-brands-title">เทียบแบรนด์ <span>{v.rangeLabel}</span></div>
          <div className="aw-table-scroll"><table className="aw-comparison aw-brandtable"><thead><tr><th>แบรนด์</th><th>{revenueLabel}</th><th>ค่าแอด</th><th>ROAS</th><th>เทียบ{v.compareLabel}</th></tr></thead>
            <tbody>{v.brands.map(x => { const r = v.pipelines[x.id]?.items.find(i => i.key === 'roas')?.value; return <tr key={x.id} className="aw-row" onClick={() => setSelected(x.id)}>
              <th><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(x.id); }}><BrandMark brand={x}/>{x.name}</button></th>
              <td data-label={revenueLabel}>{money(x.revenue)}<small>{pct(x.revShare)} ของยอดรวม</small></td><td data-label="ค่าแอด">{money(x.spend)}</td><td data-label="ROAS">{r == null || partialFrom ? '—' : `${fmtNum(r, 2)}×`}</td>
              <td data-label={`เทียบ${v.compareLabel}`} className={deltaTone(x.revChangePct)}>{deltaText(x.revChangePct)}</td></tr>; })}</tbody>
          </table></div><p className="aw-key">ทุกตัวเลขคำนวณจากช่วงที่เลือก · กดแถวเพื่อดูรายละเอียดแบรนด์</p>
        </section>}

        <WorkspaceTrends v={v} brandId={overview ? null : picked.id} sales={real ? ads.sales : null} spendFrom={partialFrom}/>

        {!overview && <section className="aw-panel aw-detail"><div className="aw-section-label">แพลตฟอร์ม <span>{head.channels.length}</span></div>
          <div className="aw-channel-grid">{head.channels.length ? head.channels.map(c => <ChannelCard key={c.key} c={c} monthView={false} real={real}/>) : <p>ไม่มีแพลตฟอร์มในตัวกรองนี้</p>}</div>
        </section>}
      </div>
    </div>}
  </main>;
}

/* หน้า Overview รื้อใหม่ 21 ก.ย. 69 (สเปก docs/superpowers/specs/2026-09-21-overview-redesign.md)
   ตอบ 3 คำถามตามลำดับ: ตอนนี้เป็นยังไง · ต้องระวังอะไร · ควรทำอะไรต่อ
   เดือนนี้แสดง pace/เป้า · ช่วงอื่นแสดงผลของช่วงและฐานเทียบ โดยไม่ปนเป้ารายเดือน
   กราฟมีที่เดียวคือบล็อกแนวโน้มซึ่งพับไว้ · หน้าปัดมีอันเดียวคือจังหวะยอดขาย */
export function AdsWorkspace({ v, ads, controls, ChannelCard, SalePipeline, settings, updateAdsControl, toast, selected: selectedProp, onSelect, todayOnly = false }) {
  const { search } = useLocation();
  const [localSelected, setLocalSelected] = useState(null);
  const selected = onSelect ? selectedProp : localSelected;
  const setSelected = onSelect ?? setLocalSelected;
  const [tab, setTab] = useState('platform');
  const picked = v.brands.find(x => x.id === selected);
  const overview = !picked;
  const cashNow = v.cash ? (overview ? v.cash.overall : v.cash.byBrand?.[picked.id]) ?? null : null;
  const s = v.summary;
  const real = ads.source === 'meta_pilot';
  const revenueLabel = v.revenueBasis === 'new' ? 'ยอดใหม่' : 'ยอดรวม';
  const noSales = (row) => row?.salesSource === 'waiting' ? 'รอเชื่อมแหล่งข้อมูล' : row?.salesSource === 'none' ? 'ยังไม่มีข้อมูลยอดขาย' : null;
  const targetText = (value) => value == null ? (real ? 'ยังไม่ตั้งเป้า' : '—') : money(value);

  const head = picked ?? (v.brands.length ? {
    ...s, id: 'overview', name: 'ภาพรวมทุกแบรนด์',
    pctAds: s.pctAds !== undefined ? s.pctAds : share(s.spend, s.revenue), channels: [],
  } : null);
  const p2 = picked ? picked.pace2 : v.overallPace;
  const pipeline = overview ? v.overallPipeline : v.pipelines[picked.id];
  const goals = overview ? v.goals?.overall : v.goals?.byBrand?.[picked?.id];
  const roas = pipeline?.items.find(x => x.key === 'roas')?.value;

  if (new URLSearchParams(search).get('panel') === 'settings') {
    return <AdsControlCenter brands={v.brands} saved={settings?.ads_control} onSave={updateAdsControl} toast={toast} ads={ads}/>;
  }
  if (!head) return <main className="aw"><section className="aw-panel">ไม่มีแบรนด์ในขอบเขตที่เลือก</section></main>;
  if (!v.monthView) return <RangeWorkspace v={v} ads={ads} controls={controls} todayOnly={todayOnly} selected={selected} setSelected={setSelected}
    picked={picked} head={head} ChannelCard={ChannelCard} SalePipeline={SalePipeline}/>;

  /* วันที่ 1 (หรือวันที่ 2 ก่อน 09:00) ยังไม่มีวันไหนของเดือนนี้ที่ข้อมูลครบ — ช่วงว่าง ขึ้นกล่องข้อมูลยังไม่เข้า แทน ฿0.00 · ทำได้ 0% (รีวิวโค้ด 28 ก.ย.) */
  const monthPending = isDataPending({ real, range: v.range, dataThrough: v.dataThrough, hasData: s.spend > 0 || s.revenue > 0 });
  /* จังหวะคิดถึงวันสุดท้ายที่ข้อมูลครบ (เมื่อวาน) ไม่ใช่วันนี้ — ยอดวันนี้ยังไม่เข้า ป้ายต้องบอกวันที่ใช้คิด */
  const asOfText = v.asOf ? thDay(v.asOf) : 'วันนี้';
  const asOfGap = v.asOf ? ' ' : '';
  /* ประโยคตัดสินใจใต้การ์ดยอด — บอกว่าต้องเร่งเป็นเท่าไรต่อวัน ไม่ใช่แค่บอกว่าช้า */
  const rev = p2?.rev;
  const decide = rev?.state === 'unknown'
    ? { tone: 'zinc', text: `ยังตัดสินใจไม่ได้ — ${paceReason(rev.reason) ?? 'ข้อมูลไม่ครบ'}` }
    : rev?.gap == null ? null
      : rev.gap < 0
        ? { tone: 'rose', text: `ช้ากว่าแผน ${money(-rev.gap)}`, more: rev.requiredDaily == null ? null : `ต้องทำให้ได้เฉลี่ย ${money(rev.requiredDaily)}/วัน ใน ${rev.daysLeft} วันที่เหลือ` }
        : { tone: 'emerald', text: `เหนือแผน ${money(rev.gap)}`, more: rev.requiredDaily == null ? null : `เหลืออีก ${money(rev.remaining)} ใน ${rev.daysLeft} วัน` };

  return <main className="aw">
    <section className="aw-toolbar" aria-label="ตัวกรองรายงาน">
      <header className="aw-header"><div><h1>ภาพรวมโฆษณา</h1><p>เดือนปัจจุบัน · ยอดขาย งบ และประสิทธิภาพ{picked ? `ของ ${picked.name}` : "รวมทุกแบรนด์"}</p></div>
        <div className="aw-header-actions"><AdsSourceControl ads={ads}/><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15}/> ตั้งค่า</Link></div></header>
      {!salesBroken(ads) && <AdsSourceNotice ads={ads} todayOnly={todayOnly}/>}<div className="aw-controls">{controls}</div>
    </section>

    {/* ระหว่างโหลดไม่โชว์ค่าหลอก (เดิมขึ้น "ยังไม่ตั้งเป้า" · "ตามแผน" · หน้าปัด 0) — แถบที่มาบอก "กำลังโหลดตัวเลขจริง…" อยู่แล้ว */}
    {/* บรรทัดสรุปอยู่เหนือทั้งแถบแบรนด์และเนื้อหา — มือถือเห็นก่อนแถบเลือกแบรนด์ (ตรวจรอบ 27 ก.ย. ดึก) */}
    {!notReady(ads) && !monthPending && overview && <Digest g={overviewDigest({ overallPace: v.overallPace, brands: v.brands })} onPick={setSelected}/>}
    {notReady(ads) ? <LoadBlock ads={ads}/> : monthPending ? <DataPending label={v.rangeLabel} through={v.dataThrough}/> :
    <div className="aw-layout">
      {/* ฝั่งซ้าย = ตัวเลือกแบรนด์ (ยอด + จังหวะ แบบย่อ) · ตารางข้างล่าง = เทียบละเอียดทีละคอลัมน์ คนละหน้าที่กัน */}
      <aside className="aw-brands">
        <div className="aw-section-label">พอร์ตแบรนด์ <span>{v.brands.length}</span></div>
        <p>{revenueLabel}และเป้ารวมเดือนปัจจุบัน</p>
        <button type="button" className={`aw-brand ${overview ? 'selected' : ''}`} aria-pressed={overview} onClick={() => setSelected(null)}>
          <div><strong>ภาพรวมทุกแบรนด์</strong><span>↗</span></div>
          <b>{money(s.revenue)}</b><small> {revenueLabel}เดือนปัจจุบัน</small>
          <Track value={share(s.revenue, s.revTarget)} expected={v.clock?.elapsed} asOfText={asOfText} label="ภาพรวม" tone={paceTone(v.overallPace?.rev?.state)}/>
          <BrandStatus pace2={v.overallPace}/>
        </button>
        {/* เรียงตามความด่วนเหมือนตารางแบรนด์ (ตรวจรอบ 28 ก.ย.) */}
        {byUrgency(v.brands).map(x => <button key={x.id} type="button" className={`aw-brand ${x.id === picked?.id ? 'selected' : ''}`} aria-pressed={x.id === picked?.id} onClick={() => setSelected(x.id)}>
          <div><BrandMark brand={x}/><strong>{x.name}</strong><span>↗</span></div>
          {/* % ของเป้าเดือน "ของแบรนด์นั้น" — เดิมเขียน "ของเป้ารวม" ทั้งที่ตัวหารคือเป้าแบรนด์ (ยอดใหม่ยังเทียบเป้ารวมของแบรนด์ เหมือนหัวการ์ด) */}
          <div><b>{money(x.revenue)}</b><small>{pace(share(x.revenue, x.revTarget))} ของเป้า{revenueLabel === 'ยอดใหม่' ? 'รวม' : 'เดือน'}</small></div>
          {noSales(x) ? <small className="zinc">{noSales(x)}</small> : <>
            <Track value={share(x.revenue, x.revTarget)} expected={v.clock?.elapsed} asOfText={asOfText} label={x.name} tone={paceTone(x.pace2?.rev?.state)}/>
            <BrandStatus pace2={x.pace2}/>
          </>}
        </button>)}
      </aside>

    <div className="aw-content">
      {spendFrom(v, ads) && <SpendStartNote from={spendFrom(v, ads)}/>}
      <div>
        <section className="aw-hero">
          <div className="aw-hero-top"><div className="aw-brand-title">{!overview && <BrandMark brand={head}/>}<h2>{head.name}</h2></div><Flag flag={paceFlag(rev?.state)}/></div>
          <div className="aw-hero-grid">
            <div>
              <span className="aw-eyebrow">{revenueLabel}เดือนปัจจุบัน{real ? ' · จากระบบขาย' : ''}{overview && real && s.excludedWaiting?.length > 0 && <span className="aw-chip">ไม่รวม {s.excludedWaiting.join(' · ')}</span>}</span>
              {/* ค่าจริง / เป้า ในตัวเลขใหญ่ (อาร์ตขอ 21 ก.ย. ค่ำ) — แบบเดียวกับการ์ดงบ/tile/แพลตฟอร์ม */}
              <div className="aw-revenue">{money(head.revenue)}{head.revTarget != null && <small> / {money(head.revTarget)}</small>}</div>
              <p>{noSales(head) ? <b>{noSales(head)}</b>
                : head.revTarget == null ? 'ยังไม่ตั้งเป้าเดือนนี้'
                : <>ทำได้ <b>{pace(share(head.revenue, head.revTarget))}</b> ของเป้า{revenueLabel === 'ยอดใหม่' ? 'รวม' : 'ทั้งเดือน'}</>}</p>
              <Track value={share(head.revenue, head.revTarget)} expected={v.clock?.elapsed} asOfText={asOfText} tone={paceTone(rev?.state)} label="ยอดขายเทียบเป้า"/>
              <dl className="aw-facts">
                <div><dt>ควรถึง{asOfGap}{asOfText}</dt><dd>{money(rev?.expectedToDate)}</dd></div>
                <div><dt>คาดปิดเดือน</dt><dd>{money(rev?.forecast)}</dd></div>
                <div><dt>{rev?.forecastGap == null ? 'เทียบเป้า' : rev.forecastGap < 0 ? 'คาดต่ำกว่าเป้า' : 'คาดเหนือเป้า'}</dt><dd>{rev?.forecastGap == null ? '—' : money(Math.abs(rev.forecastGap))}</dd></div>
                <div><dt>เทียบเดือนก่อน</dt><dd>{head.revChangePct == null ? '—' : `${head.revChangePct >= 0 ? '+' : ''}${fmtNum(head.revChangePct, 2)}%`}</dd></div>
              </dl>
            </div>
            {/* คอลัมน์ pace: หน้าปัด + ประโยคตัดสินใจอยู่ด้วยกัน (อาร์ตเคาะ 21 ก.ย. ค่ำ) — คำตอบ "แล้วต้องทำไง" อยู่ติดกับสิ่งที่มันอธิบาย */}
            <div className="aw-hero-side">
              <PaceGauge pace={rev} width={GAUGE_W} caption={`ของที่ควรได้ถึง${asOfGap}${asOfText}`}/>
              {decide && <p className={`aw-decide ${decide.tone}`}><b>{decide.text}</b>{decide.more && <span>{decide.more}</span>}</p>}
            </div>
          </div>
        </section>

      </div>

      {/* ลำดับ: ประสิทธิภาพก่อนงบ (อาร์ตสั่งสลับ 21 ก.ย. ค่ำ) */}
      <div className="aw-middle">
        <section className="aw-panel aw-efficiency">
          <div className="aw-section-label">ประสิทธิภาพ{real && <span className="zinc">คิดจากค่าแอด Meta</span>}</div>
          <div className="aw-metrics">
            <Metric name="ROAS" sub="เดือนนี้" value={roas == null || spendFrom(v, ads) ? '—' : `${fmtNum(roas, 2)}×`}
              goal={spendFrom(v, ads) ? null : goals?.roas} metric="roas" empty={spendFrom(v, ads) ? 'ค่าแอดในช่วงนี้ไม่ครบ' : roas == null ? noSales(head) : null}
              item={spendFrom(v, ads) ? null : pipeline?.items.find(i => i.key === 'roas')}/>
            <Metric name="%Ads" sub={real ? 'ต่อยอดลูกค้าใหม่' : 'เดือนนี้'} value={spendFrom(v, ads) ? '—' : pct(head.pctAds)}
              goal={spendFrom(v, ads) ? null : goals?.pctAds} metric="pctAds" empty={spendFrom(v, ads) ? 'ค่าแอดในช่วงนี้ไม่ครบ' : head.pctAds == null ? noSales(head) : null}
              item={spendFrom(v, ads) ? null : pipeline?.items.find(i => i.key === 'pctAds')}/>
          </div>
        </section>

        <section className="aw-panel">
          <div className="aw-section-label">{real ? 'งบโฆษณา Meta' : 'งบโฆษณา'} {head.budget == null && real
            ? <span className="zinc">ยังไม่ตั้งเป้างบ</span>
            : <Flag flag={paceFlag(p2?.budget?.state, 'spend')}/>}</div>
          <div className="aw-card-grid">
            <div>
              <div className="aw-spend">{money(head.spend)} <small>/ {targetText(head.budget)}</small></div>
              <Track value={share(head.spend, head.budget)} expected={v.clock?.elapsed} asOfText={asOfText} tone={paceTone(p2?.budget?.state)} label="ใช้เงินเทียบงบ"/>
              <dl className="aw-facts">
                <div><dt>ควรใช้ถึง{asOfGap}{asOfText}</dt><dd>{money(p2?.budget?.expectedToDate)}</dd></div>
                <div><dt>{p2?.budget?.remaining < 0 ? 'ใช้เกินงบ' : 'งบคงเหลือ'}</dt><dd>{money(p2?.budget?.remaining == null ? null : Math.abs(p2.budget.remaining))}</dd></div>
                <div><dt>คาดใช้สิ้นเดือน</dt><dd>{money(p2?.budget?.forecast)}</dd></div>
                <div><dt>เหลือเวลา</dt><dd>{v.clock?.daysLeft == null ? '—' : `${v.clock.daysLeft} วัน`}</dd></div>
              </dl>
            </div>
            <PaceGauge pace={p2?.budget} kind="spend" title="จังหวะใช้งบ" caption={`ของงบที่ควรใช้ถึง${asOfGap}${asOfText}`} width={GAUGE_W}/>
          </div>
          {/* ค่าแอดดึงวันละครั้งตอนเช้า — หัวหน้าบอก "1 – 27 ก.ย." แต่ค่าแอดมีถึงเมื่อวาน ต้องบอกตรงนี้ (ทดสอบแบบผู้ใช้จริง 27 ก.ย.) */}
          {p2?.budget?.reason === 'stale' ? <p className="aw-key">ค่าแอดมีถึง {thDay(v.spendThrough)} — ยังตัดสินจังหวะงบไม่ได้</p>
            : v.spendThrough && v.spendThrough < localIso(new Date()) && <p className="aw-through">ค่าแอดถึง {thDay(v.spendThrough)} (ดึงวันละครั้งตอนเช้า)</p>}
        </section>
        {cashNow && <CashPanel c={cashNow}/>}
      </div>

      <section className="aw-panel aw-journey">
        <div className="aw-section-label">จากความสนใจ สู่ยอดขาย <span>เดือนนี้</span>{real && overview && pipeline?.excluded?.length > 0 && <span className="aw-chip">ไม่รวม {pipeline.excluded.join(' · ')}</span>}</div>
        <SalePipeline row items={(pipeline?.items ?? []).slice(0, 4)} worstKey={pipeline?.worstKey} goals={goals} gauge/>
      </section>

      {/* ตารางแบรนด์เป็นของภาพรวม (อาร์ตเคาะ 21 ก.ย. ค่ำ) — ในแบรนด์ใช้ฝั่งซ้ายสลับแบรนด์ ไม่ต้องซ้ำ */}
      {overview && <section className="aw-panel" aria-labelledby="aw-brands-title">
        <div className="aw-section-label" id="aw-brands-title">แบรนด์ <span>{v.brands.length}</span></div>
        <div className="aw-table-scroll"><table className="aw-comparison aw-brandtable">
          <thead><tr><th>แบรนด์</th><th>{revenueLabel} / เป้า</th>{v.cash && <th>เงินเข้า</th>}<th>จังหวะยอด</th><th>จังหวะงบ</th><th>ROAS</th><th>คาดปิดเดือน</th><th>ควรทำ</th></tr></thead>
          <tbody>
            <tr className={`aw-row ${overview ? 'selected' : ''}`} onClick={() => setSelected(null)}><th><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(null); }}>ภาพรวมทุกแบรนด์</button></th>
              <td data-label={`${revenueLabel} / เป้า`}>{money(s.revenue)}<small> / {targetText(s.revTarget)}</small></td>
              {v.cash && <td data-label="เงินเข้า">{money(v.cash.overall?.cash)}</td>}
              <td data-label="จังหวะยอด"><Track value={share(s.revenue, s.revTarget)} expected={v.clock?.elapsed} asOfText={asOfText} label="จังหวะยอด" tone={paceTone(v.overallPace?.rev?.state)}/><span className={paceTone(v.overallPace?.rev?.state)}>{pace(v.overallPace?.rev?.value)} {paceLabel(v.overallPace?.rev?.state)}</span></td>
              <td data-label="จังหวะงบ"><Track value={share(s.spend, s.budget)} expected={v.clock?.elapsed} asOfText={asOfText} label="จังหวะงบ" tone={paceTone(v.overallPace?.budget?.state)}/><span className={paceTone(v.overallPace?.budget?.state)}>{pace(v.overallPace?.budget?.value)} {paceLabel(v.overallPace?.budget?.state, 'spend')}</span></td>
              <td data-label="ROAS">{(() => { const r = v.overallPipeline?.items.find(i => i.key === 'roas')?.value; return r == null || spendFrom(v, ads) ? '—' : `${fmtNum(r, 2)}×`; })()}</td>
              <td data-label="คาดปิดเดือน">{money(v.overallPace?.rev?.forecast)}</td>
              <td data-label="ควรทำ" className={v.overallPace?.advice?.tone}>{v.overallPace?.advice?.action}{v.overallPace?.advice?.overBudget && <small> · เกินงบแล้ว</small>}</td></tr>
            {byUrgency(v.brands).map(x => { const r = v.pipelines[x.id]?.items.find(i => i.key === 'roas')?.value; const a = x.pace2?.advice; return (
              /* ทั้งแถวกดได้ตามที่คำอธิบายใต้ตารางบอก — ปุ่มที่ชื่อยังอยู่เพื่อให้ไล่ด้วยคีย์บอร์ดได้ */
              <tr key={x.id} className={`aw-row ${x.id === picked?.id ? 'selected' : ''}`} onClick={() => setSelected(x.id)}>
                <th><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(x.id); }}><BrandMark brand={x}/>{x.name}</button></th>
                <td data-label={`${revenueLabel} / เป้า`}>{money(x.revenue)}<small> / {targetText(x.revTarget)}</small></td>
                {v.cash && <td data-label="เงินเข้า">{money(v.cash.byBrand?.[x.id]?.cash)}</td>}
                <td data-label="จังหวะยอด"><Track value={share(x.revenue, x.revTarget)} expected={v.clock?.elapsed} asOfText={asOfText} label="จังหวะยอด" tone={paceTone(x.pace2?.rev?.state)}/><span className={paceTone(x.pace2?.rev?.state)}>{pace(x.pace2?.rev?.value)} {paceLabel(x.pace2?.rev?.state)}</span></td>
                <td data-label="จังหวะงบ"><Track value={share(x.spend, x.budget)} expected={v.clock?.elapsed} asOfText={asOfText} label="จังหวะงบ" tone={paceTone(x.pace2?.budget?.state)}/><span className={paceTone(x.pace2?.budget?.state)}>{pace(x.pace2?.budget?.value)} {paceLabel(x.pace2?.budget?.state, 'spend')}</span></td>
                <td data-label="ROAS">{r == null || spendFrom(v, ads) ? '—' : `${fmtNum(r, 2)}×`}</td>
                <td data-label="คาดปิดเดือน">{money(x.pace2?.rev?.forecast)}</td>
                <td data-label="ควรทำ" className={a?.tone}>{noSales(x) ?? <>{a?.action}{a?.overBudget && <small> · เกินงบแล้ว</small>}</>}</td>
              </tr>); })}
          </tbody>
        </table></div>
      </section>}

      {/* กางตลอด (อาร์ตเคาะ 21 ก.ย. ค่ำ) — WorkspaceTrends มีหัวการ์ดของตัวเองอยู่แล้ว ไม่ต้องห่อซ้ำ */}
      <WorkspaceTrends v={v} brandId={overview ? null : picked.id} sales={real ? ads.sales : null} asOfText={asOfText} spendFrom={spendFrom(v, ads)}/>

      {/* เชิงอรรถทั้งหน้ารวมที่เดียว พับไว้ (สเปก 2026-09-26 · อาร์ตให้เอาออกจากพื้นผิวหลัก) — คงในหน้าเฉพาะข้อความเตือนสถานะข้อมูล */}
      <details className="aw-notes"><summary>สูตรและที่มา</summary><ul>
         <li>ขีดบนแถบ = จังหวะที่ควรถึง{asOfGap}{asOfText}{v.asOf ? ' (วันสุดท้ายที่ยอดขายและค่าแอดครบ — ระบบดึงวันละครั้งตอนเช้า)' : ''} · กดแถวในตารางแบรนด์เพื่อดูแบรนด์นั้น</li>
        {real ? <li>ROAS = ยอดขายจริง ÷ ค่าแอด Meta · %Ads = ค่าแอด Meta ÷ ยอดลูกค้าใหม่ · เงินเข้าต่อค่าแอด = เงินเข้าจากระบบขาย ÷ ค่าแอด Meta (เฉพาะแบรนด์ที่ระบบขายมีเงินเข้า)</li>
          : <li>ROAS = ยอดขาย ÷ ค่าแอด · %Ads = ค่าแอด ÷ ยอดขาย</li>}
        {/* คำชื่อคล้ายแต่คนละฐาน (ชุด C ข้อ 11) — ชื่อบนจอบอกฐานแล้ว ที่นี่อธิบายครั้งเดียว */}
        <li>{real ? 'ROAS (Meta) ในรายละเอียดการ์ดแพลตฟอร์ม' : 'ROAS (Meta) · %Ads (Meta) บนการ์ดแพลตฟอร์ม'} = คิดจากรายได้ที่ Meta เห็น ไม่ใช่ยอดขายจริง (ธุรกิจทักแชท Meta แทบไม่เห็นยอด)</li>
        <li>CPL = ค่าแอด ÷ ผลลัพธ์ที่ Meta นับ (หน้าแคมเปญ · Creative) · ค่าแอดต่อ Lead = ค่าแอด ÷ Lead ในระบบขาย</li>
        <li>CTR ทั้งหมด = ทุกคลิก ÷ การแสดงผล · หน้าแคมเปญและ Creative ใช้ CTR ลิงก์ = คลิกลิงก์ ÷ การแสดงผล</li>
        {real && s.excludedWaiting?.length > 0 && <li>ยอดรวมไม่รวม {s.excludedWaiting.join(' · ')} (รอเชื่อมแหล่งข้อมูลยอดขาย)</li>}
        {real && s.targetExcluded?.length > 0 && <li>เป้ารวมยังไม่รวม {s.targetExcluded.join(' · ')} (ยังไม่ตั้งเป้าเดือนนี้ในหน้าเป้าหมายของระบบขาย)</li>}
        {real && v.overallPipeline?.excluded?.length > 0 && <li>funnel ภาพรวมไม่รวม {v.overallPipeline.excluded.join(' · ')} — ระบบขายของแบรนด์นี้มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) ถ้านับรวมอัตราผ่าน Lead จะต่ำกว่าความจริง · ยอดขายและ ROAS ภาพรวมรวมแบรนด์นี้แล้ว</li>}
        {real && v.cash?.overall?.excluded?.length > 0 && <li>เงินจริงไม่รวม {v.cash.overall.excluded.join(' · ')} — ระบบขายของแบรนด์เหล่านี้ยังไม่ส่งข้อมูลเงินเข้าและมัดจำ</li>}
      </ul></details>

      {!overview && <section className="aw-panel aw-detail">
        <div className="aw-tabs" role="tablist" aria-label="รายละเอียดแบรนด์">
          <button role="tab" aria-selected={tab === 'platform'} onClick={() => setTab('platform')}>แพลตฟอร์ม <span>{head.channels.length}</span></button>
          <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>รายละเอียดแผน</button>
        </div>
        {tab === 'platform'
          ? <div className="aw-channel-grid">{head.channels.length ? head.channels.map(c => <ChannelCard key={c.key} c={c} monthView real={real} asOfText={asOfText}/>) : <p>ไม่มีแพลตฟอร์มในตัวกรองนี้</p>}</div>
          : <dl className="aw-facts aw-plan">
            <div><dt>ยอดขายที่ยังขาดจากจังหวะถึง{asOfGap}{asOfText}</dt><dd>{rev?.gap == null ? '—' : money(Math.max(0, -rev.gap))}</dd></div>
            <div><dt>ยอดขายเทียบจังหวะถึง{asOfGap}{asOfText}</dt><dd>{pace(rev?.value)}</dd></div>
            <div><dt>งบที่ควรใช้ถึง{asOfGap}{asOfText}</dt><dd>{money(p2?.budget?.expectedToDate)}</dd></div>
            <div><dt>ใช้เงินเหนือจังหวะถึง{asOfGap}{asOfText}</dt><dd>{money(p2?.budget?.gap)}</dd></div>
            <div><dt>คาดใช้เกินงบสิ้นเดือน</dt><dd>{money(p2?.budget?.forecastGap)}</dd></div>
            <div><dt>เดือนผ่านไป</dt><dd>{pct(v.clock?.elapsed)}</dd></div>
          </dl>}
      </section>}
    </div>
    </div>}
  </main>;
}
