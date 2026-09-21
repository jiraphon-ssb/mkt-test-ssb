# หน้า "บิล & กระทบยอด" ค่าแอด Meta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าใหม่ /mkt/ads/billing ให้ฝ่ายบัญชี (ผ่าน team_lead) เห็นค่าแอดรายเดือนต่อบัญชี + VAT ประมาณ + ยอดค้าง/สถานะบัญชี + เงินออกนอกระบบ + กรอก statement เทียบส่วนต่าง + ยืนยันผลตรวจ append-only — ไม่มี PDF, โครงท่อเมลเตรียมไว้เฉยๆ

**Architecture:** โมเดลคำนวณเป็น pure function (`billingModel.js`) กิน cards/connections/snapshots/reviews → แถวรายเดือนพร้อมสถานะ · snapshot บัญชีทั้งหมดเก็บโดย ads-cron ผ่าน Graph `/me/adaccounts` ด้วย token OAuth เดิม · ผลตรวจเขียนผ่าน RPC ลงตาราง append-only · UI เป็นแท็บที่ 5 ของ ads suite ใช้ภาษา/ป้ายชุดเดียวกับ Overview

**Tech Stack:** React 19 + Vite · Vitest (jsdom) · Supabase (Postgres RLS + Edge Functions Deno) · Graph API v23.0

**Spec:** docs/superpowers/specs/2026-09-22-billing-recon.md

## Global Constraints

- ตัวเลขเงินทศนิยม 2 ตำแหน่ง · % ตัดทศนิยม 2 ตำแหน่ง **ไม่ปัด** (`fmtMoney` / `fmtNum(x,2)` ของ `src/modules/marketing/dash/charts/theme.js`)
- ป้าย exception-based เท่านั้น: ปกติ = เงียบ · ใช้ class `.aw-flag .aw-flag--amber/--rose` ที่มีอยู่
- สี/โทนใช้ semantic tokens ของ `.mkt-root` (`--line --ink --ink-soft --ok --warn --bad --surface --bg`) ห้าม hex ตรงใน component ใหม่ (CSS ไฟล์ใหม่ใช้ token เดิม)
- เกณฑ์ส่วนต่าง: `MATCH_PCT = 0.005`, `MINOR_PCT = 0.02` (ค่าคงที่ใน billingModel.js)
- สิทธิ์: client แสดงเมนู/หน้าเฉพาะ `user.role === "team_lead"` · ฝั่ง DB คุมด้วย RLS `mkt_is_team_lead()` — ทั้งสองชั้นต้องมี
- ห้ามใส่ key/บัญชีจริงใน fixture (repo public) — ใช้ external_account_id สมมุติ เช่น "111000111"
- **ห้ามรัน migration/deploy edge function บน Supabase จริงโดยไม่ได้รับอนุมัติจากอาร์ตเป็นรายการ** — ทุก task ทำงานกับไฟล์+เทส fixture ได้ครบโดยไม่แตะฐานจริง จุดที่ต้องขอมีธงกำกับ 🔶 SUPABASE-GATE
- commit ต่อ task (conventional commits ไทย) · **ห้าม push** จนกว่าอาร์ตสั่ง
- VAT ทุกจุดต้องมีคำว่า "ค่าประมาณ" กำกับ · `VAT_RATE = 0.07`

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `src/supabase/migrations/0011_ad_billing.sql` (ใหม่) | ตาราง `ad_account_snapshots` · `ad_billing_reviews` (append-only) · `ad_billing_charges` (โครงท่อเมล) + RLS + RPC `mkt_billing_review_add` |
| `supabase/functions/_shared/adsAccountSnapshot.js` (ใหม่) | pure: แปลงผล `/me/adaccounts` → แถว snapshot (มีเทส) + ตัวยิง fetch ผ่าน `fetchGraphJson` |
| `supabase/functions/ads-cron/index.ts` (แก้) | ต่อท้ายรอบ cron: ดึง snapshot แล้ว upsert |
| `src/foundation/data/apiClient.js` (แก้) | `ads.accountSnapshots()` · `ads.billingReviews(month)` · `ads.addBillingReview(entry)` · `ads.billingCharges(month)` |
| `src/modules/marketing/ads/billingModel.js` (ใหม่) | pure model: `buildBillingModel({month, cards, connections, snapshots, reviews, brands})` |
| `src/modules/marketing/ads/BillingView.jsx` + `billingView.css` (ใหม่) | หน้า UI ตาม mockup ฉบับรายเดือน |
| `src/shell/routes.jsx` · `src/shell/AppShell.jsx` · `src/modules/marketing/MarketingModule.jsx` · `src/modules/marketing/ads/AdsSectionTabs.jsx` (แก้) | route `/mkt/ads/billing` + แท็บ "บิล & กระทบยอด" (team_lead เท่านั้น) |
| tests: `billingModel.test.js` · `adsAccountSnapshot.test.js` · `billingView.component.test.jsx` · `adsMigrations.test.js` (เพิ่ม) | คุมทุกชั้น |

