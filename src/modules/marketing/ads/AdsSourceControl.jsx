/* แหล่งข้อมูลของหน้า ads: ตัวสลับ (team_lead) หรือป้าย "ข้อมูลจำลอง" + แถบสถานะข้อมูลจริง
   แทนป้าย "Mock data" ที่เคยเขียนตายตัวในทุกหน้า */
import { Link } from "react-router-dom";
import { AlertTriangle, Clock3, Database, LoaderCircle, RefreshCw } from "lucide-react";
import { Dropdown } from "../ui/Dropdown.jsx";
import { ADS_SOURCE_OPTIONS } from "./adsFacts.js";
import { adsErrorText } from "./adsSyncMessages.js";

const when = (iso) => iso ? new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "ยังไม่เคยสำเร็จ";
const day = (iso) => iso ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`)) : "—";

export function AdsSourceControl({ ads }) {
  // สลับได้เฉพาะหัวหน้าทีม · คนอื่นเห็นป้ายบอกแหล่งข้อมูลที่กำลังดูอยู่ ไม่ต้องเดาว่าเลขจริงหรือจำลอง
  if (!ads.canSwitch) {
    return ads.source === "mock"
      ? <span className="aw-demo" title="โหมดเดโม — ตัวเลขทั้งหมดเป็นข้อมูลจำลอง"><i /> ข้อมูลจำลอง</span>
      : <span className="aw-live" title="ยอดจริงจาก Meta Ads (อ่านอย่างเดียว)"><i /> ยอดจริง · Meta</span>;
  }
  return <Dropdown label="ข้อมูล" ariaLabel="แหล่งข้อมูล" align="end" options={ADS_SOURCE_OPTIONS} value={ads.source} onChange={ads.setSource} active={ads.source !== "mock"} />;
}

export function AdsSourceNotice({ ads }) {
  if (ads.source !== "meta_pilot") return null;
  const { status, error, summary } = ads.pilot;
  if (status === "loading" || status === "idle") {
    return <div className="ads-source-note" role="status"><LoaderCircle size={14} className="spin" /><span>กำลังโหลดยอดจริงจาก Meta…</span></div>;
  }
  if (status === "error") {
    return <div className="ads-source-note bad" role="alert"><AlertTriangle size={14} /><span><b>โหลดยอดจริงไม่สำเร็จ</b> · {adsErrorText(error, "ลองใหม่อีกครั้ง")} · ไม่ได้แสดงข้อมูลจำลองแทน</span><button type="button" onClick={ads.reload}><RefreshCw size={13} /> ลองใหม่</button></div>;
  }
  if (summary.empty) {
    return <div className="ads-source-note warn" role="status"><Database size={14} /><span><b>ยังไม่มียอดจริง</b> · {summary.accounts ? `${summary.accounts} บัญชีเชื่อมแล้ว แต่ยังไม่เคยดึงข้อมูล` : "ยังไม่มีบัญชี Meta ที่บันทึก mapping"}</span><Link to={summary.accounts ? "/mkt/ads/sync" : "/mkt/ads?panel=settings&tab=sources"}>{summary.accounts ? "ไปดึงข้อมูล" : "ไปตั้งค่าบัญชี"}</Link></div>;
  }
  return <div className="ads-source-note" role="status">
    <Database size={14} />
    <span><b>Meta Pilot</b> · {summary.accounts} บัญชี · ข้อมูล {day(summary.from)}–{day(summary.to)} · อัปเดตล่าสุด {when(summary.lastSuccessAt)}</span>
    {summary.provisionalToday && <span className="ads-source-flag"><Clock3 size={13} /> วันนี้ยังไม่สิ้นสุด ยอดยังเปลี่ยนได้</span>}
    <span className="ads-source-fine">ยอดขาย · เป้า · funnel = ระบบขาย · ค่าแอด · คนทักจากแอด = Meta</span>
    <button type="button" onClick={ads.reload}><RefreshCw size={13} /> โหลดใหม่</button>
  </div>;
}
