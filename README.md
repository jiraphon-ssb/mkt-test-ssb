# Content Pipeline — โมดูล marketing (digital twin ของ SOP v1.1)

> **สตักเดียวกับ `ssbgroup-platform`**: React 19 · Vite · **JavaScript ล้วน** · Tailwind v4 (dark/light) ·
> **Chart.js 4** (ไม่ใช้ Recharts) · lucide-react · react-router-dom 7
> ทุกไฟล์อยู่ในโปรเจกต์นี้ — repo `ssbgroup-platform` ไม่ถูกแตะ (ดู [INTEGRATION.md](INTEGRATION.md) เผื่อวันย้าย)

**เริ่มใช้งาน**

```bash
npm install
npm run dev        # เปิด http://localhost:5173 — ใช้ได้เลย ไม่ต้องต่อฐานข้อมูล (localStorage)
```

ต่อฐานข้อมูลจริงแบบไม่ต้องล็อกอิน → [SUPABASE.md](SUPABASE.md) (รัน SQL 1 ไฟล์ + ใส่คีย์ 2 ค่า)

```
src/
  theme.css              ชั้นสีของแพลตฟอร์ม (ยกมาให้ตัวแปรชื่อตรงกัน) — สลับ dark/light ที่นี่
  foundation/            ของกลาง (design · utils · rbac · context · auth · data/apiClient)
  shell/                 เปลือกแอป: topbar · ตัวสลับแบรนด์ · nav · routes  (โมดูลห้ามมีของพวกนี้เอง)
  modules/marketing/     ← โฟลเดอร์ที่ยกไปแพลตฟอร์มได้ทั้งก้อน
    MarketingModule.jsx  หน้าหลักของโมดูล (รับ view จาก route)
    mktEngine.js         ค่าคงที่ + JSDoc typedef ของข้อมูล
    mktRules.js          กติกา SOP ทั้งหมด (gate · transition · สิทธิ์ · first-pass)
    mktAnalytics.js      aggregation ทุกมิติ    mktInsights.js  เครื่องยนต์คำแนะนำ 15 กติกา
    mktUi.jsx            UI primitives (token + Shell + Segmented + toast)
    mktStyles.css        สไตล์ nest ใต้ .mkt-root — remap token จุดเดียวคุมทั้งโมดูล
    work/ dash/ results/ detail/ admin/ data/
tests/                   184 เคส (vitest) — อยู่ที่นี่เท่านั้น แพลตฟอร์มไม่มี test runner
```

## กติกาเหล็กที่ระบบบังคับ (คุณค่าหลักเหนือ Notion)

1. **ออกจาก Review ได้ทางปุ่ม Approve / ตีกลับ ของ Team Lead เท่านั้น** — ลาก drag ข้ามถูกบล็อก · ตัดสินได้จากคิวรอตรวจ ลิสต์ หรือในการ์ด (ใช้ RejectModal ตัวเดียวกัน)
2. **ตีกลับไม่มีเหตุผล + ไม่อ้าง Direction Pack = ส่งไม่ได้** (ปุ่ม disabled)
3. **first_pass เขียนครั้งเดียว ไม่ล้างย้อนหลัง** — approve แรก=ผ่าน, reject แรก=ไม่ผ่าน ถาวร
4. **ทุกการขยับมี audit log** (status_history) — แก้ย้อนหลังไม่ได้
5. **เงื่อนไขจบเป็น validation** — ขยับการ์ดไม่ได้ถ้าเงื่อนไขขั้นปัจจุบันไม่ครบ ระบบบอกว่าขาดอะไร

ตรรกะทั้งหมดอยู่ใน [`src/domain/rules.ts`](src/domain/rules.ts) (pure functions + มี test)

---

## สถาปัตยกรรม (แยกชั้น — เตรียมย้าย Supabase ไม่ต้องแตะ UI)

