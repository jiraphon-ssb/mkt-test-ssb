import { useMemo, useState } from 'react';
import { adsMetricBoard, adsRevenue, adsSalePipeline, adsChannelList, filterByChannel, change } from '../adsOverview.js';
import { ChartBox } from '../dash/charts/ChartBox.jsx';
import { baseOpts, fmtMoney, fmtPct, fmtCompact, lineSeries, dayLabel } from '../dash/charts/theme.js';
import { Dropdown } from '../ui/Dropdown.jsx';
import { isoDay } from '../adsScope.js';
import { SALES_TREND_KEYS, salesTrendValue } from './salesOverview.js';
import { SALES_BRAND_IDS } from './syncSources.js';
const metrics = [['spend','ค่าแอด'],['revenue','ยอดขาย'],['roas','ROAS'],['inquiry','คนทัก'],['cpl','CPL'],['ctr','CTR'],['cpc','CPC'],['cpm','CPM'],['impressions','Impressions'],['frequency','Frequency']];
const colors = ['#298362','#477bc0','#ce8650','#9865b6','#ce657d'];
function valueFor(cards, range, key) {
  if(key==='revenue') return adsRevenue(cards,range);
  if(key==='inquiry') return adsSalePipeline(cards,range).items[0]?.value ?? null;
  return adsMetricBoard(cards,range).find(m=>m.key===key)?.value ?? null;
}
function dates(range) {
  const out=[];
  for(let d=new Date(range.start);d<new Date(range.end);d.setDate(d.getDate()+1)) out.push(d.toISOString());
  return out;
}
/* ข้อมูลจริง: ยอดขาย · ROAS · คนทัก · CPL มาจากระบบขาย (นิยามเดียวกับ hero/funnel ด้านบน) ค่าแอดหารจาก Meta ทุกช่องทาง
   src = { sales, brandIds, spendCards, basis } · ไม่มี src = ของ Meta ตามเดิม (ข้อมูลจำลอง / แท็บ CTR CPC CPM ฯลฯ) */
