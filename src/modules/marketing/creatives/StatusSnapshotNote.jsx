/* แถบบอกว่าสถานะเปิด/ปิดเป็นของเวลาไหน — ขึ้นเฉพาะเมื่อตอนดึงไม่มีโฆษณาไหนเปิด แต่เมื่อวานยังใช้เงิน
   (ทดสอบแบบผู้ใช้จริง 27 ก.ย.: ทุกแถวขึ้น "ปิดอยู่" ทั้งที่รันมา 26 วันและเมื่อวานใช้ ฿14,168.89) */
import { fmtMoney } from "../dash/charts/theme.js";

const clock = (iso) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });

export function StatusSnapshotNote({ note }) {
  if (!note) return null;
  return <p className="ads-source-note warn status-snapshot" role="status">
    <span><b>สถานะเปิด/ปิดเป็นของตอน {note.at ? `${clock(note.at)} น.` : "ดึงรอบล่าสุด"}</b> — ตอนนั้นไม่มีโฆษณาไหนเปิด แต่เมื่อวานยังใช้เงิน {fmtMoney(note.spend)} · ทีมอาจตั้งปิดอัตโนมัติช่วงกลางคืน สถานะตอนนี้ดูใน Ads Manager</span>
  </p>;
}
