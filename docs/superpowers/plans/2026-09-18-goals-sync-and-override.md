# เป้าจากระบบขาย + หน้าตั้งค่าเป้าที่แก้ทับได้ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: ใช้ superpowers:executing-plans ทำทีละงานในแชท (ผู้ใช้สั่งแบบนั้นรอบที่แล้ว) · ทุกขั้นมี checkbox ให้ติดตาม

**Goal:** ดึงเป้าของ JUNTAKARN จากระบบ TMK เข้ามาเหมือนเป้าของ 3 แบรนด์พี่ทัช แล้วเพิ่มหน้าตั้งค่าเป้าที่บอกว่า "เดือนนี้ได้อะไรมาแล้ว ขาดอะไร" และแก้เติมได้เอง **แยกรายเดือน · ค่าที่แก้ในหน้าตั้งค่าชนะเสมอ**

**Architecture:** เป้าที่ดึงมาอยู่ใน `ad_sales_goals` (ของเดิม · เขียนโดย `sales-sync` เท่านั้น) · ค่าที่คนแก้อยู่ในตารางใหม่ `ad_sales_goal_overrides` (คนละตาราง ท่อ sync ไม่แตะเลย) → ตอนอ่านค่อย merge กัน โดย override ชนะทีละช่อง ช่องที่ไม่ได้แก้ตกลงมาที่ค่าจากระบบขาย ช่องที่ไม่มีทั้งคู่ = "ยังไม่ตั้งเป้า"

**Tech Stack:** Supabase (Postgres + RLS + Edge Function Deno) · React 19 + Vite · Vitest

**Spec:** ไม่มีไฟล์ spec แยก — ข้อตกลงอยู่ในแผนนี้ (หัวข้อ "ข้อตกลงที่เคาะแล้ว")

---

## ข้อตกลงที่เคาะแล้ว (18 ก.ย. 2569)

จากที่ตรวจโค้ด TMK จริง (`settingsMonthTargets.jsx` · `tmk_monthly_history`) และกติกาที่ตกลงตอนต่อยอดขาย JK:

1. **เป้ายอดของ JK = ผลรวมเป้า "ช่องแชท" เท่านั้น** — `meta.channelTargetsV2` ตัด `Shopee · Lazada · POS` ออก (กติกาเดียวกับที่นับยอด ไม่งั้นเป้ากับยอดคนละฐาน JK จะดูต่ำกว่าเป้าตลอด)
2. **งบแอด Meta ของ JK = `meta.adChannelsV2` เฉพาะ `Facebook` + `Instagram`** — ช่องอื่นที่ตั้งงบได้ (LINE · TikTok · Shopee · Lazada) เป็นแอดคนละแพลตฟอร์ม ไม่ใช่ค่าแอด Meta ที่หน้าเราคิด ROAS
3. **ROAS เป้าของ JK คิดเอง** = เป้ายอดแชท ÷ งบแอด Meta (ไม่ลอกบรรทัด "ROAS เป้า" ของ TMK ซึ่งหารด้วยงบแอดรวมทุกแพลตฟอร์มและเป้ายอดรวมทุกช่องทาง)
4. **TMK ไม่มีเป้าออเดอร์ · คนทัก · CPL · CAC** (ไล่ทั้ง repo แล้ว) → ช่องพวกนี้ของ JK ว่างไว้ ให้ไปเติมเองในหน้าตั้งค่าใหม่
5. **override ชนะเสมอ** ทีละช่อง ทีละเดือน ทีละแบรนด์ · ท่อ sync เขียนทับ `ad_sales_goals` ได้ตามปกติโดยไม่แตะค่าที่คนแก้
6. **ใครแก้ได้:** หัวหน้าทีมเท่านั้น (เหมือน settings อื่นของ ads) · คนอื่นเห็นแต่อ่านอย่างเดียว
7. **ปี พ.ศ.** — `tmk_monthly_history.year` เก็บเป็น พ.ศ. (`ค.ศ. + 543`) และ `month` เป็น integer · อ่าน `meta.channelTargetsV2` / `adChannelsV2` เท่านั้น **ห้ามแตะ key ยุคเก่า** `channelTargets` / `adChannels` (key คนละชุด จะได้เป้ายุคเก่าปนมา)

## Global Constraints

- ตอบผู้ใช้ภาษาไทย · ห้ามใช้ emoji เป็นไอคอน · ห้าม gradient ม่วง
- **ทุกค่าที่มีทศนิยมแสดงทศนิยม ห้ามปัด** — เงิน 2 ตำแหน่ง · อัตราส่วน 2 ตำแหน่ง (ใช้ `fmtMoney` / `fmtNum` จาก `dash/charts/theme.js` เท่านั้น)
- **ไม่รู้ ≠ ศูนย์** — ช่องที่ไม่มีเป้าต้องขึ้น "ยังไม่ตั้งเป้า" ห้ามโชว์ 0
- **ข้อมูลลูกค้าไม่ข้ามระบบ** — RPC ใหม่คืนได้เฉพาะตัวเลขเป้ารายเดือน ห้ามมีชื่อเซลล์/ลูกค้า/เลขออเดอร์ (ด่านสองชั้นเหมือนของเดิม: `select` allowlist + ตรวจคอลัมน์เกินก่อนเขียน)
- **สถานะบอกด้วยคำเสมอ** สีเป็นตัวช่วยอ่าน ไม่ใช่ข้อมูลเดียว
- ห้าม commit / push / deploy เอง — ทำเสร็จรายงานแล้วรอคำสั่ง
- แตะ Supabase (migration · RPC · deploy) ต้องบอก จะทำอะไร·กระทบอะไร·ทางเลือก แล้วรอคำตอบก่อนทุกครั้ง
- conventional commits · เทส/lint/build ต้องเขียวก่อนบอกว่าเสร็จ

## File Structure

**ฝั่ง TMK (โปรเจกต์ `asimudifasqvtjegbvdp` — เขียนไฟล์ SQL ให้ผู้ใช้รันเอง)**
- Create: `supabase/migrations/20260919-jk-ads-monthly-goal.sql` — RPC `jk_ads_monthly_goal(p_months date[])`

**ฝั่ง ads (โปรเจกต์ `lzvftqhffqefqupwulus`)**
- Create: `supabase/migrations/20260919100000_goal_overrides.sql` — ตาราง override + RLS + ปลด check ของ `goal_source`
- Create: `supabase/functions/_shared/jkGoals.js` — แปลงแถว RPC → แถว `ad_sales_goals` (pure · มีเทส)
- Modify: `supabase/functions/_shared/jkBridge.js` — เพิ่ม `jkGoalUrl()`
- Modify: `supabase/functions/sales-sync/index.ts` — เฟสเป้า JK (อิสระจากเฟสอื่น เหมือนเฟสยอด JK)
- Create: `src/modules/marketing/ads/goalOverrides.js` — merge + gap + parse (pure · หัวใจของ "ตั้งค่าชนะ")
- Create: `src/modules/marketing/ads/GoalSettingsPanel.jsx` — หน้าตั้งค่าเป้า (ตาราง แบรนด์ × ช่อง แก้ได้)
- Modify: `src/modules/marketing/ads/AdsControlCenter.jsx` — เพิ่มแท็บ "เป้า"
- Modify: `src/foundation/data/apiClient.js` — อ่าน/เขียน override
- Modify: `src/modules/marketing/ads/useAdsData.js` · `SyncStatusView.jsx` — โหลด override แล้ว merge ก่อนส่งให้ทุกหน้า
- Modify: `src/modules/marketing/ads/adsSourceStrip.js` — ป้าย "เป้าเดือนนี้" นับทุกแบรนด์ที่มีแหล่ง (ตอนนี้ล็อกไว้ 3)
- Modify: `src/modules/marketing/ads/SalesSyncPanels.jsx` — `GoalMatrix` โชว์ที่มาเป็น 3 แบบ (ระบบขาย / TMK / ตั้งค่า)
- Test: `tests/jkGoals.test.js` · `tests/goalOverrides.test.js` · `tests/goalSettingsPanel.component.test.jsx`

