import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { BrandMark } from './BrandMark.jsx';
import { fmtMoney, fmtPct, fmtNum } from '../dash/charts/theme.js';
import { change, share } from '../adsOverview.js';
import './adsWorkspace.css';
import { WorkspaceTrends } from './WorkspaceTrends.jsx';
import { AdsControlCenter } from './AdsControlCenter.jsx';
import { GoalLine } from '../ui/GoalLine.jsx';
import { AdsSourceControl, AdsSourceNotice } from './AdsSourceControl.jsx';
import { PaceGauge } from './PaceGauge.jsx';
import { paceLabel, paceReason, paceTone } from './paceEngine.js';

const money = n => n == null ? '—' : fmtMoney(n);
const pct = n => n == null ? '—' : fmtPct(n, 1);
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
  const good = d == null || d === 0 ? null : (item?.sense ?? (metric === 'pctAds' ? 'lower' : 'higher')) === 'lower' ? d < 0 : d > 0;
  return <div className="aw-metric">
    <div className="aw-metric-head"><b>{name}</b><small>{sub}</small></div>
    <div className="aw-metric-body">
      <b className="aw-metric-num">{value}</b>
      {!empty && goal?.paceState && <PaceGauge mini width={86} caption="" kind={kind} showValue={false} showState={false}
        pace={{ value: goal.pct, state: goal.paceState, direction: kind }} title={`${name} เทียบเป้า`}/>}
    </div>
    {empty ? <small className="aw-key">{empty}</small> : <div className="aw-metric-foot">
      <GoalLine metric={metric} goal={goal} targetOnly/>
      <span className={tone}><b>{pace(goal?.pct)}</b> {paceLabel(goal?.paceState, kind)}</span>
      <span className={d == null || good == null ? 'ads-muted' : good ? 'ads-good' : 'ads-over'}>
        {d == null ? 'เทียบเดือนก่อนไม่ได้' : `${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d), 2)}%${good == null ? '' : good ? ' ดีขึ้น' : ' แย่ลง'}`}
      </span>
    </div>}
  </div>;
}

function MiniPace({ label, p, spend = false }) {
  return <PaceGauge mini width={96} label={label} caption="" pace={p} kind={spend ? 'spend' : 'higher'} title={`จังหวะ${label}`}/>;
}

/* แถบเป้า (bullet bar) — ขีดคือจังหวะที่ควรถึงวันนี้ ไม่ใช่เส้นตกแต่ง */
function Track({ value, expected, label, tone }) {
  return <div className="aw-track" role="img" aria-label={`${label}: ${pct(value)} · จังหวะวันนี้ ${pct(expected)}`}><i className={tone} style={{width:`${Math.max(0,Math.min(100,(value ?? 0)*100))}%`}} />{expected != null && <em style={{left:`${Math.min(100,expected*100)}%`}} />}</div>;
}

/* หน้า Overview รื้อใหม่ 21 ก.ย. 69 (สเปก docs/superpowers/specs/2026-09-21-overview-redesign.md)
   ตอบ 3 คำถามตามลำดับ: ตอนนี้เป็นยังไง · ต้องระวังอะไร · ควรทำอะไรต่อ
   หน้านี้เป็น "เดือนปัจจุบัน" เสมอ — ตัวเลือกช่วงเวลาไม่มีผลกับหน้านี้ (อาร์ตเคาะ 21 ก.ย.)
   กราฟมีที่เดียวคือบล็อกแนวโน้มซึ่งพับไว้ · หน้าปัดมีอันเดียวคือจังหวะยอดขาย */