```
src/
  domain/
    types.ts          ชนิดข้อมูลตรงตาม Spec ข้อ 3
    rules.ts          กติกา SOP ทั้งหมด (validateTransition, approve/reject, SLA, first-pass, flex)
    rules.test.ts     vitest — กติกา SOP
    analytics.ts      aggregation ทุกมิติของ Dashboard (weekly/rollup/funnel/heatmap/ads)
    insights.ts       Insight engine 15 กติกา + InsightProvider (จุดต่อ Claude API)
  data/
    DataStore.ts      interface — UI เรียกผ่านนี้เท่านั้น
    localStore.ts     implement ด้วย localStorage
    seed.ts           4 brands · 5 users · การ์ด ~18 ใบครอบทุกขั้น + edge cases
    seedBackfill.ts   งานย้อนหลัง 12 สัปดาห์ ~80 ใบ (deterministic) ให้ Dashboard มี trend จริง
  useApp.tsx          React context + mutations (persist ทุก action)
  components/         CardSheet (detail ทุกขั้น), RejectModal (ตีกลับ ใช้ร่วมทุกที่),
                      Attachments, IdeaModal, InfoButton, Sheet/Icon/ui
                      charts/ ChartBox·ChartTip·theme (Recharts แต่งเป็นธีม ContentOS)
  screens/            Work (บอร์ด/ลิสต์/รอตรวจ/ปฏิทิน) · Dashboard · Results (ผลตอบรับ) · Admin
                      Board · ListView · ReviewQueue · Calendar = มุมมองในหน้า Work
    dashboard/        HeroTile · MiniStats · InsightCta · RecentMeasured · ReviewQueueCard
                      TrendSection · PillarDonut · FirstPassTile · StageWipTile · RiskSection
    results/          PlatformBars · TopPosts
    dashboard/        tiles.tsx (registry: ขนาด+ลำดับไทล์ที่เดียว) · BentoGrid + TileShell ·
                      ไทล์ 11 ใบ: Kpi Insight WeeklyTopBottom Risk Trend Funnel
                      Breakdown FirstPass StageWip Heatmap Ads
  supabase/
    migrations/          0001 schema+RLS+RPC · 0002 ไฟล์แนบ/ลิงก์ · 0003 ฟิลด์ขั้น 5-7 + view ส่ง Dashboard
```

**วันย้าย Supabase:** เขียน `data/supabaseStore.ts` ที่ implement interface `DataStore` เดียวกัน
แล้วสลับใน `localStore.ts` → UI ไม่ต้องแก้เลย · schema + RLS + RPC (approve_card / reject_card) อยู่ใน migration แล้ว

---

## หน้าจอ (MVP + v1.1 ครบ)

