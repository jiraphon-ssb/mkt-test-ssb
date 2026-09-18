# JUNTAKARN Sales Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้แบรนด์ JUNTAKARN (`b_jt`) มียอดขายจริง ROAS %Ads และ funnel ในหน้า ads เหมือนอีก 3 แบรนด์ โดยดึงจากระบบ TMK Operation (Supabase คนละโปรเจกต์)

**Architecture:** ฝั่ง TMK สร้าง RPC ที่คืน *เฉพาะตัวเลขสรุปรายวัน* (ไม่มีชื่อ/เบอร์/รหัสลูกค้า) → `sales-sync` ของ ads เรียก RPC นั้นด้วย secret key แล้วแปลงเป็นแถว `business_daily_facts` ของ `b_jt` (source `tmk`) → หน้าเว็บอ่านต่อด้วยตัวคำนวณเดิมทั้งหมด ไม่ต้องแก้สูตร

**Tech Stack:** Supabase Postgres (plpgsql/SQL function) · Deno Edge Function (`sales-sync`) · React + Vite (หน้า Overview / Sync) · Vitest

**Spec:** ไม่มีเอกสาร spec แยก — ข้อตกลงที่ผู้ใช้ (อาร์ต) ตัดสินเมื่อ 18 ก.ย. 2569 อยู่ใน Global Constraints ด้านล่าง และผลสำรวจระบบ TMK อยู่ใน `docs/adr/` ของโปรเจกต์ TMK เอง (`/Users/artist/Documents/TMK Operation`)

## Global Constraints

- **นับเฉพาะออเดอร์ช่องแชท** — `source = 'shipnity'` และ `channel NOT IN ('Shopee','Lazada','POS')` (นิยาม `isChatOrder` ของ TMK) เพราะ ROAS ที่ต้องการคือของแอด Meta เท่านั้น
- **วันของยอด = `order_date`** (วันออเดอร์) ไม่ใช่วันรับรู้ยอดแบบระบบพี่ทัช — ต้องติดป้ายบนหน้าจอว่านิยามต่างกัน
- **funnel ของ JK มี 2 ขั้น**: คนทัก → ยืนยันออเดอร์ · ขั้น Lead และ ได้ออเดอร์ = ไม่มีในระบบนี้ ต้องขึ้น "—" พร้อมเหตุผล **ห้ามขึ้น 0**
- **ข้อมูลลูกค้าไม่ข้ามระบบ** — RPC คืนได้เฉพาะตัวเลขสรุปรายวัน ห้ามมี `customer_name` `customer_phone` `customer_social` `customer_code` `salesperson` `note` `order_no`
- **ต้อง merge `tmk_order_overrides` ก่อนคิดทุกครั้ง** (คีย์ `order_id = source || ':' || order_no`) ไม่งั้นได้ยอดก่อนแก้มือ
- **ตัดออเดอร์ที่ยกเลิกออกจากยอด** (`status = 'cancelled'`) แต่ยังรายงานจำนวน/มูลค่าที่ยกเลิกแยก
- ตัวเลขบนจอทศนิยม 2 ตำแหน่งแบบตัดทิ้ง ใช้ตัวจัดรูปแบบกลางใน `src/modules/marketing/dash/charts/theme.js` เท่านั้น
- ไม่มีข้อมูล = `null` + เหตุผล ห้ามแทนด้วย 0
- **ห้าม commit / push / deploy / รัน migration เอง** — ทำเสร็จแล้วรายงานและรอผู้ใช้สั่งทุกครั้ง
- แตะ Supabase หรือ Vercel (แม้แค่อ่าน) ต้องบอก จะทำอะไร · กระทบอะไร · ทางเลือกอื่น แล้วรอคำตอบก่อน
- UI ภาษาไทย ไม่ใช้ emoji เป็นไอคอน

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `TMK: supabase/migrations/20260918-jk-ads-daily-facts.sql` | RPC `jk_ads_daily_facts(p_from, p_to)` — สรุปรายวันฝั่ง TMK (ผู้ใช้รันเอง) |
| `supabase/functions/_shared/jkFacts.js` | pure: แถวจาก RPC → แถว `business_daily_facts` ของ `b_jt` + ตรวจคอลัมน์ต้องห้าม |
| `supabase/functions/_shared/jkBridge.js` | pure: ประกอบ URL ของ RPC + แบ่งช่วงวัน (ใช้ `doorState`/`describeSalesKey` เดิมจาก `salesBridge.js`) |
| `supabase/functions/sales-sync/index.ts` | เพิ่มเฟส JK ต่อจากเฟสของพี่ทัช (ล้มแยกกัน) |
| `supabase/functions/_shared/salesFacts.js` | เพิ่ม `BRAND_FUNNEL_STAGES` + `SALES_SOURCE_BRAND_IDS` (แบรนด์ที่มีแหล่งยอดขาย รวม JK) |
| `src/modules/marketing/ads/salesOverview.js` | `salesPipeline` รับ `stages` → ขั้นที่แบรนด์ไม่มี = null + เหตุผล |
| `src/modules/marketing/ads/syncSources.js` | `SALES_BRAND_IDS` ใช้ค่าจาก `SALES_SOURCE_BRAND_IDS` · แถวแหล่งข้อมูลของ JK |
| `src/modules/marketing/ads/SyncStatusView.jsx` + `SalesSyncPanels.jsx` | แถวแหล่งข้อมูล JK · ตารางความครบบอก "ไม่มีขั้นนี้" |
| `tests/jkFacts.test.js` · `tests/jkBridge.test.js` · `tests/salesOverview.test.js` · `tests/syncSources.test.js` | เทส |
| `README.md` · `docs/RUNBOOK.md` · `CHANGELOG.md` | เอกสาร |

---

### Task 1: แปลงแถวจาก RPC → แถว business_daily_facts (pure)

**Files:**
- Create: `supabase/functions/_shared/jkFacts.js`
- Test: `tests/jkFacts.test.js`

**Interfaces:**
- Consumes: ไม่มี (งานแรก)
- Produces:
  - `JK_BRAND_ID = "b_jt"`
  - `JK_SOURCE = "tmk"`
  - `JK_FACT_COLUMNS: string[]` — คอลัมน์ที่ยอมรับจาก RPC
  - `jkRowsToDailyFacts(rows: object[], { from: string, to: string }): object[]` — คืนแถว `business_daily_facts` ครบทุกวันในช่วง (วันไม่มีเหตุการณ์ = 0)
  - `jkExtraColumns(rows: object[]): string[]` — คอลัมน์เกินที่ไม่ควรมี (ใช้กันข้อมูลลูกค้าหลุด)

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `tests/jkFacts.test.js`:

