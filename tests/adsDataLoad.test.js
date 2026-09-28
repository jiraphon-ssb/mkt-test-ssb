/* ตัวโหลดยอดจริง — ภาพครีเอทีฟโหลดพังต้องไม่หายเงียบ (26 ก.ย.: เห็นจริง รายการขึ้น 132 ชิ้นไม่มีภาพ ไม่มีใครบอก)
   ยอดยังดูได้ แต่หน้าต้องรู้ว่าภาพพัง จะได้บอกผู้ใช้และให้ลองใหม่ */
import { describe, expect, it, vi } from "vitest";

const api = { creativesFail: false, salesFail: false, goalsFail: false };
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { ads: {
  connections: async () => [{ provider: "meta", id: "c1" }], facts: async () => [],
  creatives: async () => { if (api.creativesFail) throw new Error("500"); return [{ id: "cr1" }]; },
  businessFacts: async () => { if (api.salesFail) throw new Error("500"); return []; },
  salesGoals: async () => { if (api.goalsFail) throw new Error("500"); return []; }, goalOverrides: async () => [],
} } }));
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({}) }));
vi.mock("../src/modules/marketing/useMkt.jsx", () => ({ useApp: () => ({}) }));
const { loadPilotFacts } = await import("../src/modules/marketing/ads/useAdsData.js");

describe("loadPilotFacts — ภาพครีเอทีฟ", () => {
  it("โหลดครบ = creativesFailed false", async () => {
    const out = await loadPilotFacts({ force: true });
    expect(out).toMatchObject({ status: "ready", creativesFailed: false });
    expect(out.creatives).toHaveLength(1);
  });
  it("ภาพพัง = ยอดยังพร้อม แต่ติดธง creativesFailed", async () => {
    api.creativesFail = true;
    const out = await loadPilotFacts({ force: true });
    expect(out).toMatchObject({ status: "ready", creativesFailed: true, creatives: [] });
  });
});

/* ทดสอบละเอียดรอบ 2 (27 ก.ย.): ยอดขาย/เป้าโหลดพังถูกกลืนเงียบ → หน้าภาพรวมขึ้น "ยังไม่มียอดขาย" · "ยังไม่ตั้งเป้าเดือนนี้" ทั้งที่มี */
describe("loadPilotFacts — ยอดขาย/เป้าโหลดพังต้องไม่หายเงียบ", () => {
  it("ยอดขายพัง = ติดธง salesFailed · เป้าพัง = goalsFailed · ค่าแอดยังพร้อม", async () => {
    api.creativesFail = false; api.salesFail = true; api.goalsFail = true;
    const out = await loadPilotFacts({ force: true });
    expect(out).toMatchObject({ status: "ready", salesFailed: true, goalsFailed: true });
    api.salesFail = false; api.goalsFail = false;
    expect(await loadPilotFacts({ force: true })).toMatchObject({ salesFailed: false, goalsFailed: false });
  });
});
