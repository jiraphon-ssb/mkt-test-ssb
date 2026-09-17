/* กราฟแนวโน้ม: โหมดสะสม + เส้นเป้าตามจังหวะ (logic ล้วน ไม่แตะ React/Chart.js) */

export const TREND_MODES = [["line", "เส้น"], ["bar", "แท่ง"], ["cumulative", "สะสม"]];

/** บาท/จำนวน — บวกข้ามวันได้ตรงๆ · ที่เหลือเป็นอัตราส่วน สะสม = คิดใหม่จากยอดรวมตั้งแต่ต้นช่วง (ไม่ใช่เอาค่ารายวันมาบวก) */
export const ADDITIVE_TREND_KEYS = ["spend", "revenue", "inquiry", "leads", "deposits", "orders", "impressions"];

/** Frequency = Impressions ÷ Reach — คนเดียวกันเห็นหลายวัน reach รวมข้ามวันไม่ได้ สะสมแล้วตัวเลขผิด */
export const canCumulate = (key) => key !== "frequency";

/** ค่าสะสมรายจุด · valueThrough(i) = ค่าของช่วง "ต้นช่วง → วันที่ i"
    ยอดที่บวกได้: วันที่ไม่มีค่า = null (ไม่ลากยอดเดิมต่อ ให้ดูเหมือนวันนั้นเป็น 0)
    lastIndex = จุดสุดท้ายที่มีได้ (หลังจากนั้นเป็นอนาคต) */
export function cumulativeSeries({ key, daily = [], valueThrough, lastIndex = null }) {
  return daily.map((value, i) => {
    if (lastIndex != null && i > lastIndex) return null;
    if (ADDITIVE_TREND_KEYS.includes(key) && value == null) return null;
    return valueThrough(i) ?? null;
  });
}

/** เป้าเดือนตามจังหวะ: วันที่ d = เป้า × d ÷ จำนวนวันของเดือนนั้น · ไม่มีเป้า = null */
export function targetPaceSeries(days = [], target) {
  if (!(target > 0)) return null;
  return days.map((iso) => {
    const day = new Date(iso);
    const monthDays = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
    return (target * day.getDate()) / monthDays;
  });
}
