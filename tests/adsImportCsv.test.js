/* ตัวแกะไฟล์ค่าแอด (spec docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md)
   เทสยึดไฟล์ export จริงจาก OpenAI Ads Manager (TEAMDEE 8 ต.ค. 69) ไม่ใช่รูปแบบที่เดาเอา
   กติกาหลัก: ตัวเลขเพี้ยนเงียบๆ แย่กว่าไม่มีข้อมูล → ไม่เดาคอลัมน์ ไม่เติม 0 แทนช่องว่าง */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSpendCsv } from "../src/modules/marketing/ads/importCsv.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/ads-import/${name}`, import.meta.url), "utf8");
const TODAY = "2026-10-08";
const parse = (text, provider = "openai") => parseSpendCsv(text, provider, { today: TODAY });
const HEAD = "date,campaign_id,campaign_name,campaign_status,impressions,clicks,conversions,spend";

describe("parseSpendCsv — ไฟล์จริงจาก ChatGPT Ads Manager", () => {
  const out = parse(fixture("openai-teamdee.csv"));

  it("อ่านได้ทั้งที่ไฟล์มี BOM นำหน้า (ไฟล์จริงมี — ถ้าไม่ล้างจะหาคอลัมน์ date ไม่เจอ)", () => {
    expect(out.errors).toEqual([]);
    expect(out.rows).toHaveLength(3);
  });

  it("ยอดรวมตรงกับที่หน้า Ads Manager แสดง (THB436.13)", () => {
    expect(out.rows.reduce((n, r) => n + r.spend, 0)).toBeCloseTo(436.13, 2);
  });

  it("เรียงวันจากเก่าไปใหม่ และเก็บวันที่ยอดเป็นศูนย์จริงไว้ (ต่างจากช่องว่าง)", () => {
    expect(out.rows).toEqual([
      { fact_date: "2026-10-06", spend: 219.87 },
      { fact_date: "2026-10-07", spend: 216.26 },
      { fact_date: "2026-10-08", spend: 0 },
    ]);
  });
});

describe("parseSpendCsv — กติกากันตัวเลขเพี้ยน", () => {
  it("หาคอลัมน์ที่ต้องการไม่เจอ = หยุด และบอกว่าไฟล์มีคอลัมน์อะไร", () => {
    const out = parse("campaign_name,clicks\nA,10\n");
    expect(out.rows).toEqual([]);
    expect(out.errors[0]).toMatch(/ไม่พบคอลัมน์/);
    expect(out.errors[0]).toContain("campaign_name");
  });

  it("ไฟล์ Google ที่ส่งมา (มีแต่ CPC ไม่มีค่าใช้จ่าย) ถูกปฏิเสธพร้อมบอกเหตุผล", () => {
    const out = parse(fixture("google-timeseries-NO-COST.csv"), "google");
    expect(out.rows).toEqual([]);
    expect(out.errors.join(" ")).toMatch(/ไม่พบคอลัมน์|ยังไม่รองรับ/);
  });

  it("ช่องค่าแอดว่าง = ข้ามแถว ไม่ใส่ 0", () => {
    const out = parse(`${HEAD}\n"2026-10-01","c","n","active","1","1","0",""\n"2026-10-02","c","n","active","1","1","0","150"\n`);
    expect(out.rows).toEqual([{ fact_date: "2026-10-02", spend: 150 }]);
    expect(out.skipped).toBe(1);
  });

  it("วันเดียวกันหลายแคมเปญ = รวมยอดแล้วบอกว่ารวมกี่วัน", () => {
    const out = parse(`${HEAD}\n"2026-10-01","c1","n","active","1","1","0","100"\n"2026-10-01","c2","n","active","1","1","0","50.5"\n`);
    expect(out.rows).toEqual([{ fact_date: "2026-10-01", spend: 150.5 }]);
    expect(out.mergedDays).toBe(1);
  });

  it("ตัวเลขมีคอมมาและสัญลักษณ์เงิน = ล้างก่อนแปลง", () => {
    const out = parse(`${HEAD}\n"2026-10-01","c","n","active","1","1","0","฿1,234.56"\n`);
    expect(out.rows).toEqual([{ fact_date: "2026-10-01", spend: 1234.56 }]);
  });

  it("วันที่เป็นอนาคต = ปฏิเสธแถวนั้นและบอก (ตัดสินจาก today ที่ส่งเข้ามา ไม่ใช่นาฬิกาเครื่อง)", () => {
    const out = parse(`${HEAD}\n"2026-12-25","c","n","active","1","1","0","99"\n`);
    expect(out.rows).toEqual([]);
    expect(out.errors.join(" ")).toMatch(/อนาคต/);
  });

  it("ไฟล์เปล่า = บอกว่าไฟล์ว่าง ไม่ throw", () => {
    const out = parse("");
    expect(out.rows).toEqual([]);
    expect(out.errors[0]).toMatch(/ว่าง/);
  });

  it("provider ที่ยังไม่ได้ตั้งรูปแบบไฟล์ = บอกตรงๆ ไม่เดาคอลัมน์", () => {
    const out = parse(`${HEAD}\n"2026-10-01","c","n","active","1","1","0","1"\n`, "tiktok");
    expect(out.errors[0]).toMatch(/ยังไม่รองรับ/);
  });
});

