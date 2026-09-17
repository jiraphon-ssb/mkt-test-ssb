# PLAN — SSB Marketing Ads Workspace

> อัปเดตล่าสุด: 17 ก.ย. 2569 (2026-09-17) · เจ้าของ: อาร์ต · CEO/coach: พี่ทัช
> เอกสารคู่กัน: [README.md](README.md) · [docs/META-OAUTH.md](docs/META-OAUTH.md) (เชื่อม Meta + cron) · [SUPABASE.md](SUPABASE.md) · [INTEGRATION.md](INTEGRATION.md)

## โปรเจกต์นี้คืออะไร (สถานะจริง ณ วันที่อัปเดต)

**ห้องทำงานโฆษณาของ SSB Group** — ดูยอดจริงจาก Meta Ads ของ 4 แบรนด์ (TEAMDEE · JK Design · t around · JUNTAKARN) ในที่เดียว ตัดสินใจเรื่องงบและครีเอทีฟจากตัวเลขที่ตรวจสอบได้

แอปมี 4 หน้า ทุกหน้าอยู่ใต้ `src/modules/marketing/`

| หน้า | route | ทำอะไร |
|---|---|---|
| Overview ads | `/mkt/ads` | ภาพรวมทุกแบรนด์ · ยอดขาย เป้า funnel จากระบบขาย · ค่าแอดจาก Meta · ROAS/%Ads จริง |
| แคมเปญ | `/mkt/campaigns` | ตารางแคมเปญ + drawer รายละเอียดพร้อมครีเอทีฟ |
| Creative | `/mkt/creatives` | คลังครีเอทีฟ ภาพ/วิดีโอจริงจาก Meta + ดูตัวอย่างโฆษณา |
| สถานะ Sync | `/mkt/ads/sync` | สรุปว่าเชื่อถือได้ไหม · เรื่องที่ควรดู · แหล่งข้อมูล · แท็บ บัญชี Meta / ยอดขาย / สิทธิ์และคีย์ / ประวัติ |

> **หมายเหตุสำคัญ — โค้ดที่ยังอยู่แต่ route ไม่ถึง:** SOP board 7 ขั้น (บอร์ด · ลิสต์ · ปฏิทิน · คิวรอตรวจ · คลัง · Dashboard 4 แท็บ) ถูกถอดออกจากเส้นทางแอปตั้งแต่ commit `0fc984f refactor(marketing): keep only ads workspace` แผนเดิมที่ว่าด้วยการรื้อผิวเหล่านั้นจึงยกเลิก
>
> **ตัดสินใจ 16 ก.ย. 2569: เก็บไฟล์พวกนี้ไว้ ไม่ลบ** — 40 ไฟล์ · 7,661 บรรทัด อยู่ที่ `marketing/work/` · `marketing/detail/` · `marketing/dash/` · `marketing/admin/` · `marketing/results/` · `mktCard/mktParts/mktSelect/mktCsv/mktDna/mktInsights` · `foundation/design/DatePicker.jsx` · `foundation/utils/xlsx.js` · `shell/DemoUserSwitch.jsx`
>
> สิ่งที่ต้องรู้เมื่อเจอไฟล์พวกนี้
> - **ไม่ต้องรื้อ ไม่ต้อง audit ไม่ต้องแก้ตาม design token** — แก้ไปก็ไม่มีใครเห็น
> - lint warning ~17 ตัวมาจากไฟล์กลุ่มนี้ ถือว่ายอมรับได้ ไม่ต้องไล่แก้
> - ตรวจว่าไฟล์ไหน "ถึงจริง" ได้ด้วยการไล่ import จาก `src/main.jsx` (ตอนตรวจครั้งล่าสุด: ถึง 100 ไฟล์ จากทั้งหมด 124)
> - ถ้าวันหนึ่งจะรื้อฟื้น SOP board ให้ถือเป็นโปรเจกต์ใหม่และเขียนแผนใหม่

## done-when (วัดได้)

