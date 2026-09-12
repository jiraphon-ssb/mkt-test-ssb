import { useMemo, useState } from 'react';
import { adsMetricBoard, adsRevenue, adsSalePipeline, adsChannelList, filterByChannel, change } from '../adsOverview.js';
import { ChartBox } from '../dash/charts/ChartBox.jsx';
import { baseOpts, fmtMoney, fmtPct, fmtCompact } from '../dash/charts/theme.js';
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
function series(cards, days, key) {
  return days.map(start=>{const end=new Date(start);end.setDate(end.getDate()+1);return valueFor(cards,{start,end:end.toISOString()},key);});
}
const format=(key,n)=>n==null?'—':key==='ctr'?fmtPct(n,2):['roas','frequency'].includes(key)?`${n.toFixed(1)}×`:['inquiry','impressions'].includes(key)?n.toLocaleString('th-TH'):fmtMoney(n);
export function WorkspaceTrends({v,brandId}) {
  const [key,setKey]=useState('spend');
  const [split,setSplit]=useState(false);
  const result=useMemo(()=>{
    const cards=brandId?v.scoped.filter(c=>c.brand_id===brandId):v.scoped;
    const days=dates(v.range), priorDays=dates(v.before);
    const groups=brandId?adsChannelList(cards).map(name=>({name,cards:filterByChannel(cards,name)})):v.brands.map(b=>({name:b.name,cards:cards.filter(c=>c.brand_id===b.id)}));
    const current=valueFor(cards,v.range,key),before=valueFor(cards,v.before,key);
    const datasets=split?groups.map((g,i)=>({label:g.name,data:series(g.cards,days,key),borderColor:colors[i%colors.length],backgroundColor:colors[i%colors.length]})):[{label:'ช่วงนี้',data:series(cards,days,key),borderColor:colors[0],backgroundColor:colors[0]},{label:'ช่วงเทียบ',data:series(cards,priorDays,key).slice(0,days.length),borderColor:'#8f9693',backgroundColor:'#8f9693',borderDash:[5,5]}];
    return {days,datasets,current,before,delta:change(current,before)};
  },[v,brandId,key,split]);
  const label=metrics.find(m=>m[0]===key)[1];
  return <section className="aw-panel aw-trends"><div className="aw-section-label">ตัวชี้วัดและแนวโน้ม <span>{new Date(v.range.start).toLocaleDateString('th-TH')} – {new Date(new Date(v.range.end)-1).toLocaleDateString('th-TH')}</span></div>
    <div className="aw-trend-controls"><div className="aw-tabs">{metrics.slice(0,5).map(([k,l])=><button key={k} aria-pressed={key===k} aria-selected={key===k} onClick={()=>setKey(k)}>{l}</button>)}<select aria-label="ตัวชี้วัดอื่น" value={metrics.slice(5).some(m=>m[0]===key)?key:''} onChange={e=>setKey(e.target.value)}><option value="" disabled>ตัวชี้วัดอื่น</option>{metrics.slice(5).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div><label><input type="checkbox" checked={split} onChange={e=>setSplit(e.target.checked)}/>แยก{brandId?'แพลตฟอร์ม':'แบรนด์'}</label></div>
    <div className="aw-trend-total"><b>{format(key,result.current)}</b><span>{result.delta==null?'เทียบไม่ได้':`${result.delta>=0?'+':''}${result.delta.toFixed(1)}%`} · {v.compareLabel}</span></div>
    {result.current==null&&<p className="aw-key">ข้อมูลยังไม่ครบหรือรวมข้ามแพลตฟอร์มไม่ได้ ลองเลือกแพลตฟอร์มเดียว</p>}
    <ChartBox type="line" height={260} ariaLabel={`${label}รายวัน`} data={{labels:result.days.map(d=>new Date(d).toLocaleDateString('th-TH',{day:'numeric',month:'short'})),datasets:result.datasets.map(d=>({...d,tension:.2,pointRadius:2,borderWidth:2,spanGaps:false}))}} options={baseOpts({plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${format(key,c.parsed.y)}`}}},scales:{y:{beginAtZero:true,ticks:{callback:n=>key==='ctr'?fmtPct(n,1):['roas','frequency'].includes(key)?`${n}×`:fmtCompact(n)}}}})}/>
    <p className="aw-key">{split?'สีแต่ละเส้นแทนกลุ่มข้อมูล':'เส้นทึบ = ช่วงนี้ · เส้นประ = ช่วงเทียบ โดยจับคู่วันตามลำดับในช่วง'} · ช่องว่างหมายถึงไม่มีค่าที่คำนวณได้</p>
    <details><summary>ดูข้อมูลเป็นตาราง</summary><div className="aw-table-scroll"><table><thead><tr><th>วันที่</th>{result.datasets.map(d=><th key={d.label}>{d.label}</th>)}</tr></thead><tbody>{result.days.map((d,i)=><tr key={d}><th>{new Date(d).toLocaleDateString('th-TH')}</th>{result.datasets.map(s=><td key={s.label}>{format(key,s.data[i])}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