---

### Task 1: Migration 0011 — ตาราง 3 ตัว + RPC + RLS

**Files:**
- Create: `src/supabase/migrations/0011_ad_billing.sql`
- Test: `tests/adsMigrations.test.js` (เพิ่ม describe ใหม่ — ไฟล์นี้เทสด้วยการอ่านข้อความ SQL แบบเดียวกับ 0005–0010)

**Interfaces:**
- Produces (ให้ Task 3/5 ใช้): ตาราง `ad_account_snapshots(external_account_id text pk, account_name text, currency text, account_status int, amount_spent_cents bigint, balance_cents bigint, fetched_at timestamptz)` · `ad_billing_reviews(id uuid pk default gen_random_uuid(), month date not null, external_account_id text not null, verdict text check (verdict in ('match','noted')), statement_amount numeric null, note text not null default '', reviewer text not null, created_at timestamptz default now())` · `ad_billing_charges(id uuid pk, source text default 'email', charge_date date, amount numeric, external_account_id text, reference text, raw jsonb, created_at timestamptz)` · RPC `mkt_billing_review_add(p_entry jsonb) returns uuid` (security definer, ตรวจ `mkt_is_team_lead()` ในตัว, insert อย่างเดียว)

- [ ] **Step 1: เขียนเทสข้อความ SQL (fail ก่อน)** — ต่อท้าย `tests/adsMigrations.test.js`:

```js
describe("0011_ad_billing", () => {
  const sql = read("0011_ad_billing.sql");   // ใช้ helper read() ที่ไฟล์นี้มีอยู่แล้ว
  it("สามตารางเปิด RLS และจำกัด team_lead", () => {
    for (const t of ["ad_account_snapshots", "ad_billing_reviews", "ad_billing_charges"]) {
      expect(sql).toContain(`create table ${t}`);
      expect(sql).toContain(`alter table ${t} enable row level security`);
    }
    expect(sql.match(/mkt_is_team_lead\(\)/g).length).toBeGreaterThanOrEqual(4);
  });
  it("reviews เป็น append-only: ไม่มี policy update/delete และ revoke ไว้", () => {
    expect(sql).toContain("revoke update, delete on ad_billing_reviews");
    expect(sql).not.toMatch(/create policy .* on ad_billing_reviews\s+for (update|delete)/i);
  });
  it("RPC เขียนรีวิวตรวจสิทธิ์เองและ insert เท่านั้น", () => {
    expect(sql).toContain("create or replace function mkt_billing_review_add");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/if not mkt_is_team_lead\(\) then\s+raise/i);
  });
});
```

- [ ] **Step 2: รันให้เห็นแดง** — `npx vitest run tests/adsMigrations.test.js` → FAIL (ไฟล์ sql ไม่มี)
- [ ] **Step 3: เขียน migration**