1. ทุกหน้าใช้ยอดจริงจาก Meta ไม่มีตัวเลขจำลองปนในเส้นทางหลัก — **ทำแล้ว** (ข้อมูลจำลองเหลือเฉพาะโหมดเดโม)
2. ข้อมูลเข้าเองทุกวันโดยไม่มีใครต้องกดปุ่ม — **ทำแล้ว** (pg_cron ทุกชั่วโมง + ตรวจยอดอัตโนมัติวันละครั้ง)
3. ตรวจยอดกับ Ads Manager ผ่านทั้ง 4 บัญชี — **ทำแล้ว** (เกณฑ์ ±tolerance บนหน้าต่าง 7 และ 30 วัน)
4. ROAS ที่ใช้คุยงานมาจากยอดขายจริงในระบบขาย ไม่ใช่มูลค่าที่ Meta เดาให้ — **ทำแล้วระดับแบรนด์และภาพรวม** (17 ก.ย. · TD JD TA) · ระดับแคมเปญยังเป็นยอดที่ Meta เห็น · JUNTAKARN รอแหล่ง
5. ทีมเปิดดูเองได้ทุกคน ไม่ต้องผ่านหัวหน้า — **ทำแล้ว**

## Stack

React 19 · Vite · JavaScript ล้วน · Chart.js 4 · lucide-react · react-router-dom 7 · vitest · Supabase (Postgres + Edge Functions ภาษา TS/JS บน Deno) · deploy ที่ Vercel

**กติกาสไตล์ที่ห้ามฝ่าฝืน**
- สี/ขนาดทุกค่ามาจาก token ใน `mktStyles.css` — ห้าม hex ดิบ (ยกเว้นสีแบรนด์จากข้อมูล)
- dropdown ใช้ component `Dropdown` ใน `ui/` เท่านั้น
- CSS scope ใต้ `.mkt-root`
- ห้ามให้งานดู "AI ทำ": ไม่ใช้ emoji เป็นไอคอน · ไม่ใช้ gradient ม่วงฟุ้ง · ใช้ SVG icon
- ตรรกะคำนวณทุกตัวเป็น pure function + มีเทส · null ≠ 0 · ห้ามผสมยอดจำลองกับยอดจริง

## โครงระบบหลังบ้าน

| ส่วน | ที่อยู่ | หน้าที่ |
|---|---|---|
| ดึง Insights | `supabase/functions/ads-sync` | ดึงยอดรายวันต่อบัญชี เขียนผ่าน RPC `ads_replace_daily_facts` |
| ดึง Creative | `supabase/functions/ads-creatives` | ภาพ/วิดีโอ + โพสต์ต้นทาง |
| ตัวอย่างโฆษณา | `supabase/functions/ads-preview` | iframe ตัวอย่างจาก Meta (team_lead) |
| ตรวจยอด | `supabase/functions/ads-reconcile` | เทียบค่าแอด 7/30 วันกับ Meta |
| ตัวตั้งเวลา | `supabase/functions/ads-cron` + pg_cron `ads-sync-tick` | ทุกชั่วโมง: เติมช่องว่าง · ดึงซ้ำตามรอบ · ตรวจยอดวันละครั้ง · บันทึกทุกรอบลง `ad_cron_ticks` |
| ยอดขายจริง | `supabase/functions/sales-sync` | ดึงจากโปรเจกต์ระบบขายลง `business_daily_facts` (รอประตู) |
| OAuth | `ads-oauth-start/callback/status/disconnect` | เชื่อมบัญชี Meta รายบุคคล token เข้ารหัสฝั่ง server |

## งานที่เหลือ

### ข้อ 1 — เชื่อมยอดขายจริงจากระบบขาย — ✅ ขึ้นจริง 17 ก.ย. 2569

