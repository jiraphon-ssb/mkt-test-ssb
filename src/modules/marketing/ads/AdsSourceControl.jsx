/* ที่มาของตัวเลขบนหน้า ads — แถบเดียวที่ตอบว่า "เลขที่เห็นมาจากไหน สดแค่ไหน" ของทั้ง 3 ระบบ
   Meta (ค่าแอด · Creative) · ระบบขายพี่ทัช (TD · JD · TA) · ระบบ TMK (JUNTAKARN)
   18 ก.ย. 69: ถอดตัวสลับ "ของจริง / ตัวอย่าง" ออก — หน้านี้ใช้ข้อมูลจริงเสมอ (โหมดเดโมยังเป็นข้อมูลตัวอย่าง)
   แถบบอกอยู่แล้วว่าเป็นข้อมูลจริง ป้ายสลับจึงซ้ำและกินที่หัวหน้า */
import { Link } from "react-router-dom";
import { AlertTriangle, Clock3, Database, LoaderCircle, RefreshCw } from "lucide-react";
import { adsErrorText } from "./adsSyncMessages.js";
import { SOURCE_LEGEND, sourceChips, stripVerdict } from "./adsSourceStrip.js";
import { isoDay } from "../adsScope.js";

const when = (iso) => iso ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "ยังไม่เคยสำเร็จ";

/** โหมดเดโมเท่านั้น: บอกว่าตัวเลขทั้งหน้าเป็นของสมมติ (ข้อมูลจริงไม่ต้องมีป้าย — แถบด้านล่างบอกแล้ว) */
export function AdsSourceControl({ ads }) {
  if (ads.source !== "mock") return null;
  return <span className="aw-demo" title="โหมดเดโม — ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง"><i /> ข้อมูลตัวอย่าง</span>;
}

export function AdsSourceNotice({ ads }) {
  if (ads.source !== "meta_pilot") return null;
  const { status, error, summary } = ads.pilot;
  if (status === "loading" || status === "idle") {
    return <div className="ads-source-note" role="status"><LoaderCircle size={14} className="spin" /><span>กำลังโหลดตัวเลขจริง…</span></div>;
  }
  if (status === "error") {
    return <div className="ads-source-note bad" role="alert"><AlertTriangle size={14} /><span><b>โหลดตัวเลขจริงไม่สำเร็จ</b> · {adsErrorText(error, "ลองใหม่อีกครั้ง")} · ไม่ได้แสดงข้อมูลตัวอย่างแทน</span><button type="button" onClick={ads.reload}><RefreshCw size={13} /> ลองใหม่</button></div>;
  }
  if (summary.empty) {
    return <div className="ads-source-note warn" role="status"><Database size={14} /><span><b>ยังไม่มีค่าแอดจริง</b> · {summary.accounts ? `${summary.accounts} บัญชีเชื่อมแล้ว แต่ยังไม่เคยดึงข้อมูล` : "ยังไม่มีบัญชี Meta ที่บันทึก mapping"}</span><Link to={summary.accounts ? "/mkt/ads/sync" : "/mkt/ads?panel=settings&tab=sources"}>{summary.accounts ? "ไปดึงข้อมูล" : "ไปตั้งค่าบัญชี"}</Link></div>;
  }
  const today = isoDay(new Date());
  const chips = sourceChips({ summary, sales: ads.sales, salesGoals: ads.salesGoals, today });
  const verdict = stripVerdict(chips);
  /* สามชั้น: สรุปหนึ่งบรรทัด → ป้ายความสดรายแหล่ง → ที่มาของตัวเลขพับเก็บไว้ (เป็นข้อมูลอ้างอิง ไม่ต้องอ่านทุกครั้ง) */
  return <section className={`ads-source-note ${verdict.state}`} aria-label="ที่มาของตัวเลข">
    <div className="ads-source-top">
      <p className="ads-source-verdict" role="status"><Database size={14} aria-hidden="true" /><b>{verdict.text}</b></p>
      {summary.provisionalToday && <span className="ads-source-flag"><Clock3 size={13} aria-hidden="true" /> วันนี้ยังไม่สิ้นสุด ยอดยังเปลี่ยนได้</span>}
      <button type="button" className="ads-source-reload" onClick={ads.reload}><RefreshCw size={13} aria-hidden="true" /> โหลดใหม่</button>
    </div>
    <ul className="ads-source-chips">
      {chips.map((chip) => <li key={chip.key} className={chip.tone}>
        <span>{chip.label}</span><b>{chip.value}</b>
      </li>)}
    </ul>
    <details className="ads-source-legend">
      <summary>ที่มาของตัวเลข</summary>
      <dl>
        {SOURCE_LEGEND.map((item) => <div key={item.from}><dt>{item.from}</dt><dd>{item.metrics}</dd></div>)}
        <div><dt>ดึงค่าแอดล่าสุด</dt><dd>{when(summary.lastSuccessAt)}</dd></div>
      </dl>
    </details>
  </section>;
}
