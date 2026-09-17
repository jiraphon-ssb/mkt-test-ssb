import { useMemo, useState } from 'react';
import { adsMetricBoard, adsRevenue, adsSalePipeline, adsChannelList, filterByChannel, change, share } from '../adsOverview.js';
import { ChartBox } from '../dash/charts/ChartBox.jsx';
import { baseOpts, fmtMoney, fmtPct, fmtCompact, lineSeries, barSeries, dayLabel, fmtNum, fmtInt } from '../dash/charts/theme.js';
import { Dropdown } from '../ui/Dropdown.jsx';
import { isoDay } from '../adsScope.js';
import { SALES_TREND_KEYS, SPEND_TREND_KEYS, salesTrendValue } from './salesOverview.js';
import { metricCoverage } from './salesFacts.js';
import { SALES_BRAND_IDS } from './syncSources.js';
import { ADDITIVE_TREND_KEYS, TREND_MODES, canCumulate, cumulativeSeries, targetPaceSeries } from './trendSeries.js';
/* 8 ตัวแรกเป็นแท็บ (เส้นทางขาย: ค่าแอด → ยอดขาย → คนทัก → Lead → ได้ออเดอร์ → ยืนยันออเดอร์) · ที่เหลืออยู่ในเมนู */
const metrics = [['spend','ค่าแอด'],['revenue','ยอดขาย'],['roas','ROAS'],['inquiry','คนทัก'],['leads','Lead'],['deposits','ได้ออเดอร์'],['orders','ยืนยันออเดอร์'],['cpl','CPL'],['cac','CAC'],['pctAds','%Ads'],['ctr','CTR'],['cpc','CPC'],['cpm','CPM'],['impressions','Impressions'],['frequency','Frequency']];
const TABS=8;
const COUNT_KEYS=['inquiry','leads','deposits','orders','impressions'];
const colors = ['#298362','#477bc0','#ce8650','#9865b6','#ce657d'];
const COMPARE='#8f9693', TARGET='#c9a23f';
const MODE_KEY='aw-trend-mode';
function valueFor(cards, range, key) {
  if(key==='revenue') return adsRevenue(cards,range);
  if(['inquiry','leads','deposits','orders','pctAds','cac'].includes(key)){
    const items=adsSalePipeline(cards,range).items;
    const item=(k)=>items.find(i=>i.key===k)?.value ?? null;
    if(key==='cac') return share(adsMetricBoard(cards,range).find(m=>m.key==='spend')?.value ?? null,item('closed'));
    return item({inquiry:'inquiries',leads:'qualified',deposits:'deposits',orders:'closed',pctAds:'pctAds'}[key]);
  }
  return adsMetricBoard(cards,range).find(m=>m.key===key)?.value ?? null;
}
function dates(range) {
  const out=[];
  for(let d=new Date(range.start);d<new Date(range.end);d.setDate(d.getDate()+1)) out.push(d.toISOString());
  return out;
}
const nextDay=(iso)=>{const end=new Date(iso);end.setDate(end.getDate()+1);return end.toISOString();};
/* ข้อมูลจริง: ยอดขาย · ROAS · คนทัก · Lead · ออเดอร์ · CPL · CAC · %Ads มาจากระบบขาย (นิยามเดียวกับ hero/funnel ด้านบน) ค่าแอดหารจาก Meta ทุกช่องทาง
   src = { sales, brandIds, spendCards, basis, coverage } · ไม่มี src = ของ Meta ตามเดิม (ข้อมูลจำลอง / แท็บ CTR CPC CPM ฯลฯ) */
