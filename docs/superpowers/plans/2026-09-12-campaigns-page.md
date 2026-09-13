# หน้าแคมเปญ (Campaigns Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้า `/mkt/campaigns` ที่แสดงแคมเปญของทุกแบรนด์×แพลตฟอร์มเป็นตาราง พร้อมจังหวะงบระดับแคมเปญ ป้ายตัดสินใจ (สเกล/ตรวจแก้/หยุด/รอข้อมูล/ติด Gate) และแถวขยายดูรายวัน+ครีเอทีฟ — โดยไม่แตะหน้า Overview ปัจจุบัน

**Architecture:** โมเดลใหม่ `adsCampaigns.js` (pure, ต่อยอด `adsOverview.js`) รวมการ์ดรายวันเป็นแถวแคมเปญ · mock เพิ่ม `campaign_budgets` (สัดส่วนงบต่อแคมเปญ) · UI ใหม่ใน `src/modules/marketing/campaigns/` ใช้ CSS `aw-*` เดิมของ AdsWorkspace เพื่อหน้าตาเดียวกัน · route/เมนูใหม่ผ่าน `routes.jsx` + `MarketingModule` prop `view`

**Tech Stack:** React 19 + Vite 8 · plain JSX (ไม่มี TS) · Chart.js ผ่าน `ChartBox` · vitest · oxlint · CSS ของแพลตฟอร์ม (`theme.css` tokens · `mktStyles.css` · `adsWorkspace.css`)

**Spec:** `docs/superpowers/specs/2026-09-12-campaigns-page-design.md`

## Global Constraints

- **ห้ามแก้** `src/modules/marketing/ads/AdsView.jsx`, `AdsWorkspace.jsx`, `AdsControlCenter.jsx`, `adsWorkspace.css` (พี่อาร์ตล็อกหน้า Overview) — reuse ได้เฉพาะ *class CSS* และ *ฟังก์ชันใน adsOverview.js*
- **ไม่คิดเลขในหน้าจอ** — ทุกตัวเลขมาจาก `adsCampaigns.js`/`adsOverview.js` ที่มีเทส
- **null ≠ 0** — อัตราส่วนที่ตัวหารเป็น 0/ว่างต้องเป็น `null` และแสดง `—`
- **ยอดรวมของทุกแถวที่กรอง** ไม่ใช่แค่ที่เห็น · อัตราส่วนรวมคิดจาก Σตัวตั้ง ÷ Σตัวหาร
- ห้ามเพิ่ม dependency · ห้ามใช้ Recharts (กติกา `dash/charts/theme.js`)
- **git:** ห้าม commit เอง — จบ task ให้รายงาน "พร้อม commit" แล้วรอคำสั่ง (CLAUDE.md กฎข้อ 2) · ห้ามแตะ Supabase (กฎข้อ 3)
- ทุก task ที่มองเห็นในเบราว์เซอร์ต้องตรวจจริง (screenshot/วัด) ก่อนบอกว่าเสร็จ

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `src/modules/marketing/data/seedBackfill.js` (แก้) | `CAMPAIGN_META` + `buildCampaignBudgets()` |
| `src/modules/marketing/data/seed.js` (แก้) | ใส่ `campaign_budgets` ใน `buildSeed()` · bump `DATA_VERSION` |
| `src/modules/marketing/adsScope.js` (ใหม่) | `isoDay` · `periodRange` · `sameDatesLastMonth` · `PERIOD_PRESETS` (คัดลอกจาก AdsView เพราะห้ามแก้ไฟล์นั้น — มีหมายเหตุให้รวมทีหลังเมื่อได้รับอนุญาต) |
| `src/modules/marketing/adsCampaigns.js` (ใหม่) | โมเดล pure: `campaignRows` · `campaignDecision` · `SAVED_VIEWS` · `applyView` · `campaignTotals` · `sortCampaigns` |
| `src/modules/marketing/campaigns/CampaignsView.jsx` (ใหม่) | state ตัวกรอง + memo + toolbar + sidebar + ประกอบหน้า |
| `src/modules/marketing/campaigns/CampaignsTable.jsx` (ใหม่) | ตาราง + saved views + ยอดรวม + เรียง |
| `src/modules/marketing/campaigns/CampaignDetail.jsx` (ใหม่) | เนื้อหาแถวขยาย: กราฟรายวัน · ครีเอทีฟ · ข้อค้นพบ · ที่มา · ตารางสำรอง |
| `src/modules/marketing/campaigns/campaigns.css` (ใหม่) | สไตล์เฉพาะหน้า (prefix `cp-`) + responsive ≤900 |
| `src/modules/marketing/MarketingModule.jsx` (แก้) | รับ prop `view` เลือก AdsView / CampaignsView |
| `src/shell/routes.jsx`, `src/shell/AppShell.jsx` (แก้) | เมนู + route `/mkt/campaigns` |
| `tests/adsCampaigns.test.js` (ใหม่) · `tests/seedBackfill.test.js` (แก้) | เทสโมเดล + mock |

---

### Task 1: Mock — สัดส่วนงบ/objective/สถานะต่อแคมเปญ

**Files:**
- Modify: `src/modules/marketing/data/seedBackfill.js` (หลัง `const CAMPAIGNS = [...]`)
- Modify: `src/modules/marketing/data/seed.js:11` และ `:613`
- Test: `tests/seedBackfill.test.js`

**Interfaces:**
- Produces: `export const CAMPAIGN_META` · `export function buildCampaignBudgets(anchorMs = Date.now())` → `[{ brand_id, channel, campaign, month:"YYYY-MM", share:number, objective:"messages"|"leads", status:"active"|"paused" }]` · `data.campaign_budgets` ใน seed

- [ ] **Step 1: เขียนเทสที่ยังแดง** — ต่อท้าย `tests/seedBackfill.test.js`

```js
import { buildCampaignBudgets, CAMPAIGN_META } from "../src/modules/marketing/data/seedBackfill.js";

describe("งบแคมเปญ mock", () => {
  it("ทุกแพลตฟอร์มมีครบทุกแคมเปญ · สัดส่วนรวม = 1 · มี objective/status", () => {
    const rows = buildCampaignBudgets(ANCHOR);
    const names = Object.keys(CAMPAIGN_META);
    const byPlatform = new Map();
    for (const r of rows) {
      const k = `${r.brand_id}|${r.channel}`;
      byPlatform.set(k, [...(byPlatform.get(k) ?? []), r]);
      expect(names).toContain(r.campaign);
      expect(["messages", "leads"]).toContain(r.objective);
      expect(["active", "paused"]).toContain(r.status);
      expect(r.month).toBe(new Date(ANCHOR).toISOString().slice(0, 7));
    }
    for (const list of byPlatform.values()) {
      expect(list).toHaveLength(names.length);
      expect(list.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
    }
  });
  it("seed มี campaign_budgets", () => {
    expect(Array.isArray(buildSeed().campaign_budgets)).toBe(true);
    expect(buildSeed().campaign_budgets.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: รันให้แดง** — `npx vitest run tests/seedBackfill.test.js` → FAIL: `buildCampaignBudgets is not a function`

- [ ] **Step 3: เขียน mock** — ใน `seedBackfill.js` หลังบรรทัด `const CAMPAIGNS = [...]`:

```js
/* แคมเปญ mock ใต้แพลตฟอร์ม — objective/สถานะ + "สัดส่วน" งบของแพลตฟอร์ม
   เก็บสัดส่วนไม่ใช่จำนวนเงิน: แก้งบแพลตฟอร์มที่หน้าตั้งค่าแล้วงบแคมเปญขยับตามเอง
   (ตรงกับ ad_daily_facts.level = 'campaign' ที่จะมาจาก API) */
export const CAMPAIGN_META = {
  "Always-on — คนเคยทัก":         { objective: "messages", status: "active", share: 0.45 },
  "Prospecting — กลุ่มใหม่":      { objective: "leads",    status: "active", share: 0.35 },
  "Remarketing — คนดูแล้วไม่ทัก": { objective: "messages", status: "paused", share: 0.20 },
};

/** สัดส่วนงบ/objective/สถานะ ต่อ แบรนด์×แพลตฟอร์ม×แคมเปญ ของเดือนที่ anchor อยู่ */
export function buildCampaignBudgets(anchorMs = Date.now()) {
  const month = new Date(anchorMs).toISOString().slice(0, 7);
  return MONTH_ADS.flatMap((r) => Object.entries(CAMPAIGN_META).map(([campaign, m]) => ({
    brand_id: r.brand, channel: r.channel, campaign, month, share: m.share, objective: m.objective, status: m.status,
  })));
}
```

ใน `seed.js`: บรรทัด 11 → `export const DATA_VERSION = "ssb-cp-v22";  /* v22 = งบ/objective/สถานะระดับแคมเปญ */` · import `buildCampaignBudgets` จาก `./seedBackfill.js` · ใน `buildSeed()` ใต้ `ad_budgets: buildAdBudgets(),` เพิ่ม `campaign_budgets: buildCampaignBudgets(),`

- [ ] **Step 4: รันให้เขียว** — `npx vitest run tests/seedBackfill.test.js` → PASS · `npx vitest run` ทั้งชุดต้องเขียว (276 + 2)

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): campaign budget share/objective/status mock`) — รอคำสั่ง