---

### Task 1: ตารางเก็บค่าที่คนแก้ + ปลดล็อก goal_source

**Files:**
- Create: `supabase/migrations/20260919100000_goal_overrides.sql`

**Interfaces:**
- Produces: ตาราง `ad_sales_goal_overrides` (pk `brand_id, month`) ทุกช่อง nullable · `null = ไม่ได้ override` · RLS: อ่านได้ทุกคนที่ล็อกอิน เขียนได้เฉพาะ `mkt_is_team_lead()`
- Produces: `goal_source` รับค่า `'tmk_month'` เพิ่ม

- [x] **Step 1: เขียนไฟล์ migration** — เขียนแล้ว `supabase/migrations/20260919100000_goal_overrides.sql`
  · **แก้จากแผน:** FK ใช้ `on delete no action deferrable initially deferred` ไม่ใช่ `cascade`
  (`mkt_save_state` ลบ `mkt_brand` ทั้งตารางทุกครั้งที่เซฟบอร์ด → cascade = เป้าที่คนตั้งหายถาวร)
  · เพิ่ม check `month = date_trunc('month', month)` และ `revoke all from anon`

```sql
-- ค่าที่คนแก้เองในหน้าตั้งค่าเป้า — แยกตารางจาก ad_sales_goals เพราะท่อ sync เขียนทับตารางนั้นทุกวัน
-- กติกา: null = ไม่ได้แก้ช่องนี้ (ตกไปใช้ค่าจากระบบขาย) · มีค่า = ชนะเสมอ แม้ต้นทางจะเปลี่ยนทีหลัง
create table if not exists public.ad_sales_goal_overrides (
  brand_id      text not null references public.mkt_brand(id) on delete cascade,
  month         date not null,
  sales_target  numeric(18,4) check (sales_target  >= 0),
  ad_budget     numeric(18,4) check (ad_budget     >= 0),
  orders_target numeric(18,4) check (orders_target >= 0),
  leads_target  numeric(18,4) check (leads_target  >= 0),
  deposits_target numeric(18,4) check (deposits_target >= 0),
  inquiry_target  numeric(18,4) check (inquiry_target  >= 0),
  cpl           numeric(18,4) check (cpl  >= 0),
  cac           numeric(18,4) check (cac  >= 0),
  cpi           numeric(18,4) check (cpi  >= 0),
  roas          numeric(12,4) check (roas >= 0),
  pct_ads_new   numeric(10,4) check (pct_ads_new >= 0 and pct_ads_new <= 1),
  note          text check (note is null or length(note) <= 500),
  updated_at    timestamptz not null default now(),
  updated_by    text references public.mkt_profile(id),
  primary key (brand_id, month)
);
comment on table public.ad_sales_goal_overrides is
  'เป้าที่คนแก้เองในหน้าตั้งค่าเป้า — ชนะค่าที่ดึงมาจากระบบขายทีละช่อง ทีละเดือน · ท่อ sync ห้ามเขียนตารางนี้';

create index if not exists ad_sales_goal_overrides_month_idx on public.ad_sales_goal_overrides(month desc);

alter table public.ad_sales_goal_overrides enable row level security;
drop policy if exists ad_goal_overrides_read on public.ad_sales_goal_overrides;
create policy ad_goal_overrides_read on public.ad_sales_goal_overrides
  for select to authenticated using (true);
-- เขียนได้เฉพาะหัวหน้าทีม (ทั้ง using และ with check — ไม่งั้นแก้แถวให้กลายเป็นของแบรนด์อื่นได้)
drop policy if exists ad_goal_overrides_write on public.ad_sales_goal_overrides;
create policy ad_goal_overrides_write on public.ad_sales_goal_overrides
  for all to authenticated using (public.mkt_is_team_lead()) with check (public.mkt_is_team_lead());

-- เป้าของ JUNTAKARN มาจากหน้าตั้งค่าเป้าของระบบ TMK — เดิม check รับแค่ sale_goal / sale_target
alter table public.ad_sales_goals drop constraint if exists ad_sales_goals_goal_source_check;
alter table public.ad_sales_goals add constraint ad_sales_goals_goal_source_check
  check (goal_source is null or goal_source in ('sale_goal', 'sale_target', 'tmk_month'));

-- VERIFY
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'ad_sales_goals_goal_source_check';
--   select * from public.ad_sales_goal_overrides limit 1;   -- ต้องไม่ error
-- ROLLBACK
--   drop table if exists public.ad_sales_goal_overrides;
--   alter table public.ad_sales_goals drop constraint if exists ad_sales_goals_goal_source_check;
--   alter table public.ad_sales_goals add constraint ad_sales_goals_goal_source_check
--     check (goal_source in ('sale_goal','sale_target'));
```

- [x] **Step 2: ขออนุญาตผู้ใช้** — ผู้ใช้เลือก **เลื่อนไปรันพร้อมงาน 4 ตอน deploy** (18 ก.ย. 69)
  → migration นี้ยังไม่ถูก push · ต้อง push ก่อน deploy `sales-sync` ในงาน 4 ไม่งั้นเฟสเป้าจะโดน 23514

บอก: จะเพิ่มตารางใหม่ 1 ตาราง + แก้ check constraint ของ `goal_source` · ไม่แตะข้อมูลเดิม · rollback ได้ตามคอมเมนต์ในไฟล์
รอคำตอบ แล้วรัน: `npx supabase db push` (deploy gate ต้องผ่านก่อน — ถ้า `.release-ok` ไม่ตรง HEAD ให้หยุดและรายงาน)

- [x] **Step 3: ยืนยันของจริง** — หลัง push ตรวจบนฐานแล้ว: constraint มี `tmk_month` · ตารางมี 0 แถว · policy 2 ตัว · trigger 1 ตัว · FK = no action (`a,a`)

Run: `npx supabase db query --linked "select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'ad_sales_goals_goal_source_check'"`
Expected: เห็น `'tmk_month'` ในรายการ

---

### Task 2: RPC ฝั่ง TMK — เป้ารายเดือนของช่องแชท

**Files:**
- Create: `/Users/artist/Documents/TMK Operation/supabase/migrations/20260919-jk-ads-monthly-goal.sql`

**Interfaces:**
- Produces: `jk_ads_monthly_goal(p_months date[])` คืน 1 แถวต่อเดือนที่ขอ: `month date · sales_target numeric · ad_budget numeric · sales_target_all numeric · ad_budget_all numeric · has_row boolean`
- Consumes: `public.tmk_monthly_history (month int, year int(พ.ศ.), target numeric, meta jsonb)`

- [x] **Step 1: เขียนไฟล์ SQL** — `20260919-jk-ads-monthly-goal.sql` ในโปรเจกต์ TMK (ปรับจากแผน: หยิบแถวเดือนด้วย lateral ครั้งเดียว · ค่าที่แปลงเป็นตัวเลขไม่ได้นับเป็น 0 แทนที่จะพังทั้ง query)

