/* ยอดขาย JUNTAKARN จากระบบ TMK Operation (Supabase คนละโปรเจกต์) → business_daily_facts
   ข้อตกลง 21 ก.ย. 2569: นับเฉพาะออเดอร์ช่องทาง Facebook · วันของยอด = วันออเดอร์
   (เดิม 18 ก.ย. นับทุกช่องแชท — เปลี่ยนเพราะหน้านี้วัดค่าแอด Meta ที่ยิงลงเพจ FB ตัวตั้งกับตัวหารต้องเป็นช่องเดียวกัน)
   funnel มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) — Lead/ได้ออเดอร์ ระบบนี้ไม่มี หน้าจอซ่อนด้วย BRAND_FUNNEL_STAGES
   ข้อมูลลูกค้าไม่ข้ามระบบ: RPC คืนเฉพาะ JK_FACT_COLUMNS · เจอคอลัมน์เกิน = หยุดก่อนเขียน (jkExtraColumns) */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const JK_BRAND_ID = "b_jt";
export const JK_SOURCE = "tmk";
export const JK_FACT_COLUMNS = [
  "day", "inquiries", "inq_by_channel", "inquiry_filled",
  "orders", "orders_new", "sales", "sales_new", "ord_by_channel",
  "cancelled", "cancelled_value",
];

/* ชื่อช่องทางที่ยอมรับ — ฝั่ง TMK ช่อง channel เป็นข้อความอิสระที่ทีมแก้เองได้ (มี override ด้วย)
   ถ้าเอา key มาตรงๆ ชื่อ/เบอร์ลูกค้าที่พิมพ์ลงช่องนั้นจะข้ามระบบมาขึ้นบนจอเรา — นอกรายการนี้รวมเป็น "other" (ไม่ทิ้งยอด) */
export const JK_CHANNEL_KEYS = ["Facebook", "LINE", "Instagram", "TikTok", "Messenger", "Phone", "Direct", "other"];
const OTHER = "other";
const safeKey = (key) => (JK_CHANNEL_KEYS.includes(key) ? key : OTHER);

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const money = (value) => Math.round(num(value) * 100) / 100;
const count = (value) => Math.trunc(num(value));
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** {Facebook: 20} + {Facebook: 3} → {Facebook: {inquiries:20, leads:0, deposits:0, orders:3}} */
function channelFunnelOf(inq, ord) {
  const out = {};
  const add = (key, field, value) => {
    const safe = safeKey(key);
    const lane = out[safe] ?? (out[safe] = { inquiries: 0, leads: 0, deposits: 0, orders: 0 });
    lane[field] += count(value);
  };
  for (const [key, value] of Object.entries(inq ?? {})) add(key, "inquiries", value);
  for (const [key, value] of Object.entries(ord ?? {})) add(key, "orders", value);
  return out;
}

/** {ช่องทาง: จำนวน} — ชื่อช่องทางนอกรายการรวมเป็น other (รวมยอด ไม่ทิ้ง) */
function byChannel(source) {
  const out = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const safe = safeKey(key);
    out[safe] = (out[safe] ?? 0) + count(value);
  }
  return out;
}

export function jkRowsToDailyFacts(rows = [], { from, to } = {}) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  const byDay = new Map();
  for (const row of rows ?? []) {
    const day = String(row?.day ?? "").slice(0, 10);
    if (!ISO.test(day) || day < from || day > to) continue;
    byDay.set(day, row);
  }
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row = byDay.get(day);
    out.push({
      brand_id: JK_BRAND_ID, fact_date: day, source: JK_SOURCE, external_record_id: `JK|${day}`,
      inquiries: count(row?.inquiries),
      inquiries_by_channel: byChannel(row?.inq_by_channel),
      inquiry_filled: row?.inquiry_filled === true,
      channel_funnel: row ? channelFunnelOf(row.inq_by_channel, row.ord_by_channel) : {},
      // ระบบ TMK ไม่มีสเตจ Lead และมัดจำ — เก็บ 0 ไว้ในฐาน หน้าจอซ่อนด้วย BRAND_FUNNEL_STAGES (ไม่ได้แปลว่าศูนย์จริง)
      qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
      orders: count(row?.orders), orders_new: count(row?.orders_new),
      gross_revenue: money(row?.sales), revenue_new: money(row?.sales_new),
      refunds: 0, cash_received: 0,
      cancelled: count(row?.cancelled), cancelled_value: money(row?.cancelled_value),
    });
  }
  return out;
}

/** คอลัมน์ที่ไม่ได้ขอแต่กลับมา — ใช้หยุดก่อนเขียนลงฐาน (กันข้อมูลลูกค้าหลุดข้ามระบบ) */
export function jkExtraColumns(rows = []) {
  const extra = new Set();
  for (const row of rows ?? []) {
    for (const column of Object.keys(row ?? {})) if (!JK_FACT_COLUMNS.includes(column)) extra.add(column);
  }
  return [...extra].sort();
}

/** จำนวน "วันในช่วง" ที่ปลายทางคืนมาจริง — ใช้กันเขียนศูนย์ทับของจริงเมื่อบางก้อนคืนชุดว่าง
    (RPC การันตี 1 แถวต่อวันจาก generate_series ถ้าได้ไม่ครบแปลว่าบางก้อนหลุด) */
export function jkCoveredDays(rows = [], { from, to } = {}) {
  const days = new Set();
  for (const row of rows ?? []) {
    const day = String(row?.day ?? "").slice(0, 10);
    if (ISO.test(day) && day >= from && day <= to) days.add(day);
  }
  return days.size;
}