---

### Task 2: โมเดล `campaignRows`

**Files:**
- Create: `src/modules/marketing/adsCampaigns.js`
- Test: `tests/adsCampaigns.test.js`

**Interfaces:**
- Consumes: จาก `adsOverview.js` — `adFactRows(cards, range)`, `adPlatformOf(c)`, `share`, `roasOf`, `budgetOf(brandId, channel, month, adBudgets)`, `budgetPace(spend, budget, today)`, `deliveryOf({spend,impressions,clicks,reach})`, `adsDailySeries(cards, range)`, `adsCreativeRows(cards, range, brands)`, `change`
- Produces: `campaignRows(cards, range, { brands, adBudgets, campaignBudgets, today, prevRange })` → array เรียงค่าแอดมาก→น้อย แต่ละแถว:
  ```
  { key, brandId, brand, platform, name, objective, status,
    spend, spendShare, budget, pace, leads, revenue, cpl, roas, pctAds,
    impressions, clicks, reach, ctr, cpc, cpm, frequency,
    complete, days, prev:{spend,leads,cpl,roas}, delta:{spend,leads,cpl,roas},
    series:{days:[],spend:[],leads:[],cpl:[],roas:[]}, creatives:[...adsCreativeRows rows] }
  ```

- [ ] **Step 1: เขียนเทสที่ยังแดง** — สร้าง `tests/adsCampaigns.test.js`

```js
import { describe, it, expect } from "vitest";
import { campaignRows, NO_CAMPAIGN } from "../src/modules/marketing/adsCampaigns.js";

const RANGE = { start: "2026-07-01T00:00:00.000Z", end: "2026-07-16T00:00:00.000Z" };
const PREV = { start: "2026-06-16T00:00:00.000Z", end: "2026-07-01T00:00:00.000Z" };
const BRANDS = [{ id: "b_td", name: "TEAMDEE" }];
const card = (id, day, over = {}) => ({
  id, track: "project", status: "measured", brand_id: "b_td", archived: true,
  campaign: "Always-on — คนเคยทัก", creative: "ชิ้น A",
  brief: { channels: ["Facebook"], publish_at: null },
  metrics: { spend: 1000, leads: 4, revenue: 3000, impressions: 20_000, clicks: 300, reach: 10_000,
    measured_at: `2026-07-${String(day).padStart(2, "0")}T09:00:00.000Z` },
  ...over,
});
const cards = [
  card("a1", 3), card("a2", 5), card("a3", 8, { campaign: "Prospecting — กลุ่มใหม่", metrics: { ...card("x", 8).metrics, spend: 2000, leads: 0 } }),
  card("p1", 20, { metrics: { ...card("x", 20).metrics, measured_at: "2026-06-20T09:00:00.000Z" } }),
];
const budgets = [{ brand_id: "b_td", channel: "Facebook", month: "2026-07", amount: 10_000 }];
const cb = [
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Always-on — คนเคยทัก", month: "2026-07", share: 0.6, objective: "messages", status: "active" },
  { brand_id: "b_td", channel: "Meta Ads", campaign: "Prospecting — กลุ่มใหม่", month: "2026-07", share: 0.4, objective: "leads", status: "active" },
];
const opts = { brands: BRANDS, adBudgets: budgets, campaignBudgets: cb, today: "2026-07-15", prevRange: PREV };

describe("campaignRows", () => {
  it("รวมการ์ดเป็นแถวต่อ แบรนด์×แพลตฟอร์ม×แคมเปญ เรียงค่าแอด และคิดอัตราส่วนจากผลรวม", () => {
    const rows = campaignRows(cards, RANGE, opts);
    expect(rows.map((r) => r.name)).toEqual(["Always-on — คนเคยทัก", "Prospecting — กลุ่มใหม่"]);
    const a = rows[0];
    expect(a.platform).toBe("Meta Ads");
    expect(a.spend).toBe(2000);
    expect(a.leads).toBe(8);
    expect(a.cpl).toBe(250);
    expect(a.roas).toBe(3);                     // 6000/2000
    expect(a.pctAds).toBeCloseTo(1 / 3);
    expect(a.ctr).toBeCloseTo(600 / 40_000);
    expect(a.frequency).toBeCloseTo(2);
    expect(a.spendShare).toBeCloseTo(0.5);      // 2000 / 4000 ในขอบเขต
  });
  it("งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน · จังหวะงบคิดถึงระดับแคมเปญ · objective/status มาจาก mock", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.budget).toBe(6000);
    expect(a.pace.used).toBeCloseTo(2000 / 6000);
    expect(a.objective).toBe("messages");
    expect(a.status).toBe("active");
  });
  it("แคมเปญที่ไม่มีลีด: CPL/ROAS ไม่ใช่ศูนย์ — CPL null · ROAS จาก revenue จริง", () => {
    const p = campaignRows(cards, RANGE, opts)[1];
    expect(p.leads).toBe(0);
    expect(p.cpl).toBeNull();
  });
  it("เทียบช่วงก่อนจากผลรวมช่วงก่อน · delta เป็น % · ไม่มีช่วงก่อน = null", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.prev.spend).toBe(1000);
    expect(a.delta.spend).toBeCloseTo(100);     // 2000 vs 1000
    const [noPrev] = campaignRows(cards, RANGE, { ...opts, prevRange: null });
    expect(noPrev.delta.spend).toBeNull();
  });
  it("การ์ดที่ไม่มีชื่อแคมเปญไปอยู่แถว NO_CAMPAIGN งบ null สถานะ unknown", () => {
    const rows = campaignRows([card("z", 4, { campaign: undefined })], RANGE, opts);
    expect(rows[0].name).toBe(NO_CAMPAIGN);
    expect(rows[0].budget).toBeNull();
    expect(rows[0].status).toBe("unknown");
  });
  it("series รายวันมีเฉพาะวันที่มีการ์ด และพก creatives", () => {
    const [a] = campaignRows(cards, RANGE, opts);
    expect(a.series.days).toEqual(["2026-07-03", "2026-07-05"]);
    expect(a.days).toBe(2);
    expect(a.creatives[0].creative).toBe("ชิ้น A");
  });
});
```

- [ ] **Step 2: รันให้แดง** — `npx vitest run tests/adsCampaigns.test.js` → FAIL: cannot resolve `adsCampaigns.js`

- [ ] **Step 3: เขียนโมเดล** — สร้าง `src/modules/marketing/adsCampaigns.js`