```sql
-- ============================================================
-- jk_ads_monthly_goal — เป้าเดือนของ JUNTAKARN ให้ระบบ ads ของ SSB
-- ข้อตกลง 18 ก.ย. 2569:
--   · sales_target = ผลรวมเป้าช่องแชทใน meta.channelTargetsV2 (ตัด Shopee/Lazada/POS)
--     ฐานเดียวกับยอดที่ ads ดึงไป (นับเฉพาะออเดอร์จากแชท) ไม่งั้นเป้ากับยอดคนละฐาน
--   · ad_budget = meta.adChannelsV2 เฉพาะ Facebook + Instagram = ค่าแอด Meta
--     (LINE/TikTok/Shopee/Lazada เป็นแอดคนละแพลตฟอร์ม ไม่เข้า ROAS ของหน้า ads)
--   · อ่าน key V2 เท่านั้น — channelTargets/adChannels ยุคเก่า key คนละชุด ห้ามปน
--   · ปี พ.ศ.: tmk_monthly_history.year = ค.ศ. + 543 · month = เลขเดือน
-- ความปลอดภัย: คืนแต่ตัวเลขเป้ารายเดือน — ไม่มีชื่อเซลล์/ลูกค้า/ออเดอร์
-- idempotent · รันใน SQL Editor ของโปรเจกต์ TMK
-- ============================================================
drop function if exists public.jk_ads_monthly_goal(date[]);

create or replace function public.jk_ads_monthly_goal(p_months date[])
returns table (
  month date, sales_target numeric, ad_budget numeric,
  sales_target_all numeric, ad_budget_all numeric, has_row boolean
)
language sql
security definer
set search_path = public
as $$
  with want as (
    select distinct date_trunc('month', m)::date as d from unnest(p_months) as m
  ),
  row_of as (
    select w.d,
      (select h.target from public.tmk_monthly_history h
        where h.month = extract(month from w.d)::int
          and h.year  = extract(year  from w.d)::int + 543
        order by h.updated_at desc nulls last limit 1)             as total,
      (select h.meta from public.tmk_monthly_history h
        where h.month = extract(month from w.d)::int
          and h.year  = extract(year  from w.d)::int + 543
        order by h.updated_at desc nulls last limit 1)             as meta
    from want w
  ),
  chat as (
    select r.d,
      coalesce(sum((e.value#>>'{}')::numeric) filter (
        where e.key not in ('Shopee', 'Lazada', 'POS')), 0)        as sales_target,
      coalesce(sum((e.value#>>'{}')::numeric), 0)                  as sales_target_all
    from row_of r
    left join lateral jsonb_each(coalesce(r.meta->'channelTargetsV2', '{}'::jsonb)) e on true
    group by r.d
  ),
  ads as (
    select r.d,
      coalesce(sum((e.value#>>'{}')::numeric) filter (
        where e.key in ('Facebook', 'Instagram')), 0)              as ad_budget,
      coalesce(sum((e.value#>>'{}')::numeric), 0)                  as ad_budget_all
    from row_of r
    left join lateral jsonb_each(coalesce(r.meta->'adChannelsV2', '{}'::jsonb)) e on true
    group by r.d
  )
  select r.d                                as month,
    coalesce(chat.sales_target, 0)          as sales_target,
    coalesce(ads.ad_budget, 0)              as ad_budget,
    coalesce(chat.sales_target_all, coalesce(r.total, 0)) as sales_target_all,
    coalesce(ads.ad_budget_all, 0)          as ad_budget_all,
    (r.meta is not null or r.total is not null) as has_row
  from row_of r
  left join chat on chat.d = r.d
  left join ads  on ads.d  = r.d
  order by r.d;
$$;

revoke all on function public.jk_ads_monthly_goal(date[]) from public, anon, authenticated;
grant execute on function public.jk_ads_monthly_goal(date[]) to service_role;

comment on function public.jk_ads_monthly_goal(date[]) is
  'เป้าเดือนของ JUNTAKARN ให้ระบบ ads — เป้าช่องแชท + งบแอด Meta (Facebook/Instagram) · ไม่คืนข้อมูลลูกค้า';

-- VERIFY
--   select * from public.jk_ads_monthly_goal(array[date_trunc('month', current_date)::date]);
--   -- sales_target ต้องเท่ากับผลรวมช่องแชทในหน้า ตั้งค่า › เป้า & คอมมิชชั่น ของเดือนนี้
--   -- ad_budget ต้องเท่ากับ งบแอด Facebook + Instagram ของเดือนนั้น
-- ROLLBACK
--   drop function if exists public.jk_ads_monthly_goal(date[]);
-- จดว่ารันแล้ว
--   select public.tmk_migration_applied('20260919-jk-ads-monthly-goal.sql');
```

- [x] **Step 2: ส่งให้ผู้ใช้รัน** — ส่งไฟล์ + ก๊อปใส่คลิปบอร์ดแล้ว · **รอผู้ใช้รันและส่งผล VERIFY กลับ**

ก๊อปไฟล์ใส่คลิปบอร์ดให้ (`pbcopy < <path>`) + บอก path เต็ม · ให้ผู้ใช้รันใน SQL Editor ของ TMK แล้วส่งผล VERIFY กลับมาเทียบกับหน้าตั้งค่าของ TMK

---

### Task 3: แปลงแถว RPC → แถวเป้า (pure + เทส)

**Files:**
- Create: `supabase/functions/_shared/jkGoals.js`
- Modify: `supabase/functions/_shared/jkBridge.js`
- Test: `tests/jkGoals.test.js`

**Interfaces:**
- Consumes: แถวจาก `jk_ads_monthly_goal`
- Produces: `JK_GOAL_COLUMNS` · `jkGoalRows(rows)` → แถวพร้อม upsert ลง `ad_sales_goals` · `jkGoalExtraColumns(rows)` · `jkGoalUrl(url, months)`

- [x] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

```js
/* เป้า JUNTAKARN จากระบบ TMK — เป้าช่องแชท + งบแอด Meta · ROAS คิดเอง */
import { describe, expect, it } from "vitest";
import { JK_GOAL_COLUMNS, jkGoalExtraColumns, jkGoalRows } from "../supabase/functions/_shared/jkGoals.js";

const row = (patch = {}) => ({ month: "2026-09-01", sales_target: 900000, ad_budget: 150000, sales_target_all: 1500000, ad_budget_all: 200000, has_row: true, ...patch });

describe("jkGoalRows", () => {
  it("เป้า/งบ/ROAS ของแบรนด์ b_jt · goal_source = tmk_month", () => {
    const [out] = jkGoalRows([row()]);
    expect(out).toMatchObject({ brand_id: "b_jt", month: "2026-09-01", goal_source: "tmk_month", sales_target: 900000, ad_budget: 150000 });
    expect(out.roas).toBeCloseTo(6);
    expect(out.version).toBe(0);
  });
  it("ไม่มีแถวเป้าในเดือนนั้น = ไม่เขียนอะไร (ห้ามเขียนศูนย์ทับ)", () => {
    expect(jkGoalRows([row({ has_row: false, sales_target: 0, ad_budget: 0 })])).toEqual([]);
    expect(jkGoalRows([row({ sales_target: 0, ad_budget: 0 })])).toEqual([]);
  });
  it("งบแอดเป็นศูนย์ = ROAS คิดไม่ได้ (null ไม่ใช่ Infinity)", () => {
    expect(jkGoalRows([row({ ad_budget: 0 })])[0]).toMatchObject({ ad_budget: null, roas: null, sales_target: 900000 });
  });
  it("ตัวเลขที่มาเป็น string จาก PostgREST อ่านได้ · เดือนผิดรูปทิ้ง", () => {
    expect(jkGoalRows([row({ sales_target: "900000.50" })])[0].sales_target).toBeCloseTo(900000.5);
    expect(jkGoalRows([row({ month: "เดือนนี้" })])).toEqual([]);
  });
  it("คอลัมน์เกินที่ขอ = จับได้ก่อนเขียน", () => {
    expect(jkGoalExtraColumns([{ ...row(), salesperson: "เอ" }])).toEqual(["salesperson"]);
    expect(JK_GOAL_COLUMNS).not.toContain("salesperson");
  });
});
```

