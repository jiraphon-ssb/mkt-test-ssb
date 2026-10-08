/* ค้นหาบัญชีโฆษณาที่คนกดเชื่อมเข้าถึงได้ (pure)
   แทนที่จะถามคนว่า "บัญชีอยู่ใต้ MCC มั้ย" ให้ Google บอกเราเอง:
   customer_client คืนทั้งตัวบัญชีที่ถามและลูกทั้งหมด พร้อมธง manager และ level */
import { describe, expect, it } from "vitest";
import {
  GAQL_CUSTOMER_CLIENTS, listAccessibleCustomersUrl, normalizeCustomerClient, parseAccessibleCustomers,
} from "../supabase/functions/_shared/googleAdsAccounts.js";
import { GOOGLE_ADS_VERSION } from "../supabase/functions/_shared/googleAdsReports.js";

describe("listAccessibleCustomersUrl", () => {
  it("ชี้ไป endpoint ของเวอร์ชันที่ล็อกไว้", () => {
    expect(listAccessibleCustomersUrl()).toBe(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers:listAccessibleCustomers`);
  });
});

describe("parseAccessibleCustomers", () => {
  it("แปลง resourceNames เป็นรหัสบัญชีล้วน", () => {
    expect(parseAccessibleCustomers({ resourceNames: ["customers/1234567890", "customers/9876543210"] }))
      .toEqual(["1234567890", "9876543210"]);
  });
  it("ไม่มีบัญชีเลย = อาเรย์ว่าง ไม่ throw", () => {
    expect(parseAccessibleCustomers({})).toEqual([]);
  });
});

describe("GAQL_CUSTOMER_CLIENTS", () => {
  it("ขอข้อมูลที่หน้าจอต้องใช้ครบ และกรองบัญชีที่ปิดไปแล้วออก", () => {
    for (const f of ["customer_client.id", "customer_client.descriptive_name", "customer_client.currency_code",
      "customer_client.time_zone", "customer_client.manager", "customer_client.level"]) {
      expect(GAQL_CUSTOMER_CLIENTS).toContain(f);
    }
    expect(GAQL_CUSTOMER_CLIENTS).toMatch(/FROM customer_client/);
    expect(GAQL_CUSTOMER_CLIENTS).toMatch(/customer_client\.status = 'ENABLED'/);
  });
});

describe("normalizeCustomerClient", () => {
  const row = (patch = {}) => ({ customerClient: { id: "1234567890", descriptiveName: "TEAMDEE - Search", currencyCode: "THB", timeZone: "Asia/Bangkok", manager: false, level: "1", ...patch } });

  it("บัญชีลูกใต้ MCC ต้องจำว่าเรียกผ่านบัญชีผู้จัดการตัวไหน", () => {
    const out = normalizeCustomerClient(row(), { queriedCustomerId: "111-222-3333" });
    expect(out).toMatchObject({
      external_account_id: "1234567890", account_name: "TEAMDEE - Search",
      currency: "THB", timezone: "Asia/Bangkok", manager: false, login_customer_id: "1112223333",
    });
  });

  it("บัญชีเดี่ยว (level 0 = ตัวเอง) ไม่ต้องมี login-customer-id", () => {
    const out = normalizeCustomerClient(row({ id: "1112223333", level: "0" }), { queriedCustomerId: "111-222-3333" });
    expect(out.login_customer_id).toBe(null);
  });

  it("บัญชีผู้จัดการติดธงไว้ — ยิงรายงานกับบัญชีแบบนี้ไม่ได้ หน้าจอต้องกันไม่ให้เลือก", () => {
    expect(normalizeCustomerClient(row({ manager: true }), { queriedCustomerId: "1" }).manager).toBe(true);
  });

  it("ไม่มีชื่อบัญชี = ใช้รหัสแทน ไม่ปล่อยช่องว่างให้คนงง", () => {
    expect(normalizeCustomerClient(row({ descriptiveName: undefined }), { queriedCustomerId: "1" }).account_name).toBe("1234567890");
  });

  it("ไม่มีรหัสบัญชี = แถวใช้ไม่ได้", () => {
    expect(() => normalizeCustomerClient({ customerClient: {} }, { queriedCustomerId: "1" })).toThrow();
  });
});