```sql
-- 0011 — บิล & กระทบยอดค่าแอด (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
-- ทุกตาราง: team_lead เท่านั้น (การเงินบริษัท) · reviews = append-only ระดับ DB
create table ad_account_snapshots (
  external_account_id text primary key,
  account_name text not null default '',
  currency text not null default 'THB',
  account_status int,
  amount_spent_cents bigint,          -- ค่าสะสมตลอดชีพจาก Graph (minor units) — ใช้หา delta ระหว่างรอบ
  balance_cents bigint,               -- ยอดค้างที่ Meta ยังไม่ตัด
  fetched_at timestamptz not null default now()
);
create table ad_billing_reviews (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  external_account_id text not null,
  verdict text not null check (verdict in ('match','noted')),
  statement_amount numeric,           -- ยอดที่บัญชีเห็นจาก statement (ไม่บังคับ)
  note text not null default '',
  reviewer text not null,
  created_at timestamptz not null default now()
);
create index ad_billing_reviews_month_idx on ad_billing_reviews(month, external_account_id, created_at desc);
create table ad_billing_charges (      -- โครงท่อเมล: ว่างไว้จนกว่าจะเปิดใช้ (spec หัวข้อ 0)
  id uuid primary key default gen_random_uuid(),
  source text not null default 'email',
  charge_date date,
  amount numeric,
  external_account_id text,
  reference text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table ad_account_snapshots enable row level security;
alter table ad_billing_reviews enable row level security;
alter table ad_billing_charges enable row level security;
create policy snap_read on ad_account_snapshots for select to authenticated using (mkt_is_team_lead());
create policy reviews_read on ad_billing_reviews for select to authenticated using (mkt_is_team_lead());
create policy charges_read on ad_billing_charges for select to authenticated using (mkt_is_team_lead());
revoke update, delete on ad_billing_reviews from anon, authenticated;
create or replace function mkt_billing_review_add(p_entry jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not mkt_is_team_lead() then raise exception 'FORBIDDEN'; end if;
  insert into ad_billing_reviews (month, external_account_id, verdict, statement_amount, note, reviewer)
  values ((p_entry->>'month')::date, p_entry->>'external_account_id', p_entry->>'verdict',
          nullif(p_entry->>'statement_amount','')::numeric, coalesce(p_entry->>'note',''), p_entry->>'reviewer')
  returning id into v_id;
  return v_id;
end $$;
```

- [ ] **Step 4: เทสเขียว** — `npx vitest run tests/adsMigrations.test.js`
- [ ] **Step 5: Commit** — `git add src/supabase/migrations/0011_ad_billing.sql tests/adsMigrations.test.js && git commit -m "feat(billing): migration ตารางบิล 3 ตัว + RPC append-only (ยังไม่รันบนฐานจริง)"`

🔶 SUPABASE-GATE: การรัน 0011 บนโปรเจกต์ `lzvftqhffqefqupwulus` ทำ**เฉพาะเมื่ออาร์ตอนุมัติ** — จะทำอะไร: สร้าง 3 ตาราง+RPC · กระทบ: เพิ่มตารางเปล่า ไม่แตะของเดิม · rollback: `drop table` 3 ตัว + `drop function`

---

### Task 2: snapshot บัญชีทั้งหมด — shared module + ads-cron

**Files:**
- Create: `supabase/functions/_shared/adsAccountSnapshot.js`
- Modify: `supabase/functions/ads-cron/index.ts` (ต่อท้ายงานรอบ cron หลัง sync เดิม)
- Test: `tests/adsAccountSnapshot.test.js`

**Interfaces:**
- Consumes: `fetchGraphJson(url, {fetch, token, sleep})` จาก `_shared/metaInsights.js` (host lock graph.facebook.com อยู่แล้ว)
- Produces: `snapshotRows(graphJson)` → `[{external_account_id, account_name, currency, account_status, amount_spent_cents, balance_cents}]` · `fetchAccountSnapshots({fetch, token, sleep, version})` → rows (ตาม paging ของ Graph จนหมด)

- [ ] **Step 1: เทส pure parser (fail ก่อน)**

```js
import { describe, expect, it } from "vitest";
import { snapshotRows } from "../supabase/functions/_shared/adsAccountSnapshot.js";
describe("snapshotRows", () => {
  it("แปลงบัญชีจาก Graph เป็นแถว snapshot — amount_spent/balance เป็นสตางค์ตามที่ Graph ส่ง", () => {
    const rows = snapshotRows({ data: [
      { account_id: "111000111", name: "JD1", currency: "THB", account_status: 1, amount_spent: "1508073700", balance: "6166583" },
      { account_id: "222000222", name: "Finix2", currency: "THB", account_status: 2, amount_spent: "1240000", balance: "0" },
    ]});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ external_account_id: "111000111", account_name: "JD1", currency: "THB",
      account_status: 1, amount_spent_cents: 1508073700, balance_cents: 6166583 });
    expect(rows[1].account_status).toBe(2);
  });
  it("ข้อมูลพัง (ไม่มี account_id / ตัวเลขอ่านไม่ได้) = ข้ามแถว ไม่พังทั้งชุด", () => {
    const rows = snapshotRows({ data: [{ name: "x" }, { account_id: "3", amount_spent: "oops" }] });
    expect(rows).toEqual([{ external_account_id: "3", account_name: "", currency: "THB", account_status: null, amount_spent_cents: null, balance_cents: null }]);
  });
});
```