```js
/* JK (JUNTAKARN) — แถวสรุปรายวันจากระบบ TMK → business_daily_facts
   นับเฉพาะออเดอร์ช่องแชท · วันของยอด = วันออเดอร์ · funnel 2 ขั้น (คนทัก → ยืนยันออเดอร์) */
import { describe, it, expect } from "vitest";
import { JK_BRAND_ID, JK_SOURCE, jkRowsToDailyFacts, jkExtraColumns } from "../supabase/functions/_shared/jkFacts.js";

const row = (patch = {}) => ({
  day: "2026-09-02", inquiries: 30, inq_by_channel: { Facebook: 20, LINE: 10 }, inquiry_filled: true,
  orders: 4, orders_new: 3, sales: 52000, sales_new: 40000, ord_by_channel: { Facebook: 3, LINE: 1 },
  cancelled: 1, cancelled_value: 1500, avg_reply_minutes: 12, ...patch,
});

describe("jkRowsToDailyFacts", () => {
  it("แถวหนึ่งวัน → แถว business_daily_facts ของ b_jt ครบทุกช่องที่ใช้จริง", () => {
    const [out] = jkRowsToDailyFacts([row()], { from: "2026-09-02", to: "2026-09-02" });
    expect(out).toEqual({
      brand_id: "b_jt", fact_date: "2026-09-02", source: "tmk", external_record_id: "JK|2026-09-02",
      inquiries: 30, inquiries_by_channel: { Facebook: 20, LINE: 10 }, inquiry_filled: true,
      channel_funnel: { Facebook: { inquiries: 20, leads: 0, deposits: 0, orders: 3 }, LINE: { inquiries: 10, leads: 0, deposits: 0, orders: 1 } },
      qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
      orders: 4, orders_new: 3, gross_revenue: 52000, revenue_new: 40000,
      refunds: 0, cash_received: 0, cancelled: 1, cancelled_value: 1500,
    });
    expect(JK_BRAND_ID).toBe("b_jt");
    expect(JK_SOURCE).toBe("tmk");
  });

  it("วันที่ไม่มีแถวจาก RPC = แถว 0 (ยอดแก้ย้อนหลังได้ ต้องทับทั้งช่วง ไม่ใช่เว้นวัน)", () => {
    const out = jkRowsToDailyFacts([row({ day: "2026-09-03" })], { from: "2026-09-02", to: "2026-09-04" });
    expect(out.map((r) => r.fact_date)).toEqual(["2026-09-02", "2026-09-03", "2026-09-04"]);
    expect(out[0]).toMatchObject({ orders: 0, gross_revenue: 0, inquiries: 0, inquiry_filled: false, channel_funnel: {} });
  });

  it("ปัดเศษเงินเป็นสตางค์ · ค่าติดลบ/ไม่ใช่ตัวเลขเป็น 0 · วันนอกช่วงถูกทิ้ง", () => {
    const out = jkRowsToDailyFacts([
      row({ day: "2026-09-02", sales: 1234.567, sales_new: -5, orders: "3", cancelled_value: null }),
      row({ day: "2026-08-31" }),
    ], { from: "2026-09-02", to: "2026-09-02" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ gross_revenue: 1234.57, revenue_new: 0, orders: 3, cancelled_value: 0 });
  });

  it("ช่วงวันไม่ถูกต้อง = []", () => {
    expect(jkRowsToDailyFacts([row()], { from: "2026-09-05", to: "2026-09-01" })).toEqual([]);
    expect(jkRowsToDailyFacts([row()], {})).toEqual([]);
  });
});

describe("jkExtraColumns — ข้อมูลลูกค้าห้ามข้ามระบบ", () => {
  it("คอลัมน์นอกรายการที่อนุญาต ต้องถูกรายงานกลับ (เรียงชื่อ)", () => {
    expect(jkExtraColumns([row({ customer_name: "คุณเอ", order_no: "SO-1" })])).toEqual(["customer_name", "order_no"]);
    expect(jkExtraColumns([row()])).toEqual([]);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run tests/jkFacts.test.js`
Expected: FAIL — `Failed to resolve import ".../jkFacts.js"`

- [ ] **Step 3: เขียนตัวแปลง**

สร้าง `supabase/functions/_shared/jkFacts.js`:

```js
/* ยอดขาย JUNTAKARN จากระบบ TMK Operation (Supabase คนละโปรเจกต์) → business_daily_facts
   ข้อตกลง 18 ก.ย. 2569: นับเฉพาะออเดอร์ช่องแชท (ROAS ของแอด Meta) · วันของยอด = วันออเดอร์
   funnel มี 2 ขั้น (คนทัก → ยืนยันออเดอร์) — Lead/ได้ออเดอร์ ระบบนี้ไม่มี หน้าจอซ่อนด้วย BRAND_FUNNEL_STAGES
   ข้อมูลลูกค้าไม่ข้ามระบบ: RPC คืนเฉพาะ JK_FACT_COLUMNS · เจอคอลัมน์เกิน = หยุดก่อนเขียน (jkExtraColumns) */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const JK_BRAND_ID = "b_jt";
export const JK_SOURCE = "tmk";
export const JK_FACT_COLUMNS = [
  "day", "inquiries", "inq_by_channel", "inquiry_filled",
  "orders", "orders_new", "sales", "sales_new", "ord_by_channel",
  "cancelled", "cancelled_value", "avg_reply_minutes",
];

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const money = (value) => Math.round(num(value) * 100) / 100;
const count = (value) => Math.trunc(num(value));
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** {Facebook: 20} + {Facebook: 3} → {Facebook: {inquiries:20, leads:0, deposits:0, orders:3}} */
function channelFunnelOf(inq, ord) {
  const out = {};
  const keys = new Set([...Object.keys(inq ?? {}), ...Object.keys(ord ?? {})]);
  for (const key of keys) {
    out[key] = { inquiries: count(inq?.[key]), leads: 0, deposits: 0, orders: count(ord?.[key]) };
  }
  return out;
}

const byChannel = (source) => Object.fromEntries(Object.entries(source ?? {}).map(([key, value]) => [key, count(value)]));

export function jkRowsToDailyFacts(rows = [], { from, to } = {}) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  const byDay = new Map();
  for (const row of rows ?? []) {
    const day = String(row?.day ?? "").slice(0, 10);
    if (!ISO.test(day) || day < from || day > to) continue;
    byDay.set(day, row);
  }
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const row = byDay.get(day);
    out.push({
      brand_id: JK_BRAND_ID, fact_date: day, source: JK_SOURCE, external_record_id: `JK|${day}`,
      inquiries: count(row?.inquiries),
      inquiries_by_channel: byChannel(row?.inq_by_channel),
      inquiry_filled: row?.inquiry_filled === true,
      channel_funnel: row ? channelFunnelOf(row.inq_by_channel, row.ord_by_channel) : {},
      // ระบบ TMK ไม่มีสเตจ Lead และมัดจำ — เก็บ 0 ไว้ในฐาน หน้าจอซ่อนด้วย BRAND_FUNNEL_STAGES (ไม่ได้แปลว่าศูนย์จริง)
      qualified_leads: 0, leads_new: 0, deposits: 0, deposit_value: 0,
      orders: count(row?.orders), orders_new: count(row?.orders_new),
      gross_revenue: money(row?.sales), revenue_new: money(row?.sales_new),
      refunds: 0, cash_received: 0,
      cancelled: count(row?.cancelled), cancelled_value: money(row?.cancelled_value),
    });
  }
  return out;
}

/** คอลัมน์ที่ไม่ได้ขอแต่กลับมา — ใช้หยุดก่อนเขียนลงฐาน (กันข้อมูลลูกค้าหลุดข้ามระบบ) */
export function jkExtraColumns(rows = []) {
  const extra = new Set();
  for (const row of rows ?? []) {
    for (const column of Object.keys(row ?? {})) if (!JK_FACT_COLUMNS.includes(column)) extra.add(column);
  }
  return [...extra].sort();
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run tests/jkFacts.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: รันทั้งชุดแล้วรายงาน**

Run: `npm test --silent && npm run lint`
Expected: เทสทั้งหมดผ่าน · lint ไม่มี error → หยุด รายงานผู้ใช้ว่าพร้อม commit (ห้าม commit เอง)

---

### Task 2: ขั้น funnel ต่อแบรนด์ — JK มี 2 ขั้น

**Files:**
- Modify: `supabase/functions/_shared/salesFacts.js` (ท้ายไฟล์ ถัดจาก `metricCoverage`)
- Modify: `src/modules/marketing/ads/salesOverview.js` (`salesPipeline`)
- Test: `tests/salesFacts.test.js` · `tests/salesOverview.test.js`

**Interfaces:**
- Consumes: `JK_BRAND_ID` จาก Task 1 (ใช้เป็นค่าคงที่ `"b_jt"` ตรงๆ ไม่ต้อง import ข้ามไฟล์)
- Produces:
  - `FUNNEL_STAGE_KEYS = ["inquiries", "qualified", "deposits", "closed"]`
  - `BRAND_FUNNEL_STAGES: Record<string, string[]>` — แบรนด์ที่ไม่ครบ 4 ขั้น (`b_jt` = `["inquiries", "closed"]`)
  - `funnelStagesOf(brandId: string): string[]`
  - `salesPipeline({ ..., stages })` — ขั้นที่ไม่อยู่ใน `stages` คืน `{ value: null, before: null, conv: null, sub: "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้" }`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน (salesFacts)**

เพิ่มท้าย `tests/salesFacts.test.js`:

```js
import { BRAND_FUNNEL_STAGES, FUNNEL_STAGE_KEYS, funnelStagesOf } from "../src/modules/marketing/ads/salesFacts.js";