```js
/* ============================================================
   adsCampaigns — ตัวเลขของหน้า "แคมเปญ" (pure · มีเทส)
   ต่อยอด adsOverview.js: การ์ดรายวัน (campaign/creative) → แถวแคมเปญต่อ แบรนด์×แพลตฟอร์ม
   งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน (mock) · ROAS ที่นี่คือ attribution (revenue ของแคมเปญ ÷ spend)
   ============================================================ */
import {
  ACTION_RULES, adFactRows, adPlatformOf, adsCreativeRows, adsDailySeries, budgetOf, budgetPace,
  change, decideAction, deliveryOf, roasOf, share,
} from "./adsOverview.js";

export const NO_CAMPAIGN = "ไม่ระบุแคมเปญ";

const campaignOf = (c) => c.campaign ?? c.brief?.campaign ?? NO_CAMPAIGN;

/** ผลรวมดิบของกลุ่มการ์ด — ฟิลด์ผลลัพธ์ขาดใบเดียว = complete:false (ห้ามเดา) */
function rollup(cards) {
  const t = { spend: 0, leads: 0, revenue: 0, impressions: 0, clicks: 0, reach: 0, complete: cards.length > 0 };
  for (const c of cards) {
    const m = c.metrics ?? {};
    if (m.spend == null || m.leads == null || m.revenue == null) t.complete = false;
    t.spend += m.spend ?? 0; t.leads += m.leads ?? 0; t.revenue += m.revenue ?? 0;
    t.impressions += m.impressions ?? 0; t.clicks += m.clicks ?? m.link_clicks ?? 0; t.reach += m.reach ?? 0;
  }
  return t;
}

export function campaignRows(cards, range, { brands = [], adBudgets = [], campaignBudgets = [], today, prevRange = null } = {}) {
  const month = today.slice(0, 7);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const groups = new Map();
  const groupKey = (c) => `${c.brand_id}|${adPlatformOf(c)}|${campaignOf(c)}`;
  for (const c of adFactRows(cards, range)) {
    const key = groupKey(c);
    if (!groups.has(key)) groups.set(key, { key, brandId: c.brand_id, brand: brandName.get(c.brand_id) ?? c.brand_id, platform: adPlatformOf(c), name: campaignOf(c), cards: [] });
    groups.get(key).cards.push(c);
  }
  const prevByKey = new Map();
  if (prevRange) for (const c of adFactRows(cards, prevRange)) { const k = groupKey(c); prevByKey.set(k, [...(prevByKey.get(k) ?? []), c]); }
  const scopeSpend = [...groups.values()].reduce((n, g) => n + rollup(g.cards).spend, 0);

  return [...groups.values()].map((g) => {
    const m = rollup(g.cards);
    const meta = campaignBudgets.find((r) => r.brand_id === g.brandId && r.channel === g.platform && r.campaign === g.name && r.month === month) ?? null;
    const platformBudget = budgetOf(g.brandId, g.platform, month, adBudgets);
    const budget = meta && platformBudget != null ? Math.round(platformBudget * meta.share) : null;
    const p = rollup(prevByKey.get(g.key) ?? []);
    const prev = { spend: prevRange ? p.spend : null, leads: prevRange ? p.leads : null, cpl: prevRange ? share(p.spend, p.leads) : null, roas: prevRange ? roasOf(p.revenue, p.spend) : null };
    const daily = adsDailySeries(g.cards, range);
    const cpl = share(m.spend, m.leads), roas = roasOf(m.revenue, m.spend);
    return {
      key: g.key, brandId: g.brandId, brand: g.brand, platform: g.platform, name: g.name,
      objective: meta?.objective ?? null, status: meta?.status ?? "unknown",
      spend: m.spend, spendShare: share(m.spend, scopeSpend), budget, pace: budgetPace(m.spend, budget, today),
      leads: m.leads, revenue: m.revenue, cpl, roas, pctAds: share(m.spend, m.revenue),
      ...deliveryOf(m),
      complete: m.complete, days: daily.filter((d) => d.spend > 0).length,
      prev, delta: { spend: change(m.spend, prev.spend), leads: change(m.leads, prev.leads), cpl: change(cpl, prev.cpl), roas: change(roas, prev.roas) },
      series: { days: daily.map((d) => d.day), spend: daily.map((d) => d.spend), leads: daily.map((d) => d.leads), cpl: daily.map((d) => d.cpl), roas: daily.map((d) => d.roas) },
      creatives: adsCreativeRows(g.cards, range, brands, ACTION_RULES),
    };
  }).sort((a, b) => b.spend - a.spend);
}
```
(ส่วน `decideAction` import ไว้ใช้ใน Task 3)

