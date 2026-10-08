/* ชั้นข้อมูลของการนำเข้าค่าแอดจากไฟล์ (spec docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md)
   pure ทั้งหมด — สรุปก่อนยืนยัน · payload ที่ส่งเข้า RPC · ลายนิ้วมือไฟล์กันอัปซ้ำ */
import { describe, expect, it } from "vitest";
import { buildImportPayload, fileHashOf, importPreview } from "../src/modules/marketing/ads/importModel.js";

const base = { provider: "google", connectionId: "c1", fileName: "report.csv", fileHash: "abc123", importedBy: "p1" };
const rows = [{ fact_date: "2026-10-01", spend: 100.5 }, { fact_date: "2026-10-02", spend: 200.25 }];

describe("buildImportPayload", () => {
  it("สรุปช่วงวัน จำนวนแถว และยอดรวมจากแถวจริง", () => {
    const { batch } = buildImportPayload({ ...base, rows });
    expect(batch.date_from).toBe("2026-10-01");
    expect(batch.date_to).toBe("2026-10-02");
    expect(batch.row_count).toBe(2);
    expect(batch.spend_total).toBe(300.75);
    expect(batch.connection_id).toBe("c1");
    expect(batch.provider).toBe("google");
  });

  it("ส่งเฉพาะ fact_date กับ spend — คอลัมน์อื่นจากไฟล์ไม่หลุดขึ้นฐานข้อมูล", () => {
    const { rows: out } = buildImportPayload({ ...base, rows: [{ fact_date: "2026-10-01", spend: 1, campaign_name: "ลับ" }] });
    expect(Object.keys(out[0])).toEqual(["fact_date", "spend"]);
  });

  it("วันไม่เรียงในไฟล์ก็สรุปช่วงถูก", () => {
    const { batch } = buildImportPayload({ ...base, rows: [{ fact_date: "2026-10-05", spend: 1 }, { fact_date: "2026-10-02", spend: 2 }] });
    expect([batch.date_from, batch.date_to]).toEqual(["2026-10-02", "2026-10-05"]);
  });

  it("ไม่มีแถวเลย = โยน error ไม่ส่ง batch เปล่าเข้าฐานข้อมูล", () => {
    expect(() => buildImportPayload({ ...base, rows: [] })).toThrow(/ไม่มีแถว/);
  });
});

describe("importPreview", () => {
  it("บอกว่าทับของเดิมกี่วัน", () => {
    const out = importPreview({ rows, existing: [{ fact_date: "2026-10-01", spend: 99 }] });
    expect(out.overwrites).toBe(1);
    expect(out.dayCount).toBe(2);
    expect(out.spendTotal).toBe(300.75);
  });

  it("บอกวันที่ขาดหายในช่วง — ไฟล์ที่ข้ามวันต้องเห็นก่อนกดยืนยัน", () => {
    const out = importPreview({ rows: [{ fact_date: "2026-10-01", spend: 1 }, { fact_date: "2026-10-04", spend: 2 }], existing: [] });
    expect(out.missingDays).toEqual(["2026-10-02", "2026-10-03"]);
  });

  it("ไม่ทับอะไรเลย = 0 ไม่ใช่ค่าว่าง", () => {
    expect(importPreview({ rows, existing: [] }).overwrites).toBe(0);
  });
});

describe("fileHashOf", () => {
  it("ไฟล์เดียวกันได้ลายนิ้วมือเดิมทุกครั้ง", async () => {
    expect(await fileHashOf("a,b\n1,2\n")).toBe(await fileHashOf("a,b\n1,2\n"));
  });
  it("ไฟล์ต่างกันได้คนละลายนิ้วมือ", async () => {
    expect(await fileHashOf("a,b\n1,2\n")).not.toBe(await fileHashOf("a,b\n1,3\n"));
  });
});
