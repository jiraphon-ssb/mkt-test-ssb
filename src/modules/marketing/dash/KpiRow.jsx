import { pctDelta } from "../mktAnalytics.js";
import { fmtCompact, fmtInt, fmtMoney, fmtPct } from "./charts/theme.js";
import { Icon } from "../mktIcon.jsx";
export function KpiRow({ cur, prev, rangeLabel }) {
  const tiles = [
    { label: "งานที่วัดผลแล้ว", value: fmtInt(cur.produced), delta: pctDelta(cur.produced, prev.produced), hint: rangeLabel },
    { label: "Reach รวม", value: fmtCompact(cur.reach), delta: pctDelta(cur.reach, prev.reach) },
    { label: "Engagement Rate", value: fmtPct(cur.er), delta: pctDelta(cur.er, prev.er), hint: "engagement ÷ reach" },
    { label: "Leads", value: fmtInt(cur.leads), delta: pctDelta(cur.leads, prev.leads), hint: "ที่ attribute ได้" },
    { label: "งบ ads", value: cur.spend > 0 ? fmtMoney(cur.spend) : "—", delta: pctDelta(cur.spend, prev.spend) },
    { label: "CPL", value: cur.cpl != null ? fmtMoney(cur.cpl) : "—", delta: pctDelta(cur.cpl, prev.cpl), inverse: true, hint: "ยิ่งต่ำยิ่งดี" },
  ];
  return (<div className="kpi-row">
   {tiles.map((t) => {
      const good = t.delta == null ? null : t.inverse ? t.delta < 0 : t.delta > 0;
      return (<div className="kpi-tile" key={t.label}>
      <div className="kpi-label">{t.label}</div>
      <div className="kpi-value mono">{t.value}</div>
      <div className="kpi-foot">
       {t.delta == null ? (<span className="kpi-delta none">ไม่มีข้อมูลเทียบ</span>) : (<span className={`kpi-delta ${good ? "up" : "down"}`}>
         <Icon name="chevron" size={11}/>
         {Math.abs(t.delta * 100).toFixed(0)}%
        </span>)}
       {t.hint && <span className="kpi-hint">{t.hint}</span>}
      </div>
     </div>);
    })}
  </div>);
}