describe("ขั้น funnel ต่อแบรนด์ — JUNTAKARN มี 2 ขั้น (ระบบ TMK ไม่มีสเตจ Lead/มัดจำ)", () => {
  it("แบรนด์ทั่วไปครบ 4 ขั้น · b_jt เหลือคนทัก → ยืนยันออเดอร์", () => {
    expect(FUNNEL_STAGE_KEYS).toEqual(["inquiries", "qualified", "deposits", "closed"]);
    expect(funnelStagesOf("b_td")).toEqual(FUNNEL_STAGE_KEYS);
    expect(funnelStagesOf("b_jt")).toEqual(["inquiries", "closed"]);
    expect(BRAND_FUNNEL_STAGES.b_jt).toEqual(["inquiries", "closed"]);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run tests/salesFacts.test.js`
Expected: FAIL — `funnelStagesOf is not a function`

- [ ] **Step 3: เพิ่มค่าคงที่ใน salesFacts**

ต่อท้าย `supabase/functions/_shared/salesFacts.js`:

```js
/** ขั้นของเส้นทางขายมาตรฐาน (ตรงกับ key ใน salesPipeline) */
export const FUNNEL_STAGE_KEYS = ["inquiries", "qualified", "deposits", "closed"];

/* แบรนด์ที่ระบบขายต้นทางไม่ได้บันทึกครบทุกขั้น — ขั้นที่ไม่มีต้องขึ้น "—" พร้อมเหตุผล ห้ามขึ้น 0
   b_jt (JUNTAKARN) ใช้ระบบ TMK Operation ซึ่งมีแค่ "คนทัก" (tmk_sales_funnel) กับ "ยืนยันออเดอร์" (tmk_mp_orders)
   ไม่มีสเตจ Lead และไม่มีประเภทจ่ายแบบมัดจำ (ข้อตกลงอาร์ต 18 ก.ย. 2569) */
export const BRAND_FUNNEL_STAGES = { b_jt: ["inquiries", "closed"] };

export const funnelStagesOf = (brandId) => BRAND_FUNNEL_STAGES[brandId] ?? FUNNEL_STAGE_KEYS;
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run tests/salesFacts.test.js`
Expected: PASS

- [ ] **Step 5: เขียนเทสของ salesPipeline ที่ยังไม่ผ่าน**

เพิ่มท้าย `tests/salesOverview.test.js`:

```js
describe("salesPipeline — แบรนด์ที่ระบบขายไม่มีบางขั้น (JUNTAKARN)", () => {
  const sales = { revenue: 90000, revenueNew: 60000, orders: 6, ordersNew: 4, leads: 0, leadsNew: 0, inquiries: 120, inquiryFilledDays: 3, days: 3, deposits: 0, depositValue: 0, cash: 0, cancelled: 1 };
  it("ขั้นที่ไม่มี = null พร้อมเหตุผล · ขั้นที่มียังคิดปกติ · อัตราผ่านข้ามขั้นที่ไม่มี", () => {
    const items = salesPipeline({ sales, spend: 30000, stages: ["inquiries", "closed"], from: "2026-09-01", to: "2026-09-03" }).items;
    const at = (key) => items.find((item) => item.key === key);
    expect(at("qualified")).toMatchObject({ value: null, before: null, conv: null, sub: "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้" });
    expect(at("deposits")).toMatchObject({ value: null, sub: "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้" });
    expect(at("inquiries")).toMatchObject({ value: 120 });
    expect(at("closed")).toMatchObject({ value: 6 });
    expect(at("closed").conv).toBeCloseTo(6 / 120);
    expect(at("cpl").value).toBeNull();
  });
  it("ไม่ส่ง stages = ครบ 4 ขั้นเหมือนเดิม", () => {
    const items = salesPipeline({ sales, spend: 30000 }).items;
    expect(items.find((item) => item.key === "qualified").value).toBe(0);
  });
});
```

- [ ] **Step 6: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run tests/salesOverview.test.js`
Expected: FAIL — `expected 0 to be null`

- [ ] **Step 7: ให้ salesPipeline รู้จัก stages**

ใน `src/modules/marketing/ads/salesOverview.js` แก้ `salesPipeline`:

1) เพิ่มพารามิเตอร์ `stages = FUNNEL_STAGE_KEYS` (import `FUNNEL_STAGE_KEYS` จาก `./salesFacts.js` เพิ่มจากที่ import อยู่แล้ว)
2) เพิ่มค่าคงที่เหนือ `const stages = [...]` เดิม (เปลี่ยนชื่อตัวแปรเดิมเป็น `stageItems` กันชนกับพารามิเตอร์ใหม่):

```js
  const MISSING_STAGE = "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้";
  const has = (key) => stages.includes(key);
  const stageValue = (key, value) => (has(key) ? value : null);
```

3) ในอาเรย์ `stageItems` ให้ทุกขั้นห่อค่าด้วย `stageValue` และ `sub` ใช้ `MISSING_STAGE` เมื่อไม่มีขั้นนั้น เช่น:

```js
    { key: "qualified", label: "Lead", value: stageValue("qualified", leads), before: has("qualified") && prevSales ? prevSales.leads : null,
      conv: has("qualified") ? share(leads, inquiries) : null, sub: !has("qualified") ? MISSING_STAGE : sales ? null : none },
```

4) อัตราผ่านของขั้นถัดไปต้องข้ามขั้นที่ไม่มี — คำนวณ `conv` ของ `closed` จากขั้นก่อนหน้าที่ยังมีอยู่:

```js
  const prevStageValue = (key) => {
    const order = FUNNEL_STAGE_KEYS.filter((item) => has(item));
    const at = order.indexOf(key);
    return at > 0 ? { inquiries, qualified: leads, deposits, closed: orders }[order[at - 1]] : null;
  };
```
แล้วใช้ `conv: share(orders, prevStageValue("closed"))` ในขั้น `closed`

5) CPL / CAC: เมื่อไม่มีขั้น `qualified` ให้ `value` และ `before` เป็น `null` พร้อม `sub: MISSING_STAGE`

- [ ] **Step 8: รันเทสให้ผ่าน**

Run: `npx vitest run tests/salesOverview.test.js tests/salesFacts.test.js`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 9: ส่ง stages เข้าไปจากตัวคำนวณหน้า Overview**

ใน `src/modules/marketing/ads/overviewModel.js` (ส่วน `if (real)`) เพิ่ม `stages: funnelStagesOf(brand.id)` ให้ `salesPipeline` รายแบรนด์ และ `stages: FUNNEL_STAGE_KEYS` สำหรับภาพรวม (ภาพรวมรวมหลายแบรนด์ จึงยังครบ 4 ขั้น) — import จาก `./salesFacts.js`

- [ ] **Step 10: รันทั้งชุดแล้วรายงาน**

Run: `npm test --silent && npm run lint && npm run build`
Expected: ผ่านทั้งหมด → รายงานผู้ใช้ว่าพร้อม commit

---

### Task 3: หน้า Sync และป้ายกำกับของ JK

**Files:**
- Modify: `supabase/functions/_shared/salesFacts.js` (เพิ่ม `SALES_SOURCE_BRAND_IDS`)
- Modify: `src/modules/marketing/ads/syncSources.js`
- Modify: `src/modules/marketing/ads/SyncStatusView.jsx`
- Test: `tests/syncSources.test.js` · `tests/syncStatusView.component.test.jsx`

**Interfaces:**
- Consumes: `BRAND_FUNNEL_STAGES` · `funnelStagesOf` (Task 2)
- Produces:
  - `SALES_SOURCE_BRAND_IDS: string[]` — `["b_td","b_jk","b_ta","b_jt"]` (แบรนด์ที่มีแหล่งยอดขายบนหน้าจอ)
  - `jkSourceRow(facts, { today }): { state, fresh, detail }` — แถวแหล่งข้อมูล "ยอดขาย JUNTAKARN (TMK)" ในตารางแหล่งข้อมูล

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มใน `tests/syncSources.test.js`:

