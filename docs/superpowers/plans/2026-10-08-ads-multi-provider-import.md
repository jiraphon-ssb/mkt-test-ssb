# นำเข้าค่าแอด Google Ads + ChatGPT ads ด้วยไฟล์ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ค่าแอดของ Google Ads และ ChatGPT ads เข้าระบบผ่านการอัปโหลด CSV แล้วแสดงรวมกับ Meta ในทุกหน้าที่คิดเงิน

**Architecture:** ตัวแกะ CSV เป็น pure function ในเบราว์เซอร์ → สรุปให้ยืนยัน → RPC `security definer` upsert ลง `ad_daily_facts` ตารางเดิมที่ระดับ `account` · ไม่สร้างตารางค่าแอดใหม่ · ชั้นโหลดข้อมูลเดิมกรอง Meta ทิ้งอยู่หลายจุด ต้องปลดล็อกก่อนถึงจะเห็นข้อมูล

**Tech Stack:** React 19 · Vite · JavaScript ล้วน (ไม่มี TS) · vitest · Supabase (Postgres + RPC)

**Spec:** `docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md`

## Global Constraints

- **JavaScript ล้วน ห้าม TypeScript** — โปรเจกต์นี้ไม่มี TS
- **สี/ขนาดทุกค่ามาจาก token SSB ใน `mktStyles.css`** — ห้าม hex ดิบ
- **dropdown ใช้ `MktSelect` เท่านั้น** ห้าม `<select>` ดิบ
- **CSS scope ใต้ `.mkt-root`** — อะไรที่ render นอก wrapper ต้องครอบเอง
- **ห้ามโชว์ 0 แทนสิ่งที่ไม่รู้** — ไม่มีข้อมูลให้แสดง `—` หรือข้อความบอกสถานะ
- **ห้ามรัน migration บน Supabase เอง** — เขียนไฟล์ได้ แต่ต้องขออนุมัติอาร์ตก่อน apply ทุกครั้ง (กฎข้อ 3)
- **ห้าม `git commit` / `push` เอง** — ขั้น Commit ในแผนนี้ทำเมื่ออาร์ตสั่งเท่านั้น (กฎข้อ 2) ระหว่างนั้นให้รายงานว่า "พร้อม commit"
- **เทสเดิม 188 เคสต้องเขียวตลอด** — `npx vitest run`
- ชื่อ provider ใหม่คือ `openai` (ค่าใน DB) · ชื่อบนจอคือ **ChatGPT Ads**

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/supabase/migrations/0015_ads_file_import.sql` | ตาราง `ad_import_batches` · `import_batch_id` · RPC · grants | สร้าง |
| `src/modules/marketing/ads/importCsv.js` | แกะ CSV → แถวค่าแอดรายวัน (pure) | สร้าง |
| `src/modules/marketing/ads/importModel.js` | สรุปก่อนยืนยัน (ทับกี่วัน · วันขาด · ยอดรวม) (pure) | สร้าง |
| `src/modules/marketing/ads/ImportSpendPanel.jsx` | การ์ดอัปโหลด + กล่องสรุป | สร้าง |
| `src/modules/marketing/ads/FileAccountDialog.jsx` | เพิ่มบัญชีแบบไฟล์ (map บัญชี → แบรนด์) | สร้าง |
| `src/foundation/data/apiClient.js` | `ads.facts` level · `ads.importFacts` · `ads.importBatches` · `ads.createFileConnection` | แก้ |
| `src/modules/marketing/ads/useAdsData.js` | เลิกกรอง provider meta ทิ้ง | แก้ |
| `src/modules/marketing/ads/adsFacts.js` | `source`/`ad_platform` ตาม provider + รองรับแถวระดับบัญชี | แก้ |
| `src/modules/marketing/adsOverview.js` | `normalizeAdPlatform` รู้จัก ChatGPT Ads | แก้ |
| `src/modules/marketing/ads/adsConnectorContract.js` | เพิ่ม provider `openai` | แก้ |
| `src/modules/marketing/ads/BillingView.jsx` | จำกัดเฉพาะ Meta + ป้ายบอกบนจอ | แก้ |
| `src/modules/marketing/ads/SyncStatusView.jsx` | วางการ์ดนำเข้า + แถวแหล่งข้อมูลของ 2 provider | แก้ |

---

## Task 1: Migration + เทส migration

**Files:**
- Create: `src/supabase/migrations/0015_ads_file_import.sql`
- Test: `tests/adsMigrations.test.js` (เพิ่ม describe ใหม่ท้ายไฟล์)

**Interfaces:**
- Consumes: ตารางเดิม `ad_connections`, `ad_daily_facts`, `mkt_profile`, ฟังก์ชัน `mkt_is_team_lead()`
- Produces: ตาราง `ad_import_batches` · คอลัมน์ `ad_daily_facts.import_batch_id` · RPC `mkt_ads_import_facts(p_batch jsonb, p_rows jsonb) returns jsonb` คืน `{"batch_id": uuid, "inserted": int, "updated": int}`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มท้าย `tests/adsMigrations.test.js`:

```js
describe("0015_ads_file_import", () => {
  const sql = read("src/supabase/migrations/0015_ads_file_import.sql");
  it("เพิ่ม provider openai โดยไม่ลบของเดิม", () => {
    expect(sql).toMatch(/check \(provider in \('meta','google','tiktok','shopee','openai'\)\)/);
  });
  it("สร้าง ad_import_batches พร้อม file_hash ที่ห้ามซ้ำ", () => {
    expect(sql).toMatch(/create table if not exists ad_import_batches/);
    expect(sql).toMatch(/file_hash text not null unique/);
  });
  it("ผูกแถวค่าแอดกลับไปหาไฟล์ได้ และลบไฟล์แล้วแถวไม่หาย", () => {
    expect(sql).toMatch(/alter table ad_daily_facts add column if not exists import_batch_id uuid/);
    expect(sql).toMatch(/references ad_import_batches\(id\) on delete set null/);
  });
  it("RPC ตรวจ team_lead เอง และเป็น security definer", () => {
    expect(sql).toMatch(/create or replace function mkt_ads_import_facts/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/mkt_is_team_lead\(\)/);
  });
  it("ปิดสิทธิ์เขียนตรงตาราง เขียนได้ทางเดียวคือ RPC", () => {
    expect(sql).toMatch(/revoke insert, update, delete, truncate on public\.ad_import_batches\s+from anon, authenticated;/);
  });
  it("มีวิธีย้อนกลับเขียนไว้ในหัวไฟล์", () => {
    expect(sql).toMatch(/rollback:/i);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/adsMigrations.test.js`
Expected: FAIL — `ENOENT` เพราะยังไม่มีไฟล์ `0015_ads_file_import.sql`

- [ ] **Step 3: เขียน migration**

สร้าง `src/supabase/migrations/0015_ads_file_import.sql`:

```sql
-- 0014 — นำเข้าค่าแอดจากไฟล์ CSV (Google Ads · ChatGPT ads)
-- spec: docs/superpowers/specs/2026-10-08-ads-multi-provider-import-design.md
-- เพิ่มอย่างเดียว ไม่แก้ของเดิม · Meta เขียน level='ad' เท่านั้น แถวจากไฟล์เป็น level='account' จึงไม่ชนกัน
-- rollback:
--   drop function if exists mkt_ads_import_facts(jsonb, jsonb);
--   alter table ad_daily_facts drop column if exists import_batch_id;
--   drop table if exists ad_import_batches;
--   alter table ad_connections drop constraint ad_connections_provider_check,
--     add constraint ad_connections_provider_check check (provider in ('meta','google','tiktok','shopee'));

alter table ad_connections drop constraint if exists ad_connections_provider_check;
alter table ad_connections add constraint ad_connections_provider_check
  check (provider in ('meta','google','tiktok','shopee','openai'));

create table if not exists ad_import_batches (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google','openai')),
  connection_id uuid not null references ad_connections(id) on delete cascade,
  file_name text not null default '',
  file_hash text not null unique,
  date_from date not null,
  date_to date not null,
  row_count integer not null default 0,
  spend_total numeric(18,4) not null default 0,
  imported_by text references mkt_profile(id) on delete no action deferrable initially deferred,
  created_at timestamptz not null default now()
);
comment on table ad_import_batches is 'ประวัติการนำเข้าค่าแอดจากไฟล์ — 1 แถว = 1 ไฟล์ · file_hash กันอัปไฟล์เดิมซ้ำโดยไม่ตั้งใจ';

alter table ad_daily_facts add column if not exists import_batch_id uuid
  references ad_import_batches(id) on delete set null;
comment on column ad_daily_facts.import_batch_id is 'แถวนี้มาจากไฟล์ไหน — null = มาจาก API · ใช้ย้อนลบทั้งก้อนเมื่ออัปผิดไฟล์';

create index if not exists ad_daily_facts_import_batch_idx on ad_daily_facts (import_batch_id);

alter table ad_import_batches enable row level security;
drop policy if exists ads_import_batches_read on ad_import_batches;
create policy ads_import_batches_read on ad_import_batches for select to authenticated using (true);

-- p_batch: {provider, connection_id, file_name, file_hash, date_from, date_to, row_count, spend_total, imported_by}
-- p_rows : [{fact_date, spend}]  — ระดับบัญชีเท่านั้น campaign/ad_group/ad เป็นค่าว่างตาม default ของตาราง
create or replace function mkt_ads_import_facts(p_batch jsonb, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch_id uuid;
  v_before integer;
  v_after integer;
  v_rows integer;
begin
  if not public.mkt_is_team_lead() then
    raise exception 'นำเข้าค่าแอดได้เฉพาะ Team Lead' using errcode = '42501';
  end if;

  insert into public.ad_import_batches
    (provider, connection_id, file_name, file_hash, date_from, date_to, row_count, spend_total, imported_by)
  values (
    p_batch->>'provider',
    (p_batch->>'connection_id')::uuid,
    coalesce(p_batch->>'file_name', ''),
    p_batch->>'file_hash',
    (p_batch->>'date_from')::date,
    (p_batch->>'date_to')::date,
    coalesce((p_batch->>'row_count')::integer, 0),
    coalesce((p_batch->>'spend_total')::numeric, 0),
    p_batch->>'imported_by'
  )
  returning id into v_batch_id;

  select count(*) into v_before from public.ad_daily_facts
   where connection_id = (p_batch->>'connection_id')::uuid and level = 'account';

  insert into public.ad_daily_facts (connection_id, fact_date, level, spend, import_batch_id, source_updated_at)
  select (p_batch->>'connection_id')::uuid, (r->>'fact_date')::date, 'account', (r->>'spend')::numeric, v_batch_id, now()
    from jsonb_array_elements(p_rows) as r
  on conflict (connection_id, fact_date, level, campaign_id, ad_group_id, ad_id)
  do update set spend = excluded.spend,
                import_batch_id = excluded.import_batch_id,
                source_updated_at = excluded.source_updated_at,
                ingested_at = now();

  select count(*) into v_after from public.ad_daily_facts
   where connection_id = (p_batch->>'connection_id')::uuid and level = 'account';

  v_rows := jsonb_array_length(p_rows);
  return jsonb_build_object('batch_id', v_batch_id, 'inserted', v_after - v_before, 'updated', v_rows - (v_after - v_before));
end;
$$;

revoke insert, update, delete, truncate on public.ad_import_batches from anon, authenticated;
revoke all on function mkt_ads_import_facts(jsonb, jsonb) from anon;
grant execute on function mkt_ads_import_facts(jsonb, jsonb) to authenticated;
```

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/adsMigrations.test.js`
Expected: PASS ทุกเคส รวมเคสเดิมของ 0005–0013

- [ ] **Step 5: รันเทสทั้งชุด**

Run: `npx vitest run`
Expected: 188 เดิม + 6 เคสใหม่ เขียวหมด

- [ ] **Step 6: รายงานว่าพร้อม commit — อย่า commit เอง**

บอกอาร์ตว่า migration เขียนแล้วแต่ **ยังไม่ได้ apply ลง Supabase** พร้อมบอกว่าจะกระทบอะไร (เพิ่มตาราง 1 · เพิ่มคอลัมน์ 1 · เพิ่ม RPC 1 · ไม่แตะข้อมูลเดิม) แล้วรอคำตอบ

เมื่อได้คำสั่ง:

```bash
git add src/supabase/migrations/0015_ads_file_import.sql tests/adsMigrations.test.js
git commit -m "feat(ads): migration นำเข้าค่าแอดจากไฟล์ — ad_import_batches + RPC mkt_ads_import_facts"
```

---

## Task 2: ปลดล็อก provider ในชั้นโหลดข้อมูล

**ทำไมต้องทำก่อนทุกอย่างที่เกี่ยวกับหน้าจอ:** ถึงข้อมูลจะเข้า DB แล้ว ตอนนี้มี 3 จุดที่ตัดทิ้งก่อนถึงหน้าจอ

**Files:**
- Modify: `src/foundation/data/apiClient.js:2471` (`.eq("level","ad")`)
- Modify: `src/modules/marketing/ads/useAdsData.js:39` (filter provider meta)
- Modify: `src/modules/marketing/ads/adsFacts.js:72-73` (`source`/`ad_platform` hardcode)
- Modify: `src/modules/marketing/adsOverview.js:62-68` (`normalizeAdPlatform`)
- Modify: `src/modules/marketing/ads/adsConnectorContract.js` (เพิ่ม provider `openai`)
- Test: `tests/adsFacts.test.js`, `tests/adsOverview.test.js`

**Interfaces:**
- Consumes: `ad_daily_facts` แถว `level='account'` ที่ Task 1 เปิดทาง
- Produces: `factsToAdCards(facts, connections, opts)` คืนการ์ดที่มี `source` = provider id (`"meta"` | `"google"` | `"openai"`) และ `ad_platform` = ชื่อบนจอ (`"Meta Ads"` | `"Google Ads"` | `"ChatGPT Ads"`)

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มใน `tests/adsFacts.test.js`:

```js
describe("factsToAdCards — หลาย provider", () => {
  const conn = (id, provider) => ({ id, provider, brand_id: "b_td", status: "connected", config: {} });
  const fact = (connId, date, spend, level = "account") => ({
    connection_id: connId, fact_date: date, level, campaign_id: "", campaign_name: "",
    ad_group_id: "", ad_id: "", ad_name: "", spend,
  });

  it("แถวระดับบัญชีของ Google กลายเป็นการ์ดที่ติดป้าย Google Ads", () => {
    const cards = factsToAdCards([fact("c1", "2026-10-01", 1234.5)], [conn("c1", "google")], { today: "2026-10-02" });
    expect(cards).toHaveLength(1);
    expect(cards[0].source).toBe("google");
    expect(cards[0].ad_platform).toBe("Google Ads");
    expect(cards[0].metrics.spend).toBe(1234.5);
  });

  it("ChatGPT ads ติดป้าย ChatGPT Ads", () => {
    const cards = factsToAdCards([fact("c2", "2026-10-01", 600)], [conn("c2", "openai")], { today: "2026-10-02" });
    expect(cards[0].ad_platform).toBe("ChatGPT Ads");
  });

  it("Meta ยังเป็น Meta Ads เหมือนเดิม (ไม่ถอยหลัง)", () => {
    const cards = factsToAdCards([fact("c3", "2026-10-01", 7000, "ad")], [conn("c3", "meta")], { today: "2026-10-02" });
    expect(cards[0].source).toBe("meta");
    expect(cards[0].ad_platform).toBe("Meta Ads");
  });
});
```

เพิ่มใน `tests/adsOverview.test.js`:

```js
describe("normalizeAdPlatform — ChatGPT", () => {
  it("รู้จักชื่อที่เป็นไปได้ของ ChatGPT ads", () => {
    for (const raw of ["ChatGPT", "ChatGPT Ads", "OpenAI", "OpenAI Ads"]) {
      expect(normalizeAdPlatform(raw)).toBe("ChatGPT Ads");
    }
  });
  it("ของเดิมไม่เปลี่ยน", () => {
    expect(normalizeAdPlatform("Meta Ads")).toBe("Meta Ads");
    expect(normalizeAdPlatform("Google")).toBe("Google Ads");
    expect(normalizeAdPlatform("ไม่รู้จัก")).toBe(null);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/adsFacts.test.js tests/adsOverview.test.js`
Expected: FAIL — การ์ด Google ได้ `ad_platform: "Meta Ads"` และ `normalizeAdPlatform("ChatGPT")` คืน `null`

- [ ] **Step 3: แก้ให้ผ่าน**

`src/modules/marketing/ads/adsConnectorContract.js` — เพิ่มใน `ADS_PROVIDERS` ต่อจาก shopee:

```js
  {
    id: "openai", name: "ChatGPT Ads", color: "#10A37F", phase: 2,
    accountPrefix: "", accountLabel: "Advertiser ID",
    metrics: ["spend"],
    leadEvents: [],
    doc: "https://ads.openai.com",
  },
```

`src/modules/marketing/adsOverview.js:62-68` — เพิ่มบรรทัดเดียวก่อน `return null`:

```js
  if (["ChatGPT", "ChatGPT Ads", "OpenAI", "OpenAI Ads"].includes(raw)) return "ChatGPT Ads";
```

`src/modules/marketing/ads/adsFacts.js` — ในลูปของ `factsToAdCards` แทนที่สองบรรทัด hardcode:

```js
    // ชื่อแพลตฟอร์มต้องมาจาก provider ของ connection — เดิม hardcode "meta" ทำให้ค่าแอด Google/ChatGPT
    // ถูกนับเป็นของ Meta ทั้งหมดเมื่อแยกตามแพลตฟอร์ม
    const providerId = connection.provider ?? "meta";
    const platformName = ADS_PROVIDERS.find((p) => p.id === providerId)?.name ?? "Meta Ads";
```

แล้วในอ็อบเจ็กต์การ์ด:

```js
      source: providerId,
      ad_platform: platformName,
```

เพิ่ม import ที่หัวไฟล์:

```js
import { ADS_PROVIDERS } from "./adsConnectorContract.js";
```

`src/foundation/data/apiClient.js:2471` — เปลี่ยนตัวกรองระดับ:

```js
      // Meta เขียนเฉพาะ level='ad' · ไฟล์นำเข้าเขียน level='account' → รับทั้งสองไม่นับซ้ำ
      .in("level", ["ad", "account"]).gte("fact_date", from).lte("fact_date", to)
```

และเพิ่ม `import_batch_id` ในรายการ `select` ของบรรทัดก่อนหน้า

`src/modules/marketing/ads/useAdsData.js:39` — เลิกกรอง:

```js
      publish({ status: "ready", facts, creatives, creativesFailed, salesFailed, goalsFailed, sales, salesGoals, goalOverrides, connections: connections ?? [], error: null, loadedAt: new Date().toISOString() });
```

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/adsFacts.test.js tests/adsOverview.test.js`
Expected: PASS

- [ ] **Step 5: รันทั้งชุด — หาเคสที่พังเพราะเลิกกรอง**

Run: `npx vitest run`
Expected: 188 + เคสใหม่เขียว · **ถ้าเคสไหนแดง อย่าแก้เทสให้ผ่าน** ให้ดูว่าเป็นของจริงที่ต้องกรอง Meta มั้ย แล้วไปแก้ที่จุดนั้น (Task 3 จัดการหน้าบิลไว้แล้ว)

- [ ] **Step 6: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/adsFacts.js src/modules/marketing/ads/adsConnectorContract.js src/modules/marketing/ads/useAdsData.js src/modules/marketing/adsOverview.js src/foundation/data/apiClient.js tests/adsFacts.test.js tests/adsOverview.test.js
git commit -m "feat(ads): รองรับค่าแอดหลาย provider — เลิกกรอง Meta ทิ้งที่ชั้นโหลดข้อมูล"
```

---

## Task 3: กันหน้าบิลพัง + บอกบนจอว่าแสดงเฉพาะ Meta

**ทำไม:** `BillingView` สร้างรายชื่อบัญชีจาก `connectionsFromCards(ads.cards)` พอ Task 2 ปล่อยการ์ดของ Google/ChatGPT เข้ามา หน้าบิลจะขึ้นบัญชีที่ไม่มีทั้ง snapshot และรายการตัดบัตร แล้วติดป้ายว่าผิดปกติทั้งที่ไม่ผิด

**Files:**
- Modify: `src/modules/marketing/ads/BillingView.jsx:179`
- Modify: `src/modules/marketing/ads/billingView.css` (คลาสป้าย)
- Test: `tests/billingModel.test.js`

**Interfaces:**
- Consumes: `factsToAdCards` จาก Task 2 (การ์ดมี `source` = provider id)
- Produces: ไม่มี export ใหม่

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

เพิ่มใน `tests/billingModel.test.js`:

```js
describe("หน้าบิลนับเฉพาะ Meta", () => {
  it("การ์ดของ Google/ChatGPT ไม่กลายเป็นบัญชีในตารางกระทบยอด", () => {
    const cards = [
      { source: "meta", account_id: "act_111", brand_id: "b_td", fact_date: "2026-10-01", metrics: { spend: 100 } },
      { source: "google", account_id: "g-222", brand_id: "b_td", fact_date: "2026-10-01", metrics: { spend: 50 } },
      { source: "openai", account_id: "o-333", brand_id: "b_td", fact_date: "2026-10-01", metrics: { spend: 25 } },
    ];
    const metaOnly = cards.filter((c) => c.source === "meta");
    expect(connectionsFromCards(metaOnly).map((c) => c.external_account_id)).toEqual(["111"]);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/billingModel.test.js`
Expected: FAIL ถ้า `connectionsFromCards` ยังไม่ถูกเรียกแบบกรอง (เทสนี้ล็อกพฤติกรรมที่ต้องการไว้ก่อน)

- [ ] **Step 3: แก้ `BillingView.jsx`**

ก่อนบรรทัด 179 เพิ่ม:

```jsx
  /* หน้านี้กระทบยอดกับการตัดบัตรของ Meta เท่านั้น (chargeMatch สร้างบนกติกาเพดานการตัดของ Meta)
     ค่าแอด Google/ChatGPT เข้าระบบทางไฟล์และยังไม่มีรายการตัดบัตร — ถ้าปล่อยเข้ามาจะขึ้นเป็นบัญชี "นอกระบบ" ทั้งที่ไม่ผิด */
  const metaCards = useMemo(() => (ads.cards ?? []).filter((c) => c.source === "meta"), [ads.cards]);
```

แล้วเปลี่ยนบรรทัด 179 ให้ใช้ `metaCards` แทน `ads.cards` ทั้งสองที่

- [ ] **Step 4: เพิ่มป้ายบนจอ**

ใต้หัวข้อหน้าบิล เพิ่ม:

```jsx
<p className="bl-scope">แสดงเฉพาะค่าแอด <b>Meta</b> — ค่าแอด Google Ads และ ChatGPT Ads เข้าระบบทางการนำเข้าไฟล์ และยังไม่กระทบยอดกับบัตรที่หน้านี้</p>
```

ใน `billingView.css`:

```css
.mkt-root .bl-scope {
  font-size: var(--fs-sm);
  color: var(--ink-3);
  border-left: 2px solid var(--warn);
  padding-left: 8px;
  margin: 0 0 12px;
}
```

- [ ] **Step 5: รันเทสให้เขียว**

Run: `npx vitest run tests/billingModel.test.js`
Expected: PASS

- [ ] **Step 6: ดูของจริงในเบราว์เซอร์**

เปิดหน้า บิล & กระทบยอด → ต้องเห็นป้าย "แสดงเฉพาะค่าแอด Meta" และตารางไม่มีบัญชี Google/ChatGPT โผล่

- [ ] **Step 7: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/BillingView.jsx src/modules/marketing/ads/billingView.css tests/billingModel.test.js
git commit -m "fix(ads): หน้าบิลนับเฉพาะ Meta + บอกขอบเขตบนจอ"
```

---

## Task 4: apiClient — สร้างบัญชีแบบไฟล์ · นำเข้า · อ่านประวัติ

**Files:**
- Modify: `src/foundation/data/apiClient.js` (ใน object `ads`)
- Test: `tests/adsImportClient.test.js` (สร้าง)

**Interfaces:**
- Consumes: RPC `mkt_ads_import_facts` จาก Task 1
- Produces:
  - `apiClient.ads.createFileConnection({ provider, brandId, accountId, accountName, currency, timezone })` → แถว `ad_connections` ที่สร้าง
  - `apiClient.ads.importFacts({ batch, rows })` → `{ batch_id, inserted, updated }`
  - `apiClient.ads.importBatches(connectionId?)` → แถว `ad_import_batches` เรียงใหม่สุดก่อน

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `tests/adsImportClient.test.js`:

```js
import { describe, it, expect, vi } from "vitest";
import { buildImportPayload } from "../src/modules/marketing/ads/importModel.js";

describe("buildImportPayload", () => {
  const rows = [
    { fact_date: "2026-10-01", spend: 100.5 },
    { fact_date: "2026-10-02", spend: 200.25 },
  ];
  const base = { provider: "google", connectionId: "c1", fileName: "report.csv", fileHash: "abc123", importedBy: "p1" };

  it("สรุปช่วงวัน จำนวนแถว และยอดรวมจากแถวจริง", () => {
    const { batch } = buildImportPayload({ ...base, rows });
    expect(batch.date_from).toBe("2026-10-01");
    expect(batch.date_to).toBe("2026-10-02");
    expect(batch.row_count).toBe(2);
    expect(batch.spend_total).toBe(300.75);
  });

  it("ส่งเฉพาะ fact_date กับ spend ไม่หลุดคอลัมน์อื่นจากไฟล์ไปที่ DB", () => {
    const { rows: out } = buildImportPayload({ ...base, rows: [{ fact_date: "2026-10-01", spend: 1, note: "ลับ" }] });
    expect(Object.keys(out[0])).toEqual(["fact_date", "spend"]);
  });

  it("ไม่มีแถวเลย = โยน error ไม่ส่ง batch เปล่าเข้า DB", () => {
    expect(() => buildImportPayload({ ...base, rows: [] })).toThrow(/ไม่มีแถว/);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/adsImportClient.test.js`
Expected: FAIL — ยังไม่มี `importModel.js`

- [ ] **Step 3: เขียน `importModel.js`**

สร้าง `src/modules/marketing/ads/importModel.js`:

```js
/* สรุปไฟล์ที่จะนำเข้า → payload ของ RPC mkt_ads_import_facts (pure)
   ตัดคอลัมน์ที่ไม่เกี่ยวทิ้งตรงนี้ที่เดียว — ไฟล์จาก Ads Manager มีคอลัมน์ที่ไม่ควรขึ้น DB */
const round2 = (n) => Math.round(n * 100) / 100;

export function buildImportPayload({ provider, connectionId, fileName, fileHash, importedBy, rows }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("ไม่มีแถวให้นำเข้า");
  const dates = rows.map((r) => r.fact_date).sort();
  return {
    batch: {
      provider,
      connection_id: connectionId,
      file_name: fileName ?? "",
      file_hash: fileHash,
      date_from: dates[0],
      date_to: dates[dates.length - 1],
      row_count: rows.length,
      spend_total: round2(rows.reduce((n, r) => n + Number(r.spend), 0)),
      imported_by: importedBy ?? null,
    },
    rows: rows.map((r) => ({ fact_date: r.fact_date, spend: r.spend })),
  };
}

/** เทียบกับของเดิมในระบบ → บอกคนกดว่าทับอะไรบ้าง ก่อนยืนยัน */
export function importPreview({ rows, existing = [] }) {
  const have = new Map(existing.map((f) => [f.fact_date, Number(f.spend)]));
  const days = rows.map((r) => r.fact_date);
  const from = days[0], to = days[days.length - 1];
  const all = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    all.push(d.toISOString().slice(0, 10));
  }
  return {
    from, to,
    dayCount: rows.length,
    spendTotal: round2(rows.reduce((n, r) => n + Number(r.spend), 0)),
    overwrites: rows.filter((r) => have.has(r.fact_date)).length,
    missingDays: all.filter((d) => !days.includes(d)),
  };
}

/** sha256 ของเนื้อไฟล์ — กันอัปไฟล์เดิมซ้ำโดยไม่ตั้งใจ */
export async function fileHashOf(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: เขียนเมธอดใน apiClient**

เพิ่มใน object `ads` ของ `src/foundation/data/apiClient.js`:

```js
  /** สร้างบัญชีที่ป้อนข้อมูลด้วยไฟล์ (ไม่ผ่าน OAuth) — ทำเครื่องหมายไว้ใน config.source */
  async createFileConnection({ provider, brandId, accountId, accountName, currency = "THB", timezone = "Asia/Bangkok" }) {
    const db = requireSupabase();
    const { data, error } = await db.from("ad_connections").insert({
      provider, brand_id: brandId, external_account_id: accountId,
      account_name: accountName ?? "", currency, timezone,
      status: "connected", config: { source: "file" },
    }).select().single();
    if (error) throw error;
    return data;
  },
  /** นำเข้าค่าแอดจากไฟล์ — RPC ตรวจ team_lead เอง */
  async importFacts({ batch, rows }) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("mkt_ads_import_facts", { p_batch: batch, p_rows: rows });
    if (error) throw error;
    return data;
  },
  /** ประวัติการนำเข้า — ใช้บอกว่าอัปล่าสุดเมื่อไร และเตือนไฟล์ซ้ำ */
  async importBatches(connectionId = null) {
    const db = requireSupabase();
    let query = db.from("ad_import_batches").select("*").order("created_at", { ascending: false }).limit(50);
    if (connectionId) query = query.eq("connection_id", connectionId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
```

- [ ] **Step 5: รันเทสให้เขียว**

Run: `npx vitest run tests/adsImportClient.test.js`
Expected: PASS ทั้ง 3 เคส

- [ ] **Step 6: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/importModel.js src/foundation/data/apiClient.js tests/adsImportClient.test.js
git commit -m "feat(ads): ชั้นข้อมูลสำหรับนำเข้าค่าแอดจากไฟล์"
```

---

## Task 5: หน้าเพิ่มบัญชีแบบไฟล์ (map บัญชี → แบรนด์)

**ทำไมมาก่อนตัวแกะไฟล์:** ต้องมี `connection_id` ก่อนถึงจะอัปไฟล์เข้าได้ และ task นี้ไม่ต้องรอไฟล์ตัวอย่าง

**Files:**
- Create: `src/modules/marketing/ads/FileAccountDialog.jsx`
- Modify: `src/modules/marketing/ads/SyncStatusView.jsx` (ปุ่มเปิด dialog)
- Modify: `src/modules/marketing/ads/adsWorkspace.css`
- Test: `tests/fileAccountDialog.component.test.jsx` (สร้าง)

**Interfaces:**
- Consumes: `apiClient.ads.createFileConnection` (Task 4) · `ADS_PROVIDERS` (Task 2) · `validateAdsConnection` เดิม
- Produces: `<FileAccountDialog open onClose onCreated />` — `onCreated(connection)` ยิงเมื่อสร้างสำเร็จ

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

สร้าง `tests/fileAccountDialog.component.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileAccountDialog } from "../src/modules/marketing/ads/FileAccountDialog.jsx";

describe("FileAccountDialog", () => {
  it("ยังไม่เลือกแบรนด์ = ปุ่มบันทึกกดไม่ได้", () => {
    render(<FileAccountDialog open brands={[{ id: "b_td", name: "TEAMDEE" }]} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("button", { name: /บันทึก/ })).toBeDisabled();
  });

  it("กรอกครบแล้วเรียก createFileConnection ด้วยค่าที่กรอก", async () => {
    const onCreated = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: "c9" });
    render(<FileAccountDialog open brands={[{ id: "b_td", name: "TEAMDEE" }]} onClose={() => {}} onCreated={onCreated} createFn={create} />);
    fireEvent.change(screen.getByLabelText(/รหัสบัญชี/), { target: { value: "123-456-7890" } });
    fireEvent.change(screen.getByLabelText(/ชื่อบัญชี/), { target: { value: "JK Google" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google", brandId: "b_td", accountId: "123-456-7890", accountName: "JK Google",
    })));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "c9" }));
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/fileAccountDialog.component.test.jsx`
Expected: FAIL — ยังไม่มีไฟล์

- [ ] **Step 3: เขียน component**

สร้าง `src/modules/marketing/ads/FileAccountDialog.jsx` — ใช้ `Sheet` จาก `../detail/Sheet.jsx` และ `MktSelect` ตามกติกาโปรเจกต์ (ห้าม `<select>` ดิบ) ฟอร์มมี: provider (google/openai) · แบรนด์ · รหัสบัญชี · ชื่อบัญชี · สกุลเงิน (ค่าเริ่ม THB)
รับ prop `createFn` เป็นทางฉีดตอนเทส ค่าเริ่มต้นคือ `apiClient.ads.createFileConnection`
ปุ่มบันทึกปิดอยู่จนกว่า `validateAdsConnection(provider, { accountId, currency, timezone }).ok === true` และเลือกแบรนด์แล้ว

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/fileAccountDialog.component.test.jsx`
Expected: PASS

- [ ] **Step 5: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/FileAccountDialog.jsx src/modules/marketing/ads/SyncStatusView.jsx src/modules/marketing/ads/adsWorkspace.css tests/fileAccountDialog.component.test.jsx
git commit -m "feat(ads): เพิ่มบัญชีโฆษณาแบบป้อนด้วยไฟล์"
```

---

## Task 6: ตัวแกะ CSV ⛔ ต้องมีไฟล์ตัวอย่างจริงก่อน

**ประตูที่ห้ามข้าม:** ห้ามเริ่ม task นี้จนกว่าจะมีไฟล์ export จริงอย่างน้อย provider ละ 1 ไฟล์ในมือ
วางไว้ที่ `tests/fixtures/ads-import/google-7d.csv` และ `tests/fixtures/ads-import/openai-7d.csv`
ถ้า ChatGPT Ads Manager ไม่มีปุ่ม export ให้ **หยุดแล้วกลับไปคุยกับอาร์ต** — design ส่วนหน้าจอจะเปลี่ยนเป็นกรอกมือ

**Files:**
- Create: `src/modules/marketing/ads/importCsv.js`
- Create: `tests/fixtures/ads-import/google-7d.csv`, `tests/fixtures/ads-import/openai-7d.csv`
- Test: `tests/adsImportCsv.test.js`

**Interfaces:**
- Consumes: ไม่มี (pure)
- Produces: `parseSpendCsv(text, providerId)` → `{ rows: [{ fact_date, spend }], currency, errors: [string], skipped: number, mergedDays: number }`

- [ ] **Step 1: เขียนเทสจากไฟล์จริง**

สร้าง `tests/adsImportCsv.test.js` ครอบ 8 กรณี **โดยเขียนชื่อคอลัมน์ตามไฟล์จริงที่ได้มา ไม่ใช่ที่เดา**:
ไฟล์ปกติ · มีหัวตารางก่อน header · คอลัมน์หาย · สกุลเงินไม่ตรง · วันซ้ำ · ช่องค่าแอดว่าง · วันอนาคต · ไฟล์เปล่า

```js
it("คอลัมน์ที่ต้องการหาย = บอกว่าไฟล์มีอะไรและต้องการอะไร ไม่เดา", () => {
  const out = parseSpendCsv("Campaign,Clicks\nA,10\n", "google");
  expect(out.rows).toEqual([]);
  expect(out.errors[0]).toMatch(/ไม่พบคอลัมน์/);
  expect(out.errors[0]).toContain("Campaign");
});

it("ช่องค่าแอดว่าง = ข้ามแถว ไม่ใส่ 0", () => {
  const out = parseSpendCsv(`${HEADER}\n2026-10-01,\n2026-10-02,150\n`, "google");
  expect(out.rows).toEqual([{ fact_date: "2026-10-02", spend: 150 }]);
  expect(out.skipped).toBe(1);
});

it("วันเดียวกันซ้ำ = รวมยอดแล้วรายงานว่ารวมกี่แถว", () => {
  const out = parseSpendCsv(`${HEADER}\n2026-10-01,100\n2026-10-01,50\n`, "google");
  expect(out.rows).toEqual([{ fact_date: "2026-10-01", spend: 150 }]);
  expect(out.mergedDays).toBe(1);
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/adsImportCsv.test.js`
Expected: FAIL — ยังไม่มี `importCsv.js`

- [ ] **Step 3: เขียน parser**

`src/modules/marketing/ads/importCsv.js` — โครง:

```js
/* แกะไฟล์ค่าแอดจาก Ads Manager → แถวรายวัน (pure · ไม่ยุ่ง network/DOM)
   กติกา: ตัวเลขเพี้ยนเงียบๆ แย่กว่าไม่มีข้อมูล → ไม่เดาคอลัมน์ ไม่เดาสกุลเงิน ไม่เติม 0 แทนช่องว่าง */

// ชื่อคอลัมน์ที่ยอมรับ — เติมจากไฟล์จริงเท่านั้น ห้ามเดาเพิ่มเอง
const COLUMNS = {
  google: { date: [/* จากไฟล์จริง */], spend: [/* จากไฟล์จริง */] },
  openai: { date: [/* จากไฟล์จริง */], spend: [/* จากไฟล์จริง */] },
};

export function parseSpendCsv(text, providerId) { /* ... */ }
```

กติกาที่ต้องเขียน: ข้ามบรรทัดจนเจอแถวที่มีทั้งคอลัมน์วันและคอลัมน์ค่าแอด · ล้าง `,` และสัญลักษณ์สกุลเงิน · ปฏิเสธวันอนาคต · รวมวันซ้ำ · ข้ามช่องว่าง

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/adsImportCsv.test.js`
Expected: PASS ทั้ง 8 กรณี

- [ ] **Step 5: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/importCsv.js tests/adsImportCsv.test.js tests/fixtures/ads-import/
git commit -m "feat(ads): ตัวแกะ CSV ค่าแอด Google / ChatGPT"
```

---

## Task 7: การ์ดอัปโหลด + กล่องสรุปก่อนยืนยัน

**Files:**
- Create: `src/modules/marketing/ads/ImportSpendPanel.jsx`
- Modify: `src/modules/marketing/ads/SyncStatusView.jsx`
- Modify: `src/modules/marketing/ads/adsWorkspace.css`
- Test: `tests/importSpendPanel.component.test.jsx` (สร้าง)

**Interfaces:**
- Consumes: `parseSpendCsv` (Task 6) · `importPreview` / `buildImportPayload` / `fileHashOf` (Task 4) · `apiClient.ads.importFacts`, `apiClient.ads.importBatches`
- Produces: `<ImportSpendPanel connections batches onImported />`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

```jsx
it("เลือกไฟล์แล้วยังไม่เขียน — ขึ้นสรุปก่อน", async () => {
  const importFn = vi.fn();
  render(<ImportSpendPanel connections={[conn]} batches={[]} importFn={importFn} />);
  await uploadCsv(screen, GOOD_CSV);
  expect(await screen.findByText(/ยอดรวม/)).toBeInTheDocument();
  expect(importFn).not.toHaveBeenCalled();
});

it("กดยืนยันถึงเขียน", async () => {
  const importFn = vi.fn().mockResolvedValue({ batch_id: "b1", inserted: 7, updated: 0 });
  render(<ImportSpendPanel connections={[conn]} batches={[]} importFn={importFn} />);
  await uploadCsv(screen, GOOD_CSV);
  fireEvent.click(screen.getByRole("button", { name: /ยืนยันนำเข้า/ }));
  await waitFor(() => expect(importFn).toHaveBeenCalledOnce());
});

it("ไฟล์ที่เคยอัปแล้วขึ้นคำเตือน แต่ยังอัปซ้ำได้", async () => {
  render(<ImportSpendPanel connections={[conn]} batches={[{ file_hash: KNOWN_HASH, created_at: "2026-10-06T03:00:00Z" }]} importFn={vi.fn()} />);
  await uploadCsv(screen, GOOD_CSV);
  expect(await screen.findByText(/เคยอัปเมื่อ/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /ยืนยันนำเข้า/ })).toBeEnabled();
});

it("ไฟล์พัง = บอกเป็นคำ ไม่โชว์ stack", async () => {
  render(<ImportSpendPanel connections={[conn]} batches={[]} importFn={vi.fn()} />);
  await uploadCsv(screen, "Campaign,Clicks\nA,10\n");
  expect(await screen.findByText(/ไม่พบคอลัมน์/)).toBeInTheDocument();
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/importSpendPanel.component.test.jsx`
Expected: FAIL — ยังไม่มีไฟล์

- [ ] **Step 3: เขียน component**

การ์ดแสดงบัญชีแบบไฟล์แต่ละตัว: ชื่อ · แบรนด์ · ข้อมูลถึงวันไหน · อัปล่าสุดเมื่อไร · ปุ่มเลือกไฟล์
เลือกไฟล์ → `parseSpendCsv` → `importPreview` → กล่องสรุป (ช่วงวัน · กี่วัน · ยอดรวม · ทับของเดิมกี่วัน · วันที่ขาด) → ปุ่ม `ยืนยันนำเข้า` / `ยกเลิก`
`errors` แสดงเป็นรายการข้อความไทย ไม่ใช่ stack

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/importSpendPanel.component.test.jsx`
Expected: PASS ทั้ง 4 เคส

- [ ] **Step 5: ดูของจริง 2 ธีม**

เปิดแท็บ Sync → อัปไฟล์ตัวอย่าง → ตรวจว่าสรุปตรงกับไฟล์ · กดยืนยันแล้วตัวเลขขึ้นที่หน้าภาพรวม
screenshot ทั้งธีมมืดและสว่างที่ 1280px

- [ ] **Step 6: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/ImportSpendPanel.jsx src/modules/marketing/ads/SyncStatusView.jsx src/modules/marketing/ads/adsWorkspace.css tests/importSpendPanel.component.test.jsx
git commit -m "feat(ads): หน้าอัปโหลดค่าแอด + สรุปก่อนยืนยัน"
```

---

## Task 8: แถวแหล่งข้อมูล + คำเตือน "ไม่ได้อัปมา n วัน"

**Files:**
- Modify: `src/modules/marketing/ads/syncOverview.js:49` (เดิม hardcode key `meta`)
- Modify: `src/modules/marketing/ads/SyncStatusView.jsx:223`
- Test: `tests/syncSources.test.js`

**Interfaces:**
- Consumes: `apiClient.ads.importBatches` (Task 4)
- Produces: `fileSourceRow({ connection, batches, now })` → `{ state: "ok"|"stale"|"waiting", fresh, ranAt, detail }`

- [ ] **Step 1: เขียนเทสที่ยังไม่ผ่าน**

```js
describe("fileSourceRow", () => {
  it("ยังไม่เคยอัป = waiting ไม่ใช่ error", () => {
    expect(fileSourceRow({ connection: conn, batches: [], now }).state).toBe("waiting");
  });
  it("อัปภายใน 7 วัน = ok", () => {
    expect(fileSourceRow({ connection: conn, batches: [b("2026-10-06")], now: D("2026-10-08") }).state).toBe("ok");
  });
  it("เกิน 7 วัน = stale พร้อมบอกจำนวนวัน", () => {
    const row = fileSourceRow({ connection: conn, batches: [b("2026-09-25")], now: D("2026-10-08") });
    expect(row.state).toBe("stale");
    expect(row.detail).toMatch(/13 วัน/);
  });
});
```

- [ ] **Step 2: รันเทสให้เห็นว่าแดง**

Run: `npx vitest run tests/syncSources.test.js`
Expected: FAIL — ยังไม่มี `fileSourceRow`

- [ ] **Step 3: เขียน `fileSourceRow` ใน `syncOverview.js`** แล้วเพิ่มแถวใน `SyncStatusView.jsx:223` ต่อจาก `meta` และ `creatives`

- [ ] **Step 4: รันเทสให้เขียว**

Run: `npx vitest run tests/syncSources.test.js`
Expected: PASS

- [ ] **Step 5: รันทั้งชุด + build + lint**

```bash
npx vitest run && npm run build && npm run lint
```
Expected: เทสเขียวทั้งหมด · build ผ่าน · lint warning ไม่เพิ่มจาก 39

- [ ] **Step 6: รายงานว่าพร้อม commit — อย่า commit เอง**

```bash
git add src/modules/marketing/ads/syncOverview.js src/modules/marketing/ads/SyncStatusView.jsx tests/syncSources.test.js
git commit -m "feat(ads): แถวแหล่งข้อมูลของค่าแอดที่นำเข้าด้วยไฟล์ + เตือนเมื่อค้างอัป"
```

---

## ลำดับที่ทำได้ทันที vs ที่ต้องรอ

| Task | รออะไร |
|---|---|
| 1 · 2 · 3 · 4 · 5 | **ไม่ต้องรออะไร** เริ่มได้เลย (Task 1 เขียนไฟล์ได้ แต่ apply ต้องขออนุมัติ) |
| 6 · 7 · 8 | **รอไฟล์ export จริง provider ละ 1 ไฟล์** |

## สิ่งที่ยังไม่ตัดสิน (บันทึกไว้ ไม่ให้ลืม)

ตอนต่อ Google Ads API แล้ว ถ้าวันเดียวกันมีทั้งข้อมูลจากไฟล์และจาก API ใครชนะ —
ตอนนี้ใช้ "อัปทีหลังทับ" · `import_batch_id` แยกที่มาไว้แล้ว ค่อยกำหนดกติกาจริงตอนเฟส API