- [ ] **Step 2: รันแดง** — `npx vitest run tests/adsAccountSnapshot.test.js`
- [ ] **Step 3: เขียน module**

```js
/* snapshot บัญชีแอดทุกตัวที่ token เห็น — ใช้ตรวจ "เงินออกนอกระบบ" และยอดค้าง (spec 2026-09-22)
   amount_spent/balance ของ Graph เป็น minor units (สตางค์) สะสมตลอดชีพ — เก็บดิบ แปลงตอนแสดงผล */
import { fetchGraphJson } from "./metaInsights.js";
const int = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
export function snapshotRows(json) {
  return (json?.data ?? []).filter((a) => a && a.account_id).map((a) => ({
    external_account_id: String(a.account_id),
    account_name: String(a.name ?? ""),
    currency: String(a.currency ?? "THB"),
    account_status: int(a.account_status),
    amount_spent_cents: int(a.amount_spent),
    balance_cents: int(a.balance),
  }));
}
export async function fetchAccountSnapshots({ fetch, token, sleep, version }) {
  let url = `https://graph.facebook.com/${version}/me/adaccounts?fields=account_id,name,currency,account_status,amount_spent,balance&limit=100`;
  const rows = [];
  while (url) {
    const json = await fetchGraphJson(url, { fetch, token, sleep });
    rows.push(...snapshotRows(json));
    url = json?.paging?.next ?? null;
  }
  return rows;
}
```

- [ ] **Step 4: เทสเขียว** — `npx vitest run tests/adsAccountSnapshot.test.js`
- [ ] **Step 5: ต่อเข้า ads-cron** — ใน `supabase/functions/ads-cron/index.ts` หลังสรุปงาน sync เดิม (ก่อน log `[ads-cron] planned=`): โหลด token ตัวแรกที่ active จาก `ad_oauth` ด้วย helper ที่ไฟล์นี้ใช้กับงาน sync อยู่แล้ว (`decryptToken` จาก `_shared/adsOAuth.ts`) แล้ว

```ts
import { fetchAccountSnapshots } from "../_shared/adsAccountSnapshot.js";
// ... ใน handler หลังงาน sync:
try {
  const rows = await fetchAccountSnapshots({ fetch, token, sleep, version });
  if (rows.length) {
    const { error } = await admin.from("ad_account_snapshots")
      .upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })), { onConflict: "external_account_id" });
    if (error) console.error("[ads-cron] snapshot upsert", error.message);
  }
} catch (e) { console.error("[ads-cron] snapshot", e instanceof Error ? e.message : e); }  // snapshot ล้มห้ามล้มรอบ sync
```

(ตัวแปร `admin`, `version`, `sleep` ใช้ของที่ ads-cron ประกาศอยู่แล้ว — เปิดไฟล์ดูชื่อจริงก่อนต่อ)
- [ ] **Step 6: เทสทั้งชุดเขียว + build** — `npx vitest run && npm run build`
- [ ] **Step 7: Commit** — `git commit -m "feat(billing): snapshot บัญชีแอดทุกตัวที่ token เห็น เข้า ad_account_snapshots ผ่าน ads-cron"`

🔶 SUPABASE-GATE: deploy `ads-cron` เวอร์ชันใหม่ = ต้องขออนุมัติ (กระทบ: cron รอบถัดไปเริ่มเขียนตาราง snapshot · ทางถอย: deploy เวอร์ชันเดิมกลับ)

---

### Task 3: apiClient — reader/writer 4 ตัว

**Files:**
- Modify: `src/foundation/data/apiClient.js` (วางถัดจากบล็อก `ads.` เดิม ~บรรทัด 2460)
- Test: ใช้เทส component ของ Task 5 คุม (ไฟล์นี้ไม่มี unit test แยกตามแบบแผนเดิมของ repo)

**Interfaces (Produces — Task 4/5 พึ่ง):**

```js
ads.accountSnapshots()            // → [{external_account_id, account_name, currency, account_status, amount_spent_cents, balance_cents, fetched_at}]
ads.billingReviews(monthIso)      // monthIso "2026-09-01" → แถว reviews ของเดือนนั้น เรียง created_at desc
ads.addBillingReview(entry)       // entry {month, external_account_id, verdict, statement_amount|null, note, reviewer} → uuid
ads.billingCharges(monthIso)      // → แถว charges ของเดือนนั้น (ตอนนี้ว่างเสมอ — โครงท่อเมล)
```

- [ ] **Step 1: เขียนโค้ด**

```js
/* ── บิล & กระทบยอด (spec 2026-09-22) — team_lead เท่านั้น (RLS คุมอีกชั้น) ── */
async accountSnapshots() {
  const db = requireSupabase();
  const { data, error } = await db.from("ad_account_snapshots").select("*").order("account_name");
  if (error) throw error; return data ?? [];
},
async billingReviews(monthIso) {
  const db = requireSupabase();
  const { data, error } = await db.from("ad_billing_reviews").select("*")
    .eq("month", monthIso).order("created_at", { ascending: false });
  if (error) throw error; return data ?? [];
},
async addBillingReview(entry) {
  const db = requireSupabase();
  const { data, error } = await db.rpc("mkt_billing_review_add", { p_entry: entry });
  if (error) throw error; return data;
},
async billingCharges(monthIso) {
  const db = requireSupabase();
  const from = monthIso; const to = new Date(new Date(`${monthIso}T00:00:00Z`).setUTCMonth(new Date(`${monthIso}T00:00:00Z`).getUTCMonth() + 1)).toISOString().slice(0, 10);
  const { data, error } = await db.from("ad_billing_charges").select("*")
    .gte("charge_date", from).lt("charge_date", to).order("charge_date");
  if (error) throw error; return data ?? [];
},
```

- [ ] **Step 2: lint + build ผ่าน** — `npm run lint && npm run build`
- [ ] **Step 3: Commit** — `git commit -m "feat(billing): apiClient สำหรับ snapshot/reviews/charges"`

---

### Task 4: billingModel.js — pure model

**Files:**
- Create: `src/modules/marketing/ads/billingModel.js`
- Test: `tests/billingModel.test.js`

**Interfaces:**
- Consumes: cards จาก `analyticsCards(ads.cards)` (แต่ละใบมี `brand_id, campaign, metrics: {spend, measured_at}`, และ `connection_id` ติดมาจาก factsToAdCards) · `connections` `[{external_account_id, brand_id, account_name}]` · `snapshots` (Task 3) · `reviews` (Task 3) · `brands` `[{id, name}]`
- Produces: `buildBillingModel({month, cards, connections, snapshots, reviews, brands})` →

```js
{
  month, rangeLabel,                      // "2026-09-01", "ก.ย. 2569"
  rows: [{                                 // เรียง: มีเรื่องก่อน แล้วตามยอด
    external_account_id, accountName, brandName, connected: true|false,
    spend,                                 // ระบบนับทั้งเดือน (บาท) · null สำหรับบัญชีนอกระบบ
    vat, gross,                            // spend*0.07, spend*1.07 (ค่าประมาณ)
    campaigns: [{name, spend, share}],     // เรียงมาก→น้อย ครบทุกแคมเปญ (UI ตัด top เอง)
    balance, accountStatus, spentDelta,    // จาก snapshot (แปลงเป็นบาท) · null ถ้าไม่มี snapshot
    statement, diff, diffPct,              // จาก review ล่าสุดที่มี statement_amount · null ถ้าไม่กรอก
    status,                                // 'match'|'minor'|'review'|'nostatement'|'offsystem'
    flag,                                  // null | {text:'ต้องตรวจ'|'เงินออกนอกระบบ'|'บัญชีมีปัญหา', tone:'rose'|'amber'}
    review,                                // แถว review ล่าสุด (verdict/note/reviewer/created_at) | null
  }],
  totals: { spend, vat, gross, statement, offSystemSpendDelta },
  alerts: [{key, tone, text}],             // exception-based — ว่าง = เดือนเรียบร้อย
}
```

- [ ] **Step 1: เขียนเทส (fail ก่อน)** — เคสต้องครบ: (1) รวม spend เดือนต่อบัญชีจาก cards หลายวัน+หลายแคมเปญ ถูกต้องถึงสตางค์ (2) VAT = spend×0.07 แสดง 2 ตำแหน่งไม่ปัด (3) กรอก statement 150,900 กับ spend 150,807.37 → diffPct 0.06% → `match` (4) diff 1.5% → `minor` · 24.55% → `review` + flag ต้องตรวจ (5) ไม่กรอก → `nostatement` ไม่มี flag (6) บัญชีใน snapshots ที่ไม่อยู่ใน connections + spentDelta > 0 → แถว `offsystem` + flag แดง + เข้า alerts (7) account_status ≠ 1 → flag "บัญชีมีปัญหา" (8) review ล่าสุดชนะ (append-only เรียง created_at) (9) ทุกอย่างปกติ → alerts ว่าง

```js
import { describe, expect, it } from "vitest";
import { buildBillingModel } from "../src/modules/marketing/ads/billingModel.js";
const card = (conn, campaign, day, spend) => ({ brand_id: "b_jd", connection_id: conn, campaign,
  metrics: { spend, measured_at: `2026-09-${day}T12:00:00Z` } });