- [x] **Step 2: รันให้เห็นว่าแดง** — FAIL "no tests" ตามคาด

- [x] **Step 3: เขียน `jkGoals.js`**

```js
/* เป้าเดือนของ JUNTAKARN (ระบบ TMK) → ad_sales_goals ของ b_jt
   เป้าช่องแชทเท่านั้น (ฐานเดียวกับยอดที่นับ) · งบแอด = Facebook + Instagram = ค่าแอด Meta
   ROAS คิดเองจากสองตัวนี้ · ไม่มีเป้าออเดอร์/คนทัก/CPL/CAC ในระบบ TMK — ปล่อยว่างให้ไปเติมในหน้าตั้งค่าเป้า */
import { JK_BRAND_ID } from "./jkFacts.js";

const MONTH = /^\d{4}-\d{2}-01$/;
export const JK_GOAL_COLUMNS = ["month", "sales_target", "ad_budget", "sales_target_all", "ad_budget_all", "has_row"];

const num = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; };

export function jkGoalRows(rows = []) {
  const out = [];
  for (const row of rows ?? []) {
    const month = String(row?.month ?? "").slice(0, 10);
    if (!MONTH.test(month) || row?.has_row === false) continue;
    const salesTarget = num(row?.sales_target);
    const adBudget = num(row?.ad_budget);
    // ไม่มีเป้าและไม่มีงบ = เดือนนั้นทีมยังไม่ตั้ง → ไม่เขียน (กันเขียนศูนย์ทับของที่คนตั้งไว้)
    if (salesTarget === null && adBudget === null) continue;
    out.push({
      brand_id: JK_BRAND_ID, month, version: 0, goal_source: "tmk_month",
      sales_target: salesTarget, ad_budget: adBudget,
      roas: salesTarget !== null && adBudget !== null ? salesTarget / adBudget : null,
      platform_budgets: adBudget !== null ? { meta: adBudget } : {},
    });
  }
  return out;
}

export function jkGoalExtraColumns(rows = []) {
  const extra = new Set();
  for (const row of rows ?? []) for (const key of Object.keys(row ?? {})) if (!JK_GOAL_COLUMNS.includes(key)) extra.add(key);
  return [...extra].sort();
}
```

- [x] **Step 4: เพิ่ม `jkGoalUrl` ใน `jkBridge.js`**

```js
/** เป้ารายเดือน — ขอเฉพาะคอลัมน์ที่ต้องใช้ (ข้อมูลลูกค้าไม่ข้ามระบบ ตัดตั้งแต่ฝั่งขอ) */
export function jkGoalUrl(url) {
  const target = new URL(`${baseOf(url)}/rest/v1/rpc/jk_ads_monthly_goal`);
  target.searchParams.set("select", JK_GOAL_COLUMNS.join(","));
  return target.toString();
}
```
(เพิ่ม `import { JK_GOAL_COLUMNS } from "./jkGoals.js";` ที่หัวไฟล์)

- [x] **Step 5: รันเทสให้เขียว** — 9 เทสผ่าน (8 + jkGoalUrl)

- [x] **Step 6: commit** — ผู้ใช้สั่ง → `c5e570d` · `92a57a2` · tag v0.11.0

---

### Task 4: เฟสดึงเป้า JK ใน sales-sync

**Files:**
- Modify: `supabase/functions/sales-sync/index.ts`

**Interfaces:**
- Consumes: `jkGoalUrl` · `jkGoalRows` · `jkGoalExtraColumns` · `monthsToSync(today)`
- Produces: `jkGoals: { read, written, error }` ใน summary/response ของรอบ · รหัสผิดพลาด `JK_GOAL_*`

- [x] **Step 1: เพิ่มเฟสต่อจาก `runJk()`**

```ts
  /* เป้าเดือนของ JUNTAKARN — อิสระจากเฟสอื่นเหมือนเฟสยอด JK
     ล้มที่นี่ต้องไม่ทำให้ยอดที่เขียนสำเร็จแล้วพัง และเฟสอื่นล้มก็ต้องไม่ทำให้เป้าไม่ได้ดึง */
  const runJkGoals = async (months: string[]): Promise<{ read: number; written: number; error: string | null }> => {
    const jkUrl = Deno.env.get("JK_API_URL")?.trim();
    const jkKey = Deno.env.get("JK_API_KEY")?.trim();
    if (!jkUrl || !jkKey || !months.length) return { read: 0, written: 0, error: null };
    try {
      const response = await fetch(jkGoalUrl(jkUrl), {
        method: "POST",
        headers: { apikey: jkKey, Authorization: `Bearer ${jkKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_months: months }),
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw fail(`JK_GOAL_${doorState(response.status, (payload as { code?: string } | null)?.code).toUpperCase()}`);
      const rows = Array.isArray(payload) ? payload as Record<string, unknown>[] : [];
      if (jkGoalExtraColumns(rows).length) throw fail("JK_GOAL_COLUMN_LEAK");
      const out = jkGoalRows(rows).map((row) => ({ ...row, synced_at: new Date().toISOString() }));
      if (!out.length) return { read: rows.length, written: 0, error: null };   // ทีมยังไม่ตั้งเป้าเดือนนี้ = ไม่ใช่ error
      const { error } = await db.from("ad_sales_goals").upsert(out, { onConflict: "brand_id,month" });
      if (error) throw fail("JK_GOAL_WRITE_FAILED", { detail: error.message });
      return { read: rows.length, written: out.length, error: null };
    } catch (error) {
      const detail = error as { code?: string; detail?: string };
      console.error("[sales-sync] jk goals", detail.code, detail.detail ?? "");
      return { read: 0, written: 0, error: runCode(detail.code, "JK_GOAL_FAILED") };
    }
  };
```

- [x] **Step 2: ต่อเข้ารอบ**

- ประกาศ `let jkGoals = { read: 0, written: 0, error: null }` ข้าง `let jk` (ก่อน `failRun`) และใส่ `jkGoals` ลงใน summary/response ของ `failRun` ด้วย
- ในบล็อก `try` ต่อจาก `jk = await runJk();` ใส่ `jkGoals = await runJkGoals(monthsToSync(today));`
- `finishRun`: `status` เป็น partial เมื่อ `goals.error || jk.error || jkGoals.error` · `summary` เพิ่ม `jkGoals` · `errorCode: goals.error ?? jk.error ?? jkGoals.error`
- บรรทัด `console.log` ท้ายรอบเพิ่ม `jkGoals=${jkGoals.written}`

- [x] **Step 3: ข้อความไทยของรหัสใหม่** ใน `src/modules/marketing/ads/adsSyncMessages.js`

```js
  JK_GOAL_MISSING: "ระบบ TMK ยังไม่มีฟังก์ชัน jk_ads_monthly_goal — ต้องรันไฟล์ SQL ในโปรเจกต์ TMK ก่อน",
  JK_GOAL_NO_PERMISSION: "คีย์ที่ตั้งไว้เรียกฟังก์ชันเป้าของระบบ TMK ไม่ได้",
  JK_GOAL_BAD_KEY: "JK_API_KEY ผิดหรือหมดอายุ (เฉพาะส่วนดึงเป้า)",
  JK_GOAL_ERROR: "เรียกเป้าจากระบบ TMK ไม่สำเร็จ",
  JK_GOAL_COLUMN_LEAK: "ระบบ TMK ส่งคอลัมน์เกินที่ขอในส่วนเป้า — หยุดไว้ก่อน ไม่ได้บันทึกเป้า",
  JK_GOAL_WRITE_FAILED: "บันทึกเป้า JUNTAKARN ลงฐานไม่สำเร็จ เป้าเดิมยังอยู่ครบ",
  JK_GOAL_FAILED: "ดึงเป้า JUNTAKARN ไม่สำเร็จ ยอดและเป้าของแบรนด์อื่นไม่กระทบ",