- [ ] **Step 4: รันให้เขียว** — `npx vitest run tests/adsCampaigns.test.js` → PASS ทั้ง 6 · `npx oxlint src/modules/marketing/adsCampaigns.js` → 0 warning

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): campaignRows model`) — รอคำสั่ง

---

### Task 3: โมเดล — ป้ายตัดสินใจ · saved views · ยอดรวม · เรียง

**Files:**
- Modify: `src/modules/marketing/adsCampaigns.js`
- Test: `tests/adsCampaigns.test.js`

**Interfaces:**
- Produces:
  - `campaignDecision(row, targets = null, rules = ACTION_RULES)` → `{ tag:"wait"|"stop"|"fix"|"gate"|"scale"|"watch", label, tone:"zinc"|"rose"|"amber"|"emerald", why, next }`
  - `SAVED_VIEWS` = `[{ key, label, test(rowWithDecision) }]` (ทั้งหมด · ควรสเกล · ต้องตรวจแก้ · ใช้เงินไม่มีผล · เสี่ยงล้า · รอข้อมูล · ติด Gate)
  - `applyView(rows, viewKey)` · `campaignTotals(rows)` → `{ count, spend, budget, leads, revenue, cpl, roas, pctAds, reviewSpend, waiting }` · `sortCampaigns(rows, key, dir="desc")`

- [ ] **Step 1: เขียนเทสที่ยังแดง** — ต่อท้ายไฟล์เทส

```js
import { campaignDecision, SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../src/modules/marketing/adsCampaigns.js";

const base = { spend: 3000, leads: 10, cpl: 300, roas: 3.5, complete: true, days: 5,
  pace: { remaining: 2000, used: 0.6, expected: 0.5 }, creatives: [{ fatigue: false }] };

describe("campaignDecision", () => {
  it("ข้อมูลไม่พอ → รอข้อมูล ก่อนกฎอื่นทั้งหมด", () => {
    expect(campaignDecision({ ...base, days: 2 }).tag).toBe("wait");
    expect(campaignDecision({ ...base, leads: 3, spend: 200 }).tag).toBe("wait");
    expect(campaignDecision({ ...base, complete: false }).tag).toBe("wait");
  });
  it("ใช้เงินมากไม่มีผล → หยุด · ROAS ต่ำกว่า stopRoas → หยุด", () => {
    expect(campaignDecision({ ...base, leads: 0, spend: 800, roas: null, days: 4 }).tag).toBe("stop");
    expect(campaignDecision({ ...base, roas: 0.8 }).tag).toBe("stop");
  });
  it("เกณฑ์แบรนด์จากหน้าตั้งค่า: CPL เกิน / ROAS ต่ำกว่าเป้า → ตรวจแก้ พร้อมเหตุผลระบุเป้า", () => {
    const d = campaignDecision({ ...base, cpl: 450 }, { cpl: 400, roas: 0 });
    expect(d.tag).toBe("fix");
    expect(d.why).toContain("400");
    expect(campaignDecision({ ...base, roas: 3.5 }, { cpl: 0, roas: 4 }).tag).toBe("fix");
  });
  it("ครีเอทีฟล้า → ตรวจแก้", () => {
    expect(campaignDecision({ ...base, creatives: [{ fatigue: true }] }).tag).toBe("fix");
  });
  it("ผลดีแต่งบเหลือ 0 หรือใช้เร็วกว่าจังหวะ → ติด Gate ไม่ใช่สเกล", () => {
    expect(campaignDecision({ ...base, pace: { remaining: 0, used: 1, expected: 0.5 } }).tag).toBe("gate");
    expect(campaignDecision({ ...base, pace: { remaining: 500, used: 0.9, expected: 0.5 } }).tag).toBe("gate");
    expect(campaignDecision({ ...base, pace: { remaining: 3000, used: 0.5, expected: 0.5 } }).tag).toBe("scale");
  });
  it("ไม่มีงบ (pace.used null) → สเกลได้ตามกฎเดิม (ไม่มี Gate ให้ติด)", () => {
    expect(campaignDecision({ ...base, pace: { remaining: null, used: null, expected: 0.5 } }).tag).toBe("scale");
  });
});

describe("saved views · ยอดรวม · เรียง", () => {
  const rows = [
    { ...base, key: "a", spend: 3000, leads: 10, revenue: 10_500, budget: 5000, decision: { tag: "scale" } },
    { ...base, key: "b", spend: 800, leads: 0, revenue: 0, budget: null, cpl: null, roas: null, decision: { tag: "stop" } },
    { ...base, key: "c", spend: 1200, leads: 2, revenue: 900, budget: 2000, cpl: 600, roas: 0.75, decision: { tag: "wait" } },
  ];
  it("applyView กรองด้วยป้าย · 'ทั้งหมด' คืนทุกแถว", () => {
    expect(applyView(rows, "all")).toHaveLength(3);
    expect(applyView(rows, "scale").map((r) => r.key)).toEqual(["a"]);
    expect(applyView(rows, "spendNoResult").map((r) => r.key)).toEqual(["b"]);
    expect(SAVED_VIEWS.map((v) => v.key)).toEqual(["all", "scale", "fix", "spendNoResult", "fatigue", "wait", "gate"]);
  });
  it("campaignTotals คิดจาก Σ · งบไม่ครบทุกแถว = null · reviewSpend = เงินในแถว fix/stop · waiting = จำนวนรอข้อมูล", () => {
    const t = campaignTotals(rows);
    expect(t.count).toBe(3);
    expect(t.spend).toBe(5000);
    expect(t.budget).toBeNull();
    expect(t.cpl).toBeCloseTo(5000 / 12);
    expect(t.roas).toBeCloseTo(11_400 / 5000);
    expect(t.reviewSpend).toBe(800);
    expect(t.waiting).toBe(1);
    expect(campaignTotals([]).cpl).toBeNull();
  });
  it("sortCampaigns: null ท้ายเสมอทั้งสองทิศ", () => {
    expect(sortCampaigns(rows, "cpl", "asc").map((r) => r.key)).toEqual(["a", "c", "b"]);
    expect(sortCampaigns(rows, "cpl", "desc").map((r) => r.key)).toEqual(["c", "a", "b"]);
  });
});
```

- [ ] **Step 2: รันให้แดง** — FAIL: `campaignDecision is not a function`

- [ ] **Step 3: เขียนโมเดล** — ต่อท้าย `adsCampaigns.js`

```js
/* ---------- ป้ายตัดสินใจ — ต่อจาก decideAction เดิม + เป้าแบรนด์จากหน้าตั้งค่า + Gate งบ ----------
   ลำดับ: รอข้อมูล → หยุด → ตรวจแก้ (ล้า/กฎ/เป้าแบรนด์) → Gate → สเกล → ติดตาม · ทุกป้ายมี why + next */
const MIN_DAYS = 3, MIN_LEADS = 5;
const TAG = {
  wait:  { label: "รอข้อมูล",     tone: "zinc" },
  stop:  { label: "พิจารณาหยุด",  tone: "rose" },
  fix:   { label: "ตรวจแก้",      tone: "amber" },
  gate:  { label: "ติด Gate",     tone: "amber" },
  scale: { label: "พิจารณาสเกล",  tone: "emerald" },
  watch: { label: "ติดตาม",       tone: "zinc" },
};
const tagOf = (tag, why, next) => ({ tag, ...TAG[tag], why, next });

export function campaignDecision(row, targets = null, rules = ACTION_RULES) {
  if (!row.complete) return tagOf("wait", "ข้อมูลผลลัพธ์ยังไม่ครบทุกวัน", "รอ sync/กรอกผลให้ครบก่อนตัดสิน");
  if (row.days < MIN_DAYS) return tagOf("wait", `รันมา ${row.days} วัน (ต้องครบ ${MIN_DAYS} วัน)`, "รอให้ครบวันขั้นต่ำ");
  const wasted = row.spend > rules.wasteSpend && row.leads === 0;
  if (row.leads < MIN_LEADS && !wasted) return tagOf("wait", `ผลลัพธ์ ${row.leads} ยังน้อยกว่า ${MIN_LEADS}`, "รอผลเพิ่มก่อนสรุป");
  const fatigue = (row.creatives ?? []).some((c) => c.fatigue);
  const base = decideAction({ spend: row.spend, leads: row.leads, roas: row.roas, cpl: row.cpl, fatigue, complete: true }, rules);
  if (base.action === "Stop") return tagOf("stop", base.why, base.next);
  if (base.action === "Fix") return tagOf("fix", base.why, base.next);
  /* เป้าแบรนด์จากหน้าตั้งค่า (0 = ยังไม่ตั้ง) — ชนะกฎกลางเมื่อตั้งไว้ */
  if (targets?.cpl > 0 && row.cpl != null && row.cpl > targets.cpl)
    return tagOf("fix", `CPL ${Math.round(row.cpl).toLocaleString("th-TH")} เกินเป้าแบรนด์ ${targets.cpl.toLocaleString("th-TH")}`, "ลดต้นทุนก่อนเติมงบ: กลุ่มเป้าหมาย/ชิ้นงาน/ข้อเสนอ");
  if (targets?.roas > 0 && row.roas != null && row.roas < targets.roas)
    return tagOf("fix", `ROAS ${row.roas.toFixed(1)}x ต่ำกว่าเป้าแบรนด์ ${targets.roas}x`, "แก้ข้อเสนอหรือหน้าปลายทางก่อน");
  if (base.action === "Scale") {
    const p = row.pace ?? {};
    if (p.used != null && (p.remaining <= 0 || p.used > p.expected + 0.1))
      return tagOf("gate", p.remaining <= 0 ? "ผลดีแต่งบแคมเปญหมดแล้ว" : "ผลดีแต่ใช้งบเร็วกว่าจังหวะเดือน", "ขอเพิ่มงบ/โยกงบจากตัวที่ควรหยุดก่อน แล้วค่อยสเกล");
    return tagOf("scale", base.why, base.next);
  }
  return tagOf("watch", base.why, base.next);
}

export const SAVED_VIEWS = [
  { key: "all",           label: "ทั้งหมด",        test: () => true },
  { key: "scale",         label: "ควรสเกล",        test: (r) => r.decision.tag === "scale" },
  { key: "fix",           label: "ต้องตรวจแก้",    test: (r) => r.decision.tag === "fix" },
  { key: "spendNoResult", label: "ใช้เงินไม่มีผล",  test: (r) => r.decision.tag === "stop" && r.leads === 0 },
  { key: "fatigue",       label: "เสี่ยงล้า",       test: (r) => (r.creatives ?? []).some((c) => c.fatigue) },
  { key: "wait",          label: "รอข้อมูล",       test: (r) => r.decision.tag === "wait" },
  { key: "gate",          label: "ติด Gate",       test: (r) => r.decision.tag === "gate" },
];
export const applyView = (rows, key) => rows.filter(SAVED_VIEWS.find((v) => v.key === key)?.test ?? (() => true));

/** ยอดรวมของ "ทุกแถวที่กรอง" — อัตราส่วนคิดจาก Σ · งบรวมได้ต่อเมื่อทุกแถวมีงบ */
export function campaignTotals(rows) {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const leads = rows.reduce((n, r) => n + r.leads, 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const budget = rows.length && rows.every((r) => r.budget != null) ? rows.reduce((n, r) => n + r.budget, 0) : null;
  return {
    count: rows.length, spend, budget, leads, revenue,
    cpl: share(spend, leads), roas: roasOf(revenue, spend), pctAds: share(spend, revenue),
    reviewSpend: rows.filter((r) => ["fix", "stop"].includes(r.decision?.tag)).reduce((n, r) => n + r.spend, 0),
    waiting: rows.filter((r) => r.decision?.tag === "wait").length,
  };
}

/** เรียงคอลัมน์ — null ท้ายเสมอไม่ว่าทิศไหน */
export function sortCampaigns(rows, key, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return typeof x === "string" ? sign * x.localeCompare(y, "th") : sign * (x - y);
  });
}
```

- [ ] **Step 4: รันให้เขียว** — `npx vitest run tests/adsCampaigns.test.js` → PASS ทั้งหมด · lint 0

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): campaign decision tags, saved views, totals, sort`) — รอคำสั่ง

---

### Task 4: `adsScope.js` — helper ช่วงเวลาที่หน้าแคมเปญใช้ร่วม (ไม่แตะ AdsView)

**Files:**
- Create: `src/modules/marketing/adsScope.js`
- Test: `tests/adsCampaigns.test.js` (เพิ่ม describe)

**Interfaces:**
- Produces: `isoDay(date)` → `"YYYY-MM-DD"` · `periodRange(key, from, to, now = new Date())` → `{start, end}` ISO (end exclusive) · `sameDatesLastMonth(range)` · `PERIOD_PRESETS = [["today","วันนี้"],["7d","7 วัน"],["mtd","เดือนนี้"]]`

- [ ] **Step 1: เทสที่ยังแดง**

```js
import { periodRange, sameDatesLastMonth, isoDay, PERIOD_PRESETS } from "../src/modules/marketing/adsScope.js";
describe("adsScope", () => {
  const NOW = new Date(2026, 8, 12, 10, 0, 0);            // 12 ก.ย. 2026 local
  it("mtd = ต้นเดือนถึงพรุ่งนี้ (end exclusive) · 7d ย้อน 6 วัน · custom ใช้วันที่ที่ส่ง", () => {
    const m = periodRange("mtd", null, null, NOW);
    expect(isoDay(new Date(m.start))).toBe("2026-09-01");
    expect(isoDay(new Date(m.end))).toBe("2026-09-13");
    expect(isoDay(new Date(periodRange("7d", null, null, NOW).start))).toBe("2026-09-06");
    const c = periodRange("custom", "2026-09-03", "2026-09-05", NOW);
    expect(isoDay(new Date(c.end))).toBe("2026-09-06");
  });
  it("sameDatesLastMonth เลื่อนทั้งช่วงไป 1 เดือน", () => {
    const r = sameDatesLastMonth(periodRange("mtd", null, null, NOW));
    expect(isoDay(new Date(r.start))).toBe("2026-08-01");
  });
  it("มี preset 3 ตัวตามหน้า Overview", () => { expect(PERIOD_PRESETS.map((p) => p[0])).toEqual(["today", "7d", "mtd"]); });
});
```

- [ ] **Step 2: รันให้แดง** — FAIL: cannot resolve `adsScope.js`

- [ ] **Step 3: สร้างไฟล์** — คัดลอก `isoDay`/`atMidnight`/`addDaysLocal`/`periodRange`/`sameDatesLastMonth` จาก `AdsView.jsx:10-30` มาวางแบบ `export` พร้อมหัวไฟล์:

```js
/* adsScope — ช่วงเวลาของหน้า ads (คัดลอกจาก AdsView.jsx เพราะหน้า Overview ถูกล็อกห้ามแก้
   TODO(หลังได้รับอนุญาต): ให้ AdsView import จากไฟล์นี้แทนเพื่อไม่ให้มีสองสำเนา) */
export const isoDay = (d) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };
const atMidnight = (s) => new Date(`${s}T00:00:00`).toISOString();
const addDaysLocal = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function periodRange(key, from, to, now = new Date()) { /* …เหมือน AdsView.jsx:16-26 ทุกบรรทัด… */ }
export function sameDatesLastMonth(range) { /* …เหมือน AdsView.jsx:27-31… */ }
export const PERIOD_PRESETS = [["today", "วันนี้"], ["7d", "7 วัน"], ["mtd", "เดือนนี้"]];
```

- [ ] **Step 4: รันให้เขียว** · lint 0

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): shared period scope helpers`) — รอคำสั่ง

---

### Task 5: Route + เมนู + โครงหน้า (toolbar/sidebar) — เห็นหน้าเปล่าใน browser

**Files:**
- Modify: `src/shell/routes.jsx:177-186` (เพิ่ม item ใน `MARKETING_GROUPS[0].items`) + import icon
- Modify: `src/shell/AppShell.jsx:26-28`
- Modify: `src/modules/marketing/MarketingModule.jsx`
- Create: `src/modules/marketing/campaigns/CampaignsView.jsx`, `campaigns.css`

**Interfaces:**
- Consumes: `useApp()` → `{ data, inBrandScope, brandFilter }` (`data.cards`, `data.brands`, `data.ad_budgets`, `data.campaign_budgets`, `data.settings?.ads_control?.targets`) · `campaignRows`, `campaignDecision` (Task 2–3) · `periodRange`, `sameDatesLastMonth`, `isoDay`, `PERIOD_PRESETS` (Task 4) · `previousRange` จาก `mktAnalytics.js` · `analyticsCards`, `filterByChannel`, `adsChannelList`, `revenueBasisCards` จาก `adsOverview.js`
- Produces: `export function CampaignsView()` · state `{ period, customFrom, customTo, compare, channel, brandSel, query, view, sort }` · memo `v = { rows (มี decision), range, before, compareLabel, channelList, brands, byBrand:{[id]:{count,spend}} }`

- [ ] **Step 1: ลงทะเบียน route/เมนู**

`routes.jsx` — ที่บรรทัด import lucide เพิ่ม `LayoutList` · ใน `MARKETING_GROUPS[0].items` ต่อจาก item `mkt_ads`:
```js
      {
        id: "mkt_campaigns", path: "/mkt/campaigns", label: "แคมเปญ", icon: LayoutList,
        perm: "marketing.dash.view", status: "live", view: "campaigns",
        purpose: "แคมเปญทุกแบรนด์×แพลตฟอร์ม · จังหวะงบระดับแคมเปญ · ป้ายสเกล/ตรวจแก้/หยุด · ครีเอทีฟล้า",
      },
```
`AppShell.jsx:26-28`:
```js
const MODULE_ELEMENTS = {
  mkt_ads: <MarketingModule view="ads" />,
  mkt_campaigns: <MarketingModule view="campaigns" />,
};
```
`MarketingModule.jsx` (ทั้งไฟล์):
```jsx
import { lazy, Suspense } from "react";
import { useApp } from "./useMkt.jsx";
import { MktStyles, Toaster } from "./mktUi.jsx";
import "./mktStyles.css";

const AdsView = lazy(() => import("./ads/AdsView.jsx").then((m) => ({ default: m.AdsView })));
const CampaignsView = lazy(() => import("./campaigns/CampaignsView.jsx").then((m) => ({ default: m.CampaignsView })));

export default function MarketingModule({ view = "ads" }) {
  const { toastState } = useApp();
  return (
    <div className="mkt-root">
      <MktStyles />
      <Suspense fallback={<div className="empty">กำลังโหลด…</div>}>
        {view === "campaigns" ? <CampaignsView /> : <AdsView />}
      </Suspense>
      <Toaster />
      {toastState && <div className={`toast on ${toastState.kind}`} key={toastState.id}>{toastState.msg}</div>}
    </div>
  );
}
```

- [ ] **Step 2: สร้าง `CampaignsView.jsx`** (โครง + toolbar + sidebar · ตารางมาใน Task 6)

```jsx
/* CampaignsView — หน้า "แคมเปญ" สำหรับคนยิงแอด · reuse ภาษา UI ของ AdsWorkspace (class aw-*)
   ตัวเลขทั้งหมดมาจาก adsCampaigns.js · หน้า Overview ไม่ถูกแตะ */
import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useApp } from "../useMkt.jsx";
import { analyticsCards, previousRange } from "../mktAnalytics.js";
import { adsChannelList, filterByChannel } from "../adsOverview.js";
import { campaignRows, campaignDecision } from "../adsCampaigns.js";
import { isoDay, periodRange, sameDatesLastMonth, PERIOD_PRESETS } from "../adsScope.js";
import { fmtMoney } from "../dash/charts/theme.js";
import { BrandMark } from "../ads/BrandMark.jsx";
import "../ads/adsWorkspace.css";
import "./campaigns.css";

