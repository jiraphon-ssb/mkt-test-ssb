/* ยอดขาย JUNTAKARN จากระบบ TMK Operation (Supabase คนละโปรเจกต์) → business_daily_facts
   ข้อตกลง 18 ก.ย. 2569: นับเฉพาะออเดอร์ช่องแชท (ROAS ของแอด Meta) · วันของยอด = วันออเดอร์
   funnel มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) — Lead/ได้ออเดอร์ ระบบนี้ไม่มี หน้าจอซ่อนด้วย BRAND_FUNNEL_STAGES
   ข้อมูลลูกค้าไม่ข้ามระบบ: RPC คืนเฉพาะ JK_FACT_COLUMNS · เจอคอลัมน์เกิน = หยุดก่อนเขียน (jkExtraColumns) */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const JK_BRAND_ID = "b_jt";
export const JK_SOURCE = "tmk";
export const JK_FACT_COLUMNS = [
  "day", "inquiries", "inq_by_channel", "inquiry_filled",
  "orders", "orders_new", "sales", "sales_new", "ord_by_channel",
  "cancelled", "cancelled_value", "avg_reply_minutes",
];

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
  const keys = new Set([...Object.keys(inq ?? {}), ...Object.keys(ord ?? {})]);
  for (const key of keys) {
    out[key] = { inquiries: count(inq?.[key]), leads: 0, deposits: 0, orders: count(ord?.[key]) };
  }
  return out;
}

const byChannel = (source) => Object.fromEntries(Object.entries(source ?? {}).map(([key, value]) => [key, count(value)]));

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
