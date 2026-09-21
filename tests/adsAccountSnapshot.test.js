/* snapshot บัญชีแอดทุกตัวที่ token เห็น — ฐานของตัวตรวจ "เงินออกนอกระบบ" (spec 2026-09-22)
   amount_spent/balance ของ Graph เป็น minor units (สตางค์) — เก็บดิบ ห้ามหาร 100 ตรงนี้ */
import { describe, expect, it } from "vitest";
import { fetchAccountSnapshots, snapshotRows } from "../supabase/functions/_shared/adsAccountSnapshot.js";

describe("snapshotRows", () => {
  it("แปลงบัญชีจาก Graph เป็นแถว snapshot — ตัวเลขเป็นสตางค์ตามที่ Graph ส่ง", () => {
    const rows = snapshotRows({ data: [
      { account_id: "111000111", name: "JD1", currency: "THB", account_status: 1, amount_spent: "1508073700", balance: "6166583" },
      { account_id: "222000222", name: "Finix2", currency: "THB", account_status: 2, amount_spent: "1240000", balance: "0" },
    ] });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ external_account_id: "111000111", account_name: "JD1", currency: "THB",
      account_status: 1, amount_spent_cents: 1508073700, balance_cents: 6166583 });
    expect(rows[1].account_status).toBe(2);
  });
  it("ข้อมูลพัง (ไม่มี account_id / ตัวเลขอ่านไม่ได้) = ข้ามแถว/เป็น null ไม่พังทั้งชุด", () => {
    const rows = snapshotRows({ data: [{ name: "x" }, { account_id: "3", amount_spent: "oops" }] });
    expect(rows).toEqual([{ external_account_id: "3", account_name: "", currency: "THB",
      account_status: null, amount_spent_cents: null, balance_cents: null }]);
  });
});

describe("fetchAccountSnapshots", () => {
  it("ตาม paging จนหมดและต่อแถวตามลำดับ", async () => {
    const pages = {
      "https://graph.facebook.com/v23.0/me/adaccounts?fields=account_id,name,currency,account_status,amount_spent,balance&limit=100":
        { data: [{ account_id: "1", name: "A", amount_spent: "100", balance: "0", account_status: 1, currency: "THB" }], paging: { next: "https://graph.facebook.com/page2" } },
      "https://graph.facebook.com/page2":
        { data: [{ account_id: "2", name: "B", amount_spent: "200", balance: "50", account_status: 1, currency: "THB" }] },
    };
    const fetch = async (url) => ({ ok: true, status: 200, json: async () => pages[url] });
    const rows = await fetchAccountSnapshots({ fetch, token: "t", sleep: async () => {}, version: "v23.0" });
    expect(rows.map((r) => r.external_account_id)).toEqual(["1", "2"]);
  });
});
