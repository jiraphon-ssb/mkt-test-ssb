/* ============================================================
 Engagement by platform — แถบสัดส่วนรวม + แถวต่อช่องทาง พร้อม delta
 นับจากงานที่วัดผลแล้วในช่วง · งานที่ลงหลายช่องทางนับให้ทุกช่อง
 ============================================================ */
import { useMemo } from "react";
import { rollupBy } from "../mktAnalytics.js";
import { useApp } from "../useMkt.jsx";
import { fmtCompact } from "../dash/charts/theme.js";
import { InfoButton } from "../mktInfoButton.jsx";
export function PlatformBars({ cards, allCards, range, prev, }) {
  /* สีช่องทางมาจากหน้าตั้งค่า — ช่องทางที่เพิ่มเองก็ได้สีของตัวเอง */
  const { data } = useApp();
  const chColor = (name) => data.channels.find((c) => c.name === name)?.color ?? "var(--ink-faint)";
  const chLogo = (name) => data.channels.find((c) => c.name === name)?.logo || "";
  const rows = useMemo(() => {
    const cur = rollupBy(cards, allCards, "channel", range, data.channels);
    const before = rollupBy(cards, allCards, "channel", prev, data.channels);
    const total = cur.reduce((a, r) => a + r.engagement, 0);
    return {
      total,
      list: cur
        .sort((a, b) => b.engagement - a.engagement)
        .map((r) => {
        const old = before.find((b) => b.key === r.key);
        const delta = old && old.engagement > 0 ? (r.engagement - old.engagement) / old.engagement : null;
        return { ...r, share: total > 0 ? r.engagement / total : 0, delta };
      }),
    };
  }, [cards, allCards, range, prev, data.channels]);
  if (rows.list.length === 0) {
    return <div className="empty-row">ยังไม่มีงานที่วัดผลในช่วงนี้</div>;
  }
  return (<>
   {/* แถบเดียวแบ่งสัดส่วน engagement ทั้งหมด */}
   <div className="pb-bar">
    {rows.list.map((r) => (<i key={r.key} style={{ width: `${r.share * 100}%`, background: chColor(r.key) }} title={`${r.key} ${(r.share * 100).toFixed(0)}%`}/>))}
   </div>

   <div className="pb-list">
    {rows.list.map((r) => (<div className="pb-row" key={r.key}>
      {chLogo(r.key)
        ? <img className="pb-logo" src={chLogo(r.key)} alt=""/>
        : <span className="pb-tick" style={{ background: chColor(r.key) }}/>}
      <span className="pb-name">{r.key}</span>
      <span className="pb-n mono">{r.n} ชิ้น</span>
      <span className="pb-val mono">{fmtCompact(r.engagement)}</span>
      <span className={`pb-delta mono ${r.delta == null ? "flat" : r.delta >= 0 ? "up" : "down"}`}>
       {r.delta == null ? "—" : `${r.delta >= 0 ? "↑" : "↓"} ${Math.abs(r.delta * 100).toFixed(1)}%`}
      </span>
     </div>))}
   </div>

   <div className="tile-note">
    engagement รวมทุกช่อง {fmtCompact(rows.total)}
    <InfoButton label="ช่องทาง" text="งานที่ลงหลายช่องทางถูกนับให้ทุกช่อง ยอดรวมข้ามช่องจึงมากกว่าจำนวนงานจริง · ลูกศรคือเทียบกับช่วงก่อนหน้าที่ยาวเท่ากัน"/>
   </div>
  </>);
}
