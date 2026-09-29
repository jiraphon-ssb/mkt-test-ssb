/* รายการตัดบัตรจริงของ Meta ต่อบัญชีแอด — ชั้น "Meta ตัดจริง" ของหน้า บิล & กระทบยอด (แทนการอัปโหลด CSV)
   ที่มา: GET /act_{id}/activities?category=BUDGET (สิทธิ์ ads_read เดิม) — อาร์ตทดสอบใน Graph API Explorer 29 ก.ย. 69
   ได้ event_type "ad_account_billing_charge" + extra_data (JSON string) {currency, new_value (สตางค์), transaction_id}
   ทางอื่นใช้ไม่ได้: /act/transactions ถูกปลดตั้งแต่ v2.12 · business_invoices มีเฉพาะบัญชีใบแจ้งหนี้รายเดือน
   ยอดเป็น minor units เหมือน balance/amount_spent ของ API เดียวกัน (balance 344808 = ฿3,448.08 ตรงกับหน้าบิล)
   VAT: บัญชีที่ใส่เลขผู้เสียภาษี (tax_id_status 3) Meta ไม่บวก VAT — ยอดที่ตัด = ค่าแอดล้วน (chargeMatch ตัดสินโหมดเองอยู่แล้ว) */
import { fetchAllPages } from "./metaInsights.js";

/** event_type → ชนิดที่หน้าบิลใช้ · charge เท่านั้นที่นับเป็นยอดตัด ที่เหลือใช้เตือน */
export const BILLING_KINDS = {
  ad_account_billing_charge: "charge",
  ad_account_billing_charge_failed: "failed",
  ad_account_billing_decline: "declined",
  ad_account_billing_refund: "refund",
  ad_account_billing_chargeback: "chargeback",
  ad_account_billing_chargeback_reversal: "chargeback_reversal",
};

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** วันแรกที่ระบบมีข้อมูลค่าแอด (18 มิ.ย.) — ดึงย้อนตั้งแต่ต้นเดือนนั้น */
export const BILLING_START = "2026-06-01";
const MAX_WINDOW_DAYS = 90;

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** "2026-09-26T09:56:29+0000" → วันที่เวลาไทย (ไทยไม่มี DST) */
const bangkokDay = (eventTime) => {
  const ms = Date.parse(String(eventTime ?? "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(ms) ? new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10) : null;
};
const parseExtra = (value) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return null; }
};

/** เหตุการณ์จาก /activities → แถว ad_billing_charges · ข้ามเหตุการณ์อื่น/ข้อมูลเสีย/ไม่มียอด (ห้ามเดาเป็น 0) */
export function parseBillingActivities(events = [], accountId) {
  const account = String(accountId ?? "").replace(/^act_/, "");
  const rows = [];
  for (const event of events ?? []) {
    const kind = BILLING_KINDS[event?.event_type];
    if (!kind) continue;
    const extra = parseExtra(event.extra_data);
    const minor = Number(extra?.new_value);
    const day = bangkokDay(event.event_time);
    if (!extra || !Number.isFinite(minor) || !day) continue;
    // ไม่มีเลขรายการ (เช่นบัตรถูกปฏิเสธ) = อ้างอิงจากชนิด+เวลา — ดึงซ้ำแล้วชนแถวเดิม ไม่เกิดแถวซ้ำ
    const reference = extra.transaction_id ? String(extra.transaction_id) : `${kind}:${event.event_time}`;
    rows.push({
      source: "meta_api", external_account_id: account, charge_date: day, amount: minor / 100, reference,
      raw: { kind, event_type: event.event_type, event_time: event.event_time, currency: extra.currency ?? null, amount_minor: minor },
    });
  }
  return rows;
}

/** เที่ยงคืนเวลาไทยของวันนั้นเป็น unix วินาที (ไทยไม่มี DST) */
const bangkokMidnight = (iso) => Date.parse(`${iso}T00:00:00+07:00`) / 1000;

/** since/until = วันที่ไทย (รวมทั้งสองวัน) → ส่งเป็น unix เที่ยงคืนไทย · until = เที่ยงคืนของวันถัดไป (ไม่รวม)
    เดิมส่งวันที่เปล่า Meta ตีเป็น 00:00 UTC (= 07:00 ไทย) และ until ไม่รวม → บิลหลัง 07:00 ของวันที่ดึงหาย
    และรอยต่อระหว่างช่วง 90 วันหาย 1 วัน (ตรวจกับ Meta 29 ก.ย.: t around ตัด 07:08 ฿19,572.33 · TEAMDEE 29 ส.ค. 20:26 ฿7,000 ไม่เข้า) */
