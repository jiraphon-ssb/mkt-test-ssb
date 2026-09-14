/* RevenueBasisToggle — กลุ่มปุ่ม "คิดจาก · ยอดใหม่ / ยอดรวม" ชิ้นเดียวใช้ทุกหน้า (Overview · แคมเปญ) ให้หน้าตา/ป้าย/a11y ตรงกัน
   สไตล์: .aw-basis ใน adsSectionTabs.css (สูตรเดียวกับ .aw-presets/.cp-basis) */
const OPTIONS = [["new", "ยอดใหม่"], ["total", "ยอดรวม"]];

export function RevenueBasisToggle({ value, onChange, label = "คิดจาก" }) {
  return <div className="aw-basis" role="radiogroup" aria-label="ฐานยอดขาย">
    <span>{label}</span>
    {OPTIONS.map(([key, text]) => <button type="button" role="radio" key={key} aria-checked={value === key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}
