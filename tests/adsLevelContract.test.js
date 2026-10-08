/* ข้อตกลงกับ SSB PLATFORM (8 ต.ค. 69)
   ท่อ ads-sync ฝั่ง platform อ่าน ad_daily_facts ตรง เฉพาะ level in ('ad','account')
   (ต้องใช้ชื่อบัญชีแอดรายบัญชี ซึ่ง view ad_spend_daily ไม่มี)
   ถ้า provider ไหนเขียนเฉพาะระดับ campaign หรือ ad_group ค่าแอดของ provider นั้นจะหายฝั่ง platform โดยไม่ error

   เทสนี้แดง = กำลังจะผิดข้อตกลง → แจ้งฝั่ง platform ให้แก้ท่อก่อน แล้วค่อยเพิ่มระดับใหม่ในรายการข้างล่าง
   ห้ามแก้รายการให้เทสผ่านโดยไม่แจ้ง */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const AGREED_LEVELS = ["ad", "account"];
const dir = new URL("../supabase/functions/_shared/", import.meta.url);
const writers = readdirSync(dir).filter((name) => name.endsWith(".js"))
  .map((name) => [name, readFileSync(new URL(name, dir), "utf8")]);

describe("ระดับของ ad_daily_facts ที่ตัวดึงเขียน", () => {
  it("ตัวดึงทุกตัวเขียนเฉพาะระดับที่ตกลงกับ platform ไว้", () => {
    const found = [];
    for (const [name, source] of writers) {
      for (const match of source.matchAll(/level:\s*["']([a-z_]+)["']/g)) found.push([name, match[1]]);
    }
    expect(found.length).toBeGreaterThan(0);   // หาไม่เจอเลย = รูปแบบโค้ดเปลี่ยน เทสนี้ต้องเขียนใหม่ ไม่ใช่ผ่านเงียบ
    for (const [name, level] of found) expect(AGREED_LEVELS, `${name} เขียน level '${level}'`).toContain(level);
  });

  it("การนำเข้าจากไฟล์เขียนระดับ account", () => {
    const sql = readFileSync(new URL("../src/supabase/migrations/0015_ads_file_import.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/\(r->>'fact_date'\)::date, 'account'/);
  });
});