export function activitiesUrl({ version, accountId, since, until }) {
  const id = String(accountId).replace(/^act_/, "");
  return `https://graph.facebook.com/${version}/act_${id}/activities?fields=event_type,event_time,extra_data&category=BUDGET&since=${bangkokMidnight(since)}&until=${bangkokMidnight(addDays(until, 1))}&limit=500`;
}

/** แบ่งช่วงละไม่เกิน 90 วัน (ช่วงยาวให้ผลช้าและเสี่ยงหมดเวลา Edge Function) */
export function chargeWindows({ since, until, maxDays = MAX_WINDOW_DAYS }) {
  if (!ISO_DAY.test(String(since)) || !ISO_DAY.test(String(until)) || since > until) return [];
  const out = [];
  for (let from = since; from <= until;) {
    const to = addDays(from, maxDays - 1) < until ? addDays(from, maxDays - 1) : until;
    out.push({ since: from, until: to });
    from = addDays(to, 1);
  }
  return out;
}

/** เริ่มดึงจากไหน: ยังไม่เคยดึง = วันเริ่มระบบ · เคยดึง = ย้อนซ้อน 7 วัน (Meta อาจลงเหตุการณ์ช้า · upsert กันซ้ำ) */
export function billingSince({ latest = null, overlapDays = 7, start = BILLING_START } = {}) {
  if (!ISO_DAY.test(String(latest ?? ""))) return start;
  const from = addDays(latest, -overlapDays);
  return from < start ? start : from;
}

/** ดึงทุกบัญชี × ทุกช่วง · บัญชีที่ล้ม (ไม่มีสิทธิ์/ถูกปิด) ข้ามไปแล้วบอกชื่อ — ไม่ล้มทั้งรอบ cron */
export async function fetchBillingCharges({ fetch, token, sleep, version, accountIds = [], since, until }) {
  const rows = [], failed = [];
  for (const id of accountIds) {
    try {
      for (const window of chargeWindows({ since, until })) {
        const { rows: events } = await fetchAllPages(activitiesUrl({ version, accountId: id, ...window }), { fetch, token, sleep, maxRetries: 2 });
        rows.push(...parseBillingActivities(events, id));
      }
    } catch {
      failed.push(String(id).replace(/^act_/, ""));
    }
  }
  return { rows, failed };
}

/** ดึงรายการตัดบัตรตั้งแต่รายการล่าสุด (ย้อนซ้อน 7 วัน) ถึงวันนี้ แล้ว upsert กันซ้ำ — ใช้ร่วม ads-cron และ ads-snapshot
    ล้มตรงไหนคืนผลสรุป ไม่ throw (รอบ cron/ปุ่มยอดค้างต้องไปต่อ) · ต้องมี unique index (external_account_id, reference) */
export async function syncBillingCharges({ db, fetch, token, sleep, version, accountIds = [], today, since: fromDay = null }) {
  const { data: latest } = await db.from("ad_billing_charges").select("charge_date").eq("source", "meta_api")
    .order("charge_date", { ascending: false }).limit(1).maybeSingle();
  /* since = ดึงย้อนตั้งแต่วันที่กำหนด (ครั้งเดียว ใช้เติมรอยรั่ว) · ไม่ส่ง/ค่าเสีย = รอบปกติ ย้อนซ้อน 7 วันจากรายการล่าสุด */
  const since = ISO_DAY.test(String(fromDay ?? "")) ? (fromDay < BILLING_START ? BILLING_START : fromDay)
    : billingSince({ latest: latest?.charge_date ?? null });
  const fetched = await fetchBillingCharges({ fetch, token, sleep, version, accountIds, since, until: today });
  // เหตุการณ์เดียวกันซ้ำในชุด (หน้าซ้อน/ช่วงชนขอบ) = แถวเดียว — upsert ชุดเดียวที่มีคีย์ซ้ำ Postgres จะ error ทั้งชุด
  const rows = [...new Map(fetched.rows.map((row) => [`${row.external_account_id}|${row.reference}`, row])).values()];
  const { failed } = fetched;
  if (!rows.length) return { since, rows: 0, failed, error: null };
  const { error } = await db.from("ad_billing_charges").upsert(rows, { onConflict: "external_account_id,reference" });
  return { since, rows: rows.length, failed, error: error?.message ?? null };
}