export function CampaignsView() {
  const { data, inBrandScope, brandFilter } = useApp();
  const todayLocal = isoDay(new Date());
  const [period, setPeriod] = useState("mtd");
  const [customFrom, setCustomFrom] = useState(todayLocal.slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(todayLocal);
  const [compare, setCompare] = useState("previous");
  const [channel, setChannel] = useState("all");
  const [brandSel, setBrandSel] = useState("all");
  const [query, setQuery] = useState("");

  const v = useMemo(() => {
    const scopedAll = analyticsCards(data.cards).filter(inBrandScope);
    const scoped = filterByChannel(scopedAll, channel);
    const range = periodRange(period, customFrom, customTo);
    const before = compare === "lastMonth" ? sameDatesLastMonth(range) : previousRange(range);
    const brands = (data.brands ?? []).filter((b) => b.active !== false && (brandFilter === "all" || b.id === brandFilter));
    const targets = data.settings?.ads_control?.targets ?? {};
    const all = campaignRows(scoped, range, { brands, adBudgets: data.ad_budgets ?? [], campaignBudgets: data.campaign_budgets ?? [], today: isoDay(new Date()), prevRange: before })
      .map((r) => ({ ...r, decision: campaignDecision(r, targets[r.brandId] ?? null) }));
    const byBrand = Object.fromEntries(brands.map((b) => [b.id, { count: 0, spend: 0 }]));
    for (const r of all) if (byBrand[r.brandId]) { byBrand[r.brandId].count += 1; byBrand[r.brandId].spend += r.spend; }
    const q = query.trim().toLowerCase();
    const rows = all.filter((r) => (brandSel === "all" || r.brandId === brandSel) && (!q || r.name.toLowerCase().includes(q)));
    return { rows, all, range, before, brands, byBrand, channelList: adsChannelList(scopedAll),
      compareLabel: compare === "lastMonth" ? "วันเดียวกันเดือนก่อน" : "ช่วงก่อนหน้า" };
  }, [data, inBrandScope, brandFilter, period, customFrom, customTo, compare, channel, brandSel, query]);

  const shownFrom = isoDay(new Date(v.range.start));
  const shownTo = isoDay(new Date(new Date(v.range.end).getTime() - 1));
  const changeFrom = (next) => { setCustomFrom(next); setCustomTo(next > shownTo ? next : shownTo); setPeriod("custom"); };
  const changeTo = (next) => { setCustomTo(next); setCustomFrom(next < shownFrom ? next : shownFrom); setPeriod("custom"); };
  const totalSpend = v.all.reduce((n, r) => n + r.spend, 0);

  return <main className="aw cp">
    <section className="aw-toolbar" aria-label="ตัวกรองแคมเปญ">
      <header className="aw-header"><h1>แคมเปญ</h1><a className="aw-settings-link" href="/mkt/ads?panel=settings"><Settings2 size={15} /> ตั้งค่า</a></header>
      <div className="aw-controls">
        <div className="aw-presets" role="group" aria-label="ช่วงเวลาด่วน">{PERIOD_PRESETS.map(([key, label]) => <button type="button" key={key} className={period === key ? "active" : ""} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</div>
        <div className="aw-date-range"><label><span>จาก</span><input aria-label="วันที่เริ่มต้น" type="date" value={shownFrom} max={shownTo} onChange={(e) => changeFrom(e.target.value)} /></label><b>–</b><label><span>ถึง</span><input aria-label="วันที่สิ้นสุด" type="date" value={shownTo} min={shownFrom} max={todayLocal} onChange={(e) => changeTo(e.target.value)} /></label></div>
        <label className="aw-filter"><span>ช่องทาง</span><select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="all">ทั้งหมด</option>{v.channelList.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="aw-filter"><span>เทียบ</span><select value={compare} onChange={(e) => setCompare(e.target.value)}><option value="previous">ช่วงก่อน</option><option value="lastMonth">เดือนก่อน</option></select></label>
        <label className="aw-filter cp-search"><span>ค้นหา</span><input type="search" placeholder="ชื่อแคมเปญ" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <span className="aw-demo"><i /> Mock data</span>
      </div>
    </section>
    <div className="aw-layout">
      <aside className="aw-brands">
        <div className="aw-section-label">แบรนด์ <span>{v.brands.length}</span></div>
        <button type="button" className={`aw-brand ${brandSel === "all" ? "selected" : ""}`} aria-pressed={brandSel === "all"} onClick={() => setBrandSel("all")}><div><strong>ทุกแบรนด์</strong></div><b>{fmtMoney(totalSpend)}</b><small> ค่าแอด {v.all.length} แคมเปญ</small></button>
        {v.brands.map((b) => <button key={b.id} type="button" className={`aw-brand ${brandSel === b.id ? "selected" : ""}`} aria-pressed={brandSel === b.id} onClick={() => setBrandSel(b.id)}><div><BrandMark brand={b} /><strong>{b.name}</strong></div><div><b>{fmtMoney(v.byBrand[b.id]?.spend ?? 0)}</b><small>{v.byBrand[b.id]?.count ?? 0} แคมเปญ</small></div></button>)}
      </aside>
      <div className="aw-content">
        <section className="aw-panel"><div className="aw-section-label">ตารางแคมเปญ (Task 6)</div></section>
      </div>
    </div>
  </main>;
}
```

`campaigns.css` เริ่มต้น:
```css
/* หน้าแคมเปญ — สไตล์เฉพาะ (prefix cp-) · โครง/สี reuse aw-* ของ AdsWorkspace */
.cp .cp-search input { height: 32px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); padding: 0 9px; font: inherit; min-width: 180px; }
```

- [ ] **Step 3: build + lint** — `npm run -s build` ✓ · `npx oxlint src/modules/marketing/campaigns src/shell src/modules/marketing/MarketingModule.jsx` → 0

- [ ] **Step 4: ตรวจใน browser** — เปิด `http://localhost:5173/mkt/campaigns`: เมนู "แคมเปญ" โผล่ใต้ "Overview ads" · toolbar/sidebar หน้าตาเหมือน Overview · sidebar แสดง 4 แบรนด์ + จำนวนแคมเปญ · console ไม่มี error · **เปิด `/mkt/ads` เทียบ screenshot ก่อน/หลัง ต้องเหมือนเดิม**

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): campaigns route, menu and page shell`) — รอคำสั่ง

---

### Task 6: ตารางแคมเปญ + saved views + ยอดรวม + เรียง

**Files:**
- Create: `src/modules/marketing/campaigns/CampaignsTable.jsx`
- Modify: `CampaignsView.jsx` (แทน placeholder Task 5) · `campaigns.css`

**Interfaces:**
- Consumes: `SAVED_VIEWS`, `applyView`, `campaignTotals`, `sortCampaigns` (Task 3) · `PlatformIcon`/`platformMeta` จาก `../ads/PlatformIcon.jsx` · `fmtMoney, fmtPct, fmtInt` จาก `../dash/charts/theme.js`
- Produces: `<CampaignsTable rows={v.rows} compareLabel={v.compareLabel} renderDetail={(row) => <CampaignDetail row={row} … />} />` · state ภายใน: `view`, `sortKey`, `sortDir`, `openKey`

- [ ] **Step 1: เขียน `CampaignsTable.jsx`**

```jsx
import { useMemo, useState } from "react";
import { SAVED_VIEWS, applyView, campaignTotals, sortCampaigns } from "../adsCampaigns.js";
import { PlatformIcon, platformMeta } from "../ads/PlatformIcon.jsx";
import { fmtInt, fmtMoney, fmtPct } from "../dash/charts/theme.js";
import { Icon } from "../mktIcon.jsx";

const fmtRoas = (x) => (x == null ? "—" : `${x.toFixed(1)}x`);
const COLS = [
  ["name", "แคมเปญ"], ["spend", "ค่าแอด"], ["budget", "งบ / จังหวะ"], ["leads", "ผลลัพธ์"], ["cpl", "CPL"],
  ["roas", "ROAS (attr)"], ["ctr", "CTR"], ["frequency", "ความถี่"], ["delta", "เทียบก่อน"], ["decision", "ตัดสินใจ"],
];
const STATUS = { active: "กำลังรัน", paused: "หยุดชั่วคราว", unknown: "ไม่ระบุ" };

/** ป้ายตัดสินใจ: คำคู่สี + tooltip เหตุผล */
function DecisionBadge({ d }) {
  return <span className={`ads-badge ads-badge--${d.tone}`} title={`${d.why} → ${d.next}`}>{d.label}</span>;
}

export function CampaignsTable({ rows, compareLabel, renderDetail }) {
  const [view, setView] = useState("all");
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [openKey, setOpenKey] = useState(null);
  const shown = useMemo(() => sortCampaigns(applyView(rows, view), sortKey, sortDir), [rows, view, sortKey, sortDir]);
  const totals = useMemo(() => campaignTotals(shown), [shown]);
  const counts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((s) => [s.key, applyView(rows, s.key).length])), [rows]);
  const sortBy = (key) => { if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setSortDir("desc"); } };

  return <section className="aw-panel cp-table-panel">
    <div className="cp-totals" aria-label="ยอดรวมของทุกแถวที่กรอง">
      <div><span>แคมเปญ</span><b className="mono">{totals.count}</b></div>
      <div><span>ค่าแอด / งบ</span><b className="mono">{fmtMoney(totals.spend)}<small> / {totals.budget != null ? fmtMoney(totals.budget) : "—"}</small></b></div>
      <div><span>ผลลัพธ์</span><b className="mono">{fmtInt(totals.leads)}</b></div>
      <div><span>CPL</span><b className="mono">{totals.cpl != null ? fmtMoney(totals.cpl) : "—"}</b></div>
      <div><span>ROAS (attr)</span><b className="mono">{fmtRoas(totals.roas)}</b></div>
      <div><span>%Ads</span><b className="mono">{totals.pctAds != null ? fmtPct(totals.pctAds, 1) : "—"}</b></div>
      <div className="cp-totals-review"><span>เงินในรายการที่ต้องตรวจแก้/หยุด</span><b className="mono ads-over">{fmtMoney(totals.reviewSpend)}</b><small>· รอข้อมูล {totals.waiting}</small></div>
    </div>
    <div className="ads-seg cp-views" role="tablist" aria-label="มุมมองที่บันทึกไว้">
      {SAVED_VIEWS.map((s) => <button key={s.key} type="button" role="tab" aria-selected={view === s.key} className={`ads-seg-btn ${view === s.key ? "active" : ""}`} onClick={() => setView(s.key)}>{s.label} <span className="mono">{counts[s.key]}</span></button>)}
    </div>
    {shown.length === 0 ? <div className="empty-row">ไม่มีแคมเปญในมุมมองนี้</div> : (
      <div className="ads-table-wrap">
        <table className="ads-decision-table cp-table">
          <caption className="ads-sr-only">แคมเปญตามตัวกรอง — เรียงตาม {COLS.find((c) => c[0] === sortKey)?.[1]}</caption>
          <thead><tr>{COLS.map(([key, label]) => <th key={key} scope="col" aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
            {["delta", "decision"].includes(key) ? label : <button type="button" className="cp-sort" onClick={() => sortBy(key)}>{label}{sortKey === key && <Icon name="chevron" size={11} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none" }} />}</button>}
          </th>)}<th scope="col"><span className="ads-sr-only">รายละเอียด</span></th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const open = openKey === r.key; const meta = platformMeta(r.platform);
              return <FragmentRow key={r.key} r={r} open={open} meta={meta} compareLabel={compareLabel} onToggle={() => setOpenKey((k) => (k === r.key ? null : r.key))} renderDetail={renderDetail} />;
            })}
          </tbody>
        </table>
      </div>
    )}
  </section>;
}