```js
describe("แหล่งข้อมูลยอดขาย JUNTAKARN (ระบบ TMK)", () => {
  const fact = (fact_date, patch = {}) => ({ brand_id: "b_jt", fact_date, source: "tmk", orders: 2, gross_revenue: 5000, inquiries: 30, inquiry_filled: true, ...patch });
  it("มีข้อมูลล่าสุดเมื่อวาน = ปกติ · บอกนิยามที่ต่างจากแบรนด์อื่น", () => {
    const row = jkSourceRow([fact("2026-09-16"), fact("2026-09-17")], { today: "2026-09-18" });
    expect(row.state).toBe("ok");
    expect(row.detail).toContain("นับเฉพาะออเดอร์จากแชท");
    expect(row.detail).toContain("วันที่ออเดอร์");
  });
  it("ไม่มีแถวเลย = รอเชื่อม", () => {
    expect(jkSourceRow([], { today: "2026-09-18" }).state).toBe("waiting");
  });
  it("แบรนด์ที่มีแหล่งยอดขายบนหน้าจอ รวม JUNTAKARN แล้ว", () => {
    expect(SALES_BRAND_IDS).toEqual(["b_td", "b_jk", "b_ta", "b_jt"]);
  });
});
```
(เพิ่ม `jkSourceRow` เข้าไปในบรรทัด import ของไฟล์เทสนี้)

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run tests/syncSources.test.js`
Expected: FAIL — `jkSourceRow is not a function`

- [ ] **Step 3: เพิ่มรายชื่อแบรนด์ + แถวแหล่งข้อมูล**

ใน `supabase/functions/_shared/salesFacts.js`:

```js
/* แบรนด์ที่มีแหล่งยอดขายบนหน้าจอ = 3 แบรนด์ของพี่ทัช + JUNTAKARN (ระบบ TMK)
   ต่างจาก SALES_SOURCE_BRANDS ซึ่งเป็น "รหัสที่ขอจาก RPC ของพี่ทัช" — ห้ามใส่ JK ลงตัวนั้น (จะดึงข้อมูลไม่ครบมานับซ้ำ) */
export const SALES_SOURCE_BRAND_IDS = [...SALES_SOURCE_BRANDS.map((code) => SALE_BRAND_BY_CODE[code]), "b_jt"];
```

ใน `src/modules/marketing/ads/syncSources.js`:

```js
export const SALES_BRAND_IDS = SALES_SOURCE_BRAND_IDS;

/** แถวแหล่งข้อมูลของ JUNTAKARN — นิยามต่างจากแบรนด์อื่น ต้องเขียนไว้บนจอ ไม่ให้คนอ่านเข้าใจผิด */
export function jkSourceRow(facts = [], { today } = {}) {
  const days = (facts ?? []).filter((fact) => fact?.brand_id === "b_jt" && fact?.source === "tmk").map((fact) => fact.fact_date).sort();
  const last = days[days.length - 1] ?? null;
  const detail = "นับเฉพาะออเดอร์จากแชท (ไม่รวม Shopee · Lazada · หน้าร้าน) · ยอดลงตามวันที่ออเดอร์ · ไม่มีขั้น Lead และมัดจำ";
  if (!last) return { state: "waiting", fresh: null, detail };
  const lag = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
  return { state: lag <= 2 ? "ok" : "stale", fresh: last, detail };
}
```
(import `SALES_SOURCE_BRAND_IDS` เพิ่มจาก `./salesFacts.js`)

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run tests/syncSources.test.js`
Expected: PASS

- [ ] **Step 5: แสดงแถวใหม่ในหน้า Sync**

ใน `src/modules/marketing/ads/SyncStatusView.jsx` ในตาราง "แหล่งข้อมูล" เพิ่มแถวที่ 4 โดยใช้ `jkSourceRow(sales, { today })` แทนข้อความ "รอเชื่อมแหล่งข้อมูล" เดิมของ JUNTAKARN และให้แสดง `detail` ใต้ชื่อแหล่ง

- [ ] **Step 6: เทสหน้าจอ**

เพิ่มใน `tests/syncStatusView.component.test.jsx` — render แล้วยืนยันว่ามีข้อความ "นับเฉพาะออเดอร์จากแชท" และไม่มีคำว่า "รอเชื่อมแหล่งข้อมูล" สำหรับ JUNTAKARN เมื่อส่ง facts ของ `b_jt` เข้าไป

Run: `npx vitest run tests/syncStatusView.component.test.jsx`
Expected: PASS

- [ ] **Step 7: รันทั้งชุดแล้วรายงาน**

Run: `npm test --silent && npm run lint && npm run build`
Expected: ผ่านทั้งหมด → รายงานผู้ใช้ว่าพร้อม commit

---

### Task 4: RPC ฝั่ง TMK (ผู้ใช้รันเอง)

**Files:**
- Create: `/Users/artist/Documents/TMK Operation/supabase/migrations/20260918-jk-ads-daily-facts.sql`

**Interfaces:**
- Consumes: `JK_FACT_COLUMNS` (Task 1) — ชื่อคอลัมน์ที่ RPC ต้องคืน ต้องตรงกันเป๊ะ
- Produces: RPC `public.jk_ads_daily_facts(p_from date, p_to date)` คืนคอลัมน์: `day, inquiries, inq_by_channel, inquiry_filled, orders, orders_new, sales, sales_new, ord_by_channel, cancelled, cancelled_value, avg_reply_minutes`

- [ ] **Step 1: เขียนไฟล์ migration**

