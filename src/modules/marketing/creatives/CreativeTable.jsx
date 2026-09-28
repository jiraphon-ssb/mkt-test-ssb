/* ตารางครีเอทีฟ (หน้าคลัง โหมด "ตาราง") — สเปก 2026-09-25 ทาง A
   แถว = ชิ้นงาน · คลิก/Enter = หน้าต่างครีเอทีฟ (CreativeViewer) · ไม่มีการ์ดลอยตอนชี้เมาส์
   สถานะเปิด/ปิดมาจาก effective_status ของ Meta — แยกจากคำแนะนำ ("ควรหยุด") ที่อยู่คอลัมน์ท้าย */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { mediaView } from "./creativeMedia.js";
import { FORMAT_LABELS, creativeFormatOf } from "./creativeLibrary.js";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import { Dot } from "./CreativeViewer.jsx";
import "./creativeTable.css";

const times = (x) => (x == null ? "—" : `${fmtNum(x, 2)}×`);

function Thumb({ asset }) {
  const src = mediaView(asset).items[0]?.src ?? null;
  const [broken, setBroken] = useState(false);
  return <span className="ct-thumb">{src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <ImageOff size={16} aria-hidden="true" />}</span>;
}

/**
 * @param rows        แถวครีเอทีฟ (adsCreativeRows) ตามลำดับที่แสดง
 * @param onOpen      (index) => void — เปิดหน้าต่างครีเอทีฟที่ตำแหน่งนั้น
 * @param context     "campaign" | "library" (library = บรรทัดรองเป็นแบรนด์ · แคมเปญ)
 * @param selection   { isChecked(key), toggle(key) } — ช่องติ๊กเทียบ (หน้าคลัง)
 * @param renderExtra (row) => node ท้ายชื่อ เช่นป้ายผลกฎ
 */
export function CreativeTable({ rows = [], onOpen, context = "campaign", selection = null, renderExtra = null }) {
  if (!rows.length) return <p className="ct-empty">ไม่มีครีเอทีฟในช่วงนี้</p>;
  const library = context === "library";
  return <div className="ct-wrap">
    <table className={`ct-table ct-table--${context}`}>
      <thead><tr>
        {selection && <th className="ct-col-pick"><span className="ct-sr">เทียบ</span></th>}
        <th>ชิ้นงาน</th><th>สถานะ</th><th className="num">ค่าแอด</th><th className="num">CTR ลิงก์</th><th className="num">ความถี่</th><th className="num">ROAS (Meta)</th><th>คำแนะนำ</th>
      </tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.key} tabIndex={0} className="ct-row" onClick={() => onOpen?.(index)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen?.(index); } }}>
        {selection && <td className="ct-col-pick" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" aria-label={`เทียบ ${row.creative}`} checked={selection.isChecked(row.key)} onChange={() => selection.toggle(row.key)} onKeyDown={(event) => event.stopPropagation()} />
        </td>}
        <td className="ct-name-cell"><div className="ct-name"><Thumb asset={row.asset} /><div>
          <b title={row.creative}>{row.creative}</b>
          {(() => { const sub = library ? [row.brand, (row.campaigns ?? []).join(", ")].filter(Boolean).join(" · ") : FORMAT_LABELS[creativeFormatOf(row)]; return <small title={sub}>{sub}</small>; })()}
          {renderExtra?.(row)}
        </div></div></td>
        <td className="ct-state"><Dot status={adStatusOf(row.asset?.status)} /></td>
        <td className="num">{fmtMoney(row.spend)}</td>
        <td className="num">{row.linkCtr == null ? "—" : fmtPct(row.linkCtr)}</td>
        <td className="num">{times(row.frequency)}</td>
        <td className="num">{times(row.roas)}</td>
        <td><span className={`ct-action ct-action--${actionTone(row)}`}>{actionLabel(row)}</span></td>
      </tr>)}</tbody>
    </table>
  </div>;
}
