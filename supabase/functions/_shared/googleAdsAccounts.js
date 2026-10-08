/* ค้นหาบัญชีโฆษณาที่ผู้กดเชื่อมเข้าถึงได้ (pure · เทสใน tests/googleAdsAccounts.test.js)

   ทำไมไม่ถามคนว่า "บัญชีอยู่ใต้ MCC มั้ย": ถามแล้วตอบผิดได้ และคนส่วนใหญ่ไม่รู้
   customers:listAccessibleCustomers คืนบัญชีระดับบนที่ผู้ใช้เข้าถึงได้
   แล้ว customer_client ของแต่ละตัวคืน "ตัวเอง (level 0) + ลูกทั้งหมด" พร้อมธง manager
   → รู้เองว่าต้องใส่ login-customer-id หรือเปล่า และบัญชีไหนยิงรายงานไม่ได้ */
import { GOOGLE_ADS_VERSION, customerIdOf } from "./googleAdsReports.js";

export const listAccessibleCustomersUrl = ({ version = GOOGLE_ADS_VERSION } = {}) =>
  `https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`;

export const parseAccessibleCustomers = (payload) =>
  (payload?.resourceNames ?? []).map((name) => String(name).split("/").pop()).filter(Boolean);

/* ตัดบัญชีที่ปิดไปแล้วออกตั้งแต่ต้นทาง — ไม่งั้นหน้าเลือกบัญชีจะยาวด้วยของที่เลือกไปก็ใช้ไม่ได้ */
export const GAQL_CUSTOMER_CLIENTS = [
  "SELECT",
  "  customer_client.id, customer_client.descriptive_name, customer_client.currency_code,",
  "  customer_client.time_zone, customer_client.manager, customer_client.level",
  "FROM customer_client",
  "WHERE customer_client.status = 'ENABLED'",
].join("\n");

/**
 * แถว customer_client → บัญชีที่เอาไปสร้าง ad_connections ได้
 * level 0 = ตัวบัญชีที่เราถาม (ไม่ต้องมี login-customer-id)
 * level > 0 = ลูกของบัญชีผู้จัดการ → ต้องเรียกผ่านบัญชีที่ถาม
 */
export function normalizeCustomerClient(row, { queriedCustomerId }) {
  const client = row?.customerClient ?? {};
  const id = customerIdOf(client.id);
  if (!id) throw new Error("แถวบัญชีไม่มีรหัส Customer ID");
  const level = Number(client.level ?? 0);
  return {
    external_account_id: id,
    account_name: client.descriptiveName || id,   // บัญชีที่ไม่ตั้งชื่อ ให้โชว์รหัสแทนช่องว่าง
    currency: client.currencyCode ?? null,
    timezone: client.timeZone ?? null,
    manager: Boolean(client.manager),             // บัญชีผู้จัดการยิงรายงานไม่ได้ หน้าจอต้องกันไม่ให้เลือก
    login_customer_id: level > 0 ? customerIdOf(queriedCustomerId) : null,
  };
}

/** ผลของ searchStream (หลายก้อน) → รายการบัญชี (ตัดซ้ำด้วยรหัสบัญชี) */
export function collectCustomerClients(batches = [], { queriedCustomerId }) {
  const seen = new Map();
  for (const batch of batches ?? []) {
    for (const row of batch?.results ?? []) {
      const account = normalizeCustomerClient(row, { queriedCustomerId });
      if (!seen.has(account.external_account_id)) seen.set(account.external_account_id, account);
    }
  }
  return [...seen.values()];
}
