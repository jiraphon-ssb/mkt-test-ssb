/* การ์ดครีเอทีฟตัวเดียว (อาร์ตเคาะ 25 ก.ย.) — หน้าตาแบบการ์ดในแผงแคมเปญเดิมที่อาร์ตชอบ ใช้ทั้งแผงแคมเปญและหน้าคลัง
   รูปใหญ่ · ชื่อ + คำแนะนำ · สถานะ (เฉพาะเมื่อรู้) · ตัวเลข 4 ช่อง · อยู่ใน N แคมเปญ + ลิงก์โพสต์
   26 ก.ย. (สเปก creative-page-hierarchy): 4 ช่องคงที่ ค่าแอด · ต่อผลลัพธ์ · CTR ลิงก์ · ROAS — แคปชั่นอยู่ในหน้าต่างเท่านั้น
   คลิกที่ไหนก็ได้ = หน้าต่างครีเอทีฟ (CreativeViewer) · ลิงก์/ช่องเทียบไม่เปิดหน้าต่าง */
import { ExternalLink } from "lucide-react";
import { fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import { Dot } from "./CreativeViewer.jsx";
import "./creativeCard.css";

const stop = (event) => event.stopPropagation();

/**
 * @param row         แถวครีเอทีฟ (adsCreativeRows)
 * @param onOpen      () => void — เปิดหน้าต่างครีเอทีฟ
 * @param selectable  แสดงช่อง "เทียบ" (หน้าคลัง) คู่กับ checked/onToggle
 * @param ruleResult  ผลกฎ { status, text } (หน้าคลัง) — null = ไม่แสดง
 */
export function CreativeCard({ row, onOpen, selectable = false, checked = false, onToggle, ruleResult = null, ruleText = {} }) {
  const asset = row.asset;
  const links = postLinksOf(asset);
  /* คำตัดสินเดียวต่อการ์ด (ทดสอบแบบใช้งานจริง 27 ก.ย.): ไม่ผ่านกฎที่ทีมตั้ง = ป้ายบนสุด · นอกนั้นป้ายคือคำแนะนำของระบบ */
  // ระบบบอกควรหยุด (หนักกว่า) = ป้ายควรหยุด แล้วบอกไม่ผ่านกฎในบรรทัดล่างแทน (ตรวจรอบ 27 ก.ย. ดึก)
  const failed = ruleResult?.status === "fail" && row.action !== "Stop";
  const tone = failed ? "rose" : actionTone(row);
  const showRule = ruleResult && ruleResult.status !== "pass";
  return <article className={`cc${row.fatigue ? " is-fatigue" : ""}`} onClick={onOpen}>
    {/* คลิกในกรอบรูปจบในกรอบรูป — ปุ่ม ‹ › เลื่อนภาพต้องไม่เปิดหน้าต่าง · ปุ่มทั้งกรอบของรูปเปิดเองครั้งเดียว */}
    <div onClick={stop}><CreativeMedia row={row} onPreview={() => onOpen()} openLabel="เปิดดูชิ้นนี้" /></div>
    <div className="cc-body">
      {/* ชื่อเป็นปุ่มเปิดหน้าต่าง — ทุกใบเปิดด้วยคีย์บอร์ดได้ แม้ไม่มีรูปให้กด (ชุด B ข้อ 16) */}
      <div className="cc-title"><button type="button" className="cc-open" aria-label={`ดูรายละเอียด ${row.creative}`} onClick={(e) => { e.stopPropagation(); onOpen?.(); }}><b title={row.creative}>{row.creative}</b></button><span className={`cc-action cc-action--${tone}`}>{failed ? (ruleText.fail ?? "ไม่ผ่านกฎ") : actionLabel(row)}</span></div>
      {asset?.status && <Dot status={adStatusOf(asset.status)} />}
      <dl className="cc-facts">
        <div><dt>ค่าแอด</dt><dd>{fmtMoney(row.spend)}</dd></div>
        <div><dt>ต่อผลลัพธ์</dt><dd>{row.cpl == null ? "—" : fmtMoney(row.cpl)}</dd></div>
        <div><dt>CTR ลิงก์</dt><dd>{row.linkCtr == null ? "—" : fmtPct(row.linkCtr)}</dd></div>
        {/* ROAS null = Meta ไม่เห็นยอด (ชิ้นทักแชท) → "—" สีปกติ · แดงเฉพาะมียอดจริงแต่ได้คืนไม่ถึงค่าแอด */}
        <div><dt>ROAS (Meta)</dt><dd className={row.roas != null && row.roas < 1 ? "bad" : undefined}>{row.roas == null ? "—" : `${fmtNum(row.roas, 2)}×`}</dd></div>
      </dl>
      {/* ผลกฎสั้น: ผ่าน = ไม่ขึ้น (ป้ายบนเป็นคำแนะนำอยู่แล้ว) · ไม่ผ่าน = เหตุผลบรรทัดเดียว (ป้ายบนบอกแล้วว่าไม่ผ่าน)
          รอ = บอกว่ากฎยังตัดสินไม่ได้ · เหตุผลเต็มอยู่ในหน้าต่าง */}
      {showRule && <p className={`cc-rule cc-rule--${ruleResult.status}`}>{!failed && <b>{ruleText[ruleResult.status] ?? ruleResult.status}</b>}{ruleResult.text && <span title={ruleResult.text}>{ruleResult.text}</span>}</p>}
      <div className="cc-foot">
        <span>อยู่ใน {(row.campaigns ?? []).length} แคมเปญ</span>
        <span className="cc-links" onClick={stop}>
          {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.label} ของ ${row.creative}`}>{link.key === "facebook" ? "FB" : "IG"} <ExternalLink size={11} aria-hidden="true" /></a>)}
          {selectable && <label className="cc-check"><input type="checkbox" aria-label={`เทียบ ${row.creative}`} checked={checked} onChange={onToggle} /><span aria-hidden="true">เทียบ</span></label>}
        </span>
      </div>
    </div>
  </article>;
}
