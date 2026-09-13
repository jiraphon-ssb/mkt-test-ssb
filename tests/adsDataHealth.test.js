import { describe, expect, it } from "vitest";
import { adsDataHealth, reconciliationRows } from "../src/modules/marketing/ads/adsDataHealth.js";

const mapping = (over = {}) => ({ enabled: true, accountId: "act_123", timezone: "Asia/Bangkok", currency: "THB", ...over });

describe("adsDataHealth", () => {
  it("ไม่รายงานว่าพร้อมเมื่อยังไม่มี OAuth และข้อมูลจริง", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping() } } });
    expect(health.state).toBe("waiting");
    expect(health.goLive).toBe(false);
  });

  it("แยกข้อมูลปกติกับข้อมูลล่าช้าตามกฎ", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const connected = (lastSuccessAt) => mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt, reconciliation: { status: "passed" } });
    expect(adsDataHealth({ mappings: { meta: { b1: connected("2026-09-14T10:00:00Z") } } }, now).state).toBe("healthy");
    expect(adsDataHealth({ mappings: { meta: { b1: connected("2026-09-14T04:00:00Z") } } }, now).state).toBe("stale");
  });

  it("ไม่ขึ้นพร้อมใช้เมื่อข้อมูลสดแต่ยังไม่ตรวจยอด", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T10:00:00Z" }) } } }, new Date("2026-09-14T12:00:00Z"));
    expect(health.state).toBe("unverified");
    expect(health.goLive).toBe(false);
  });

  it("รายงานปัญหาที่รุนแรงที่สุดเมื่อมีหลายแพลตฟอร์ม", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const config = { mappings: {
      meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T04:00:00Z" }) },
      google: { b1: mapping({ accountId: "123-456-7890", connectionId: "c2", oauthStatus: "connected", lastErrorCode: "TOKEN_EXPIRED" }) },
    } };
    expect(adsDataHealth(config, now).state).toBe("error");
  });

  it("ไม่ให้ผ่านเมื่อข้อมูลมีช่วงวันที่ขาด", () => {
    const health = adsDataHealth({ mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", lastSuccessAt: "2026-09-14T10:00:00Z", missingDays: 2, reconciliation: { status: "passed" } }) } } }, new Date("2026-09-14T12:00:00Z"));
    expect(health.state).toBe("missing");
    expect(health.goLive).toBe(false);
  });
});

describe("reconciliationRows", () => {
  it("ต้องมีผลตรวจ 7 และ 30 วันภายใน tolerance จึงพร้อมเปิดใช้", () => {
    const config = { rules: { reconciliationTolerance: 1 }, mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", reconciliation: { windows: { "7d": { localSpend: 1000, remoteSpend: 1005 }, "30d": { localSpend: 4000, remoteSpend: 4200 } } } }) } } };
    const [row] = reconciliationRows(config, [{ id: "b1", name: "Brand" }]);
    expect(row.checks[0].status).toBe("passed");
    expect(row.checks[1].status).toBe("failed");
    expect(row.ready).toBe(false);
  });

  it("รองรับการตรวจช่วงที่ทั้งสองฝั่งเป็นศูนย์", () => {
    const config = { mappings: { meta: { b1: mapping({ connectionId: "c1", oauthStatus: "connected", reconciliation: { windows: { "7d": { localSpend: 0, remoteSpend: 0 }, "30d": { localSpend: 0, remoteSpend: 0 } } } }) } } };
    const [row] = reconciliationRows(config, [{ id: "b1", name: "Brand" }]);
    expect(row.checks.every((check) => check.status === "passed")).toBe(true);
    expect(row.ready).toBe(true);
  });
});
