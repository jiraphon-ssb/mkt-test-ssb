/* แหล่งข้อมูลของหน้า ads: ตัวสลับ (team_lead) หรือป้าย "ข้อมูลตัวอย่าง" + แถบที่มาของตัวเลข
   แถบนี้ตอบคำถาม "เลขที่เห็นมาจากไหน สดแค่ไหน" ของทั้ง 3 ระบบ — Meta · ระบบขายพี่ทัช · ระบบ TMK (JUNTAKARN)
   เดิมเขียนว่า "Meta Pilot" (ชื่อภายใน ไม่บอกอะไร) และบอกความสดของ Meta อย่างเดียว */
import { Link } from "react-router-dom";
import { AlertTriangle, Clock3, Database, LoaderCircle, RefreshCw } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { ADS_SOURCE_OPTIONS } from "./adsFacts.js";
import { adsErrorText } from "./adsSyncMessages.js";
import { SOURCE_LEGEND, sourceChips, stripVerdict } from "./adsSourceStrip.js";
import { isoDay } from "../adsScope.js";

const when = (iso) => iso ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "ยังไม่เคยสำเร็จ";

export function AdsSourceControl({ ads }) {
  // สลับได้เฉพาะหัวหน้าทีม · คนอื่นเห็นป้ายบอกแหล่งข้อมูลที่กำลังดูอยู่ ไม่ต้องเดาว่าเลขจริงหรือตัวอย่าง
  if (!ads.canSwitch) {
    return ads.source === "mock"
      ? <span className="aw-demo" title="โหมดเดโม — ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง"><i /> ข้อมูลตัวอย่าง</span>
      : <span className="aw-live" title="ตัวเลขจริงจากระบบขายและ Meta Ads (อ่านอย่างเดียว)"><i /> ข้อมูลจริง</span>;
  }
  return <Dropdown label="ข้อมูล" ariaLabel="แหล่งข้อมูล" align="end" options={ADS_SOURCE_OPTIONS} value={ads.source} onChange={ads.setSource} active={ads.source !== "mock"} />;
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
  return <div className={`ads-source-note${verdict.state === "warn" ? " warn" : ""}`} role="status">
    <Database size={14} />
    <div className="ads-source-body">
      <div className="ads-source-head">
        <b>{verdict.text}</b>
        {summary.provisionalToday && <span className="ads-source-flag"><Clock3 size={13} /> วันนี้ยังไม่สิ้นสุด ยอดยังเปลี่ยนได้</span>}
      </div>
      {/* แหล่งละป้าย — สถานะเขียนเป็นคำ ไม่ได้บอกด้วยสีอย่างเดียว */}
      <ul className="ads-source-chips">
        {chips.map((chip) => <li key={chip.key} className={chip.tone}>
          <span>{chip.label}</span><b>{chip.value}</b>
        </li>)}
      </ul>
      <p className="ads-source-fine">
        {SOURCE_LEGEND.map((item) => <span key={item.from}><b>{item.metrics}</b> มาจาก{item.from}</span>)}
        <span>ดึงค่าแอดล่าสุด {when(summary.lastSuccessAt)}</span>
      </p>
    </div>
    <button type="button" onClick={ads.reload}><RefreshCw size={13} /> โหลดใหม่</button>
  </div>;
}