const base = () => ({
  month: "2026-09-01",
  brands: [{ id: "b_jd", name: "JK Design" }],
  connections: [{ external_account_id: "111000111", brand_id: "b_jd", account_name: "JD1" }],
  cards: [card("c1", "แคมเปญ A", "05", 100000), card("c1", "แคมเปญ A", "06", 30000), card("c1", "แคมเปญ B", "06", 20807.37)],
  snapshots: [
    { external_account_id: "111000111", account_name: "JD1", account_status: 1, amount_spent_cents: 90000000, balance_cents: 6166583, fetched_at: "2026-09-21T09:00:00Z" },
    { external_account_id: "999000999", account_name: "Finix2", account_status: 1, amount_spent_cents: 1240000, balance_cents: 0, fetched_at: "2026-09-21T09:00:00Z" },
  ],
  snapshotsBefore: [{ external_account_id: "999000999", amount_spent_cents: 0 }],
  reviews: [],
});
// connection c1 ↔ external 111000111: buildBillingModel รับ mapping ผ่าน connections โดย cards จับคู่ด้วย connection_id → external ผ่านพารามิเตอร์ connectionIndex
it("รวมยอดเดือนต่อบัญชีถึงสตางค์ + VAT ประมาณ", () => {
  const m = buildBillingModel({ ...base(), connectionIndex: { c1: "111000111" } });
  const jd = m.rows.find((r) => r.external_account_id === "111000111");
  expect(jd.spend).toBe(150807.37);
  expect(jd.vat).toBe(10556.5159);           // เก็บดิบ — UI จัดรูป 2 ตำแหน่งไม่ปัด
  expect(jd.campaigns[0]).toEqual({ name: "แคมเปญ A", spend: 130000, share: 130000 / 150807.37 });
});
it("statement เทียบส่วนต่าง → สถานะสามระดับ", () => {
  const withSt = (amt) => buildBillingModel({ ...base(), connectionIndex: { c1: "111000111" },
    reviews: [{ month: "2026-09-01", external_account_id: "111000111", verdict: "noted", statement_amount: amt, note: "", reviewer: "อาร์ต", created_at: "2026-10-02T07:00:00Z" }] });
  expect(withSt(150900).rows[0].status).toBe("match");        // 0.06%
  expect(withSt(153000).rows[0].status).toBe("minor");        // 1.45%
  const r = withSt(187800).rows[0];                            // 24.53%
  expect(r.status).toBe("review");
  expect(r.flag).toEqual({ text: "ต้องตรวจ", tone: "rose" });
});
it("บัญชีนอกระบบที่ใช้เงินเพิ่ม = แถว offsystem + alert · ปกติหมด = alerts ว่าง", () => {
  const m = buildBillingModel({ ...base(), connectionIndex: { c1: "111000111" } });
  const off = m.rows.find((r) => r.external_account_id === "999000999");
  expect(off.connected).toBe(false);
  expect(off.status).toBe("offsystem");
  expect(off.spentDelta).toBe(12400);
  expect(m.alerts.some((a) => a.key === "offsystem")).toBe(true);
  const clean = buildBillingModel({ ...base(), connectionIndex: { c1: "111000111" }, snapshots: base().snapshots.slice(0, 1), snapshotsBefore: [] });
  expect(clean.alerts).toEqual([]);
});
```

- [ ] **Step 2: รันแดง** — `npx vitest run tests/billingModel.test.js`
- [ ] **Step 3: เขียนโมเดล** — โครง:

```js
export const VAT_RATE = 0.07, MATCH_PCT = 0.005, MINOR_PCT = 0.02;
export function buildBillingModel({ month, cards, connections, snapshots = [], snapshotsBefore = [], reviews = [], brands = [], connectionIndex = {} }) {
  // 1) กรอง cards เฉพาะเดือน (metrics.measured_at ขึ้นต้นด้วย month.slice(0,7)) → รวม spend ต่อ external_account_id (ผ่าน connectionIndex) และต่อแคมเปญ
  // 2) แถว connected: ต่อ connection — spend, vat = spend*VAT_RATE, gross, campaigns เรียงมาก→น้อย
  // 3) join snapshot: balance = balance_cents/100, accountStatus, spentDelta = (now - before)/100 เมื่อมีคู่
  // 4) review ล่าสุดของ (month, account) — เรียง created_at desc แถวแรก · statement → diff = statement - spend, diffPct = |diff|/spend
  // 5) status: ไม่มี statement → 'nostatement' · diffPct ≤ MATCH_PCT 'match' · ≤ MINOR_PCT 'minor' · เกิน 'review'+flag rose "ต้องตรวจ"
  // 6) snapshot ที่ไม่อยู่ใน connections และ spentDelta > 0 → แถว offsystem (spend null) + flag rose "เงินออกนอกระบบ"
  // 7) accountStatus != null && != 1 → flag amber "บัญชีมีปัญหา" (ถ้ายังไม่มี flag แดง)
  // 8) alerts: offsystem รวมยอด · review กี่บัญชี · บัญชีสถานะมีปัญหา — ว่างเมื่อไม่มีเรื่อง
  // 9) เรียง rows: flag ก่อน แล้ว spend มาก→น้อย · totals รวมเฉพาะ connected
}
```

เขียนเต็มตามสัญญา output ของ Interfaces (ห้ามคืน field ขาด) — ตัวเลขเก็บดิบ ให้ UI จัดรูป
- [ ] **Step 4: เทสเขียว** — `npx vitest run tests/billingModel.test.js`
- [ ] **Step 5: Commit** — `git commit -m "feat(billing): billingModel รายเดือน — กระทบยอด statement + ตรวจบัญชีนอกระบบ"`

---

### Task 5: BillingView UI + เทสระดับหน้าจอ

**Files:**
- Create: `src/modules/marketing/ads/BillingView.jsx`, `src/modules/marketing/ads/billingView.css`
- Test: `tests/billingView.component.test.jsx`

**Interfaces:**
- Consumes: `buildBillingModel` (Task 4) · `apiClient.ads.*` (Task 3 — mock ในเทส) · `useAdsData` (cards/connections) · `useAuth` (role gate) · `Flag`-style chip: ใช้ class `.aw-flag` ตรง (component `Flag` ใน AdsWorkspace ไม่ export — เขียน span ตรงๆ แบบเดียวกับที่ ChannelCard ทำ)
- Produces: `export function BillingView()` — โครงหน้า: header (ชื่อ + เดือนก่อน/ถัดไป + ลิงก์ "เปิด Billing hub ของ Meta" ไป `https://business.facebook.com/billing_hub/payment_activity`) · แถบ alerts (เฉพาะเมื่อมี) · summary strip 4 ช่อง (ระบบนับ · VAT ประมาณ · ยอดค้างรวม · นอกระบบ) · ตารางแถวต่อบัญชี (ตาม mockup ฉบับรายเดือน) · แถวกดขยาย = ไส้ในแคมเปญ + ฟอร์มกรอก statement + ปุ่มยืนยัน (verdict match/noted + note) · ประวัติ append-only ใต้แถว · ส่วน "การตัดบัตรรายครั้ง" แสดงเฉพาะเมื่อ `billingCharges` มีข้อมูล (โครงท่อเมล — ตอนนี้ซ่อนตลอด)

