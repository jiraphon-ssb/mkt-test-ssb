# คู่มือย้ายโมดูลนี้เข้า ssbgroup-platform

> เอกสารนี้อยู่ใน **โปรเจกต์นี้** เท่านั้น — repo `ssbgroup-platform` ยังไม่ถูกแตะแม้แต่ไฟล์เดียว
> (ใช้เป็น "ตัวอย่างอ่านอย่างเดียว" ระหว่างพัฒนา)
> อัปเดตล่าสุด: 27 ก.ค. 2026 — ครอบคลุมระบบโน้ต · 3 ขั้นท้ายรายช่องทาง · หน้าคลัง · MktSelect

## สิ่งที่ย้าย

```
คัดลอกทั้งโฟลเดอร์:  src/modules/marketing/   →  platform/src/modules/marketing/
```

โฟลเดอร์นี้ import ข้ามออกไปแค่ `foundation/*` เท่านั้น (กติกาเหล็ก #1) — ตรวจได้ด้วย:

```bash
grep -rhn 'from "\(\.\./\)\{2,\}' src/modules/marketing/ | grep -v foundation
# ต้องไม่มีผลลัพธ์ (ครอบ ../../ และลึกกว่านั้น เช่น ../../../../ ของ dash/charts/)
```

ของจริงที่โมดูลแตะจาก foundation มีแค่ **4 ไฟล์** (ตรวจแล้ว 27 ก.ค. 2026 ด้วย copy test ข้างล่าง):

| ไฟล์ | ใช้อะไร | ที่แพลตฟอร์ม |
|---|---|---|
| `foundation/context/EntityContext.jsx` | ขอบเขตแบรนด์ที่ shell เลือก | ✓ มี — interface ต่างเล็กน้อย ดูหมายเหตุ |
| `foundation/context/orgConfig.js` | `BRANDS`, `brandCodesFromContext` | ✓ มี |
| `foundation/context/ThemeContext.jsx` | `useTheme` (สีกราฟตามธีม — `dash/charts/ChartBox.jsx`) | ✓ มี |
| `foundation/utils/dates.js` | `startOfWeekMon/addWeeks/addDays` | **ต้องคัดลอกไปด้วย** |

### copy test — พิสูจน์ว่ายกไปแล้ว build ได้จริง

ทำแล้วผ่าน (27 ก.ค. 2026): ก๊อป `src/modules/marketing/` + foundation 4 ไฟล์ข้างบน ไปวางในโครงเปล่า
แล้ว `vite build` → ผ่าน ไม่มี import ค้าง (ได้ chunk ครบรวม lazy chunk ของ Dashboard/Results/ChartBox)
ทำซ้ำได้ด้วย:

```bash
SB=$(mktemp -d); mkdir -p "$SB/src/modules" "$SB/src/foundation/context" "$SB/src/foundation/utils"
cp -R src/modules/marketing "$SB/src/modules/marketing"
cp src/foundation/context/{EntityContext.jsx,orgConfig.js,ThemeContext.jsx} "$SB/src/foundation/context/"
cp src/foundation/utils/dates.js "$SB/src/foundation/utils/"
cp package.json vite.config.js src/theme.css "$SB/"; ln -s "$PWD/node_modules" "$SB/node_modules"
# ใส่ index.html + src/main.jsx ที่ import MarketingModule.jsx แล้ว: cd "$SB" && npx vite build
```

**หมายเหตุ EntityContext:** จุดที่โมดูลอ่านมีที่เดียวคือ `useMkt.jsx` (แปลง context → รายชื่อรหัสแบรนด์)
ถ้า shape ของแพลตฟอร์มต่าง แก้ที่ฟังก์ชัน map ตรงนั้นบรรทัดเดียว

## 3 จุดที่ต้องแก้ในแพลตฟอร์ม

**1. `src/shell/routes.jsx`** — ปลดล็อกโมดูล `marketing` แล้วเพิ่ม nav 4 รายการ
(ผังพร้อมใช้อยู่ใน `src/shell/routes.jsx` ของโปรเจกต์นี้ — คัดลอก `NAV` ไปวางใน group ของ marketing)

| path | label | perm |
|---|---|---|
| `/mkt/work` | งาน | `marketing.work.view` |
| `/mkt/dashboard` | Dashboard | `marketing.dash.view` |
| `/mkt/results` | ผลตอบรับ | `marketing.results.view` |
| `/mkt/admin` | ตั้งค่า | `marketing.admin` |

**2. `src/shell/AppShell.jsx`** — เพิ่ม lazy import + ใส่ใน `MODULE_ELEMENTS`

```js
const MarketingModule = lazy(() => import("../modules/marketing/MarketingModule.jsx"));
// element: <MarketingModule view="work" />   (view มาจาก routes.jsx)
```

**3. `src/foundation/rbac/can.js`** — เพิ่ม `MKT_ROLE_PERM` (คัดลอกจาก `src/foundation/rbac/can.js` ของโปรเจกต์นี้)
แล้ว derive perm ใน `AuthContext.buildUser` แบบเดียวกับ `sale.oem.view`

## กับดักที่เจอมาแล้ว — อย่าไปเจอซ้ำ

- **CSS ทั้งโมดูล scope ใต้ `.mkt-root`** (`mktStyles.css`) — อะไรที่ render จาก provider/portal
  นอก `<MarketingModule>` ต้องครอบ `<div className="mkt-root">` เอง ไม่งั้นได้ popup เปล่าไร้สไตล์
  (เคยเป็นบั๊กจริงกับ `ConfirmDialog` กลางใน `useMkt.jsx` — ตอนนี้ครอบไว้แล้ว)
- **dropdown ทุกจุดใช้ `MktSelect`** (`mktSelect.jsx`) — ห้ามกลับไปใช้ `<select>` ดิบ
- **`DATA_VERSION`** ใน `data/seed.js` (ตอนนี้ `ssb-cp-v15`) — bump เมื่อ schema ของ demo เปลี่ยน
  จะบังคับ reset localStorage ทุกเครื่อง demo
- ไฟล์แนบเดโมเป็น **object URL ราย session** — refresh แล้วรูปหาย เหลือ metadata
  (ของจริงอัปเข้า bucket แล้วเก็บ `file_url` — จุดอ่านจุดเดียวคือ `attachmentUrl()` ใน `detail/Attachments.jsx`)

## seam ข้อมูล — จุดเดียวที่สลับเป็น Supabase

**`modules/marketing/data/DataStore.js`** คือ seam — ทุกที่ในโมดูล (`useMkt.jsx`, `admin/AdminView.jsx`)
และ `apiClient.marketing` ของ shell import `store` จากไฟล์นี้ ไม่มีใครเรียก `localStore.js` ตรงๆ
(ตรวจ: `grep -rn "data/localStore.js" src --include='*.js*'` ต้องเจอแค่ใน `DataStore.js`)

วันย้าย: เขียน `supabaseStore.js` ที่มี 5 เมธอด (`load/save/reset/export/import`)
แล้วแก้บรรทัดสุดท้ายของ `DataStore.js` บรรทัดเดียว — UI ไม่ต้องแตะ

> เมธอดเดโมเป็น sync (`load()` คืนค่าเลย) · ของจริงเป็น async — ตอนสลับให้ทำ `load()`
> ครั้งเดียวตอน mount ใน `AppProvider` แล้ว `save()` ยิงเป็น RPC ราย mutation
> (`persist()` ใน `useMkt.jsx` เป็นจุดเดียวที่เขียน — เปลี่ยนที่นั่นที่เดียว)

ผัง RPC ที่ต้องเขียนวันย้ายจริง (ชื่อ pattern เดียวกับ `sale_*`):

```js
export const marketing = {
  cards:      () => db.from("cards").select("*").order("updated_at", { ascending: false }),
  create:     (payload) => db.rpc("mkt_card_create", { payload }),
  update:     (id, patch) => db.rpc("mkt_card_update", { p_id: id, patch }),
  transition: (id, to) => db.rpc("mkt_card_transition", { p_id: id, p_to: to }),
  approve:    (id) => db.rpc("mkt_review_approve", { p_id: id }),      // + ถอดหมุดโน้ต reject ใน RPC เดียวกัน
  reject:     (id, reason, dpRef) => db.rpc("mkt_review_reject", { p_id: id, p_reason: reason, p_ref: dpRef }),
                                                                        // + insert card_notes kind='reject' pinned
  archive:    (id) => db.rpc("mkt_card_archive", { p_id: id }),
  duplicate:  (id) => db.rpc("mkt_card_duplicate", { p_id: id }),      // ปุ่ม "ใช้เป็นต้นแบบ" หน้าคลัง
  runs:       { list, update },                                        // channel_runs — ตั้งเวลา/ขึ้นจริง/ตัวเลข รายช่องทาง
  notes:      { list, add, update, remove },                           // card_notes — ลบต้อง cascade รูป note_image
  history:    (id) => db.from("status_history").select("*").eq("card_id", id),
  attachments:{ list, upload, remove },                                // bucket "mkt-files"
};
```

## ตาราง Supabase (migration ตัวอย่างอยู่ใน `src/supabase/migrations/`)

| ไฟล์ | ครอบคลุม |
|---|---|
| `0001_init.sql` | cards / brands / profiles / status_history / review_actions / settings |
| `0002_brief_attachments.sql` | ไฟล์แนบ + ลิงก์อ้างอิง + RLS + storage bucket |
| `0003_stage_fields.sql` | ฟิลด์รายขั้น + metrics + view `posts_measured` / `brand_er_baseline` |
| `0004_channel_runs_notes.sql` | **ใหม่** — `channel_runs` (3 ขั้นท้ายรายช่องทาง + view rollup) · `card_notes` (โน้ต/ตีกลับ/ปักหมุด) · ชนิดไฟล์แนบใหม่ (`draft_work`, `*_proof`, `note_image`) + ผูก channel/note |

เลข migration ฝั่งแพลตฟอร์มให้เรียงต่อของเขา (ตอนเขียนคู่มือนี้คือ `0080`) — เนื้อ SQL ยกจาก 4 ไฟล์นี้

**กติกาที่ห้ามพลาด**
- RLS: มี policy **select เท่านั้น** · เขียนผ่าน `SECURITY DEFINER` RPC ที่ตรวจสิทธิ์เอง + เขียน audit
- รหัสการ์ด (`CT-…`) และรหัสโน้ต gen ที่ server ด้วย counter table + trigger (เดโม gen ฝั่ง client)
- `first_pass` เขียนครั้งเดียว ห้ามรีเซ็ต — บังคับใน RPC `mkt_review_approve/reject`
- ออกจาก Review ได้ทาง `mkt_review_approve` / `mkt_review_reject` เท่านั้น
- โน้ต `kind='reject'` สร้าง/ถอดหมุดโดย RPC review เท่านั้น — ผู้ใช้แก้/ลบไม่ได้
- ยอดการ์ด (reach/ER) อ่านจาก view `card_metrics_rollup` — อย่าคำนวณซ้ำใน client ของจริง
- **ห้าม merge commit ที่มี migration ใหม่จนกว่าเจ้าของจะรัน SQL บน Supabase Cloud เอง**

## เทส

`tests/` (**181 เคส**, vitest) **อยู่ที่โปรเจกต์นี้เท่านั้น** — แพลตฟอร์มไม่มี test runner
เวลาย้าย: คัดลอกเฉพาะ `src/modules/marketing/` ไม่ต้องเอา `tests/` ไป
แต่ถ้าแก้กติกา SOP ให้กลับมาแก้ + รันเทสที่นี่ก่อน แล้วค่อยคัดลอกไฟล์ใหม่ไปทับ

## ยกเลิกแล้ว

- `cards.members` (`0003`) — งานหนึ่งใบมี "ผู้ดูแล" คนเดียว · ที่ platform ถ้าสร้างแล้วปล่อยว่าง อย่าเพิ่ง drop
- `cards.scheduled_channels / post_link / published_checks` (`0003`) — ถูกแทนด้วย `channel_runs` (`0004`)
  ปล่อยว่างไว้จน backfill เสร็จ