function metricValue(cards, range, key, src) {
  if(!src) return valueFor(cards,range,key);
  const spend=['roas','cpl'].includes(key)?adsMetricBoard(src.spendCards,range).find(m=>m.key==='spend')?.value ?? null:null;
  return salesTrendValue({sales:src.sales,key,brandIds:src.brandIds,spend,basis:src.basis,from:isoDay(new Date(range.start)),to:isoDay(new Date(new Date(range.end)-1))});
}
function series(cards, days, key, src) {
  return days.map(start=>{const end=new Date(start);end.setDate(end.getDate()+1);return metricValue(cards,{start,end:end.toISOString()},key,src);});
}
const format=(key,n)=>n==null?'—':key==='ctr'?fmtPct(n,2):['roas','frequency'].includes(key)?`${n.toFixed(1)}×`:['inquiry','impressions'].includes(key)?n.toLocaleString('th-TH'):fmtMoney(n);
export function WorkspaceTrends({v,brandId,sales=null}) {
  const [key,setKey]=useState('spend');
  const [split,setSplit]=useState(false);
  const fromSales=Boolean(sales)&&SALES_TREND_KEYS.includes(key);
  // ยอดขายไม่แยกตามแพลตฟอร์มโฆษณา → หน้าแบรนด์ แท็บของระบบขาย แยกแพลตฟอร์มไม่ได้
  const canSplit=!(fromSales&&brandId);
  const waiting=fromSales&&(brandId?!SALES_BRAND_IDS.includes(brandId):!v.brands.some(b=>SALES_BRAND_IDS.includes(b.id)));
  const result=useMemo(()=>{
    const cards=brandId?v.scoped.filter(c=>c.brand_id===brandId):v.scoped;
    const srcFor=(ids)=>{const brandIds=ids.filter(id=>SALES_BRAND_IDS.includes(id));return fromSales?{sales,brandIds,basis:v.revenueBasis,spendCards:(v.scopedAll??v.scoped).filter(c=>brandIds.includes(c.brand_id))}:null;};
    const main=srcFor(brandId?[brandId]:v.brands.map(b=>b.id));
    const days=dates(v.range), priorDays=dates(v.before);
    const groups=brandId?adsChannelList(cards).map(name=>({name,cards:filterByChannel(cards,name),src:null})):v.brands.map(b=>({name:fromSales&&!SALES_BRAND_IDS.includes(b.id)?`${b.name} (รอเชื่อม)`:b.name,cards:cards.filter(c=>c.brand_id===b.id),src:srcFor([b.id])}));
    const current=metricValue(cards,v.range,key,main),before=metricValue(cards,v.before,key,main);
    const datasets=split&&canSplit?groups.map((g,i)=>({label:g.name,data:series(g.cards,days,key,g.src),borderColor:colors[i%colors.length],backgroundColor:colors[i%colors.length]})):[{label:'ช่วงนี้',data:series(cards,days,key,main),borderColor:colors[0],backgroundColor:colors[0]},{label:'ช่วงเทียบ',data:series(cards,priorDays,key,main).slice(0,days.length),borderColor:'#8f9693',backgroundColor:'#8f9693',borderDash:[5,5]}];
    // วันนี้ยังไม่จบ — เส้นช่วงท้ายเป็นประจาง (เส้นช่วงเทียบเป็นวันที่จบแล้ว ไม่ต้อง)
    const todayIso=isoDay(new Date());
    const openAt=days.findIndex(d=>isoDay(new Date(d))===todayIso);
    return {days,priorDays,datasets,current,before,delta:change(current,before),openFrom:openAt>0?openAt:null};
  },[v,brandId,key,split,sales,fromSales,canSplit]);
  const sourceNote=!sales?null:fromSales?(key==='inquiry'?'จากระบบขาย · คนทักที่ทีมขายกรอก':key==='revenue'?'จากระบบขาย':key==='cpl'?'ค่าแอด Meta ÷ Lead ในระบบขาย':'ยอดขายจริง ÷ ค่าแอด Meta')+(brandId?'':' · รวมเฉพาะแบรนด์ที่มีแหล่งยอดขาย'):'จาก Meta';
  const emptyNote=waiting?'รอเชื่อมแหล่งข้อมูลยอดขาย':fromSales?(key==='inquiry'?'ทีมยังไม่กรอกคนทักในช่วงนี้':'ช่วงนี้ยังไม่มีข้อมูลจากระบบขาย'):'ข้อมูลยังไม่ครบหรือรวมข้ามแพลตฟอร์มไม่ได้ ลองเลือกแพลตฟอร์มเดียว';
  const label=metrics.find(m=>m[0]===key)[1];
  return <section className="aw-panel aw-trends"><div className="aw-section-label">ตัวชี้วัดและแนวโน้ม <span>{new Date(v.range.start).toLocaleDateString('th-TH')} – {new Date(new Date(v.range.end)-1).toLocaleDateString('th-TH')}</span></div>
    <div className="aw-trend-controls"><div className="aw-tabs">{metrics.slice(0,5).map(([k,l])=><button key={k} aria-pressed={key===k} aria-selected={key===k} onClick={()=>setKey(k)}>{l}</button>)}<Dropdown className="aw-tabs-more" ariaLabel="ตัวชี้วัดอื่น" placeholder="ตัวชี้วัดอื่น" options={metrics.slice(5)} value={metrics.slice(5).some(m=>m[0]===key)?key:null} onChange={setKey} /></div><label title={canSplit?undefined:'ยอดขายจากระบบขายไม่แยกตามแพลตฟอร์มโฆษณา'}><input type="checkbox" checked={split&&canSplit} disabled={!canSplit} onChange={e=>setSplit(e.target.checked)}/>แยก{brandId?'แพลตฟอร์ม':'แบรนด์'}</label></div>
    <div className="aw-trend-total"><b>{format(key,result.current)}</b><span>{result.delta==null?'เทียบไม่ได้':`${result.delta>=0?'+':''}${result.delta.toFixed(1)}%`} · {v.compareLabel}</span></div>
    {sourceNote&&<p className="aw-key">{sourceNote}</p>}
    {result.current==null&&<p className="aw-key">{emptyNote}</p>}
    <ChartBox type="line" height={260} ariaLabel={`${label}รายวัน`} data={{labels:result.days.map(dayLabel),datasets:result.datasets.map(d=>({...d,...lineSeries(result.days.length,{openFrom:d.borderDash?null:result.openFrom})}))}} options={baseOpts({plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:c=>`${c.dataset.label}${c.dataset.borderDash&&result.priorDays[c.dataIndex]?` (${dayLabel(result.priorDays[c.dataIndex])})`:''}: ${format(key,c.parsed.y)}`}}},scales:{x:{ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12}},y:{beginAtZero:true,ticks:{callback:n=>key==='ctr'?fmtPct(n,1):['roas','frequency'].includes(key)?`${n}×`:fmtCompact(n)}}}})}/>
    <p className="aw-key">{result.openFrom!=null&&'เส้นประจางช่วงท้าย = วันนี้ยังไม่จบ ตัวเลขยังเพิ่มได้ · '}{split?'สีแต่ละเส้นแทนกลุ่มข้อมูล':'เส้นเขียว = ช่วงนี้ · เส้นเทาประ = ช่วงเทียบ จับคู่วันตามลำดับในช่วง (ชี้ที่จุดเพื่อดูวันจริงของช่วงเทียบ)'} · จุด = วันที่มีค่า ช่วงประจางระหว่างจุด = วันที่ไม่มีค่าที่คำนวณได้</p>
    <details><summary>ดูข้อมูลเป็นตาราง</summary><div className="aw-table-scroll"><table><thead><tr><th>วันที่</th>{result.datasets.map(d=><th key={d.label}>{d.label}</th>)}</tr></thead><tbody>{result.days.map((d,i)=><tr key={d}><th>{new Date(d).toLocaleDateString('th-TH')}</th>{result.datasets.map(s=><td key={s.label}>{format(key,s.data[i])}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