function FragmentRow({ r, open, meta, compareLabel, onToggle, renderDetail }) {
  const d = r.delta;
  const deltaTxt = d.spend == null ? "เทียบไม่ได้" : `ค่าแอด ${d.spend >= 0 ? "▲" : "▼"}${Math.abs(d.spend).toFixed(0)}% · CPL ${d.cpl == null ? "—" : `${d.cpl >= 0 ? "▲" : "▼"}${Math.abs(d.cpl).toFixed(0)}%`}`;
  return <>
    <tr className={`cp-row ${open ? "open" : ""}`}>
      <th scope="row" data-label="แคมเปญ" style={{ boxShadow: `inset 3px 0 0 ${meta.color}` }}>
        <div className="cp-name"><PlatformIcon channel={r.platform} size={14} /><b>{r.name}</b></div>
        <small className="ads-muted">{r.brand} · {r.platform} · {r.objective ?? "—"} · {STATUS[r.status]}</small>
      </th>
      <td data-label="ค่าแอด" className="mono num"><b>{fmtMoney(r.spend)}</b><small className="ads-muted"> {r.spendShare != null ? fmtPct(r.spendShare, 0) : ""}</small></td>
      <td data-label="งบ / จังหวะ" className="cp-budget">{r.budget == null ? <span className="ads-muted">ไม่มีงบแคมเปญ</span> : <>
        <span className="mono">{fmtMoney(r.budget)} <small className="ads-muted">{fmtPct(r.pace.used, 0)}</small></span>
        <div className="ads-brand-bar" role="img" aria-label={`ใช้ไป ${fmtPct(r.pace.used, 0)} ของงบ · ควรถึง ${fmtPct(r.pace.expected, 0)}`}><i style={{ width: `${Math.min(100, Math.round(r.pace.used * 100))}%`, background: r.pace.used > r.pace.expected + 0.1 ? "var(--warn)" : "var(--ok)" }} /><span className="ads-brand-bar-tick" style={{ left: `${Math.round(r.pace.expected * 100)}%` }} /></div>
      </>}</td>
      <td data-label="ผลลัพธ์" className="mono num">{fmtInt(r.leads)}</td>
      <td data-label="CPL" className="mono num">{r.cpl != null ? fmtMoney(r.cpl) : "—"}</td>
      <td data-label="ROAS (attr)" className="mono num">{fmtRoas(r.roas)}</td>
      <td data-label="CTR" className="mono num">{r.ctr != null ? fmtPct(r.ctr, 2) : "—"}</td>
      <td data-label="ความถี่" className="mono num">{r.frequency != null ? `${r.frequency.toFixed(1)}x` : "—"}</td>
      <td data-label={`เทียบ${compareLabel}`} className="cp-delta">{deltaTxt}</td>
      <td data-label="ตัดสินใจ"><DecisionBadge d={r.decision} /></td>
      <td className="ads-lg-more"><button type="button" className="ads-lg-expand" aria-expanded={open} aria-label={`${open ? "ซ่อน" : "ดู"}รายละเอียด ${r.name}`} onClick={onToggle}><Icon name="chevron" size={12} /></button></td>
    </tr>
    {open && <tr className="cp-detail"><td colSpan={COLS.length + 1}>{renderDetail(r)}</td></tr>}
  </>;
}
```

- [ ] **Step 2: ต่อเข้า `CampaignsView`** — แทน section placeholder:
```jsx
<CampaignsTable rows={v.rows} compareLabel={v.compareLabel} renderDetail={(row) => <CampaignDetail row={row} compareLabel={v.compareLabel} />} />
```
(import `CampaignsTable` และ `CampaignDetail` — `CampaignDetail` มาใน Task 7; ระหว่างนี้ใช้ `renderDetail={() => <p className="ads-muted">รายละเอียด (Task 7)</p>}`)

- [ ] **Step 3: CSS** — ต่อท้าย `campaigns.css`
```css
.cp-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.cp-totals > div { display: flex; flex-direction: column; gap: 2px; }
.cp-totals span { font-size: var(--fs-xs); color: var(--ink-soft); }
.cp-totals b { font-size: 18px; font-variant-numeric: tabular-nums; }
.cp-totals b small { font-size: var(--fs-sm); color: var(--ink-soft); font-weight: 500; }
.cp-totals-review { grid-column: span 2; }
.cp-views { margin: 12px 0; flex-wrap: wrap; }
.cp-views .ads-seg-btn span { margin-left: 4px; color: var(--ink-faint); }
.cp .ads-table-wrap { border: 0; border-radius: 0; }
.cp-table { min-width: 0; }
.cp-table thead th { background: none; border-bottom: 1px solid var(--line); padding: 0 10px 6px; white-space: nowrap; }
.cp-table th, .cp-table td { padding: 8px 10px; vertical-align: middle; }
.cp-table tbody th { background: none; padding-left: 12px; }
.cp-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.mkt-root .cp-sort { display: inline-flex; align-items: center; gap: 4px; padding: 0; background: none; border: 0; font: inherit; font-weight: 600; color: var(--ink-soft); cursor: pointer; min-height: 24px; }
.mkt-root .cp-sort:hover { color: var(--ink); }
.cp-name { display: flex; align-items: center; gap: 6px; }
.cp-budget { min-width: 150px; }
.cp-budget .ads-brand-bar { margin: 4px 0 0; }
.cp-delta { font-size: var(--fs-xs); color: var(--ink-soft); white-space: nowrap; }
.cp-row.open th, .cp-row.open td, .cp-detail td { background: color-mix(in srgb, var(--surface-2) 60%, transparent); }
.cp-detail td { padding: 12px 14px 16px; }
```

- [ ] **Step 4: build + lint + ตรวจ browser** — วัด: จำนวนแถว = จำนวนแคมเปญ (JUNTAKARN 3 แพลตฟอร์ม × 3 แคมเปญ + "ไม่ระบุแคมเปญ") · กด saved view "ควรสเกล" แถวเปลี่ยน · กดหัวคอลัมน์ CPL เรียง null ท้าย · ยอดรวมเปลี่ยนตามมุมมอง · overflow 0 ที่ 1500/2000 · screenshot

- [ ] **Step 5: รายงานพร้อม commit** (`feat(ads): campaigns table with saved views, totals and sorting`) — รอคำสั่ง

---

### Task 7: แถวขยาย — กราฟรายวัน · ครีเอทีฟ · ข้อค้นพบ · ที่มา · ตารางสำรอง

**Files:**
- Create: `src/modules/marketing/campaigns/CampaignDetail.jsx`
- Modify: `CampaignsView.jsx` (ใช้ `CampaignDetail` จริง) · `campaigns.css`

**Interfaces:**
- Consumes: `row` จาก `campaignRows`+`decision` · `ChartBox` จาก `../dash/charts/ChartBox.jsx` · `baseOpts, chartColor, fmtCompact, fmtMoney, fmtPct, SERIES` จาก `../dash/charts/theme.js`
- Produces: `<CampaignDetail row compareLabel />`

- [ ] **Step 1: เขียน `CampaignDetail.jsx`**

```jsx
import { useState } from "react";
import { ChartBox, ChartLegend } from "../dash/charts/ChartBox.jsx";
import { baseOpts, chartColor, fmtCompact, fmtMoney, fmtPct, SERIES } from "../dash/charts/theme.js";

const METRICS = [["spend", "ค่าแอด", "money"], ["leads", "ผลลัพธ์", "int"], ["cpl", "CPL", "money"], ["roas", "ROAS (attr)", "roas"]];
const fmt = (kind, v) => (v == null ? "—" : kind === "money" ? fmtMoney(v) : kind === "roas" ? `${v.toFixed(1)}x` : String(Math.round(v)));