| หน้า | ทำอะไร |
|---|---|
| **งาน** | หน้าเดียว 4 มุมมองของงานชุดเดียวกัน — ตัวกรอง (ค้นหา/ประเภท/ผู้ดูแล/Realtime) แชร์ระหว่างบอร์ด↔ลิสต์<br>· **บอร์ด** kanban 7 ขั้น drag&drop วิ่ง validation · Review ล็อก drag-out<br>· **ลิสต์** ชิปนับต่อขั้นกรองได้ + ตารางทุกใบ เรียงตามอัปเดต/กำหนด/ค้างนานสุด · toggle เห็นงานที่ปิดแล้ว · ตัดสินจากแถวได้<br>· **รอตรวจ** คิวเรียงรอนานสุด + SLA chip + Approve/ตีกลับ (badge บนแท็บและบน nav)<br>· **ปฏิทิน** timeline รายวัน เลนละแบรนด์ (แถบวัน 14 วัน · แกน 08:00–22:00 · เส้นเวลาปัจจุบัน · คลิกงาน = แผงรายละเอียดข้าง) + มุมมองเดือน · flex slot Realtime |
| **การ์ด (รายละเอียด)** | ซ้าย: stepper + ข้อมูลงาน (แก้ brand/pillar/ผู้ดูแล/สมาชิก) + ประวัติ · ขวา: เช็คลิสต์เงื่อนไขจบที่บอกอัตลักษณ์ของขั้น (สี/เจ้าของขั้น/โจทย์) + กลุ่มฟอร์มรายขั้น — **ขั้นปัจจุบันกางค้าง ขั้นที่ผ่านแล้วพับเหลือบรรทัดสรุป** กดกางแก้ย้อนหลังได้ |
| **Dashboard** (ทุกคน) | หน้าแรก — รู้ทันทีว่าวันนี้ต้องทำอะไร: การ์ดสรุปใหญ่ (วงแหวนสัดส่วนป้ายผล + ER รวม) · stat tiles 4 ตัว · **การ์ดเรื่องด่วน** = insight อันดับ 1 พร้อมปุ่มพาไปแก้ (กางดูทั้งหมดได้) · แนวโน้มรายสัปดาห์ · สัดส่วน pillar · งานล่าสุดที่วัดผล · คิวรอตรวจ · แถวกระบวนการ (ผ่านรอบแรก · งานค้างในสาย · ต้องเคลียร์) |
| **ผลตอบรับ** (ทุกคน) | หน้าดูผลงานโดยเฉพาะ: KPI 6 ตัว + delta · **Engagement by platform** (แถบสัดส่วน + เทียบช่วงก่อน) · **อันดับโพสต์** ตารางเรียงได้ทุกใบ มีภาพปก · วาระ Weekly Sync · เจาะรายมิติ 4 แท็บ · heatmap เวลาโพสต์ · ยิงแอด · Export CSV |
| **Admin** (team_lead) | เพิ่ม/แก้/ปิดใช้งาน users + brands · settings · Export ข้อมูลวัดผล (CSV) · export/import/reset ข้อมูล demo |

**หน้าสถิติเดิมถูกยุบเข้า Dashboard แล้ว** — first-pass / Weekly Sync / SLA / Direction Pack กลายเป็นไทล์ (ไม่มีข้อมูลหาย)

**สลับ user จำลอง:** กดที่ชื่อมุมบนขวา — เปลี่ยน role แล้ว permission ทั้งแอพปรับตาม (Spec ข้อ 2)
ลองสลับเป็น content_owner แล้วจะเห็นปุ่มตัดสิน review หายไป

---

## ทดลอง flow เต็มวงจร

1. กด **+** (โยนไอเดีย) → ชื่อ + brand + ประเภทงาน (Content / Project·ads) → "เข้าคลัง Idea" หรือ "กรอก Brief ต่อเลย"
2. เปิดการ์ด → ติ๊ก "อยู่ในแผน/คุ้มทำ" + เลือก Pillar (อยู่ในกล่องขั้น Idea เลย) → กด "บันทึกและไป Brief" — ขั้นนี้ยังไม่ต้องแตะ Brief
3. กรอก Brief v2 ครบทั้ง 2 ส่วน (โจทย์ 4 ข้อ + Fact Sheet + Format/Size/Deadline/ช่องทาง/วันโพสต์ + Layout sketch/Mood/Ref AW/ลิงก์ CI — Ref AW & CI ใช้ไฟล์แนบแทนได้) → ไป Draft
4. ใส่ลิงก์ไฟล์งาน + ติ๊ก self-check 6 ข้อ → เดินเข้า Review
5. สลับ user เป็น **คุณตะ (Team Lead)** → หน้ารอตรวจ → **ตีกลับ** (ต้องเลือกข้อ + เขียนเหตุผล ปุ่มถึงจะกด)
6. แก้ → เข้า review อีกรอบ → **Approve** (first_pass ยังเป็น false เพราะเคยถูกตีกลับ)
7. **Scheduled** ติ๊กตั้งเวลาจริงครบทุกช่องทาง → **Published** ยืนยันขึ้นจริง + ดูแลคอมเมนต์ 24 ชม. → **Measured** กรอก reach/engagement/lead → ป้ายผลขึ้นเอง → "ปิดงาน — เก็บเข้ากรุ"
   (ฝืนย้าย measured ก่อน 7 วัน จะเจอ confirm เตือน)