สเปก: [docs/superpowers/specs/2026-09-16-sales-revenue-bridge.md](docs/superpowers/specs/2026-09-16-sales-revenue-bridge.md) · แผนและบันทึกการทำ: [docs/superpowers/plans/2026-09-17-sales-data-rollout.md](docs/superpowers/plans/2026-09-17-sales-data-rollout.md)
ใช้ secret key `marketing_bridge` อ่านของที่ระบบพี่ทัชมีอยู่แล้ว (ไม่ต้องรัน SQL ฝั่งขาย) · ถอดแท็บเป้าของเราออก เป้าทั้งหมดมาจากหน้าเป้าหมายของระบบขาย

ยังเหลือ
- JUNTAKARN: ยอดขายอยู่ใน Supabase ของอาร์ตเอง — ยังไม่ต่อ (หน้าจอขึ้น "รอเชื่อมแหล่งข้อมูล")
- ทีมพี่ทัชยังไม่ตั้งเป้าแบบใหม่ (งบแอด · CPL · ROAS · %Ads · CAC) — หน้าจอขึ้น "ยังไม่ตั้งเป้า"
- ระบบขายมีข้อมูล "ได้ออเดอร์" ตั้งแต่ 1 ก.ย. เท่านั้น · คนทักเดือน ส.ค. ทีมไม่ได้กรอก (ดึงย้อนหลังเฟส 3 พักไว้)

### ข้อ 2 — คุณภาพผิวหน้าที่ใช้จริง

เกณฑ์จบ 1 ผิว (ยกมาจากแผนเดิมเพราะยังใช้ได้ดี)
1. `npx vitest run` เขียว · `npm run build` ผ่าน · `npm run lint` warning ไม่เพิ่ม
2. `design-audit` บนผิวนั้น — ไม่มี finding ระดับ Critical / Major ค้าง
3. screenshot จริงในเบราว์เซอร์ **ทั้ง 2 ธีม** ที่ 1280px ขึ้นไป
4. ไม่มี console error จากโค้ดโมดูล
5. ยึด token ครบ ไม่มี hex ดิบใหม่

| # | ผิว | ไฟล์หลัก | สถานะ |
|---|---|---|---|
| 2.1 | ตั้งค่า ads | `ads/AdsControlCenter.jsx` | ✅ ผ่านเกณฑ์ 16 ก.ย. (`d0db658`) |
| 2.2 | แคมเปญ + drawer | `campaigns/*` | ✅ ผ่านเกณฑ์ 16 ก.ย. (`ea09d30`) |
| 2.3 | Creative | `creatives/*` | ✅ ผ่านเกณฑ์ 16 ก.ย. (`ba76a03`) |
| 2.4 | Overview ads | `ads/AdsWorkspace.jsx` | ✅ ผ่านเกณฑ์ 16 ก.ย. (`f7417e2`) |
| 2.5 | สถานะ Sync | `ads/SyncStatusView.jsx` | ✅ รื้อใหม่ 17 ก.ย. (`0b3a033` · `4a4a38d`) — ตรวจ 375px สองธีม contrast ≥4.72 |

ผลรวมรอบนี้: ตัวอักษรต่ำกว่า 11px **366 จุด → 0** · contrast ที่ตก AA 11 จุดแก้หมด โดย 2 จุดเป็นระดับ token ทั้งแอป
- `--accent-text` (ธีมสว่าง) 4.14 → 5.52 บนพื้น tint
- `--accent-solid` (ใหม่) สำหรับพื้นทึบที่มีตัวหนังสือขาว 3.65/3.74 → 5.36/6.30

วิธีวัดซ้ำ: เปิดหน้าในเบราว์เซอร์ที่ 1280px แล้วไล่ทุก text node เทียบสีหน้า/หลังด้วยตัวแปลง oklch/oklab/color(srgb) เอง (`getComputedStyle` คืนค่าพวกนี้ ไม่ใช่ rgb) — ไอคอนตกแต่งที่ `aria-hidden` ไม่นับเป็นข้อความ

### ข้อ 3 — หนี้ที่รู้ตัว

