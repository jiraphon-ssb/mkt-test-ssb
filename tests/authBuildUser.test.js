import { describe, it, expect } from "vitest";
import { buildUser, isMissingTable } from "../src/foundation/auth/buildUser.js";
import { can } from "../src/foundation/rbac/can.js";

const AUTH = { id: "9a5b811b-0000-0000-0000-000000000000", email: "jiraphon.e@example.com" };

describe("buildUser — โหมด Supabase auth", () => {
  it("ไม่มี role ใดเลย → เห็นแค่ขอเบิกเงิน + คลังความรู้ (พฤติกรรมเดิม)", () => {
    const u = buildUser(AUTH, [], [], null);
    expect(u.permissions).toEqual(["finance.request.view", "km.view"]);
    expect(u.roleLabel).toBe("ยังไม่มี role");
    expect(can(u, "marketing.dash.view")).toBe(false);
  });
  it("ผูก mkt_profile ที่ active → ได้สิทธิ์ marketing ตาม role และป้ายชื่อจากโปรไฟล์", () => {
    const u = buildUser(AUTH, [], [], { id: "u_art", display_name: "อาร์ต", role: "team_lead", active: true });
    expect(can(u, "marketing.dash.view")).toBe(true);
    expect(can(u, "marketing.admin")).toBe(true);
    expect(u.roleLabel).toContain("team_lead");
    expect(u.name).toBe("อาร์ต");
    expect(u.mktProfileId).toBe("u_art");
  });
  it("content_owner ได้ marketing.dash.view แต่ไม่ได้ marketing.admin · โปรไฟล์ inactive ไม่ได้สิทธิ์เลย", () => {
    const owner = buildUser(AUTH, [], [], { id: "u_x", display_name: "x", role: "content_owner", active: true });
    expect(can(owner, "marketing.dash.view")).toBe(true);
    expect(can(owner, "marketing.admin")).toBe(false);
    const inactive = buildUser(AUTH, [], [], { id: "u_y", display_name: "y", role: "team_lead", active: false });
    expect(can(inactive, "marketing.dash.view")).toBe(false);
  });
  it("สิทธิ์ finance/sale เดิมยังรวมกับ marketing ได้", () => {
    const u = buildUser(AUTH, [{ entity: "SSB", role: "finance", approve_limit: 0 }], [{ role: "sales_rep", default_brand: "b_td" }], { id: "u_art", display_name: "อาร์ต", role: "performance_marketer", active: true });
    expect(can(u, "finance.ap.view")).toBe(true);
    expect(can(u, "sale.oem.view")).toBe(true);
    expect(can(u, "marketing.results.export")).toBe(true);
  });
});

describe("isMissingTable — ตาราง role ของแพลตฟอร์มไม่มีในบางโปรเจกต์ ไม่ถือเป็น error ชั่วคราว", () => {
  it("PGRST205 / 42P01 / ข้อความ could not find the table → true", () => {
    expect(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.user_role' in the schema cache" })).toBe(true);
    expect(isMissingTable({ code: "42P01", message: 'relation "user_role" does not exist' })).toBe(true);
  });
  it("เน็ตล่ม / สิทธิ์ถูกปฏิเสธ / ไม่มี error → false", () => {
    expect(isMissingTable({ code: "", message: "TypeError: Failed to fetch" })).toBe(false);
    expect(isMissingTable({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingTable(null)).toBe(false);
  });
});