- [ ] **Step 1: เทสหน้าจอ (fail ก่อน)** — mock `useMkt`/`useAdsData`/`AuthContext`/`apiClient` แบบเดียวกับ `tests/creativeLibraryView.component.test.jsx` · เคส: (1) role อื่น → render null/ข้อความไม่มีสิทธิ์ (2) team_lead เห็นตาราง: JD1 แถว spend "฿150,807.37" VAT "฿10,556.51" (ตัดไม่ปัด) (3) แถว Finix2 มีป้าย "เงินออกนอกระบบ" (4) แถวไม่กรอก statement = ไม่มีป้าย (เงียบ) (5) กดยืนยัน → เรียก `addBillingReview` ด้วย payload ครบ (6) alerts ว่างเมื่อข้อมูลสะอาด (7) ส่วนการตัดรายครั้งไม่ render เมื่อ charges ว่าง
- [ ] **Step 2: รันแดง**
- [ ] **Step 3: เขียน component + css** — ใช้โทน/ระยะจาก mockup (`aw-panel`, `.aw-facts`, `.aw-flag`, ตาราง grid แบบ `.aw-brandtable`) · ทุกตัวเลขผ่าน `fmtMoney/fmtNum` · ฟอร์ม statement เป็น input `inputMode="decimal"` รับคอมมา (reuse แนว `parseRuleNumber`) · ปุ่มยืนยัน disabled ระหว่างส่ง · หลังบันทึก refresh reviews
- [ ] **Step 4: เทสเขียว + เทสทั้ง repo + build**
- [ ] **Step 5: Commit** — `git commit -m "feat(billing): หน้า บิล & กระทบยอด (team_lead) ตาม mockup ฉบับรายเดือน"`