```

- [x] **Step 4: เทสข้อความครบ** — เพิ่มเทสล็อกรหัส JK ทั้ง 17 ตัวว่ามีข้อความไทย — เพิ่มใน `tests/adsSyncMessages.test.js` (ถ้ามี) ว่า `adsErrorText("JK_GOAL_NO_PERMISSION")` ไม่คืนโค้ดดิบ · รัน `npx vitest run tests/adsSyncMessages.test.js`

- [x] **Step 5: ขึ้นของจริงแล้ว** — ผู้ใช้สั่ง → `sales-sync` version 20 ACTIVE · เป้า JK เข้าจริง (ก.ย. ฿540,000 / งบ ฿95,000) — `npx supabase functions deploy sales-sync --use-api` (ต้องผ่าน gate · ห้าม deploy เองถ้ายังไม่ได้รับคำสั่ง)

---

### Task 5: หัวใจ "ตั้งค่าชนะ" — merge + ช่องที่ขาด (pure + เทส)

**Files:**
- Create: `src/modules/marketing/ads/goalOverrides.js`
- Test: `tests/goalOverrides.test.js`

**Interfaces:**
- Produces:
  - `GOAL_EDIT_FIELDS` — `[{ key, label, unit: "money"|"count"|"ratio"|"pct", hint }]` 11 ช่องตามคอลัมน์ override
  - `mergeGoals(goals, overrides)` → **Map** คีย์ `"<brand_id>|<YYYY-MM-DD>"` → แถวเป้าที่ใช้จริง พร้อม `sources: { [field]: "sale_goal"|"sale_target"|"tmk_month"|"manual" }` และ `synced: { [field]: ค่าต้นทาง|null }`
  - `mergedGoalRows(merged)` → array แถวเป้าแบบเดิม (ให้หน้าที่ไม่รู้เรื่อง override ใช้ต่อได้เหมือนเดิม)
  - `goalRowFor(merged, brandId, month)` → แถวเดียวหรือ `null`
  - `missingGoalFields(row)` → รายชื่อช่องที่ยังไม่มีค่าเลย
  - `changedFromSource(row)` → ช่องที่ override ต่างจากค่าต้นทาง (ไว้เตือนว่าต้นทางเปลี่ยนแล้ว)
  - `parseGoalInput(text, unit)` → ตัวเลขหรือ null (รับ "1,300,000" · "6.5x" · "12%" · "฿90,000")

- [x] **Step 1: เขียนเทสที่ยังไม่ผ่าน** — 18 เทส (ครอบคลุมกว่าที่ร่างไว้: ไม่ mutate · เดือนแบบ timestamp · override ที่ค่าเท่าต้นทาง · เป้า TMK ถูกทับ · ขาดทุกช่องเมื่อไม่มีแถว)

```js
/* เป้าที่ใช้จริง = ค่าจากระบบขาย ทับด้วยค่าที่คนแก้ในหน้าตั้งค่า (ทีละช่อง ทีละเดือน)
   กติกาที่ผู้ใช้เคาะ 18 ก.ย. 69: "อะไรชนะ — ในหน้าตั้งค่าเราชนะ" */
import { describe, expect, it } from "vitest";
import { changedFromSource, goalRowFor, mergeGoals, missingGoalFields, parseGoalInput } from "../src/modules/marketing/ads/goalOverrides.js";

const goal = (patch = {}) => ({ brand_id: "b_td", month: "2026-09-01", goal_source: "sale_goal", version: 3, sales_target: 3500000, ad_budget: 210000, orders_target: 209, roas: 9, ...patch });
const ov = (patch = {}) => ({ brand_id: "b_td", month: "2026-09-01", updated_at: "2026-09-18T10:00:00Z", ...patch });

describe("mergeGoals", () => {
  it("ช่องที่แก้ในตั้งค่าชนะ · ช่องที่ไม่ได้แก้ใช้ค่าจากระบบขาย · บอกที่มารายช่อง", () => {
    const row = goalRowFor(mergeGoals([goal()], [ov({ ad_budget: 250000 })]), "b_td", "2026-09-01");
    expect(row.ad_budget).toBe(250000);
    expect(row.sales_target).toBe(3500000);
    expect(row.sources.ad_budget).toBe("manual");
    expect(row.sources.sales_target).toBe("sale_goal");
    expect(row.synced.ad_budget).toBe(210000);      // เก็บค่าต้นทางไว้ให้กดคืนค่าได้
  });
  it("override เป็น 0 = ตั้งใจให้เป็นศูนย์ (ไม่ตกไปใช้ค่าต้นทาง)", () => {
    expect(goalRowFor(mergeGoals([goal()], [ov({ ad_budget: 0 })]), "b_td", "2026-09-01").ad_budget).toBe(0);
  });
  it("เดือนที่ไม่มีแถวจากระบบขายเลย แต่มีคนตั้งเอง = ได้แถวเป้าจาก override ล้วน", () => {
    const row = goalRowFor(mergeGoals([], [ov({ month: "2026-10-01", sales_target: 1000000 })]), "b_td", "2026-10-01");
    expect(row).toMatchObject({ sales_target: 1000000, goal_source: "manual" });
    expect(row.synced.sales_target).toBe(null);
  });
  it("ต้นทางเปลี่ยนทีหลัง override ยังชนะ แต่บอกว่าต่างกัน", () => {
    const row = goalRowFor(mergeGoals([goal({ sales_target: 4000000 })], [ov({ sales_target: 3500000 })]), "b_td", "2026-09-01");
    expect(row.sales_target).toBe(3500000);
    expect(changedFromSource(row)).toEqual([{ key: "sales_target", value: 3500000, source: 4000000 }]);
  });
  it("แยกคนละเดือนคนละแบรนด์ ไม่ปนกัน", () => {
    const merged = mergeGoals([goal(), goal({ month: "2026-08-01", sales_target: 3000000 })], [ov({ sales_target: 9 })]);
    expect(goalRowFor(merged, "b_td", "2026-08-01").sales_target).toBe(3000000);
    expect(goalRowFor(merged, "b_jt", "2026-09-01")).toBe(null);
  });
});

describe("missingGoalFields", () => {
  it("บอกช่องที่ยังไม่มีค่าเลย (ทั้งต้นทางและตั้งค่า)", () => {
    const row = goalRowFor(mergeGoals([goal()], []), "b_td", "2026-09-01");
    expect(missingGoalFields(row).map((f) => f.key)).toContain("inquiry_target");
    expect(missingGoalFields(row).map((f) => f.key)).not.toContain("sales_target");
  });
});

