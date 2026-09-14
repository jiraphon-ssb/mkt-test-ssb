import { describe, it, expect, vi } from "vitest";
import { pickSyncMode, collectMetaFacts, publicSyncCode, syncFailureStatus } from "../supabase/functions/_shared/adsSyncJob.js";

const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
const insight = (date, adId, spend) => ({ date_start: date, date_stop: date, campaign_id: "c1", adset_id: "s1", ad_id: adId, spend: String(spend), actions: [{ action_type: "lead", value: "2" }] });

describe("pickSyncMode", () => {
  it("auto: ยังไม่เคยสำเร็จ = backfill · เคยแล้ว = incremental · สั่งเองได้", () => {
    expect(pickSyncMode("auto", { last_success_at: null })).toBe("backfill");
    expect(pickSyncMode(undefined, { last_success_at: "2026-09-14T01:00:00Z" })).toBe("incremental");
    expect(pickSyncMode("backfill", { last_success_at: "2026-09-14T01:00:00Z" })).toBe("backfill");
    expect(() => pickSyncMode("reconcile", {})).toThrow("SYNC_MODE_INVALID");
  });
});

describe("collectMetaFacts", () => {
  const base = { accountId: "act_42", version: "v26.0", token: "TKN", sleep: async () => {}, config: { leadEvent: "lead", attribution: "platform_default" } };
  it("ขอทีละก้อน 7 วัน รวมทุกหน้า แปลงเป็น facts และสรุปผล", async () => {
    const fetch = vi.fn(async (url) => {
      const range = JSON.parse(new URL(url).searchParams.get("time_range"));
      return res({ data: [insight(range.since, "a1", 100), insight(range.until, "a2", 50.5)] });
    });
    const out = await collectMetaFacts({ ...base, fetch, from: "2026-09-01", to: "2026-09-10" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(out.facts.length).toBe(4);
    expect(out.facts.every((f) => f.leads === 2 && f.level === "ad")).toBe(true);
    expect(out.summary).toMatchObject({ rows: 4, rowsRead: 4, spend: 301, leads: 8, pages: 2, retries: 0, duplicates: 0, from: "2026-09-01", to: "2026-09-10" });
  });
  it("แถวนอกช่วงที่ขอ = throw (ไม่เขียนข้อมูลวันที่ไม่ได้ขอ)", async () => {
    const fetch = vi.fn(async () => res({ data: [insight("2026-08-01", "a1", 1)] }));
    await expect(collectMetaFacts({ ...base, fetch, from: "2026-09-01", to: "2026-09-03" })).rejects.toMatchObject({ code: "INSIGHT_ROW_INVALID" });
  });
  it("ก้อนหลังพัง = throw ทั้งงาน ไม่คืนก้อนแรกครึ่งเดียว", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(res({ data: [insight("2026-09-01", "a1", 1)] }))
      .mockResolvedValue(res({ error: { code: 190 } }, 401));
    await expect(collectMetaFacts({ ...base, fetch, from: "2026-09-01", to: "2026-09-10" })).rejects.toMatchObject({ code: "META_TOKEN_INVALID" });
  });
});

describe("publicSyncCode / syncFailureStatus", () => {
  it("ส่งออกเฉพาะรหัสที่รู้จัก ข้อความอื่นรวมเป็น SYNC_FAILED", () => {
    const e = new Error("META_RATE_LIMIT"); e.code = "META_RATE_LIMIT";
    expect(publicSyncCode(e)).toBe("META_RATE_LIMIT");
    expect(publicSyncCode(new Error("duplicate key value violates unique constraint \"ad_sync_runs_one_active_uidx\""))).toBe("SYNC_FAILED");
    expect(publicSyncCode(new Error("TEAM_LEAD_REQUIRED"))).toBe("TEAM_LEAD_REQUIRED");
  });
  it("token เสีย = connection expired · อย่างอื่น = error", () => {
    expect(syncFailureStatus("META_TOKEN_INVALID")).toBe("expired");
    expect(syncFailureStatus("META_RATE_LIMIT")).toBe("error");
  });
});