---

### Task 6: route + แท็บ + gate สิทธิ์

**Files:**
- Modify: `src/shell/routes.jsx` (เพิ่มหลัง mkt_sync ~บรรทัด 196): `{ id: "mkt_billing", path: "/mkt/ads/billing", label: "บิล & กระทบยอด", icon: ReceiptText, perm: "marketing.dash.view", status: "live", view: "billing", sidebar: false }` (import `ReceiptText` จาก lucide-react)
- Modify: `src/shell/AppShell.jsx` (~บรรทัด 29): `mkt_billing: <MarketingModule view="billing" />`
- Modify: `src/modules/marketing/MarketingModule.jsx`: เพิ่ม lazy `BillingView` + branch `view === "billing"`
- Modify: `src/modules/marketing/ads/AdsSectionTabs.jsx`: แท็บที่ 5 แสดงเฉพาะ team_lead — `const { user } = useAuth();` เพิ่ม `["/mkt/ads/billing", "บิล & กระทบยอด", ReceiptText]` เมื่อ `user?.role === "team_lead"`
- Test: `tests/billingView.component.test.jsx` เพิ่มเคสแท็บ: mock auth team_lead → เห็นแท็บ · role อื่น → ไม่เห็น (เทส AdsSectionTabs ตรง)

Steps: เทสแท็บแดง → wiring → เขียว → เทสทั้ง repo + build → commit `feat(billing): เส้นทาง /mkt/ads/billing + แท็บเฉพาะ team_lead`