```sql
-- ============================================================
-- jk_ads_daily_facts — สรุปยอดรายวันให้ระบบ ads ของ SSB (โปรเจกต์ lzvftqhffqefqupwulus)
-- ข้อตกลง 18 ก.ย. 2569: นับเฉพาะออเดอร์ช่องแชท (source=shipnity และไม่ใช่ Shopee/Lazada/POS)
--   · ยอดลงตามวันที่ออเดอร์ · ตัดออเดอร์ยกเลิกออกจากยอด แต่รายงานจำนวน/มูลค่าที่ยกเลิกแยก
--   · merge tmk_order_overrides ก่อนคิดเสมอ (order_id = source || ':' || order_no)
-- ห้ามคืนข้อมูลลูกค้า/เซลล์/เลขออเดอร์ — ฝั่ง ads ตรวจซ้ำอีกชั้น (jkExtraColumns)
-- idempotent · รันใน Supabase SQL Editor ของโปรเจกต์ TMK
-- ============================================================
create or replace function public.jk_ads_daily_facts(p_from date, p_to date)
returns table (
  day date, inquiries numeric, inq_by_channel jsonb, inquiry_filled boolean,
  orders numeric, orders_new numeric, sales numeric, sales_new numeric, ord_by_channel jsonb,
  cancelled numeric, cancelled_value numeric, avg_reply_minutes numeric
)
language sql
security definer
set search_path = public
as $$
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as d
  ),
  merged as (
    select
      coalesce(nullif(ov.order_date, '')::date, o.order_date)            as d,
      coalesce(nullif(ov.channel, ''), o.channel)                        as channel,
      coalesce(nullif(ov.customer_type, ''), o.customer_type)            as customer_type,
      coalesce(ov.sales, o.sales, 0)                                     as sales,
      coalesce(o.status, 'active')                                       as status,
      coalesce(o.source, '')                                             as source
    from public.tmk_mp_orders o
    left join public.tmk_order_overrides ov on ov.order_id = coalesce(o.source, '') || ':' || o.order_no
  ),
  chat as (
    select * from merged
    where source = 'shipnity'
      and channel is not null
      and channel not in ('Shopee', 'Lazada', 'POS')
      and d between p_from and p_to
  ),
  ord as (
    select d,
      count(*) filter (where status <> 'cancelled')                                    as orders,
      count(*) filter (where status <> 'cancelled' and customer_type = 'ลูกค้าใหม่')    as orders_new,
      coalesce(sum(sales) filter (where status <> 'cancelled'), 0)                     as sales,
      coalesce(sum(sales) filter (where status <> 'cancelled' and customer_type = 'ลูกค้าใหม่'), 0) as sales_new,
      count(*) filter (where status = 'cancelled')                                     as cancelled,
      coalesce(sum(sales) filter (where status = 'cancelled'), 0)                      as cancelled_value
    from chat
    group by d
  ),
  -- ออเดอร์ต่อช่องทาง: รวมทีละ (วัน, ช่องทาง) ก่อน แล้วค่อยยุบเป็น jsonb ต่อวัน (กันนับซ้ำ)
  ord_ch_rows as (
    select d, channel, count(*) as n
    from chat
    where status <> 'cancelled'
    group by d, channel
  ),
  ord_ch as (
    select d, jsonb_object_agg(channel, n) as ord_by_channel
    from ord_ch_rows
    group by d
  ),
  -- คนทัก: รูปแบบ jsonb ใหม่ {ช่องทาง:{new,old}} หรือ {ช่องทาง:12} · ไม่มี jsonb ค่อยใช้ 4 คอลัมน์เก่า
  funnel_rows as (
    select f.date as d,
      case when f.leads is not null and jsonb_typeof(f.leads) = 'object' and f.leads <> '{}'::jsonb
        then (select coalesce(jsonb_object_agg(e.key,
                case when jsonb_typeof(e.value) = 'object'
                     then coalesce((e.value->>'new')::numeric, 0) + coalesce((e.value->>'old')::numeric, 0)
                     else coalesce(e.value#>>'{}', '0')::numeric end), '{}'::jsonb)
              from jsonb_each(f.leads) e)
        else jsonb_strip_nulls(jsonb_build_object(
               'Facebook', nullif(coalesce(f.leads_fb_new, 0) + coalesce(f.leads_fb_old, 0), 0),
               'LINE',     nullif(coalesce(f.leads_line_new, 0) + coalesce(f.leads_line_old, 0), 0)))
      end as by_channel
    from public.tmk_sales_funnel f
    where f.date between p_from and p_to
  ),
  -- แตกเป็น (วัน, ช่องทาง, จำนวน) รวมทุกเซลล์ แล้วค่อยยุบกลับเป็น jsonb ต่อวัน
  funnel_ch as (
    select fr.d, e.key as channel, sum((e.value#>>'{}')::numeric) as n
    from funnel_rows fr
    cross join lateral jsonb_each(fr.by_channel) e
    group by fr.d, e.key
  ),
  funnel as (
    select d,
      sum(n) as inquiries,
      jsonb_object_agg(channel, n) as inq_by_channel
    from funnel_ch
    group by d
  ),
  -- วันที่ทีมกรอกคนทัก (มีแถวใน tmk_sales_funnel) — ใช้ตัดสิน inquiry_filled แม้ยอดจะเป็น 0
  funnel_days as (
    select distinct date as d from public.tmk_sales_funnel where date between p_from and p_to
  ),
  reply as (
    select date as d, max(coalesce(avg_reply_minutes, 0)) as avg_reply_minutes
    from public.tmk_daily_sales
    where date between p_from and p_to and deleted_at is null
    group by date
  )
  select days.d as day,
    coalesce(funnel.inquiries, 0)                                as inquiries,
    coalesce(funnel.inq_by_channel, '{}'::jsonb)                 as inq_by_channel,
    (funnel_days.d is not null)                                  as inquiry_filled,
    coalesce(ord.orders, 0)                                      as orders,
    coalesce(ord.orders_new, 0)                                  as orders_new,
    coalesce(ord.sales, 0)                                       as sales,
    coalesce(ord.sales_new, 0)                                   as sales_new,
    coalesce(ord_ch.ord_by_channel, '{}'::jsonb)                 as ord_by_channel,
    coalesce(ord.cancelled, 0)                                   as cancelled,
    coalesce(ord.cancelled_value, 0)                             as cancelled_value,
    coalesce(reply.avg_reply_minutes, 0)                         as avg_reply_minutes
  from days
  left join ord         on ord.d = days.d
  left join ord_ch      on ord_ch.d = days.d
  left join funnel      on funnel.d = days.d
  left join funnel_days on funnel_days.d = days.d
  left join reply       on reply.d = days.d
  order by days.d;
$$;

revoke all on function public.jk_ads_daily_facts(date, date) from public, anon, authenticated;
grant execute on function public.jk_ads_daily_facts(date, date) to service_role;

-- VERIFY (รันแล้วต้องได้แถวเท่าจำนวนวัน และตัวเลขตรงกับหน้าเว็บ TMK)
-- select * from public.jk_ads_daily_facts('2026-09-01', '2026-09-17');
-- ROLLBACK: drop function if exists public.jk_ads_daily_facts(date, date);
```

- [ ] **Step 2: ขออนุญาตผู้ใช้ก่อนให้รัน**

รายงานผู้ใช้: ไฟล์อยู่ที่ไหน · รันที่ไหน (Supabase SQL Editor ของโปรเจกต์ TMK) · กระทบอะไร (เพิ่มฟังก์ชันใหม่ ไม่แตะตารางหรือข้อมูล) · ย้อนกลับยังไง (`drop function`) แล้ว **รอผู้ใช้รันเอง** ตามกติกาของ repo TMK (ไม่มี migration runner)

- [ ] **Step 3: ให้ผู้ใช้ตรวจตัวเลข**