/* 9 ต.ค. 69: ไฟล์รายงานแคมเปญรายวันจริงจาก Google Ads (TEAMDEE 1–8 ต.ค.)
   กับดักของไฟล์นี้: มีแถวสรุปซ้อนหลายชุด (ทั้งหมด: แคมเปญ / บัญชี / การค้นหา / ประสิทธิภาพสูงสุด) แยกรายวันด้วย
   รวมทุกแถวตามวันตรงๆ จะได้ยอดราว 4 เท่าของจริง (฿5,770.00) */
describe("parseSpendCsv — ไฟล์จริงจาก Google Ads", () => {
  const out = parseSpendCsv(fixture("google-teamdee-daily.csv"), "google", { today: "2026-10-09" });

  it("ยอดรวมเท่ากับที่ไฟล์สรุปไว้เอง (฿5,770.00) — ไม่นับแถวสรุปซ้ำ", () => {
    expect(out.errors).toEqual([]);
    expect(Math.round(out.rows.reduce((n, r) => n + r.spend, 0) * 100) / 100).toBe(5770);
  });

  it("ได้ 8 วัน ยอดรายวันตรงกับแถว 'ทั้งหมด: บัญชี' ของวันนั้น", () => {
    expect(out.rows).toEqual([
      { fact_date: "2026-10-01", spend: 970.12 }, { fact_date: "2026-10-02", spend: 1051.83 },
      { fact_date: "2026-10-03", spend: 1109.85 }, { fact_date: "2026-10-04", spend: 957.91 },
      { fact_date: "2026-10-05", spend: 688.78 }, { fact_date: "2026-10-06", spend: 333.63 },
      { fact_date: "2026-10-07", spend: 283.94 }, { fact_date: "2026-10-08", spend: 373.94 },
    ]);
  });

  it("บอกสกุลเงินจากไฟล์ และยอดสรุปของไฟล์ไว้ให้ตรวจ", () => {
    expect(out.currency).toBe("THB");
    expect(out.fileTotal).toBe(5770);
  });

  it("ยอดที่แกะได้ไม่เท่ายอดสรุปของไฟล์ = ปฏิเสธทั้งไฟล์ (แปลว่ารูปแบบไฟล์เปลี่ยนจนเราอ่านผิด)", () => {
    const tampered = fixture("google-teamdee-daily.csv").replace("9.50%,970.12\n2026-10-02,หยุดชั่วคราว", "9.50%,1970.12\n2026-10-02,หยุดชั่วคราว");
    const bad = parseSpendCsv(tampered, "google", { today: "2026-10-09" });
    expect(bad.rows).toEqual([]);
    expect(bad.errors.join(" ")).toMatch(/ไม่ตรงกับยอดรวมของไฟล์/);
  });
});
