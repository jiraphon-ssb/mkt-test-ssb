/* ============================================================
 ตารางจัดอันดับโพสต์ที่วัดผลแล้ว — เรียงได้ · คลิกเปิดการ์ด
 ป้ายผลใช้สูตรเดิม (เทียบค่าเฉลี่ย ER ของแบรนด์เอง)
 ============================================================ */
import { useMemo, useState } from "react";
import { RESULT_LABEL_TEXT } from "../mktEngine.js";
import { brandAverageER, engagementRate, resultLabel } from "../mktRules.js";
import { brandOf, fmtDayMonth } from "../mktParts.jsx";
import { attachmentUrl } from "../detail/Attachments.jsx";
import { fmtCompact } from "../dash/charts/theme.js";
const SORTS = [
  { id: "er", label: "ER" },
  { id: "reach", label: "Reach" },
  { id: "leads", label: "Leads" },
  { id: "date", label: "ล่าสุด" },
];
const SHOW_FIRST = 10;
export function TopPosts({ cards, data, onOpen, }) {
  const [sort, setSort] = useState("er");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const list = cards.map((c) => ({
      card: c,
      er: engagementRate(c.metrics) ?? 0,
      reach: c.metrics?.reach ?? 0,
      leads: c.metrics?.leads ?? 0,
      engagement: c.metrics?.engagement ?? 0,
      when: c.brief.publish_at ?? c.metrics?.measured_at ?? "",
      label: resultLabel(c, brandAverageER(data.cards, c.brand_id, c.id)),
      cover: data.attachments.find((a) => a.card_id === c.id && a.mime_type.startsWith("image/")),
    }));
    list.sort((a, b) => sort === "date" ? b.when.localeCompare(a.when) : b[sort] - a[sort]);
    return list;
  }, [cards, data, sort]);
  if (rows.length === 0) {
    return <div className="empty-row">ยังไม่มีงานที่วัดผลในช่วงนี้</div>;
  }
  const shown = all ? rows : rows.slice(0, SHOW_FIRST);
  return (<>
   <div className="wl-bar">
    <div className="wl-sorts">
     {SORTS.map((s) => (<button key={s.id} className={sort === s.id ? "on" : ""} onClick={() => setSort(s.id)}>
       {s.label}
      </button>))}
    </div>
    <span className="tp-count mono">{rows.length} ชิ้น</span>
   </div>

   <div className="tp-head">
    <span />
    <span>งาน</span>
    <span className="num">Reach</span>
    <span className="num">Eng.</span>
    <span className="num">ER</span>
    <span className="num">Leads</span>
    <span>ผล</span>
   </div>

   <div className="tp-list">
    {shown.map((r, i) => {
      const brand = brandOf(data, r.card.brand_id);
      const url = r.cover ? attachmentUrl(r.cover) : null;
      return (<button className="tp-row" key={r.card.id} onClick={() => onOpen(r.card)}>
       <span className="tp-rank mono">{i + 1}</span>
       <span className="tp-main">
        <span className="tp-thumb" style={{ background: url ? undefined : brand.color }}>
         {url && <img src={url} alt=""/>}
        </span>
        <span className="tp-txt">
         <span className="tp-title">{r.card.title}</span>
         <span className="tp-sub">
          {brand.name} · {r.when ? fmtDayMonth(r.when) : "—"}
         </span>
        </span>
       </span>
       <span className="num mono">{fmtCompact(r.reach)}</span>
       <span className="num mono">{fmtCompact(r.engagement)}</span>
       <span className="num mono strong">{(r.er * 100).toFixed(1)}%</span>
       <span className="num mono">{r.leads || "—"}</span>
       <span className={`tp-label ${r.label ?? ""}`}>
        {r.label ? RESULT_LABEL_TEXT[r.label] : "—"}
       </span>
      </button>);
    })}
   </div>

   {rows.length > SHOW_FIRST && (<button className="dash-more" onClick={() => setAll(!all)}>
     {all ? "ย่อรายการ" : `ดูทั้งหมด ${rows.length} ชิ้น`}
    </button>)}
  </>);
}