---

### Task 7: เอกสาร + ปิดงาน

**Files:**
- Modify: `CHANGELOG.md` — หัวข้อ added: หน้า บิล & กระทบยอด (สรุป scope + สิ่งที่ตัด + gate ที่ยังรอรัน)
- Modify: `docs/superpowers/specs/2026-09-22-billing-recon.md` — หัวข้อ 0 เติม "ของจริงที่สร้างเสร็จ" + ส่วนที่เบี่ยงจาก spec (ถ้ามี)

Steps: เขียน → `npx vitest run && npm run lint && npm run build` เขียวครบ → commit `docs(billing): CHANGELOG + spec ตามของจริง` → **หยุด รายงานอาร์ต**: รายการ 🔶 SUPABASE-GATE ค้าง 2 รายการ (รัน 0011 · deploy ads-cron) + สถานะพร้อม push — รอคำสั่ง

---

## Self-Review (ทำแล้ว)

- Spec coverage: โจทย์บัญชีข้อ 1→T4/T5 · ข้อ 2→T2/T4 · ข้อ 3→T2/T4/T5 · ข้อ 4→T1(RPC)/T4/T5 · ข้อ 5→T4/T5 · ข้อ 6→T1/T5 · ท่อเมลเตรียม→T1(ตาราง)/T3(reader)/T5(ส่วนซ่อน) · non-goals ไม่มี task ✓
- ชื่อ/ชนิดข้าม task ตรงกัน: `external_account_id`/`amount_spent_cents`/`balance_cents` (T1↔T2↔T3↔T4) · `mkt_billing_review_add(p_entry)` (T1↔T3) · `buildBillingModel` signature (T4↔T5) ✓
- ไม่มี TBD/placeholder — T4 Step 3 เป็นโครงคอมเมนต์แต่สัญญา output ระบุครบใน Interfaces และเทสบังคับพฤติกรรมจริง ✓
- จุดเดียวที่ผู้ลงมือต้องเปิดไฟล์ดูชื่อจริง: ตัวแปร token/admin ใน ads-cron (ระบุไว้ใน T2 Step 5 แล้ว) ✓