export function CampaignDetail({ row, compareLabel }) {
  const [metric, setMetric] = useState("spend");
  const [, label, kind] = METRICS.find((m) => m[0] === metric);
  const data = row.series[metric];
  const fatigued = row.creatives.filter((c) => c.fatigue);
  return <div className="cp-detail-grid">
    <section aria-label="กราฟรายวัน">
      <div className="cp-detail-head"><h4>รายวัน</h4>
        <div className="ads-seg" role="tablist" aria-label="เลือกตัวชี้วัด">{METRICS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={metric === k} className={`ads-seg-btn ${metric === k ? "active" : ""}`} onClick={() => setMetric(k)}>{l}</button>)}</div>
        <ChartLegend style={{ margin: 0 }} items={[{ label: "ช่วงนี้", color: SERIES.blue, line: true }]} />
      </div>
      <ChartBox type="line" height={180} ariaLabel={`${label} รายวันของ ${row.name}`}
        data={{ labels: row.series.days.map((d) => Number(d.slice(-2))), datasets: [{ label, data, borderColor: SERIES.blue, backgroundColor: "rgba(111,140,245,.12)", borderWidth: 2, tension: .25, pointRadius: 2, spanGaps: false, fill: true }] }}
        options={baseOpts({ scales: { y: { grid: { color: chartColor.line(), drawTicks: false }, border: { display: false }, ticks: { color: chartColor.inkFaint(), font: { size: 11 }, callback: (v) => (kind === "roas" ? `${Number(v).toFixed(1)}x` : fmtCompact(v)) } } },
          plugins: { tooltip: { callbacks: { title: (i) => `วันที่ ${i[0]?.label}`, label: (c) => `${label} ${fmt(kind, c.parsed.y)}` } } } })} />
      <details className="ads-chart-table"><summary>ดูเป็นตาราง (เข้าถึงด้วยคีย์บอร์ด)</summary>
        <div className="ads-table-wrap"><table className="ads-decision-table"><caption className="ads-sr-only">{label} รายวัน</caption>
          <thead><tr><th scope="col">วันที่</th><th scope="col">{label}</th></tr></thead>
          <tbody>{row.series.days.map((d, i) => <tr key={d}><th scope="row">{Number(d.slice(-2))}</th><td className="mono">{fmt(kind, data[i])}</td></tr>)}</tbody>
        </table></div></details>
    </section>
    <section aria-label="ครีเอทีฟ">
      <h4>ครีเอทีฟ {row.creatives.length} ชิ้น{fatigued.length ? <span className="ads-badge ads-badge--amber">เสี่ยงล้า {fatigued.length}</span> : null}</h4>
      <ul className="cp-creatives">{row.creatives.map((c) => <li key={c.key}>
        <div><b>{c.creative}</b><span className={`ads-badge ads-badge--${c.tone}`}>{c.action}</span></div>
        <small className="mono">{fmtMoney(c.spend)} · CTR {c.ctr != null ? fmtPct(c.ctr, 2) : "—"} · ความถี่ {c.frequency != null ? `${c.frequency.toFixed(1)}x` : "—"}{c.ctrDrop != null ? ` · CTR ครึ่งหลัง ${c.ctrDrop >= 0 ? "ตก" : "ขึ้น"} ${fmtPct(Math.abs(c.ctrDrop), 0)}` : ""}</small>
        <small className="ads-muted">{c.why}</small>
      </li>)}</ul>
    </section>
    <section aria-label="ข้อค้นพบและที่มา">
      <h4>ข้อค้นพบ</h4>
      <p className="cp-finding"><span className={`ads-badge ads-badge--${row.decision.tone}`}>{row.decision.label}</span> {row.decision.why}</p>
      <p className="cp-finding"><b>ควรทำต่อ:</b> {row.decision.next}</p>
      <p className="cp-finding ads-muted">เทียบ{compareLabel}: ค่าแอด {row.delta.spend == null ? "—" : `${row.delta.spend.toFixed(0)}%`} · ผลลัพธ์ {row.delta.leads == null ? "—" : `${row.delta.leads.toFixed(0)}%`} · CPL {row.delta.cpl == null ? "—" : `${row.delta.cpl.toFixed(0)}%`}</p>
      <h4>ที่มาของตัวเลข</h4>
      <ul className="cp-source ads-muted">
        <li>ข้อมูลจำลอง (การ์ด <code>ma_*</code> รายวัน) · รันมา {row.days} วันในช่วง</li>
        <li>ROAS (attr) = revenue ที่แพลตฟอร์ม attribute ให้แคมเปญ ÷ ค่าแอด — ไม่ใช่ยอดขายจริงจาก CRM</li>
        <li>งบแคมเปญ = งบแพลตฟอร์ม × สัดส่วน {row.budget == null ? "(ยังไม่ตั้ง)" : ""} · จังหวะ = ใช้ไป ÷ งบ เทียบวันที่ผ่านไป</li>
        <li>ป้ายตัดสินใจ: กฎกลาง (ACTION_RULES) + เป้าแบรนด์จากหน้าตั้งค่า · ขั้นต่ำ 3 วัน / 5 ผลลัพธ์</li>
      </ul>
    </section>
  </div>;
}
```

- [ ] **Step 2: CSS**
```css
.cp-detail-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
.cp-detail-grid h4 { margin: 0 0 8px; font-size: 11px; font-weight: 700; color: var(--ink-soft); display: flex; align-items: center; gap: 8px; }
.cp-detail-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.cp-creatives { list-style: none; margin: 0; padding: 0; }
.cp-creatives li { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; font-size: var(--fs-xs); }
.cp-creatives li + li { border-top: 1px solid var(--line); }
.cp-creatives li > div { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); }
.cp-finding { margin: 0 0 6px; font-size: var(--fs-sm); }
.cp-source { margin: 0; padding-left: 16px; font-size: var(--fs-xs); line-height: 1.6; }
@media (max-width: 1100px) { .cp-detail-grid { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 3: build + lint + ตรวจ browser** — กด ▸ ที่แถว: กราฟขึ้น · สลับ metric เปลี่ยนเส้น · ตารางสำรองเปิดได้ · ครีเอทีฟโชว์ป้าย Scale/Fix/Stop · ข้อค้นพบตรงกับป้ายในแถว · console ไม่มี error · screenshot

- [ ] **Step 4: รายงานพร้อม commit** (`feat(ads): campaign detail row with daily chart, creatives and findings`) — รอคำสั่ง

---

### Task 8: Responsive ≤900px + audit + หลักฐานสรุป

**Files:**
- Modify: `campaigns.css`

- [ ] **Step 1: CSS แปลงตารางเป็นการ์ดในจอแคบ**
```css
@media (max-width: 900px) {
  .cp-table thead { position: absolute; left: -9999px; }
  .cp-table, .cp-table tbody, .cp-table tr, .cp-table th, .cp-table td { display: block; }
  .cp-row { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; margin-bottom: 10px; background: var(--surface); }
  .cp-row th, .cp-row td { padding: 4px 0; border: 0; box-shadow: none !important; text-align: left; }
  .cp-row td[data-label]::before { content: attr(data-label) " "; font-size: var(--fs-xs); color: var(--ink-soft); }
  .cp-row .num { text-align: left; }
  .cp-detail td { display: block; }
  .cp-totals-review { grid-column: span 1; }
}
```
- [ ] **Step 2: ตรวจ** — 375 / 768 / 1500 / 2000: overflow 0 · ที่ 375 แถวเป็นการ์ด ป้ายคอลัมน์โผล่ · ปุ่มทุกปุ่ม ≥ 24px · contrast ป้าย/hint ≥ 4.5:1 (วัดด้วย JS เหมือนรอบ audit ก่อน) · ธีมมืด/สว่างทั้งสอง
- [ ] **Step 3: เทียบหน้า Overview** — screenshot `/mkt/ads` ก่อน/หลังทั้งแผน ต้องเหมือนเดิม · `git diff --stat` ต้องไม่มี `AdsView.jsx`/`AdsWorkspace.jsx`/`adsWorkspace.css`
- [ ] **Step 4: รันทั้งชุด** — `npx vitest run` เขียวทั้งหมด · `npm run build` ✓ · lint 0 → รายงานพร้อม commit (`style(ads): campaigns responsive + audit fixes`) — รอคำสั่ง

---

### Task 9 (เฟส 2 — ต้องถามพี่อาร์ตก่อน): ลิงก์จากการ์ดแพลตฟอร์มใน Overview

แตะ `AdsView.jsx` (ChannelCard) 1 บรรทัด: ปุ่ม "ดูแคมเปญ ↗" → `/mkt/campaigns` พร้อม query `?brand=<id>&channel=<platform>` และให้ `CampaignsView` อ่าน query ตั้งค่า `brandSel`/`channel` ตอนโหลด — **ห้ามทำจนกว่าพี่อาร์ตอนุมัติ** เพราะขัดกับ "ห้ามแก้หน้าปัจจุบัน"

---

## Self-review (ทำแล้ว)

- **Spec coverage:** §3 โครงหน้า → Task 5–7 · §4 ข้อมูล/ป้าย → Task 1–3 · §2 ข้อ 9 มือถือ → Task 8 · ข้อ 3 ลิงก์จาก Overview → Task 9 (gated) · §6 เกณฑ์ผ่าน → Task 8 ✓
- **Placeholder scan:** ไม่มี TBD/TODO ยกเว้นหมายเหตุ TODO ใน `adsScope.js` ซึ่งเป็นเจตนา (บอกที่ที่จะรวมไฟล์ทีหลัง) ✓
- **Type consistency:** `campaignRows` → `rows[].decision` ใส่ที่ `CampaignsView` (Task 5) ก่อนส่ง `CampaignsTable`/`campaignTotals` (Task 3 ใช้ `r.decision?.tag`) ✓ · `creatives[]` ใช้ฟิลด์ของ `adsCreativeRows` (`creative, spend, ctr, frequency, ctrDrop, fatigue, action, tone, why`) ✓ · `pace` มาจาก `budgetPace` (`used, expected, remaining`) ✓