- `mktStyles.css` 3,606 บรรทัด มีกฎของหน้าที่ถอดออกไปแล้วปนอยู่มาก — ตัดสินใจแล้วว่าเก็บไว้เหมือนไฟล์ JS (ดูหมายเหตุด้านบน) ถ้าจะลบวันหลังต้องไล่ยืนยันทีละคลาส เคยพังมา 3 ครั้งจากสคริปต์ลบอัตโนมัติ
- ~~bucket `mkt-files` เป็น public~~ ปิดแล้ว 16 ก.ย. 2569 (migration `20260916200000`) — เรียก URL สาธารณะได้ 400 NoSuchBucket
- ยอด purchase ของ 18 มิ.ย. 2569 วันเดียวยังเป็นเลขจากโค้ดเก่า (อยู่นอกหน้าต่าง 90 วันพอดี)

### ข้อ 3.1 — ตาข่ายฝั่งหน้าจอ (เริ่ม 16 ก.ย. 2569)

เดิมเทสทั้งหมดเป็น logic ล้วน ไม่มีไฟล์ไหนแตะ `.jsx` เลย — แก้ CSS หรือ JSX ผิดแล้วไม่มีอะไรเตือนจนกว่าจะเปิดหน้าดูเอง
ไฟล์ component test ที่ครอบผิวที่คนใช้จริง (jsdom + @testing-library/react · ประกาศ env ด้วย `// @vitest-environment jsdom` ต่อไฟล์)

| ไฟล์ | ครอบอะไร |
|---|---|
| `tests/creativeMedia.component.test.jsx` | ตัวเลื่อนภาพ: ตัวนับ ปุ่ม คีย์บอร์ด ภาพหมดอายุ ปุ่มดูตัวอย่าง |
| `tests/campaignsTable.component.test.jsx` | ตารางแคมเปญผ่านท่อข้อมูลจริง · การ์ดยอดขายจริง/ยอดใหม่ |
| `tests/syncStatusView.component.test.jsx` | หน้า Sync ทั้งหน้า: ระหว่างโหลดห้ามสรุปว่า "ยังไม่มี" · โหลดแยกส่วน · สมาชิกที่ไม่ใช่หัวหน้าทีม |
| `tests/salesSyncPanels.component.test.jsx` · `tests/syncHistoryList.component.test.jsx` | แท็บยอดขาย (เป้า · ความครบ) · แท็บประวัติ (แบ่งหน้า · กลุ่มวัน) |
| `tests/workspaceTrends.component.test.jsx` | กราฟแนวโน้มใช้ยอดขายจากระบบขาย |
| `tests/adsControlCenter.component.test.jsx` | หน้าตั้งค่า: ไม่มีแท็บเป้า · แท็บกฎเหลือช่องที่ใช้จริง |

กราฟถูก mock (Chart.js ต้องมี canvas จริง) · jsdom ไม่มี `scrollIntoView` ต้องจำลองในเทสที่กดเปลี่ยนหน้า (ไม่งั้น `npm test` exit 1 แม้เทสผ่าน)
ยังไม่ครอบ: Overview ทั้งหน้า (`AdsView`) · `CreativeLibraryView` เต็มหน้า · DateRangePicker · Dropdown

### ข้อ 4 — ที่ยังไม่ตัดสินใจ

Google / TikTok / Shopee connectors ยังเป็นข้อมูลจำลอง · ROAS ระดับแคมเปญต้องให้ระบบขายเก็บ ref จาก Click-to-Message ก่อน (ตอนนี้หน้าแคมเปญไม่ใช้ ROAS ของ Meta ตัดสินใจแล้ว) · กฎแนะนำ "สเกล" รายแคมเปญ (ยังไม่มี — จะใช้ CPL แทนไหม) · แจ้งเตือนเมื่อระบบเงียบ (ตัดสินใจแล้วว่ายังไม่ทำ)

---

## กติกาการทำงานของโปรเจกต์นี้

ตามไฟล์ `~/.claude/CLAUDE.md` — ประกาศ skill ก่อนเริ่มงานหลายขั้น · ห้าม commit/push เองถ้าไม่ได้สั่ง · แตะ Supabase/Vercel ต้องถามก่อน · "เสร็จ" ต้องมีหลักฐานจริง