describe("parseGoalInput", () => {
  it("รับรูปแบบที่คนพิมพ์จริง", () => {
    expect(parseGoalInput("1,300,000", "money")).toBe(1300000);
    expect(parseGoalInput("฿90,000.50", "money")).toBeCloseTo(90000.5);
    expect(parseGoalInput("6.5x", "ratio")).toBe(6.5);
    expect(parseGoalInput("12%", "pct")).toBeCloseTo(0.12);
    expect(parseGoalInput("0.12", "pct")).toBeCloseTo(0.12);
    expect(parseGoalInput("", "money")).toBe(null);
    expect(parseGoalInput("ไม่รู้", "money")).toBe(undefined);   // undefined = พิมพ์ผิด (ต่างจากเว้นว่าง)
  });
});
```

- [x] **Step 2: รันให้เห็นว่าแดง** — FAIL "no tests" ตามคาด

- [x] **Step 3: เขียน `goalOverrides.js` ให้ผ่าน** — เพิ่มจากร่าง: `goalFieldLabel` · `hint` ต่อช่อง · `%` เกิน 100 ถือว่าพิมพ์ผิด

โครงที่ต้องมี (เขียนคอมเมนต์หัวไฟล์ว่าทำไม override ชนะ):

```js
/* เป้าที่ใช้จริง = ค่าจากระบบขาย ทับด้วยค่าที่คนแก้ในหน้าตั้งค่า (pure · เทสใน tests/goalOverrides.test.js)
   กติกาที่ผู้ใช้เคาะ 18 ก.ย. 69: "อะไรชนะ — ในหน้าตั้งค่าเราชนะ" ทีละช่อง ทีละเดือน ทีละแบรนด์
   เก็บค่าต้นทางไว้ใน synced เสมอ เพื่อให้หน้าจอบอกได้ว่าทับอะไรไว้ และกดคืนค่าได้ */
export const GOAL_EDIT_FIELDS = [
  { key: "sales_target", label: "เป้ายอดขาย", unit: "money" },
  { key: "ad_budget", label: "งบแอด", unit: "money" },
  { key: "orders_target", label: "เป้ายืนยันออเดอร์", unit: "count" },
  { key: "deposits_target", label: "เป้าได้ออเดอร์", unit: "count" },
  { key: "leads_target", label: "เป้า Lead", unit: "count" },
  { key: "inquiry_target", label: "เป้าคนทัก", unit: "count" },
  { key: "cpl", label: "CPL ที่ตั้งไว้", unit: "money" },
  { key: "cac", label: "CAC ที่ตั้งไว้", unit: "money" },
  { key: "cpi", label: "ต้นทุนต่อคนทัก", unit: "money" },
  { key: "roas", label: "ROAS เป้า", unit: "ratio" },
  { key: "pct_ads_new", label: "%Ads เป้า", unit: "pct" },
];
const FIELD_KEYS = GOAL_EDIT_FIELDS.map((field) => field.key);
const MONTH = /^\d{4}-\d{2}-\d{2}$/;
const monthOf = (value) => String(value ?? "").slice(0, 10);
const keyOf = (brandId, month) => `${brandId}|${monthOf(month)}`;
const numOf = (value) => { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; };

export function mergeGoals(goals = [], overrides = []) {
  const out = new Map();
  const blank = (brandId, month) => ({
    brand_id: brandId, month, goal_source: null, version: null,
    sources: {}, synced: Object.fromEntries(FIELD_KEYS.map((key) => [key, null])),
    ...Object.fromEntries(FIELD_KEYS.map((key) => [key, null])),
  });
  for (const goal of goals ?? []) {
    const month = monthOf(goal?.month);
    if (!goal?.brand_id || !MONTH.test(month)) continue;
    const row = out.get(keyOf(goal.brand_id, month)) ?? blank(goal.brand_id, month);
    row.goal_source = goal.goal_source ?? null;
    row.version = goal.version ?? null;
    for (const key of FIELD_KEYS) {
      const value = numOf(goal[key]);
      row.synced[key] = value;
      if (value === null) continue;
      row[key] = value;
      row.sources[key] = goal.goal_source ?? "sale_goal";
    }
    out.set(keyOf(goal.brand_id, month), row);
  }
  for (const override of overrides ?? []) {
    const month = monthOf(override?.month);
    if (!override?.brand_id || !MONTH.test(month)) continue;
    const row = out.get(keyOf(override.brand_id, month)) ?? blank(override.brand_id, month);
    for (const key of FIELD_KEYS) {
      const value = numOf(override[key]);
      if (value === null) continue;            // null ในตาราง override = ไม่ได้แก้ช่องนี้ ไม่ใช่ "ตั้งเป็นว่าง"
      row[key] = value;
      row.sources[key] = "manual";
    }
    row.note = override.note ?? null;
    row.updated_at = override.updated_at ?? null;
    row.updated_by = override.updated_by ?? null;
    if (!row.goal_source) row.goal_source = "manual";
    out.set(keyOf(override.brand_id, month), row);
  }
  return out;
}

export const mergedGoalRows = (merged) => [...(merged?.values() ?? [])];
export const goalRowFor = (merged, brandId, month) => merged?.get(keyOf(brandId, month)) ?? null;
export const missingGoalFields = (row) => GOAL_EDIT_FIELDS.filter((field) => row?.[field.key] == null);
export const changedFromSource = (row) => GOAL_EDIT_FIELDS
  .filter((field) => row?.sources?.[field.key] === "manual" && row.synced?.[field.key] != null && row.synced[field.key] !== row[field.key])
  .map((field) => ({ key: field.key, value: row[field.key], source: row.synced[field.key] }));

