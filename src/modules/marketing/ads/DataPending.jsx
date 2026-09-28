/* ช่วงที่ข้อมูลยังไม่เข้า (ตรวจรอบ 27–28 ก.ย.) — ใช้ร่วม ภาพรวม · แคมเปญ · Creative ให้พูดเหมือนกันทุกหน้า
   เดิม "วันนี้" ขึ้น ฿0.00 · ▼ 100.00% (ภาพรวม) หรือ "ไม่มีข้อมูล ลองเปลี่ยนช่วงเวลา" (แคมเปญ/Creative) ทั้งที่ข้อมูลดึงวันละครั้งตี 5
   → บอกว่ามีข้อมูลถึงวันไหน + ลิงก์ไปวันนั้น (คงตัวกรองอื่นไว้) */
import { Link, useLocation } from "react-router-dom";
import { isoDay } from "../adsScope.js";
import { DAILY_RUN_LABEL } from "../../../../supabase/functions/_shared/dailySchedule.js";
import "./dataPending.css";

const thDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

/** ข้อมูลจริง · ช่วงเริ่มหลังวันล่าสุดที่มีข้อมูล · ยังไม่มีตัวเลขในช่วงนั้น (มีแล้ว เช่นกดดึงเอง = แสดงหน้าปกติ) */
export const isDataPending = ({ real, range, dataThrough, hasData }) =>
  Boolean(real && dataThrough && range && !hasData && isoDay(new Date(range.start)) > dataThrough);

export function DataPending({ label, through }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("period", "custom"); params.set("from", through); params.set("to", through);
  return <section className="aw-panel aw-today-pending" role="status">
    <b>ข้อมูลของ {label} ยังไม่เข้า</b>
    <p>ระบบดึงค่าแอดและยอดขายวันละครั้งตอน {DAILY_RUN_LABEL} น. · ตอนนี้มีข้อมูลถึง {thDay(through)}</p>
    <Link to={`${location.pathname}?${params}`}>ดูข้อมูลล่าสุด ({thDay(through)})</Link>
  </section>;
}
