import { HEAT_SLOTS, HEAT_START_HOUR } from "../mktAnalytics.js";
import { fmtPct } from "./charts/theme.js";
const DOW = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
export function TimingHeatmap({ cells, teamER }) {
  const byKey = new Map(cells.map((c) => [`${c.dow}:${c.slot}`, c]));
  const maxER = Math.max(...cells.map((c) => c.avgER ?? 0), teamER ?? 0, 0.0001);
  const total = cells.reduce((a, c) => a + c.n, 0);
  return (<>
   {total === 0 ? (<div className="empty-row">ยังไม่มีงานที่ระบุวัน–เวลาโพสต์ในช่วงนี้</div>) : (<>
     <div className="heat" style={{ gridTemplateColumns: `54px repeat(7, 1fr)` }}>
      <div />
      {DOW.map((d) => <div className="heat-h" key={d}>{d}</div>)}
      {Array.from({ length: HEAT_SLOTS }, (_, slot) => {
        const from = HEAT_START_HOUR + slot * 2;
        return (<div className="heat-row" key={slot} style={{ display: "contents" }}>
         <div className="heat-t mono">{String(from).padStart(2, "0")}–{String(from + 2).padStart(2, "0")}</div>
         {DOW.map((_, dow) => {
            const cell = byKey.get(`${dow}:${slot}`);
            const strength = cell?.avgER ? Math.min(1, cell.avgER / maxER) : 0;
            const hot = cell != null && teamER != null && cell.n >= 3 && (cell.avgER ?? 0) >= teamER * 1.3;
            return (<div key={dow} className={`heat-c ${cell ? "has" : ""} ${hot ? "hot" : ""}`} style={cell ? { background: `color-mix(in srgb, var(--accent) ${Math.round(10 + strength * 50)}%, var(--surface))` } : undefined} title={cell ? `${DOW[dow]} ${from}:00 · งาน ${cell.n} ชิ้น · ER ${fmtPct(cell.avgER)}` : "ไม่มีงานในช่องนี้"}>
            {cell ? <span className="mono">{cell.n}</span> : ""}
           </div>);
          })}
        </div>);
      })}
     </div>
     <div className="heat-legend">
      <span>ER ต่ำ</span>
      <i className="heat-scale"/>
      <span>ER สูง</span>
     </div>
    </>)}
  </>);
}
