/* ตัวเลือกฐานเทียบ ใช้ทุกหน้า ads — "เดือนนี้" ล็อกเป็นวันเดียวกันเดือนก่อน (ทุกตัวบนหน้าต้องฐานเดียวกัน · effectiveCompare) */
import { Dropdown } from "./Dropdown.jsx";

export function CompareControl({ period, value, onChange }) {
  if (period === "mtd") return <span className="aw-fixed-compare" title="ช่วงเดือนนี้เทียบวันเดียวกันของเดือนก่อนทุกตัวเลข">เทียบ · วันเดียวกันเดือนก่อน</span>;
  return <Dropdown label="เทียบ" options={[["previous", period === "wtd" ? "สัปดาห์ก่อน" : "ช่วงก่อน"], ["lastMonth", "เดือนก่อน"]]} value={value} onChange={onChange} />;
}
