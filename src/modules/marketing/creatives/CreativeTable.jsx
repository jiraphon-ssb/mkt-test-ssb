/* ตารางครีเอทีฟกลาง (25 ก.ย. อาร์ตขอ) — ใช้ทั้งแผงแคมเปญ (context="campaign") และหน้าคลัง Creative (context="library")
   แถว = ชิ้นงาน · ชี้ค้าง ~0.3 วิ = การ์ดตัวอย่างคร่าวๆ (เฉพาะอุปกรณ์ที่มีเมาส์) · คลิก/Enter = เปิดดูเต็ม (CreativeDetail)
   สถานะเปิด/ปิดมาจาก effective_status ของ Meta — ไม่ใช่คำแนะนำของระบบ (ป้าย "ควรหยุด" อยู่อีกคอลัมน์) */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageOff } from "lucide-react";
import { fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { mediaView } from "./creativeMedia.js";
import { FORMAT_LABELS, creativeFormatOf } from "./creativeLibrary.js";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import "./creativeTable.css";

const HOVER_DELAY = 300;
const times = (x) => (x == null ? "—" : `${fmtNum(x, 2)}x`);
const canHover = () => typeof window === "undefined" || !window.matchMedia || window.matchMedia("(hover: hover)").matches;

export function StatusDot({ status, prefix = "" }) {
  return <span className={`ct-status ct-status--${status.tone}`}><i aria-hidden="true" />{prefix}{status.label}</span>;
}

function Thumb({ asset, size = 44 }) {
  const src = mediaView(asset).items[0]?.src ?? null;
  const [broken, setBroken] = useState(false);
  return <span className="ct-thumb" style={{ width: size, height: size }}>
    {src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <ImageOff size={16} aria-hidden="true" />}
  </span>;
}

/* การ์ดตัวอย่างลอยข้างเมาส์ — ยึดขอบจอไม่ให้ล้น · อ่านอย่างเดียว ไม่รับการกด (pointer-events:none) */
function HoverCard({ row, at, campaignStatus }) {
  const status = adStatusOf(row.asset?.status);
  const width = 300, height = 380;
  const left = Math.max(8, Math.min(at.x + 18, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(at.y + 12, window.innerHeight - height - 8));
  const src = mediaView(row.asset).items[0]?.src ?? null;
  const copy = row.asset?.copy ?? {};
  return createPortal(<div className="ct-hover" role="tooltip" style={{ left, top, width }}>
    <div className="ct-hover-media">{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : <span><ImageOff size={18} aria-hidden="true" />ยังไม่มีภาพ</span>}</div>
    <div className="ct-hover-body">
      <strong>{row.creative}</strong>
      <div className="ct-hover-status"><StatusDot status={status} prefix="โฆษณา" />{campaignStatus && <StatusDot status={campaignStatus} prefix="แคมเปญ" />}</div>
      {copy.headline && <b>{copy.headline}</b>}
      {copy.primaryText && <p>{copy.primaryText}</p>}
      <small>คลิกเพื่อดูเต็ม</small>
    </div>
  </div>, document.body);
}

/**
 * @param rows            แถวครีเอทีฟ (adsCreativeRows)
 * @param onOpen          (row) => void — เปิดดูเต็ม
 * @param context         "campaign" | "library"
 * @param campaignStatus  (row) => สถานะแคมเปญ (หน้าคลัง) · ในแผงแคมเปญส่งค่าเดียวผ่าน sheetCampaignStatus
 * @param selection       { isChecked(key), toggle(key) } — ช่องติ๊กเทียบ (หน้าคลัง)
 * @param renderExtra     (row) => node ใต้ชื่อ เช่นผลตามกฎ
 */
export function CreativeTable({ rows = [], onOpen, context = "campaign", campaignStatus = null, sheetCampaignStatus = null, selection = null, renderExtra = null }) {
  const [hover, setHover] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const statusOfCampaign = (row) => (campaignStatus ? campaignStatus(row) : sheetCampaignStatus);

  const enter = (row, event) => {
    if (!canHover()) return;
    const at = { x: event.clientX ?? 0, y: event.clientY ?? 0 };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover({ row, at }), HOVER_DELAY);
  };
  const leave = () => { clearTimeout(timer.current); setHover(null); };
  const open = (row) => { leave(); onOpen?.(row); };

  if (!rows.length) return <p className="ct-empty">ไม่มีครีเอทีฟในช่วงนี้</p>;
  const library = context === "library";
  return <div className="ct-wrap">
    <table className={`ct-table ct-table--${context}`}>
      <thead><tr>
        {selection && <th className="ct-col-pick"><span className="ct-sr">เทียบ</span></th>}
        <th>ชิ้นงาน</th><th>สถานะ</th><th className="num">ค่าแอด</th><th className="num">CTR</th><th className="num">ความถี่</th><th className="num">ROAS</th><th>คำแนะนำ</th>
      </tr></thead>
      <tbody>{rows.map((row) => {
        const status = adStatusOf(row.asset?.status);
        const camp = library ? statusOfCampaign(row) : null;
        return <tr key={row.key} tabIndex={0} className="ct-row" onClick={() => open(row)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(row); } }}
          onMouseEnter={(event) => enter(row, event)} onMouseLeave={leave} onFocus={leave}>
          {selection && <td className="ct-col-pick" onClick={(event) => event.stopPropagation()}>
            <input type="checkbox" aria-label={`เทียบ ${row.creative}`} checked={selection.isChecked(row.key)} onChange={() => selection.toggle(row.key)} onKeyDown={(event) => event.stopPropagation()} />
          </td>}
          <td className="ct-name"><Thumb asset={row.asset} /><span>
            <b title={row.creative}>{row.creative}</b>
            <small>{library ? [row.brand, (row.campaigns ?? []).join(", ")].filter(Boolean).join(" · ") : FORMAT_LABELS[creativeFormatOf(row)]}</small>
            {renderExtra?.(row)}
          </span></td>
          <td className="ct-state"><StatusDot status={status} />{camp && <small><StatusDot status={camp} prefix="แคมเปญ" /></small>}</td>
          <td className="num">{fmtMoney(row.spend)}</td>
          <td className="num">{row.ctr == null ? "—" : fmtPct(row.ctr, 2)}</td>
          <td className="num">{times(row.frequency)}</td>
          <td className="num">{times(row.roas)}</td>
          <td><span className={`ct-action ct-action--${actionTone(row)}`}>{actionLabel(row)}</span></td>
        </tr>;
      })}</tbody>
    </table>
    {hover && <HoverCard row={hover.row} at={hover.at} campaignStatus={library ? statusOfCampaign(hover.row) : sheetCampaignStatus} />}
  </div>;
}