---

## สคริปต์พรีเซนต์ 5 นาที (เดินเรื่องตามนี้แล้ว SOP ขายตัวเอง)

> ก่อนเริ่ม: หน้า **ตั้งค่า → รีเซ็ตข้อมูล demo** ให้ข้อมูลกลับสภาพสวยเสมอ · ธีมไหนก็ได้ (รองรับทั้งคู่)

| นาที | ไปที่ | โชว์อะไร · พูดอะไร |
|---|---|---|
| 0–1 | **Dashboard** | KPI เดือนนี้ → ไทล์ "เรื่องที่ต้องจัดการก่อน" (ระบบจัดลำดับให้เอง) → เลื่อนลง **"จากคลังผลงาน"**: สูตรที่เวิร์ค + บทเรียนที่ทีมจดไว้ — "ระบบไม่ได้แค่เก็บงาน แต่สกัดความรู้กลับมา" |
| 1–2 | **งาน → บอร์ด** | การ์ดหน้าตาเดียวกันทุกจอ: แบรนด์/ชนิดงาน/วันไทย/ความพร้อม อ่านแวบเดียว · จุดแดง = มีตีกลับค้าง · เปิดการ์ด 1 ใบ → แผงซ้ายเห็นทุกอย่าง (stepper ติดวันที่จริง, กำหนดเวลา "อีก n วัน", ของในการ์ด) + คอลัมน์โน้ตขวา |
| 2–3 | **รอตรวจ** (สลับ user เป็น คุณตะ) | กด "ตรวจงาน" → เลื่อนดูรูปงานฝั่งซ้าย เทียบโจทย์ฝั่งขวา → **ตีกลับ**: ต้องอ้างข้อ Direction Pack + เขียนเหตุผล (มีโครง 3 หัวข้อ) — "ตีกลับลอยๆ ทำไม่ได้" |
| 3–4 | เปิดการ์ดที่ถูกตีกลับ | โน้ตแดงปักหมุดขึ้นเองบอกว่าต้องแก้อะไร → แก้เสร็จ Approve แล้วหมุดถอดเอง · ประวัติเป็นไทม์ไลน์ครบทุกเหตุการณ์ |
| 4–5 | **คลัง** | งานปิดแล้วทั้งหมด + ผลตอบรับ · สูตรที่เวิร์ค กดกรองดูกลุ่มที่ชนะ · เปิดใบเด่น → ตัวเลข/กราฟรายช่องทาง/บทเรียน · จบด้วยปุ่ม **"ใช้เป็นต้นแบบ"** — งานที่เวิร์คกลายเป็นไอเดียใหม่ในคลิกเดียว "ความสำเร็จวนกลับมาใช้ซ้ำ ไม่เริ่มจากศูนย์" |

ประโยคปิด: *"Notion เก็บงานได้ แต่บังคับกติกาไม่ได้ — ตัวนี้กติกา SOP เป็น validation จริง ตีกลับต้องอ้างเหตุ ความรู้ไหลกลับเป็นต้นแบบ"*

## Roadmap (ตาม Spec ข้อ 9)

- **MVP + v1.1** ✅ (โปรเจกต์นี้)
- **ต่อ AI จริง** — `insights.ts` วาง `InsightProvider` ไว้แล้ว: เพิ่ม claudeInsightProvider (ส่งสรุปตัวเลข ไม่ส่งข้อมูลดิบ) + fallback เป็น rule engine → หน้า Dashboard ไม่ต้องแก้
- **v1.2** — Notifications ผ่าน n8n → LINE (08:30 สรุปคิว, reject แจ้ง owner) · view ส่ง Dashboard (`posts_measured` มีใน migration แล้ว)
- ย้าย backend → Supabase (Postgres + Auth + RLS) deploy บน Coolify · schema ครบใน `src/supabase/migrations/` (0001–0003)

---

Stack: Vite · React 18 · TypeScript · @dnd-kit · date-fns · vitest — opensource ทั้งหมด