ขอให้ผู้ใช้รันใน SQL Editor แล้วส่งผลกลับมา:
```sql
select * from public.jk_ads_daily_facts('2026-09-01', current_date);
```
เทียบกับหน้า "รายงานขาย" ของ TMK ช่วงเดียวกัน (ยอดขายรวม · จำนวนออเดอร์ · คนทัก) ถ้าต่างเกิน 1 บาทหรือ 1 ออเดอร์ ให้หยุดและรายงาน อย่าเดาเหตุผล

- [ ] **Step 4: จดว่ารัน migration แล้ว**

ตามกติกาของ repo TMK:
```sql
select public.tmk_migration_applied('20260918-jk-ads-daily-facts.sql');
```

---

### Task 5: เฟส JK ใน sales-sync

**Files:**
- Create: `supabase/functions/_shared/jkBridge.js`
- Create: `tests/jkBridge.test.js`
- Modify: `supabase/functions/sales-sync/index.ts`

**Interfaces:**
- Consumes: `jkRowsToDailyFacts` · `jkExtraColumns` · `JK_FACT_COLUMNS` (Task 1) · `doorState` · `describeSalesKey` · `describeSalesUrl` (มีอยู่แล้วใน `_shared/salesBridge.js`)
- Produces:
  - `jkFactsUrl(url: string, from: string, to: string): string` — URL ของ RPC พร้อม `select` เฉพาะ `JK_FACT_COLUMNS`
  - `jkWindows(from: string, to: string, size?: number): {from,to}[]` — แบ่งช่วงกันชนเพดาน 1,000 แถว (ค่าเริ่ม 31 วัน เพราะ 1 แถว/วัน)

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `tests/jkBridge.test.js`:

```js
import { describe, it, expect } from "vitest";
import { jkFactsUrl, jkWindows } from "../supabase/functions/_shared/jkBridge.js";

describe("jkFactsUrl", () => {
  it("ชี้ไป RPC พร้อมช่วงวันและขอเฉพาะคอลัมน์ที่อนุญาต", () => {
    const url = new URL(jkFactsUrl("https://asimudifasqvtjegbvdp.supabase.co", "2026-09-01", "2026-09-17"));
    expect(url.pathname).toBe("/rest/v1/rpc/jk_ads_daily_facts");
    expect(url.searchParams.get("select")).toBe("day,inquiries,inq_by_channel,inquiry_filled,orders,orders_new,sales,sales_new,ord_by_channel,cancelled,cancelled_value,avg_reply_minutes");
  });
  it("วันที่ผิดรูป = โยน DATE_INVALID", () => {
    expect(() => jkFactsUrl("https://x.supabase.co", "01/09/2026", "2026-09-17")).toThrow("DATE_INVALID");
  });
});

describe("jkWindows", () => {
  it("แบ่งเป็นก้อนละไม่เกิน size วัน (รวมหัวท้าย)", () => {
    expect(jkWindows("2026-09-01", "2026-09-05", 2)).toEqual([
      { from: "2026-09-01", to: "2026-09-02" }, { from: "2026-09-03", to: "2026-09-04" }, { from: "2026-09-05", to: "2026-09-05" },
    ]);
    expect(jkWindows("2026-09-01", "2026-09-30").length).toBe(1);
  });
  it("ช่วงกลับหัว = []", () => {
    expect(jkWindows("2026-09-05", "2026-09-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าไม่ผ่าน**

Run: `npx vitest run tests/jkBridge.test.js`
Expected: FAIL — resolve import ไม่เจอ

- [ ] **Step 3: เขียน jkBridge**

สร้าง `supabase/functions/_shared/jkBridge.js`:

```js
/* สะพานไประบบ TMK (ยอดขาย JUNTAKARN) — ประกอบ URL ของ RPC และแบ่งช่วงวัน
   สถานะประตู/ชนิดคีย์ใช้ของเดิมร่วมกับสะพานพี่ทัช (doorState / describeSalesKey ใน salesBridge.js) */
import { JK_FACT_COLUMNS } from "./jkFacts.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const baseOf = (url) => String(url ?? "").trim().replace(/\/+$/, "");
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function jkFactsUrl(url, from, to) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? ""))) throw new Error("DATE_INVALID");
  const target = new URL(`${baseOf(url)}/rest/v1/rpc/jk_ads_daily_facts`);
  target.searchParams.set("select", JK_FACT_COLUMNS.join(","));
  return target.toString();
}

/** 1 แถว/วัน → ก้อนละ 31 วันยังห่างเพดาน 1,000 แถวมาก */
export function jkWindows(from, to, size = 31) {
  if (!ISO.test(String(from ?? "")) || !ISO.test(String(to ?? "")) || from > to) return [];
  const step = Math.max(1, Math.trunc(Number(size) || 1));
  const out = [];
  for (let start = from; start <= to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    out.push({ from: start, to: end < to ? end : to });
  }
  return out;
}
```

- [ ] **Step 4: รันเทสให้ผ่าน**

Run: `npx vitest run tests/jkBridge.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: ต่อเฟส JK เข้า sales-sync**

ใน `supabase/functions/sales-sync/index.ts` หลังบล็อกที่เขียน `business_daily_facts` ของพี่ทัชเสร็จ (บรรทัด ~229) เพิ่ม:

```ts
  /* เฟส JUNTAKARN — ระบบ TMK Operation (Supabase คนละโปรเจกต์ · env JK_API_URL / JK_API_KEY)
     ล้มแยกจากเฟสพี่ทัช: JK พังต้องไม่ทำให้ TD/JD/TA หายไปด้วย */
  let jk: { read: number; written: number; error: string | null } = { read: 0, written: 0, error: null };
  const jkUrl = Deno.env.get("JK_API_URL")?.trim();
  const jkKey = Deno.env.get("JK_API_KEY")?.trim();
  if (jkUrl && jkKey) {
    try {
      const jkRows: Record<string, unknown>[] = [];
      for (const window of jkWindows(from, to)) {
        const response = await fetch(jkFactsUrl(jkUrl, window.from, window.to), {
          method: "POST",
          headers: { apikey: jkKey, Authorization: `Bearer ${jkKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_from: window.from, p_to: window.to }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw fail(`JK_${doorState(response.status, payload?.code).toUpperCase()}`);
        if (Array.isArray(payload)) jkRows.push(...payload);
      }
      const leaked = jkExtraColumns(jkRows);
      if (leaked.length) throw fail("JK_COLUMN_LEAK");
      const rows = jkRowsToDailyFacts(jkRows, { from, to }).map((row) => ({ ...row, source_updated_at: new Date().toISOString() }));
      if (rows.length) {
        const { error } = await db.from("business_daily_facts").upsert(rows, { onConflict: "source,external_record_id" });
        if (error) throw fail("JK_WRITE_FAILED");
      }
      jk = { read: jkRows.length, written: rows.length, error: null };
    } catch (error) {
      jk = { read: 0, written: 0, error: error instanceof Error ? (error as { code?: string }).code ?? "JK_FAILED" : "JK_FAILED" };
    }
  }
