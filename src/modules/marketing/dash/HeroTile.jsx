/* ============================================================
 วงแหวนป้ายผล — สัดส่วนงานที่ได้ป้ายเขียว/เหลือง/แดง ในช่วงที่เลือก
 ตัวเลข KPI ดิบ (งานที่วัดผล/Reach/Leads/ER/CPL) อยู่ที่แถบ KpiRow ที่เดียว
 ไทล์นี้ตอบคำถามที่ไม่มีที่อื่นตอบ: "งานที่ทำไป ดีกว่าค่าเฉลี่ยแบรนด์ตัวเองกี่ชิ้น"
 ============================================================ */
import { useMemo } from "react";
import { brandAverageER, resultLabel } from "../mktRules.js";
const R = 52;
const C = 2 * Math.PI * R;
const SEG_LABEL = { green: "เกินค่าเฉลี่ย", yellow: "ตามค่าเฉลี่ย", red: "ต่ำกว่าครึ่ง" };

export function HeroTile({ measured, allCards, onSeeResults }) {
  const labels = useMemo(() => {
    const acc = { green: 0, yellow: 0, red: 0 };
    for (const c of measured) {
      const l = resultLabel(c, brandAverageER(allCards, c.brand_id, c.id));
      if (l)
        acc[l] += 1;
    }
    return acc;
  }, [measured, allCards]);
  const total = labels.green + labels.yellow + labels.red;
  const segs = total > 0
    ? [
      { key: "green", n: labels.green, color: "var(--ok)" },
      { key: "yellow", n: labels.yellow, color: "var(--warn)" },
      { key: "red", n: labels.red, color: "var(--bad)" },
    ].filter((s) => s.n > 0)
    : [];
  let offset = 0;

  return (<section className="hero">
   <div className="hero-k">ป้ายผลเทียบค่าเฉลี่ยของแบรนด์ตัวเอง</div>

   <button className="hero-ring" onClick={onSeeResults} title="ดูรายละเอียดในแท็บผลตอบรับ">
    <svg viewBox="0 0 130 130">
     <circle cx="65" cy="65" r={R} className="ring-track"/>
     {segs.map((s) => {
      const len = (s.n / total) * C;
      const el = (<circle key={s.key} cx="65" cy="65" r={R} className="ring-seg" stroke={s.color} strokeDasharray={`${Math.max(len - 4, 1)} ${C}`} strokeDashoffset={-offset}/>);
      offset += len;
      return el;
    })}
    </svg>
    <span className="ring-mid">
     <span className="rm-k">เกินค่าเฉลี่ย</span>
     <span className="rm-v mono">{total === 0 ? "—" : `${Math.round((labels.green / total) * 100)}%`}</span>
    </span>
   </button>

   {total > 0 ? (<div className="hero-legend">
     {segs.map((s) => (<span className="hl-item" key={s.key}>
       <i style={{ background: s.color }}/>
       {SEG_LABEL[s.key]}
       <b className="mono">{s.n}</b>
      </span>))}
    </div>) : (<div className="hero-legend"><span className="hl-item">ยังไม่มีงานที่วัดผลในช่วงนี้</span></div>)}
  </section>);
}
