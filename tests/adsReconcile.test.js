/* ตรวจยอดอัตโนมัติ: เทียบค่าแอด 7/30 วัน (จบเมื่อวาน) ระหว่าง ad_daily_facts กับ Meta ระดับบัญชี */
import { describe, it, expect, vi } from "vitest";
import { reconcileWindows, buildAccountSpendUrl, compareSpend, buildReconcileSummary, fetchRemoteSpend, sumLocalSpend } from "../supabase/functions/_shared/adsReconcile.js";

describe("reconcileWindows", () => {
  it("หน้าต่างจบเมื่อวาน (วันนี้ยอดยังขยับ) · 7 และ 30 วันเต็ม", () => {
    expect(reconcileWindows("2026-09-15")).toEqual({
      "7d": { from: "2026-09-08", to: "2026-09-14" },
      "30d": { from: "2026-08-16", to: "2026-09-14" },
    });
  });
  it("วันที่เพี้ยน = throw", () => {
    expect(() => reconcileWindows("15/09/2026")).toThrow("SYNC_RANGE_INVALID");
  });
});

describe("buildAccountSpendUrl", () => {
  it("ระดับ account · ไม่แบ่งรายวัน · ขอแค่ spend · attribution ตาม config · ไม่มี token ใน URL", () => {
    const url = new URL(buildAccountSpendUrl({ version: "v26.0", accountId: "act_9", from: "2026-09-08", to: "2026-09-14" }));
    expect(url.pathname).toBe("/v26.0/act_9/insights");
    expect(url.searchParams.get("level")).toBe("account");
    expect(url.searchParams.get("fields")).toBe("spend");
    expect(url.searchParams.has("time_increment")).toBe(false);
    expect(JSON.parse(url.searchParams.get("time_range"))).toEqual({ since: "2026-09-08", until: "2026-09-14" });
    expect(url.searchParams.get("use_unified_attribution_setting")).toBe("true");
    expect(url.searchParams.has("access_token")).toBe(false);
    const custom = new URL(buildAccountSpendUrl({ version: "v26.0", accountId: "act_9", from: "2026-09-08", to: "2026-09-14", attribution: "1d_click" }));
    expect(JSON.parse(custom.searchParams.get("action_attribution_windows"))).toEqual(["1d_click"]);
  });
  it("account id ผิดรูป = throw", () => {
    expect(() => buildAccountSpendUrl({ version: "v26.0", accountId: "me", from: "2026-09-08", to: "2026-09-14" })).toThrow("ACCOUNT_ID_INVALID");
  });
});

describe("compareSpend", () => {
  it("ผ่านเมื่อต่างไม่เกิน tolerance% ของยอด Meta · ปัด diffPct 2 ตำแหน่ง", () => {
    expect(compareSpend(1009.9, 1000, 1)).toEqual({ localSpend: 1009.9, remoteSpend: 1000, diffPct: 0.99, status: "passed" });
    expect(compareSpend(1011, 1000, 1).status).toBe("failed");
    expect(compareSpend(990, 1000, 1).status).toBe("passed");
  });
  it("Meta เป็น 0: ผ่านเฉพาะฝั่งเราเป็น 0 ด้วย · ค่าไม่ใช่ตัวเลข = failed ไม่ใช่ผ่านมั่ว", () => {
    expect(compareSpend(0, 0, 1)).toEqual({ localSpend: 0, remoteSpend: 0, diffPct: 0, status: "passed" });
    expect(compareSpend(5, 0, 1)).toMatchObject({ diffPct: null, status: "failed" });
    expect(compareSpend(NaN, 100, 1).status).toBe("failed");
    expect(compareSpend(100, 100, 0).status).toBe("passed");     // tolerance 0 = ต้องตรงเป๊ะ
    expect(compareSpend(100.01, 100, 0).status).toBe("failed");
  });
});

describe("fetchRemoteSpend / sumLocalSpend", () => {
  const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  it("อ่าน spend แถวเดียวจาก Meta · ไม่มีข้อมูล (ไม่ได้ยิงช่วงนั้น) = 0", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(res({ data: [{ spend: "1234.56" }] })).mockResolvedValueOnce(res({ data: [] }));
    const opts = { fetch, token: "T", sleep: async () => {} };
    expect(await fetchRemoteSpend("https://graph.facebook.com/v26.0/act_9/insights", opts)).toBe(1234.56);
    expect(await fetchRemoteSpend("https://graph.facebook.com/v26.0/act_9/insights", opts)).toBe(0);
  });
  it("รวมค่าแอดฝั่งเราแบบแบ่งหน้า · null ไม่ถูกนับเป็น 0 แต่ไม่ทำให้ล้ม (spend เป็น not null โดย schema จริง)", async () => {
    const pages = [Array.from({ length: 1000 }, () => ({ spend: "1.5" })), [{ spend: 10 }, { spend: null }]];
    const query = vi.fn(async (offset, limit) => pages[offset / limit] ?? []);
    expect(await sumLocalSpend(query, 1000)).toBe(1510);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("buildReconcileSummary", () => {
  it("ผ่านทั้งสองหน้าต่าง = passed · หน้าต่างเดียวไม่ผ่าน = failed · เก็บ from/to ต่อหน้าต่าง", () => {
    const windows = reconcileWindows("2026-09-15");
    const ok = buildReconcileSummary({ windows, tolerance: 1, results: { "7d": compareSpend(100, 100, 1), "30d": compareSpend(500, 500, 1) } });
    expect(ok).toMatchObject({ kind: "reconcile", tolerance: 1, passed: true });
    expect(ok.windows["7d"]).toMatchObject({ from: "2026-09-08", to: "2026-09-14", localSpend: 100, remoteSpend: 100, status: "passed" });
    const bad = buildReconcileSummary({ windows, tolerance: 1, results: { "7d": compareSpend(100, 100, 1), "30d": compareSpend(700, 500, 1) } });
    expect(bad.passed).toBe(false);
  });
});
