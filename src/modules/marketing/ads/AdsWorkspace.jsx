import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { BrandMark } from './BrandMark.jsx';
import { fmtMoney, fmtPct } from '../dash/charts/theme.js';
import { salesPaceStatus, paceStatus, adsSalePipeline, share } from '../adsOverview.js';
import './adsWorkspace.css';
import { WorkspaceTrends } from './WorkspaceTrends.jsx';
import { AdsControlCenter } from './AdsControlCenter.jsx';

const money = n => n == null ? '—' : fmtMoney(n);
const pct = n => n == null ? '—' : fmtPct(n, 1);
function Track({ value, expected, label, tone }) {
  return <div className="aw-track" role="img" aria-label={`${label}: ${pct(value)} · จังหวะวันนี้ ${pct(expected)}`}><i className={tone} style={{width:`${Math.max(0,Math.min(100,(value ?? 0)*100))}%`}} />{expected != null && <em style={{left:`${Math.min(100,expected*100)}%`}} />}</div>;
}
export function AdsWorkspace({ v, controls, ChannelCard, SalePipeline, settings, updateAdsControl, toast }) {
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('platform');
  const picked = v.brands.find(x=>x.id===selected);
  const overview = !picked;
  const s = v.summary;
  const b = picked ?? (v.brands.length ? {...s, id:'overview',name:'ภาพรวมทุกแบรนด์',pctAds:share(s.spend,s.revenue),channels:[],revPace:{...s.revPace,expectedToDate:s.revPace.expectedSpend,pctOfExpected:s.revPctOfExpected,forecastVsTarget:s.revPace.forecastOver,behind:s.revPace.vsPace==null?null:-s.revPace.vsPace}} : null);
  const pipeline = overview ? adsSalePipeline(v.scoped,v.range,v.before) : v.pipelines[b.id];
  const rst = b ? salesPaceStatus(b.revPace.pctOfExpected) : null;
  const bst = b ? paceStatus(b.pace) : null;
  const roas = pipeline?.items.find(x=>x.key==='roas')?.value;
  if (new URLSearchParams(window.location.search).get('panel') === 'settings') {
    return <AdsControlCenter brands={v.brands} saved={settings?.ads_control} onSave={updateAdsControl} toast={toast}/>;
  }
  return <main className="aw">
    <header className="aw-header"><h1>Overview ads</h1><a className="aw-settings-link" href="/mkt/ads?design=workspace&panel=settings"><Settings2 size={15}/> ตั้งค่า</a></header>
    <div className="aw-controls">{controls}<span className="aw-demo"><i/> Mock data</span></div>
    <div className="aw-layout">
      <aside className="aw-brands"><div className="aw-section-label">พอร์ตแบรนด์ <span>{v.brands.length}</span></div><p>ยอดขายและเป้าเดือนปัจจุบัน</p>{<button type="button" className={`aw-brand ${overview?'selected':''}`} aria-pressed={overview} onClick={()=>setSelected(null)}><div><strong>ภาพรวมทุกแบรนด์</strong><span>↗</span></div><b>{money(s.revenue)}</b><small> ยอดขายเดือนปัจจุบัน</small></button>}{v.brands.map(x=>{const st=salesPaceStatus(x.revPace.pctOfExpected);return <button key={x.id} type="button" className={`aw-brand ${x.id===b?.id?'selected':''}`} onClick={()=>setSelected(x.id)} aria-pressed={x.id===b?.id}><div><BrandMark brand={x}/><strong>{x.name}</strong><span>↗</span></div><div><b>{money(x.revenue)}</b><small>{pct(x.revPct)} ของเป้า</small></div><Track value={x.revPct} expected={x.pace.expected} label={x.name} tone={st.tone}/><small className={st.tone}>{st.text}</small></button>})}<div className="aw-key">ขีดบนแถบ = จังหวะที่ควรถึงวันนี้</div></aside>
      {b ? <div className="aw-content">
        <section className="aw-hero"><div className="aw-hero-top"><div className="aw-brand-title">{!overview&&<BrandMark brand={b}/>}<h2>{b.name}</h2></div><span className={`aw-status ${rst.tone}`}>{rst.text}</span></div>
          <div className="aw-hero-grid"><div><span className="aw-eyebrow">ยอดขายเดือนปัจจุบัน</span><div className="aw-revenue">{money(b.revenue)}</div><p>จากเป้า <b>{money(b.revTarget)}</b> <span>· ทำได้ {pct(b.revPct)}</span></p><Track value={b.revPct} expected={b.pace.expected} tone={rst.tone} label="ยอดขายเทียบเป้า"/><div className="aw-hero-foot"><span>ควรได้วันนี้ {money(b.revPace.expectedToDate)}</span><span>{b.revChangePct==null?'เทียบเดือนก่อนไม่ได้':`${b.revChangePct>=0?'+':''}${b.revChangePct.toFixed(1)}% เทียบเดือนก่อน`}</span></div></div>
          <div className="aw-forecast"><span>หากรักษาจังหวะปัจจุบัน</span><h3>{money(b.revPace.forecast)}</h3><p>คาดการณ์ยอดขายสิ้นเดือน</p><strong className={b.revPace.forecastVsTarget<0?'rose':'emerald'}>{b.revPace.forecastVsTarget==null?'ยังประเมินเทียบเป้าไม่ได้':`${b.revPace.forecastVsTarget<0?'ต่ำกว่าเป้า':'เหนือเป้า'} ${money(Math.abs(b.revPace.forecastVsTarget))}`}</strong><small>คาดการณ์จากค่าเฉลี่ยสะสม ไม่รวมการเปลี่ยนแผนในอนาคต</small></div></div>
        </section>
        <div className="aw-middle"><section className="aw-panel"><div className="aw-section-label">งบโฆษณา <span className={bst.tone}>{bst.text}</span></div><div className="aw-spend">{money(b.spend)} <small>/ {money(b.budget)}</small></div><Track value={b.pace.used} expected={b.pace.expected} tone={bst.tone} label="ใช้เงินเทียบงบ"/><dl className="aw-facts"><div><dt>งบคงเหลือ</dt><dd>{money(b.pace.remaining)}</dd></div><div><dt>เฉลี่ยต่อวัน</dt><dd>{money(b.pace.average)}</dd></div><div><dt>คาดใช้สิ้นเดือน</dt><dd>{money(b.pace.forecast)}</dd></div><div><dt>เหลือเวลา</dt><dd>{b.pace.daysLeft} วัน</dd></div></dl></section>
        <section className="aw-panel aw-efficiency"><div className="aw-section-label">ประสิทธิภาพ</div><div><span>ROAS <small>ช่วงที่เลือก</small></span><b>{roas==null?'—':`${roas.toFixed(1)}×`}</b></div><div><span>%Ads <small>เดือนปัจจุบัน</small></span><b>{pct(b.pctAds)}</b></div><p>ROAS = ยอดขาย ÷ ค่าแอด<br/>%Ads = ค่าแอด ÷ ยอดขาย</p></section></div>
        {overview && <section className="aw-panel"><div className="aw-section-label">เปรียบเทียบแบรนด์ <span>ยอดขายและงบเดือนปัจจุบัน · ROAS ช่วงที่เลือก</span></div><div className="aw-table-scroll"><table className="aw-comparison"><thead><tr><th>แบรนด์</th><th>ยอดขาย / เป้า</th><th>จังหวะยอดขาย</th><th>จังหวะงบ</th><th>ROAS</th><th>สถานะยอดขาย</th></tr></thead><tbody>{v.brands.map(x=>{const st=salesPaceStatus(x.revPace.pctOfExpected);const r=v.pipelines[x.id]?.items.find(i=>i.key==='roas')?.value;return <tr key={x.id}><th><button onClick={()=>setSelected(x.id)}>{x.name} ↗</button></th><td>{money(x.revenue)}<small> / {money(x.revTarget)}</small></td><td><Track value={x.revPct} expected={x.pace.expected} label="ยอดขาย" tone={st.tone}/>{pct(x.revPct)}</td><td><Track value={x.pace.used} expected={x.pace.expected} label="งบ" tone={paceStatus(x.pace).tone}/>{pct(x.pace.used)}</td><td>{r==null?'—':`${r.toFixed(1)}×`}</td><td className={st.tone}>{st.text}</td></tr>})}</tbody></table></div></section>}
        <WorkspaceTrends v={v} brandId={overview?null:b.id}/>
        <section className="aw-panel aw-journey"><div className="aw-section-label">จากความสนใจ สู่ยอดขาย <span>ช่วงที่เลือก</span></div><SalePipeline row items={(pipeline?.items??[]).slice(0,4)} worstKey={pipeline?.worstKey}/>{pipeline?.estimated&&<p className="aw-key">Lead มัดจำ และออเดอร์เป็นข้อมูลจำลอง จนกว่าจะเชื่อม CRM</p>}</section>
        {!overview && <section className="aw-panel aw-detail"><div className="aw-tabs" role="tablist" aria-label="รายละเอียดแบรนด์"><button role="tab" aria-selected={tab==='platform'} onClick={()=>setTab('platform')}>แพลตฟอร์ม <span>{b.channels.length}</span></button><button role="tab" aria-selected={tab==='plan'} onClick={()=>setTab('plan')}>รายละเอียดแผน</button></div>{tab==='platform'?<div className="aw-channel-grid">{b.channels.length?b.channels.map(c=><ChannelCard key={c.key} c={c}/>):<p>ไม่มีแพลตฟอร์มในตัวกรองนี้</p>}</div>:<dl className="aw-facts aw-plan"><div><dt>ยอดขายที่ยังขาดจากจังหวะวันนี้</dt><dd>{money(b.revPace.behind)}</dd></div><div><dt>ยอดขายเทียบจังหวะวันนี้</dt><dd>{pct(b.revPace.pctOfExpected)}</dd></div><div><dt>งบที่ควรใช้ถึงวันนี้</dt><dd>{money(b.pace.expectedSpend)}</dd></div><div><dt>ใช้เงินเหนือจังหวะวันนี้</dt><dd>{money(b.pace.vsPace)}</dd></div><div><dt>คาดใช้เกินงบสิ้นเดือน</dt><dd>{money(b.pace.forecastOver)}</dd></div><div><dt>เดือนผ่านไป</dt><dd>{pct(b.pace.expected)}</dd></div></dl>}</section>}
      </div>:<section className="aw-panel">ไม่มีแบรนด์ในขอบเขตที่เลือก</section>}
    </div>
  </main>;
}