/** "1,300,000" · "฿90,000.50" · "6.5x" · "12%" → ตัวเลข · เว้นว่าง → null · พิมพ์ผิด → undefined */
export function parseGoalInput(text, unit = "money") {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[฿,\s]/g, "").replace(/[x×]$/i, "");
  const pct = /%$/.test(cleaned);
  const n = Number(cleaned.replace(/%$/, ""));
  if (!Number.isFinite(n) || n < 0) return undefined;
  if (unit === "pct") return pct || n > 1 ? n / 100 : n;
  return n;
}
```

- [x] **Step 4: รันเทสให้เขียว** — 18/18 ผ่าน · ทั้งชุด 966 ผ่าน

---

### Task 6: ต่อ merge เข้าทุกหน้า

**Files:**
- Modify: `src/foundation/data/apiClient.js` · `src/modules/marketing/ads/useAdsData.js` · `SyncStatusView.jsx` · `adsSourceStrip.js`

**Interfaces:**
- Consumes: `mergeGoals` จาก Task 5
- Produces: `apiClient.ads.goalOverrides()` · `apiClient.ads.saveGoalOverride(row)` · `apiClient.ads.clearGoalOverride(brandId, month)` · `ads.salesGoals` ที่ทุกหน้าได้รับ = **ค่าที่ merge แล้ว**

- [x] **Step 1: apiClient — อ่าน/เขียน override** (`goalOverrides` · `saveGoalOverride` · `clearGoalOverride`)

```js
  /** เป้าที่คนแก้เองในหน้าตั้งค่า — ชนะค่าที่ดึงมา (อ่านได้ทุกคน เขียนได้เฉพาะหัวหน้าทีมตาม RLS) */
  async goalOverrides({ months = null } = {}) {
    const db = requireSupabase();
    let query = db.from("ad_sales_goal_overrides").select("*");
    if (months?.length) query = query.in("month", months);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
  /** บันทึกค่าที่คนแก้ — ส่งเฉพาะช่องที่มีค่า ช่องที่เป็น null = ล้าง override ของช่องนั้น */
  async saveGoalOverride({ brandId, month, values = {}, note = null }) {
    const db = requireSupabase();
    const { data, error } = await db.from("ad_sales_goal_overrides")
      .upsert({ brand_id: brandId, month, ...values, note, updated_at: new Date().toISOString() }, { onConflict: "brand_id,month" })
      .select().maybeSingle();
    if (error) throw error;
    return data;
  },
  async clearGoalOverride(brandId, month) {
    const db = requireSupabase();
    const { error } = await db.from("ad_sales_goal_overrides").delete().eq("brand_id", brandId).eq("month", month);
    if (error) throw error;
  },
```

`updated_by` เขียนจากฐานไม่ได้ตรงๆ (RLS รู้จัก `auth.uid()` ไม่ใช่ `mkt_profile.id`) → ใส่ trigger เติมให้ใน Task 1 หรือส่ง `updated_by` จากโปรไฟล์ที่หน้าเว็บรู้อยู่แล้ว — **เลือกทางหลัง** (ง่ายกว่าและตรวจสอบได้): หน้าเว็บส่ง `updated_by: user.profileId`

- [x] **Step 2: `useAdsData` โหลด override คู่กับเป้า แล้ว merge ก่อนแจก**

```js
        apiClient.ads.salesGoals().catch(() => []),
        apiClient.ads.goalOverrides().catch(() => []),   // แก้ไม่ได้/อ่านไม่ได้ = ใช้เป้าจากระบบขายไปก่อน
```
แล้วใน `useAdsData()` ให้ `salesGoals` ที่ส่งออกไป = `mergeGoals(pilot.salesGoals, pilot.goalOverrides)` แปลงกลับเป็น array แถวเป้าปกติ (หน้าอื่นไม่ต้องรู้ว่ามี override)

- [x] **Step 3: `SyncStatusView` ก็ merge เหมือนกัน** + ป้ายที่มาในตารางเป้ารองรับ `tmk_month` / `manual` และบอกว่าแก้เองกี่ช่อง (แท็บยอดขาย → `GoalMatrix`) — เพิ่ม resource `goalOverrides` แล้วส่งค่าที่ merge แล้วเข้า `GoalMatrix`

- [x] **Step 4: ป้าย "เป้าเดือนนี้" นับทุกแบรนด์ที่มีแหล่ง** — 4 แบรนด์ · "ตั้งแล้ว" = มีเป้ายอดขายของเดือนนั้น

ใน `adsSourceStrip.js` เปลี่ยนตัวหารจาก `SSB_BRAND_IDS` เป็นรายชื่อแบรนด์ที่มีแหล่งยอดขายทั้งหมด (รวม `b_jt`) แล้วแก้เทสที่ล็อก "3/3 แบรนด์" เป็น "4/4 แบรนด์"

- [x] **Step 5: รันเทสทั้งชุด** — 968 ผ่าน · เพิ่มเทสพิสูจน์ว่าค่าที่แก้ชนะถึงหน้าจอจริง (ไม่ใช่แค่ในฟังก์ชัน) — `npm test --silent` ต้องเขียวทั้งหมด (เทสเก่าที่ล็อก 3 แบรนด์ต้องอัปเดตพร้อมเหตุผลในคอมเมนต์)

---

### Task 7: หน้าตั้งค่าเป้า (แท็บใหม่ใน ตั้งค่า)

**Files:**
- Create: `src/modules/marketing/ads/GoalSettingsPanel.jsx`
- Modify: `src/modules/marketing/ads/AdsControlCenter.jsx`
- Modify: `src/modules/marketing/ads/adsWorkspace.css` (หรือไฟล์ css ของ settings ที่ใช้อยู่)
- Test: `tests/goalSettingsPanel.component.test.jsx`

**Interfaces:**
- Consumes: `GOAL_EDIT_FIELDS` · `mergeGoals` · `missingGoalFields` · `changedFromSource` · `parseGoalInput` · apiClient จาก Task 6

**หน้าตาที่ต้องได้ (เรียงจากบนลงล่าง):**

1. **เลือกเดือน** (ค่าเริ่ม = เดือนนี้) + ปุ่ม "คัดลอกจากเดือนก่อน" (คัดลอกเฉพาะช่องที่เดือนก่อนมีค่าและเดือนนี้ยังว่าง)
2. **สรุปหนึ่งบรรทัด** — "เดือนนี้ได้เป้ามาจากระบบขาย 3 แบรนด์ · JUNTAKARN มาจากระบบ TMK (เป้ายอด · งบแอด · ROAS) · ยังขาด: เป้าคนทัก (4 แบรนด์) · CPL (JUNTAKARN)"
3. **ตาราง แบรนด์ × ช่อง** ทุกช่องแก้ได้ (หัวหน้าทีม) — แต่ละช่อง:
   - ค่าที่ใช้จริง + ป้ายที่มาตัวเล็ก: `ระบบขาย v3` / `ระบบ TMK` / `ตั้งค่าเอง` / `ยังไม่ตั้ง`
   - ถ้าเป็น `ตั้งค่าเอง` และต้นทางมีค่าต่างกัน → บรรทัดเล็กใต้ช่อง "ระบบขายให้มา ฿210,000.00" + ปุ่ม "คืนค่า"
   - ช่องที่พิมพ์ผิด → ขอบแดง + ข้อความใต้ช่อง ไม่บันทึกทั้งแถว
4. **ปุ่มบันทึกเดียวต่อเดือน** (ไม่ auto-save) — มีจุดบอกว่ามีอะไรยังไม่บันทึก · กดออกจากหน้าโดยยังไม่บันทึก = เตือน
5. **ท้ายตาราง** — "แก้ล่าสุด 18 ก.ย. 2569 14:20 โดย อาร์ต" ต่อแบรนด์ที่มี override
6. คนที่ไม่ใช่หัวหน้าทีม = อ่านอย่างเดียว (input เป็น `disabled` + บรรทัดบอกเหตุผล)

- [x] **Step 1: เขียนเทสคอมโพเนนต์ก่อน** — 11 เทส (เพิ่มเคสที่ร่างไว้ไม่มี: อ่านตาราง override ไม่ได้ต้องยังดูเป้าได้)

```jsx
// @vitest-environment jsdom
/* หน้าตั้งค่าเป้า — ต้องบอกว่าได้อะไรมาแล้ว ขาดอะไร และแก้ทับได้ทีละเดือน */
// เทสที่ต้องมี:
//  1) แสดงค่าที่ merge แล้ว + ป้ายที่มารายช่อง (ระบบขาย / ระบบ TMK / ตั้งค่าเอง / ยังไม่ตั้ง)
//  2) บรรทัดสรุปบอกช่องที่ขาดของเดือนที่เลือก
//  3) พิมพ์ทับแล้วกดบันทึก → เรียก saveGoalOverride ด้วยค่าที่ parse แล้ว (ไม่ใช่ข้อความดิบ)
//  4) กด "คืนค่า" → เรียก clearGoalOverride แล้วช่องกลับไปเป็นค่าต้นทาง
//  5) สลับเดือน → โหลดค่าของเดือนนั้น ไม่เอาค่าที่ค้างในฟอร์มข้ามเดือน
//  6) ไม่ใช่หัวหน้าทีม → input ทุกช่อง disabled และไม่มีปุ่มบันทึก
//  7) พิมพ์ผิด ("abc") → ขึ้นข้อความใต้ช่องและไม่เรียก save
```

- [x] **Step 2: รันให้แดง แล้วเขียนคอมโพเนนต์จนเขียว** — เทสจับบั๊กได้ 1 ตัว: ช่องกรอกไม่โชว์สิ่งที่พิมพ์ (ใช้ object แทน key)

- [x] **Step 3: เพิ่มแท็บใน `AdsControlCenter.jsx`** — `1 · บัญชี · 2 · เป้า · 3 · กฎ · 4 · ตรวจยอด`

```js
  const [tab, setTab] = useState(["sources", "goals", "rules", "reconcile"].includes(requestedTab) ? requestedTab : "sources");
  ...
    {tab === "goals" && <GoalSettingsPanel brands={brands} isLead={isLead} toast={toast} />}
```
เพิ่มปุ่มแท็บ "เป้า" ไอคอน `Target` ต่อจาก "แหล่งข้อมูล"

- [x] **Step 4: ลิงก์ไปมา** — หน้าตั้งค่าลิงก์ไปสถานะ Sync (ยังไม่ได้ทำลิงก์ย้อนกลับจาก GoalMatrix — ทำในงาน 8) — ใน `GoalMatrix` (แท็บยอดขายของหน้า Sync) เพิ่มลิงก์ "ไปตั้งเป้าที่ขาด" → `/mkt/ads?panel=settings&tab=goals`

- [x] **Step 5: ดูของจริง** — เปิดหน้าจริงทั้งจอกว้าง (1100px) และมือถือ (375px) · เจอ 2 เรื่องที่แก้เพิ่ม: ตาราง override ยังไม่มีแล้วทั้งหน้าพัง · บรรทัด "ยังขาด" ยาว 11 ช่องของแบรนด์เดียว — `preview_start` → เปิดหน้าตั้งค่า แท็บเป้า → screenshot ทั้งจอกว้างและ 375px · แก้ค่าหนึ่งช่องแล้วดูว่าป้ายที่มาเปลี่ยนเป็น "ตั้งค่าเอง" จริง

---

### Task 8: ปิดงาน — เอกสาร + ตรวจของจริง

**Files:**
- Modify: `README.md` · `docs/RUNBOOK.md` · `CHANGELOG.md`

- [x] **Step 1: ตรวจเลขเป้าของ JK** — ผู้ใช้ยืนยัน 18 ก.ย. 69 ว่า**ตรง**: เป้ายอด ฿540,000.00 = ผลรวมเป้าช่องแชทในหน้า TMK · งบแอด ฿95,000.00 = Facebook + Instagram · ROAS เป้า 5.6842

เทียบ `sales_target` / `ad_budget` / `roas` ของ `b_jt` กับหน้า ตั้งค่า › เป้า & คอมมิชชั่น ของ TMK (ผลรวมช่องแชท · งบ FB+IG) — ไม่ตรงให้หยุดและรายงานส่วนต่าง ห้ามปรับสูตรให้ตรงโดยไม่รู้สาเหตุ

- [x] **Step 2: ตรวจว่า "ตั้งค่าชนะ" จริงบนของจริง** — พิสูจน์แล้ว 18 ก.ย. 69:
  ผู้ใช้ตั้งเองเวลา 15:58 (ROAS 4.2 · %Ads 20% · คนทัก 2,300 · ออเดอร์ 355) · sync รันทับเป้าใหม่เวลา 16:18 (เขียน jkGoals 2 เดือน · success)
  → หน้าจอเวลา 16:20 ยังขึ้น `เป้า ≥ 4.20×` และ `เพดาน ≤ 20.00%` (ค่าที่ตั้งเอง) ไม่ใช่ 5.68 จาก TMK
  · trigger ประทับคนแก้ทำงานจริง (`updated_by = u_art` มาจากฐาน ไม่ใช่จากหน้าเว็บ)

แก้ค่าหนึ่งช่องในหน้าตั้งค่า → กดดึงยอดขายอีกรอบ → ค่าที่แก้ต้องยังอยู่ และป้ายยังเป็น "ตั้งค่าเอง"

- [x] **Step 3: เอกสาร** — README (ตารางข้อมูลไหล 3 แถวใหม่) · RUNBOOK (หัวข้อ 4 ยอด/เป้า JK ไม่เข้า + เป้าไม่ตรงกับที่ทีมตั้ง) · CHANGELOG v0.11.0

- `README.md` ตาราง "ข้อมูลไหลยังไง": เพิ่มแถวเป้า JUNTAKARN (RPC `jk_ads_monthly_goal` · วันละครั้ง) และแถว override
- `docs/RUNBOOK.md`: หัวข้อ "เป้าไม่ตรงกับที่ทีมตั้ง" — ดูป้ายที่มาในหน้าตั้งค่าเป้า · ถ้าเป็น "ตั้งค่าเอง" คือมีคนแก้ทับ · รหัส `JK_GOAL_*`
- `CHANGELOG.md` `[Unreleased]` → `### feat`

- [x] **Step 4: รันทั้งชุดแล้วรายงาน** — 991 เทสผ่าน · lint 0 error · build ผ่าน · ออก v0.11.0 · migration applied · sales-sync v20 — `npm test --silent && npm run lint && npm run build` → รายงานว่าพร้อม commit

---

## ความเสี่ยงที่ต้องระวัง

| ความเสี่ยง | กันยังไง |
|---|---|
| ท่อ sync เขียนทับค่าที่คนแก้ | คนละตาราง — `sales-sync` ไม่มีสิทธิ์และไม่มีโค้ดแตะ `ad_sales_goal_overrides` เลย |
| เป้า JK ฐานไม่ตรงกับยอด JK | RPC รวมเฉพาะช่องแชท (กติกาเดียวกับที่นับยอด) · Task 8 Step 1 บังคับเทียบกับหน้า TMK ก่อนปิดงาน |
| งบแอดรวมของแพลตฟอร์มอื่นมาปน ROAS ต่ำเกินจริง | เอาเฉพาะ `Facebook` + `Instagram` · เก็บ `ad_budget_all` ไว้ดูเทียบได้แต่ไม่เขียนลงเป้า |
| เดือนที่ทีมยังไม่ตั้งเป้า ถูกเขียนศูนย์ทับ | `jkGoalRows` ทิ้งแถวที่ไม่มีทั้งเป้าและงบ · `has_row = false` ก็ทิ้ง |
| คนที่ไม่ใช่หัวหน้าทีมแก้เป้า | RLS `mkt_is_team_lead()` ทั้ง `using` และ `with check` · หน้าเว็บ disable ให้ด้วย แต่ด่านจริงอยู่ที่ฐาน |
| แก้เดือนหนึ่งแล้วไปโผล่อีกเดือน | pk `(brand_id, month)` · ฟอร์มโหลดใหม่ทุกครั้งที่สลับเดือน (มีเทสข้อ 5) |
| ต้นทางเปลี่ยนแล้วไม่มีใครรู้ | `changedFromSource` แสดงค่าต้นทางใต้ช่องที่ override + ปุ่มคืนค่า |
| `%Ads` สับสนหน่วย (0.12 vs 12%) | `parseGoalInput` รับทั้งสองแบบ เก็บเป็นสัดส่วน 0–1 · ฐานมี check `between 0 and 1` |

## สิ่งที่ยังไม่ทำในรอบนี้ (จงใจ)

- ประวัติการแก้เป้า (ใครแก้อะไรเมื่อไหร่ย้อนหลัง) — เก็บแค่ `updated_at` / `updated_by` ล่าสุด
- ตั้งเป้าล่วงหน้าหลายเดือนรวดเดียว — ทำได้ทีละเดือน + ปุ่มคัดลอกจากเดือนก่อน
- ดึงเป้ารายเซลล์/CRM ของ TMK — ไม่เกี่ยวกับเป้าแบรนด์
- เป้าต่อช่องทาง (Facebook/LINE แยกกัน) ฝั่งเรา — TMK มี แต่หน้า ads ยังไม่มีที่ใช้