function metricValue(cards, range, key, src) {
  if(!src) return valueFor(cards,range,key);
  const spend=SPEND_TREND_KEYS.includes(key)?adsMetricBoard(src.spendCards,range).find(m=>m.key==='spend')?.value ?? null:null;
  return salesTrendValue({sales:src.sales,key,brandIds:src.brandIds,spend,basis:src.basis,coverage:src.coverage,from:isoDay(new Date(range.start)),to:isoDay(new Date(new Date(range.end)-1))});
}
function series(cards, days, key, src) {
  return days.map(start=>metricValue(cards,{start,end:nextDay(start)},key,src));
}
/* สะสม: จุดที่ i = ค่าของช่วง "ต้นช่วง → วันที่ i" (อัตราส่วนคิดใหม่จากยอดรวม ไม่ใช่บวกค่ารายวัน) · วันหลังวันนี้ = ว่าง */
function running(cards, days, key, src, lastIndex) {
  const daily=series(cards,days,key,src);
  return {daily,data:cumulativeSeries({key,daily,lastIndex,valueThrough:i=>metricValue(cards,{start:days[0],end:nextDay(days[i])},key,src)})};
}
const format=(key,n)=>n==null?'—':['ctr','pctAds'].includes(key)?fmtPct(n):['roas','frequency'].includes(key)?`${fmtNum(n, 2)}×`:COUNT_KEYS.includes(key)?fmtInt(n):fmtMoney(n);
const tick=(key,n)=>['ctr','pctAds'].includes(key)?`${fmtNum(n*100,1)}%`:['roas','frequency'].includes(key)?`${n}×`:fmtCompact(n);
const readMode=()=>{try{const m=localStorage.getItem(MODE_KEY);return TREND_MODES.some(([k])=>k===m)?m:'line';}catch{return 'line';}};
const SALES_NOTE={inquiry:'จากระบบขาย · คนทักที่ทีมขายกรอก',revenue:'จากระบบขาย',leads:'จากระบบขาย',deposits:'จากระบบขาย · ได้ออเดอร์ = เข้าสเตจออกแบบครั้งแรก',orders:'จากระบบขาย · ยืนยันออเดอร์ = รับรู้ยอด',roas:'ยอดขายจริง ÷ ค่าแอด Meta',cpl:'ค่าแอด Meta ÷ Lead ในระบบขาย',cac:'ค่าแอด Meta ÷ ออเดอร์ลูกค้าใหม่ในระบบขาย',pctAds:'ค่าแอด Meta ÷ ยอดลูกค้าใหม่ในระบบขาย'};
/* เป้ารายเดือนของตัวที่บวกได้ — ค่าแอด = งบ (ภาพรวมต้องตั้งครบทุกแบรนด์ เพราะเส้นค่าแอดรวมทุกแบรนด์) · ที่เหลือจากเป้าระบบขาย */
function monthTarget(v, brandId, key) {
  const row=brandId?v.brands.find(b=>b.id===brandId):v.summary;
  const goals=brandId?v.goals?.byBrand?.[brandId]:v.goals?.overall;
  if(key==='spend') return brandId?row?.budget ?? null:v.brands.length&&v.brands.every(b=>b.budget>0)?v.brands.reduce((n,b)=>n+b.budget,0):null;
  if(key==='revenue') return row?.revTarget ?? null;
  const goalKey={inquiry:'inquiries',leads:'qualified',deposits:'deposits',orders:'closed'}[key];
  return goalKey?goals?.[goalKey]?.monthTarget ?? null:null;
}
const dateLabel=(iso)=>new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH',{day:'numeric',month:'short'});
export function WorkspaceTrends({v,brandId,sales=null}) {
  const [key,setKey]=useState('spend');
  const [split,setSplit]=useState(false);
  const [chosenMode,setChosenMode]=useState(readMode);
  const chooseMode=(m)=>{setChosenMode(m);try{localStorage.setItem(MODE_KEY,m);}catch{/* โหมดส่วนตัว — ไม่จำก็ได้ */}};
  // Frequency สะสมไม่ได้ → แสดงรายวันแทน (ไม่ล้างค่าที่เลือกไว้ กลับไปแท็บอื่นยังเป็นสะสม)
  const mode=chosenMode==='cumulative'&&!canCumulate(key)?'line':chosenMode;
  const fromSales=Boolean(sales)&&SALES_TREND_KEYS.includes(key);
  // ยอดขายไม่แยกตามแพลตฟอร์มโฆษณา → หน้าแบรนด์ แท็บของระบบขาย แยกแพลตฟอร์มไม่ได้
  const canSplit=!(fromSales&&brandId);
  const waiting=fromSales&&(brandId?!SALES_BRAND_IDS.includes(brandId):!v.brands.some(b=>SALES_BRAND_IDS.includes(b.id)));
  const coverage=useMemo(()=>sales?metricCoverage(sales):null,[sales]);
  const result=useMemo(()=>{
    const cards=brandId?v.scoped.filter(c=>c.brand_id===brandId):v.scoped;
    const srcFor=(ids)=>{const brandIds=ids.filter(id=>SALES_BRAND_IDS.includes(id));return fromSales?{sales,brandIds,basis:v.revenueBasis,coverage,spendCards:(v.scopedAll??v.scoped).filter(c=>brandIds.includes(c.brand_id))}:null;};
    const main=srcFor(brandId?[brandId]:v.brands.map(b=>b.id));
    const days=dates(v.range), priorDays=dates(v.before);
    // วันนี้ยังไม่จบ — เส้น/แท่งช่วงท้ายเป็นสีจาง (ช่วงเทียบเป็นวันที่จบแล้ว ไม่ต้อง)
    const todayIso=isoDay(new Date());
    const openAt=days.findIndex(d=>isoDay(new Date(d))===todayIso);
    const lastIndex=(()=>{const i=days.findIndex(d=>isoDay(new Date(d))>todayIso);return i<0?null:i-1;})();
    const build=(c,ds,src,last)=>mode==='cumulative'?running(c,ds,key,src,last):{daily:null,data:series(c,ds,key,src)};
    const groups=brandId?adsChannelList(cards).map(name=>({name,cards:filterByChannel(cards,name),src:null})):v.brands.map(b=>({name:fromSales&&!SALES_BRAND_IDS.includes(b.id)?`${b.name} (รอเชื่อม)`:b.name,cards:cards.filter(c=>c.brand_id===b.id),src:srcFor([b.id])}));
    const current=metricValue(cards,v.range,key,main),before=metricValue(cards,v.before,key,main);
    const splitOn=split&&canSplit;
    const datasets=splitOn?groups.map((g,i)=>({kind:'main',label:g.name,color:colors[i%colors.length],...build(g.cards,days,g.src,lastIndex)}))
      :[{kind:'main',label:'ช่วงนี้',color:colors[0],...build(cards,days,main,lastIndex)},{kind:'compare',label:'ช่วงเทียบ',color:COMPARE,...(()=>{const r=build(cards,priorDays,main,null);return {data:r.data.slice(0,days.length),daily:r.daily?.slice(0,days.length) ?? null};})()}];
    // เส้นเป้าตามจังหวะ: เฉพาะโหมดสะสม · ช่วง "เดือนนี้" · ไม่แยกกลุ่ม · ตัวที่บวกได้และมีเป้า
    const target=mode==='cumulative'&&v.monthView&&!splitOn&&ADDITIVE_TREND_KEYS.includes(key)&&!waiting?monthTarget(v,brandId,key):null;
    const pace=targetPaceSeries(days,target);
    if(pace) datasets.push({kind:'target',label:'เป้าตามจังหวะ',color:TARGET,data:pace,daily:null});
    const paceToday=pace?pace[lastIndex ?? pace.length-1]:null;
    return {days,priorDays,datasets,current,before,delta:change(current,before),openFrom:openAt>0?openAt:null,target,paceToday,splitOn};
  },[v,brandId,key,split,sales,fromSales,canSplit,mode,coverage,waiting]);
  const depositsSince=key==='deposits'&&coverage?(()=>{const ids=(brandId?[brandId]:v.brands.map(b=>b.id)).filter(id=>SALES_BRAND_IDS.includes(id));const starts=ids.map(id=>coverage.get(id)?.deposits).filter(Boolean).sort();return starts.length?starts[starts.length-1]:null;})():null;
  const sourceNote=!sales?null:fromSales?SALES_NOTE[key]+(depositsSince?` · มีข้อมูลตั้งแต่ ${dateLabel(depositsSince)}`:'')+(brandId?'':' · รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย'):'จาก Meta';
  const emptyNote=waiting?'รอเชื่อมแหล่งข้อมูลยอดขาย':fromSales?(key==='inquiry'?'ทีมยังไม่กรอกคนทักในช่วงนี้':key==='deposits'?'ระบบขายยังไม่มีข้อมูลได้ออเดอร์ในช่วงนี้':'ช่วงนี้ยังไม่มีข้อมูลจากระบบขาย'):'ข้อมูลยังไม่ครบหรือรวมข้ามแพลตฟอร์มไม่ได้ ลองเลือกแพลตฟอร์มเดียว';
  const label=metrics.find(m=>m[0]===key)[1];
  const additive=ADDITIVE_TREND_KEYS.includes(key);
  const chartType=mode==='bar'?'bar':'line';
  const paint=(d)=>{
    const base={label:d.label,data:d.data,daily:d.daily,kind:d.kind,borderColor:d.color};
    if(chartType==='bar') return {...base,...barSeries(d.kind==='compare'?`${COMPARE}80`:d.color,{openFrom:d.kind==='main'?result.openFrom:null})};
    const line={...base,backgroundColor:d.color,...lineSeries(result.days.length,{openFrom:d.kind==='main'?result.openFrom:null})};
    if(d.kind==='compare') return {...line,borderDash:[5,5]};
    if(d.kind==='target') return {...line,borderDash:[2,3],borderWidth:1.5,pointRadius:0,pointHoverRadius:3};
    // สะสม: พื้นจางใต้เส้นหลัก ให้เห็นว่าเป็นยอดที่พอกขึ้น (เฉพาะไม่แยกกลุ่ม ไม่งั้นพื้นซ้อนกันอ่านไม่ออก)
    return mode==='cumulative'&&!result.splitOn?{...line,fill:'origin',backgroundColor:`${d.color}1f`}:line;
  };
  const tooltipLabel=(c)=>{
    const d=c.dataset;
    const priorDay=d.kind==='compare'&&result.priorDays[c.dataIndex]?` (${dayLabel(result.priorDays[c.dataIndex])})`:'';
    const daily=d.daily&&d.daily[c.dataIndex]!=null?` · วันนั้น ${format(key,d.daily[c.dataIndex])}`:'';
    return `${d.label}${priorDay}: ${format(key,c.parsed.y)}${daily}`;
  };
  const cumulativeBlocked=chosenMode==='cumulative'&&mode!=='cumulative';
  const modeNote=mode==='cumulative'
    ?(additive?'แต่ละจุด = ยอดรวมตั้งแต่ต้นช่วงถึงวันนั้น':`แต่ละจุด = ${label} คิดจากยอดรวมตั้งแต่ต้นช่วงถึงวันนั้น (ไม่ใช่เอาค่ารายวันมาบวกกัน)`)+(result.splitOn?'':' · เส้นเทาประ = ช่วงเทียบสะสมแบบเดียวกัน')+(result.target!=null?' · เส้นเหลืองประ = เป้าเดือนเฉลี่ยตามวัน':'')
    :mode==='bar'
      ?(result.splitOn?'สีแต่ละแท่งแทนกลุ่มข้อมูล':'แท่งเขียว = ช่วงนี้ · แท่งเทา = ช่วงเทียบ จับคู่วันตามลำดับในช่วง')+' · ไม่มีแท่ง = วันที่ไม่มีค่าที่คำนวณได้'
      :(result.splitOn?'สีแต่ละเส้นแทนกลุ่มข้อมูล':'เส้นเขียว = ช่วงนี้ · เส้นเทาประ = ช่วงเทียบ จับคู่วันตามลำดับในช่วง (ชี้ที่จุดเพื่อดูวันจริงของช่วงเทียบ)')+' · จุด = วันที่มีค่า ช่วงประจางระหว่างจุด = วันที่ไม่มีค่าที่คำนวณได้';
  const openNote=result.openFrom==null?'':mode==='bar'?'แท่งจางท้ายสุด = วันนี้ยังไม่จบ ตัวเลขยังเพิ่มได้ · ':'เส้นประจางช่วงท้าย = วันนี้ยังไม่จบ ตัวเลขยังเพิ่มได้ · ';
  const needsTarget=mode==='cumulative'&&v.monthView&&!result.splitOn&&additive&&!waiting&&result.target==null;
  return <section className="aw-panel aw-trends"><div className="aw-section-label">ตัวชี้วัดและแนวโน้ม <span>{new Date(v.range.start).toLocaleDateString('th-TH')} – {new Date(new Date(v.range.end)-1).toLocaleDateString('th-TH')}</span></div>
    <div className="aw-trend-controls"><div className="aw-tabs">{metrics.slice(0,TABS).map(([k,l])=><button key={k} aria-pressed={key===k} aria-selected={key===k} onClick={()=>setKey(k)}>{l}</button>)}<Dropdown className="aw-tabs-more" ariaLabel="ตัวชี้วัดอื่น" placeholder="ตัวชี้วัดอื่น" options={metrics.slice(TABS)} value={metrics.slice(TABS).some(m=>m[0]===key)?key:null} onChange={setKey} /></div>
      <div className="aw-trend-view"><div className="aw-seg" role="group" aria-label="รูปแบบกราฟ">{TREND_MODES.map(([k,l])=>{const blocked=k==='cumulative'&&!canCumulate(key);return <button key={k} type="button" aria-pressed={mode===k} disabled={blocked} title={blocked?`${label} สะสมไม่ได้`:undefined} onClick={()=>chooseMode(k)}>{l}</button>;})}</div>
      <label title={canSplit?undefined:'ยอดขายจากระบบขายไม่แยกตามแพลตฟอร์มโฆษณา'}><input type="checkbox" checked={split&&canSplit} disabled={!canSplit} onChange={e=>setSplit(e.target.checked)}/>แยก{brandId?'แพลตฟอร์ม':'แบรนด์'}</label></div></div>
    <div className="aw-trend-total"><b>{format(key,result.current)}</b><span>{result.delta==null?'เทียบไม่ได้':`${result.delta>=0?'+':''}${fmtNum(result.delta, 2)}%`} · {v.compareLabel}</span>{result.target!=null&&<span>เป้าเดือน {format(key,result.target)} · ควรถึงวันนี้ {format(key,result.paceToday)}{result.current!=null&&result.paceToday>0?` · ทำได้ ${fmtPct(result.current/result.paceToday)} ของจังหวะ`:''}</span>}</div>
    {sourceNote&&<p className="aw-key">{sourceNote}</p>}
    {result.current==null&&<p className="aw-key">{emptyNote}</p>}
    {cumulativeBlocked&&<p className="aw-key">{label} สะสมไม่ได้ (Reach นับคนซ้ำข้ามวัน รวมกันแล้วผิด) · แสดงรายวันแทน</p>}
    <ChartBox type={chartType} height={260} ariaLabel={`${label}${mode==='cumulative'?'สะสม':'รายวัน'}`} data={{labels:result.days.map(dayLabel),datasets:result.datasets.map(paint)}} options={baseOpts({plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:tooltipLabel}}},scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12}},y:{beginAtZero:true,ticks:{precision:COUNT_KEYS.includes(key)?0:undefined,callback:n=>tick(key,n)}}}})}/>
    <p className="aw-key">{openNote}{modeNote}{needsTarget?(key==='spend'&&!brandId?' · งบ Meta ยังตั้งไม่ครบทุกแบรนด์ จึงไม่มีเส้นเป้า':' · ยังไม่ตั้งเป้าเดือนของตัวนี้ในระบบขาย จึงไม่มีเส้นเป้า'):''}</p>
    <details><summary>ดูข้อมูลเป็นตาราง</summary><div className="aw-table-scroll"><table><thead><tr><th>วันที่</th>{result.datasets.map(d=><th key={d.label}>{d.label}{mode==='cumulative'&&d.kind!=='target'?' (สะสม)':''}</th>)}{mode==='cumulative'&&!result.splitOn&&<th>วันนั้น</th>}</tr></thead><tbody>{result.days.map((d,i)=><tr key={d}><th>{new Date(d).toLocaleDateString('th-TH')}</th>{result.datasets.map(s=><td key={s.label}>{format(key,s.data[i])}</td>)}{mode==='cumulative'&&!result.splitOn&&<td>{format(key,result.datasets[0].daily?.[i] ?? null)}</td>}</tr>)}</tbody></table></div></details>
  </section>;
}
