/* งานที่ค้างอยู่ตอนนี้ต่อขั้น (WIP) — ย้ายมาจากหน้าสถิติ
 ต่างจากไทล์ funnel: อันนั้นคือ "งานที่ไหลผ่าน" ในช่วงเวลา อันนี้คือ "ค้างอยู่ตอนนี้" */
export function StageWipTile({ perStage }) {
  const max = Math.max(1, ...perStage.map((s) => s.n));
  const total = perStage.reduce((a, s) => a + s.n, 0);
  if (total === 0)
    return <div className="empty-row">ไม่มีงานค้างในสายผลิตตอนนี้</div>;
  return (<div className="stagebars">
   {perStage.map((s) => (<div className="stagebar" key={s.id}>
     <span className="lbl">{s.name}</span>
     <div className="track2">
      <div className="f2" style={{ width: `${(s.n / max) * 100}%` }}>{s.n}</div>
     </div>
    </div>))}
  </div>);
}