```

เพิ่ม import ด้านบนไฟล์:
```ts
import { jkExtraColumns, jkRowsToDailyFacts } from "../_shared/jkFacts.js";
import { jkFactsUrl, jkWindows } from "../_shared/jkBridge.js";
```

และใส่ `jk` ลงใน `summary` ของ `finishRun` และใน `json(request, {...})` ตอนจบ เพื่อให้หน้า Sync เห็นผลรอบ JK

- [ ] **Step 6: รันทั้งชุด**

Run: `npm test --silent && npm run lint`
Expected: ผ่านทั้งหมด (เฟส JK ยังไม่ถูกเรียกจริงจนกว่าจะตั้ง env)

- [ ] **Step 7: ขออนุญาต deploy**

รายงานผู้ใช้: ต้องตั้ง secret `JK_API_URL` (`https://asimudifasqvtjegbvdp.supabase.co`) และ `JK_API_KEY` (secret key ของโปรเจกต์ TMK) ใน Supabase ของ ads **ผู้ใช้ตั้งเอง — ห้ามให้ผมพิมพ์คีย์** แล้วขออนุญาต deploy `sales-sync` ผ่าน `/release` (เขียน `.release-ok` แยกคำสั่งจากคำสั่ง deploy) ถ้ายังไม่ตั้ง env เฟส JK จะถูกข้ามเงียบๆ ไม่กระทบของเดิม

---

### Task 6: เปิดใช้จริงและตรวจตัวเลข

**Files:**
- Modify: `README.md` · `docs/RUNBOOK.md` · `CHANGELOG.md`

**Interfaces:**
- Consumes: ทุกงานก่อนหน้า
- Produces: เอกสารที่บอกวิธีตรวจและนิยามที่ต่างของ JK

- [ ] **Step 1: สั่งดึงข้อมูลย้อนหลังครั้งแรก**

ขออนุญาตผู้ใช้ก่อน แล้วให้ผู้ใช้กดปุ่ม "ดึงข้อมูลตอนนี้" ในหน้า Sync (หัวหน้าทีมเท่านั้น) — ดึงย้อนหลัง 14 วันอัตโนมัติ ถ้าต้องการมากกว่านั้นใช้ปุ่มดึงย้อนหลังรายเดือน

- [ ] **Step 2: ตรวจตัวเลขเทียบต้นทาง**

เปิดหน้า Overview เลือกแบรนด์ JUNTAKARN ช่วงเดือนนี้ แล้วเทียบกับหน้า "รายงานขาย" ของ TMK ช่วงเดียวกัน:

| ตัวเลข | ต้องตรงกับ |
|---|---|
| ยอดขาย | ยอดขายของออเดอร์ช่องแชทใน TMK |
| ยืนยันออเดอร์ | จำนวนออเดอร์ช่องแชท |
| คนทัก | คนทักรวมของทีมในหน้าคนทัก |
| Lead / ได้ออเดอร์ | ต้องขึ้น "—" พร้อมข้อความ "ระบบขายของแบรนด์นี้ไม่มีขั้นนี้" |
| ROAS · %Ads | คิดจากค่าแอด Meta ของ JUNTAKARN ที่มีอยู่แล้ว |

ถ้าไม่ตรง ให้หยุดและรายงานส่วนต่าง อย่าปรับสูตรให้ตรงโดยไม่รู้สาเหตุ

- [ ] **Step 3: อัปเดตเอกสาร**

- `README.md` ตาราง "ข้อมูลไหลยังไง": เพิ่มแถวยอดขาย JUNTAKARN (แหล่ง: ระบบ TMK · RPC `jk_ads_daily_facts` · วันละครั้ง) และแก้บรรทัดที่เขียนว่า JUNTAKARN ยังไม่มีแหล่งยอดขาย
- `docs/RUNBOOK.md`: เพิ่มหัวข้อ "ยอดขาย JUNTAKARN ไม่มา" — ตรวจ env สองตัว · เรียก RPC ตรงๆ ใน SQL Editor ของ TMK · ดูรหัสผิดพลาด `JK_*` ในประวัติรอบ
- `CHANGELOG.md` `[Unreleased]` → `### feat`: ต่อยอดขาย JUNTAKARN จากระบบ TMK (นับเฉพาะออเดอร์จากแชท · ยอดตามวันที่ออเดอร์ · funnel 2 ขั้น)

- [ ] **Step 4: รันทั้งชุดแล้วรายงาน**

Run: `npm test --silent && npm run lint && npm run build`
Expected: ผ่านทั้งหมด → รายงานผู้ใช้ว่าพร้อม commit (ห้าม commit เอง)

---

## ความเสี่ยงที่ต้องระวัง

| เรื่อง | ผลถ้าพลาด | กันยังไง |
|---|---|---|
| ลืม merge override | ยอดเป็นค่าก่อนแก้มือ | อยู่ใน SQL ของ Task 4 และมีขั้นตอนเทียบตัวเลขใน Task 6 |
| นับมาร์เก็ตเพลสปนเข้ามา | ROAS ของ JK สูงเกินจริง | กรอง `source='shipnity'` + ตัด Shopee/Lazada/POS ใน RPC |
| ข้อมูลลูกค้าหลุดข้ามระบบ | ผิดกติกาความปลอดภัยที่ตั้งไว้ | RPC คืนเฉพาะตัวเลข + `jkExtraColumns` หยุดก่อนเขียน |
| JK พังแล้วลาก TD/JD/TA ล้มด้วย | ยอดทุกแบรนด์หาย | เฟส JK อยู่ใน try/catch แยก (Task 5) |
| นิยามวันต่างจากแบรนด์อื่น | คนอ่านเข้าใจผิดตอนเทียบแบรนด์ | ข้อความบนหน้า Sync (Task 3) + เอกสาร (Task 6) |