export function AdsWorkspace({ v, ads, controls, ChannelCard, SalePipeline, settings, updateAdsControl, toast, selected: selectedProp, onSelect }) {
  const { search } = useLocation();
  const [localSelected, setLocalSelected] = useState(null);
  const selected = onSelect ? selectedProp : localSelected;
  const setSelected = onSelect ?? setLocalSelected;
  const [tab, setTab] = useState('platform');
  const picked = v.brands.find(x => x.id === selected);
  const overview = !picked;
  const s = v.summary;
  const real = ads.source === 'meta_pilot';
  const revenueLabel = v.revenueBasis === 'new' ? 'ยอดใหม่' : 'ยอดรวม';
  const noSales = (row) => row?.salesSource === 'waiting' ? 'รอเชื่อมแหล่งข้อมูล' : row?.salesSource === 'none' ? 'ยังไม่มีข้อมูลยอดขาย' : null;
  const targetText = (value) => value == null ? (real ? 'ยังไม่ตั้งเป้า' : '—') : money(value);

  const head = picked ?? (v.brands.length ? {
    id: 'overview', name: 'ภาพรวมทุกแบรนด์', revenue: s.revenue, revTarget: s.revTarget, spend: s.spend, budget: s.budget,
    revChangePct: s.revChangePct, pctAds: s.pctAds !== undefined ? s.pctAds : share(s.spend, s.revenue), channels: [],
  } : null);
  const p2 = picked ? picked.pace2 : v.overallPace;
  const pipeline = overview ? v.overallPipeline : v.pipelines[picked.id];
  const goals = overview ? v.goals?.overall : v.goals?.byBrand?.[picked?.id];
  const roas = pipeline?.items.find(x => x.key === 'roas')?.value;
  /* ข้อมูลยังมาไม่ครบ ห้ามสรุปว่า "ยังไม่ได้ตั้งเป้า" — กฎเดียวกับหน้า Sync
     (เจอตอนรีวิวตัวเอง 21 ก.ย.: 10 วินาทีแรกการ์ดนี้ประกาศว่า 3 แบรนด์ยังไม่ตั้งเป้า ทั้งที่ตั้งครบ) */
  const loading = real && ads.pilot?.status !== 'ready';
  const actions = overview ? (v.actions ?? []) : (v.actions ?? []).filter(a => a.brandId === picked.id);

  if (new URLSearchParams(search).get('panel') === 'settings') {
    return <AdsControlCenter brands={v.brands} saved={settings?.ads_control} onSave={updateAdsControl} toast={toast}/>;
  }
  if (!head) return <main className="aw"><section className="aw-panel">ไม่มีแบรนด์ในขอบเขตที่เลือก</section></main>;

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
      <header className="aw-header"><div><h1>Overview ads</h1><p>เดือนปัจจุบัน · ยอดขาย งบ และประสิทธิภาพรวมทุกแบรนด์</p></div>
        <div className="aw-header-actions"><AdsSourceControl ads={ads}/><Link className="aw-settings-link" to="/mkt/ads?panel=settings"><Settings2 size={15}/> ตั้งค่า</Link></div></header>
      <AdsSourceNotice ads={ads}/><div className="aw-controls">{controls}</div>
    </section>

    <div className="aw-layout">
      {/* ฝั่งซ้าย = ตัวเลือกแบรนด์ (ยอด + จังหวะ แบบย่อ) · ตารางข้างล่าง = เทียบละเอียดทีละคอลัมน์ คนละหน้าที่กัน */}
      <aside className="aw-brands">
        <div className="aw-section-label">พอร์ตแบรนด์ <span>{v.brands.length}</span></div>
        <p>{revenueLabel}และเป้ารวมเดือนปัจจุบัน</p>
        <button type="button" className={`aw-brand ${overview ? 'selected' : ''}`} aria-pressed={overview} onClick={() => setSelected(null)}>
          <div><strong>ภาพรวมทุกแบรนด์</strong><span>↗</span></div>
          <b>{money(s.revenue)}</b><small> {revenueLabel}เดือนปัจจุบัน</small>
          <div className="aw-minirow"><MiniPace label="ยอด" p={v.overallPace?.rev}/><MiniPace label="ค่าแอด" p={v.overallPace?.budget} spend/></div>
        </button>
        {v.brands.map(x => <button key={x.id} type="button" className={`aw-brand ${x.id === picked?.id ? 'selected' : ''}`} aria-pressed={x.id === picked?.id} onClick={() => setSelected(x.id)}>
          <div><BrandMark brand={x}/><strong>{x.name}</strong><span>↗</span></div>
          <div><b>{money(x.revenue)}</b><small>{pace(share(x.revenue, x.revTarget))} ของเป้ารวม</small></div>
          {noSales(x) ? <small className="zinc">{noSales(x)}</small> : <>
            <div className="aw-minirow"><MiniPace label="ยอด" p={x.pace2?.rev}/><MiniPace label="ค่าแอด" p={x.pace2?.budget} spend/></div>
          </>}
        </button>)}
        <div className="aw-key">ขีดบนแถบ = จังหวะที่ควรถึงวันนี้</div>
      </aside>

    <div className="aw-content">
      <div className="aw-top">
        <section className="aw-hero">
          <div className="aw-hero-top"><div className="aw-brand-title">{!overview && <BrandMark brand={head}/>}<h2>{head.name}</h2></div></div>
          <div className="aw-hero-grid">
            <div>
              <span className="aw-eyebrow">{revenueLabel}เดือนปัจจุบัน{real ? ' · จากระบบขาย' : ''}</span>
              <div className="aw-revenue">{money(head.revenue)}</div>
              <p>{noSales(head) ? <b>{noSales(head)}</b> : <>{revenueLabel === 'ยอดใหม่' ? 'จากเป้ารวม' : 'จากเป้า'} <b>{targetText(head.revTarget)}</b>{head.revTarget != null && <span> · ทำได้ {pace(share(head.revenue, head.revTarget))}</span>}</>}</p>
              <Track value={share(head.revenue, head.revTarget)} expected={v.clock?.elapsed} tone={paceTone(rev?.state)} label="ยอดขายเทียบเป้า"/>
              <dl className="aw-facts">
                <div><dt>ควรถึงวันนี้</dt><dd>{money(rev?.expectedToDate)}</dd></div>
                <div><dt>คาดปิดเดือน</dt><dd>{money(rev?.forecast)}</dd></div>
                <div><dt>{rev?.forecastGap == null ? 'เทียบเป้า' : rev.forecastGap < 0 ? 'คาดต่ำกว่าเป้า' : 'คาดเหนือเป้า'}</dt><dd>{rev?.forecastGap == null ? '—' : money(Math.abs(rev.forecastGap))}</dd></div>
                <div><dt>เทียบเดือนก่อน</dt><dd>{head.revChangePct == null ? '—' : `${head.revChangePct >= 0 ? '+' : ''}${fmtNum(head.revChangePct, 2)}%`}</dd></div>
              </dl>
              {overview && real && s.excludedWaiting?.length > 0 && <p className="aw-key">ไม่รวม {s.excludedWaiting.join(' · ')} (รอเชื่อมแหล่งข้อมูลยอดขาย)</p>}
              {overview && real && s.targetExcluded?.length > 0 && <p className="aw-key">เป้ารวมยังไม่รวม {s.targetExcluded.join(' · ')} (ยังไม่ตั้งเป้าเดือนนี้ในหน้าเป้าหมายของระบบขาย)</p>}
            </div>
            <PaceGauge pace={rev} width={GAUGE_W}/>
          </div>
          {decide && <p className={`aw-decide ${decide.tone}`}><b>{decide.text}</b>{decide.more && <span> — {decide.more}</span>}</p>}
        </section>

        <section className="aw-panel aw-actions" aria-labelledby="aw-actions-title">
          <div className="aw-section-label" id="aw-actions-title">สิ่งที่ต้องทำวันนี้ {!loading && actions.length > 0 && <span>{actions.length}</span>}</div>
          {loading
            ? <p className="aw-key">กำลังตรวจข้อมูล…</p>
            : actions.length === 0
            ? <p className="aw-key">ยังไม่มีเรื่องที่ต้องลงมือ — ทุกแบรนด์อยู่ในจังหวะที่รับได้</p>
            : <ul className="aw-action-list">{actions.map(item => <li key={item.key} className={item.level}>
              <span className={`aw-dot ${item.tone}`} aria-hidden="true" />
              <span className="aw-action-text"><b>{item.title}</b><small>{item.detail}</small></span>
              {item.brandId && item.brandId !== picked?.id && <button type="button" onClick={() => setSelected(item.brandId)}>ดูแบรนด์</button>}
            </li>)}</ul>}
          {!loading && overview && (v.actionsTotal ?? 0) > actions.length && <p className="aw-key">และอีก {v.actionsTotal - actions.length} เรื่อง — ดูในตารางแบรนด์และหน้า Creative</p>}
        </section>
      </div>

      <div className="aw-middle">
        <section className="aw-panel">
          <div className="aw-section-label">{real ? 'งบโฆษณา Meta' : 'งบโฆษณา'} <span className={paceTone(p2?.budget?.state)}>{head.budget == null && real ? 'ยังไม่ตั้งเป้างบ' : paceLabel(p2?.budget?.state, 'spend')}</span></div>
          <div className="aw-card-grid">
            <div>
              <div className="aw-spend">{money(head.spend)} <small>/ {targetText(head.budget)}</small></div>
                  <Track value={share(head.spend, head.budget)} expected={v.clock?.elapsed} tone={paceTone(p2?.budget?.state)} label="ใช้เงินเทียบงบ"/>
              <dl className="aw-facts">
                <div><dt>ควรใช้วันนี้</dt><dd>{money(p2?.budget?.expectedToDate)}</dd></div>
                <div><dt>งบคงเหลือ</dt><dd>{money(p2?.budget?.remaining)}</dd></div>
                <div><dt>คาดใช้สิ้นเดือน</dt><dd>{money(p2?.budget?.forecast)}</dd></div>
                <div><dt>เหลือเวลา</dt><dd>{v.clock?.daysLeft == null ? '—' : `${v.clock.daysLeft} วัน`}</dd></div>
              </dl>
            </div>
            <PaceGauge pace={p2?.budget} kind="spend" title="จังหวะใช้งบ" caption="ของงบที่ควรใช้วันนี้" width={GAUGE_W}/>
          </div>
          {p2?.budget?.reason === 'stale' && <p className="aw-key">ค่าแอดมีถึง {v.spendThrough} — ยังตัดสินจังหวะงบไม่ได้</p>}
        </section>

        <section className="aw-panel aw-efficiency">
          <div className="aw-section-label">ประสิทธิภาพ{real && <span className="zinc">คิดจากค่าแอด Meta</span>}</div>
          <div className="aw-metrics">
            <Metric name="ROAS" sub="เดือนนี้" value={roas == null ? '—' : `${fmtNum(roas, 2)}×`}
              goal={goals?.roas} metric="roas" empty={roas == null ? noSales(head) : null}
              item={pipeline?.items.find(i => i.key === 'roas')}/>
            <Metric name="%Ads" sub={real ? 'ต่อยอดลูกค้าใหม่' : 'เดือนนี้'} value={pct(head.pctAds)}
              goal={goals?.pctAds} metric="pctAds" empty={head.pctAds == null ? noSales(head) : null}
              item={pipeline?.items.find(i => i.key === 'pctAds')}/>
          </div>
          <details className="aw-formula"><summary>สูตรที่ใช้</summary>{real ? <p>ROAS = ยอดขายจริง ÷ ค่าแอด Meta<br/>%Ads = ค่าแอด Meta ÷ ยอดลูกค้าใหม่</p> : <p>ROAS = ยอดขาย ÷ ค่าแอด<br/>%Ads = ค่าแอด ÷ ยอดขาย</p>}</details>
        </section>
      </div>

      <section className="aw-panel aw-journey">
        <div className="aw-section-label">จากความสนใจ สู่ยอดขาย <span>เดือนนี้</span></div>
        <SalePipeline row items={(pipeline?.items ?? []).slice(0, 4)} worstKey={pipeline?.worstKey} goals={goals} gauge/>
        {real && overview && pipeline?.excluded?.length > 0 && <p className="aw-key">ไม่รวม {pipeline.excluded.join(' · ')} — ระบบขายของแบรนด์นี้มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) ถ้านับรวมอัตราผ่าน Lead จะต่ำกว่าความจริง · ยอดขายและ ROAS ภาพรวมรวมแบรนด์นี้แล้ว</p>}
      </section>

      <section className="aw-panel" aria-labelledby="aw-brands-title">
        <div className="aw-section-label" id="aw-brands-title">แบรนด์ <span>{v.brands.length}</span></div>
        <div className="aw-table-scroll"><table className="aw-comparison aw-brandtable">
          <thead><tr><th>แบรนด์</th><th>{revenueLabel} / เป้า</th><th>จังหวะยอด</th><th>จังหวะงบ</th><th>ROAS</th><th>คาดปิดเดือน</th><th>ควรทำ</th></tr></thead>
          <tbody>
            <tr className={`aw-row ${overview ? 'selected' : ''}`} onClick={() => setSelected(null)}><th><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(null); }}>ภาพรวมทุกแบรนด์</button></th>
              <td>{money(s.revenue)}<small> / {targetText(s.revTarget)}</small></td>
              <td><Track value={share(s.revenue, s.revTarget)} expected={v.clock?.elapsed} label="จังหวะยอด" tone={paceTone(v.overallPace?.rev?.state)}/><span className={paceTone(v.overallPace?.rev?.state)}>{pace(v.overallPace?.rev?.value)}</span></td>
              <td><Track value={share(s.spend, s.budget)} expected={v.clock?.elapsed} label="จังหวะงบ" tone={paceTone(v.overallPace?.budget?.state)}/><span className={paceTone(v.overallPace?.budget?.state)}>{pace(v.overallPace?.budget?.value)}</span></td>
              <td>{(() => { const r = v.overallPipeline?.items.find(i => i.key === 'roas')?.value; return r == null ? '—' : `${fmtNum(r, 2)}×`; })()}</td>
              <td>{money(v.overallPace?.rev?.forecast)}</td>
              <td className={v.overallPace?.advice?.tone}>{v.overallPace?.advice?.action}{v.overallPace?.advice?.overBudget && <small> · เกินงบแล้ว</small>}</td></tr>
            {v.brands.map(x => { const r = v.pipelines[x.id]?.items.find(i => i.key === 'roas')?.value; const a = x.pace2?.advice; return (
              /* ทั้งแถวกดได้ตามที่คำอธิบายใต้ตารางบอก — ปุ่มที่ชื่อยังอยู่เพื่อให้ไล่ด้วยคีย์บอร์ดได้ */
              <tr key={x.id} className={`aw-row ${x.id === picked?.id ? 'selected' : ''}`} onClick={() => setSelected(x.id)}>
                <th><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(x.id); }}><BrandMark brand={x}/>{x.name}</button></th>
                <td>{money(x.revenue)}<small> / {targetText(x.revTarget)}</small></td>
                <td><Track value={share(x.revenue, x.revTarget)} expected={v.clock?.elapsed} label="จังหวะยอด" tone={paceTone(x.pace2?.rev?.state)}/><span className={paceTone(x.pace2?.rev?.state)}>{pace(x.pace2?.rev?.value)}</span></td>
                <td><Track value={share(x.spend, x.budget)} expected={v.clock?.elapsed} label="จังหวะงบ" tone={paceTone(x.pace2?.budget?.state)}/><span className={paceTone(x.pace2?.budget?.state)}>{pace(x.pace2?.budget?.value)}</span></td>
                <td>{r == null ? '—' : `${fmtNum(r, 2)}×`}</td>
                <td>{money(x.pace2?.rev?.forecast)}</td>
                <td className={a?.tone}>{noSales(x) ?? <>{a?.action}{a?.overBudget && <small> · เกินงบแล้ว</small>}</>}</td>
              </tr>); })}
          </tbody>
        </table></div>
        <p className="aw-key">ขีดบนแถบ = จังหวะที่ควรถึงวันนี้ · กดแถวเพื่อดูแบรนด์นั้น</p>
      </section>

      <details className="aw-panel aw-trends-fold">
        <summary><span className="aw-section-label">ตัวชี้วัดและแนวโน้ม</span><small>{head.revChangePct == null ? 'เทียบเดือนก่อนไม่ได้' : `${revenueLabel}${head.revChangePct >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${fmtNum(Math.abs(head.revChangePct), 2)}% จากเดือนก่อน`} · กดเพื่อดูกราฟ</small></summary>
        <WorkspaceTrends v={v} brandId={overview ? null : picked.id} sales={real ? ads.sales : null}/>
      </details>

      {!overview && <section className="aw-panel aw-detail">
        <div className="aw-tabs" role="tablist" aria-label="รายละเอียดแบรนด์">
          <button role="tab" aria-selected={tab === 'platform'} onClick={() => setTab('platform')}>แพลตฟอร์ม <span>{head.channels.length}</span></button>
          <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>รายละเอียดแผน</button>
        </div>
        {tab === 'platform'
          ? <div className="aw-channel-grid">{head.channels.length ? head.channels.map(c => <ChannelCard key={c.key} c={c} monthView/>) : <p>ไม่มีแพลตฟอร์มในตัวกรองนี้</p>}</div>
          : <dl className="aw-facts aw-plan">
            <div><dt>ยอดขายที่ยังขาดจากจังหวะวันนี้</dt><dd>{rev?.gap == null ? '—' : money(Math.max(0, -rev.gap))}</dd></div>
            <div><dt>ยอดขายเทียบจังหวะวันนี้</dt><dd>{pace(rev?.value)}</dd></div>
            <div><dt>งบที่ควรใช้ถึงวันนี้</dt><dd>{money(p2?.budget?.expectedToDate)}</dd></div>
            <div><dt>ใช้เงินเหนือจังหวะวันนี้</dt><dd>{money(p2?.budget?.gap)}</dd></div>
            <div><dt>คาดใช้เกินงบสิ้นเดือน</dt><dd>{money(p2?.budget?.forecastGap)}</dd></div>
            <div><dt>เดือนผ่านไป</dt><dd>{pct(v.clock?.elapsed)}</dd></div>
          </dl>}
      </section>}
    </div>
    </div>
  </main>;
}
