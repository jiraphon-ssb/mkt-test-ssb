# SSB Marketing Ads Workspace

> ห้องทำงานโฆษณาของ SSB Group — ดูยอดจริงจาก Meta Ads ของ 4 แบรนด์ (TEAMDEE · JK Design · t around · JUNTAKARN) ในที่เดียว
> React 19 · Vite · JavaScript ล้วน · Chart.js 4 · lucide-react · react-router-dom 7 · Supabase (Postgres + Edge Functions) · deploy ที่ Vercel

**หน้าในระบบ** — Overview (`/mkt/ads`) · แคมเปญ (`/mkt/campaigns`) · Creative (`/mkt/creatives`) · สถานะ Sync (`/mkt/ads/sync`) · ตั้งค่า (`/mkt/ads?panel=settings`)

**เอกสารที่ควรอ่านก่อน**

| ไฟล์ | เมื่อไหร่ที่ต้องใช้ |
|---|---|
| [PLAN.md](PLAN.md) | โปรเจกต์นี้คืออะไร เหลืออะไร และของเก่าที่เก็บไว้เฉยๆ อยู่ตรงไหน |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | ข้อมูลไม่เข้า ตัวเลขไม่ตรง ตัวตั้งเวลาเงียบ — แก้ยังไง |
| [docs/META-OAUTH.md](docs/META-OAUTH.md) | เชื่อม Meta · ตัวดึงอัตโนมัติ (pg_cron) · ค่าที่ต้องตั้ง |
| [docs/superpowers/specs/2026-09-16-sales-revenue-bridge.md](docs/superpowers/specs/2026-09-16-sales-revenue-bridge.md) | ดึงยอดขาย · funnel · เป้าจากระบบขายของพี่ทัช (คีย์ `marketing_bridge` อ่านอย่างเดียว) |

**เริ่มใช้งาน**

```bash
npm install
npm run dev        # http://localhost:5173 — ไม่ใส่คีย์ = โหมดเดโม (ข้อมูลจำลองในหน่วยความจำ)
```

ต่อฐานข้อมูลจริง → ใส่ `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` · `VITE_AUTH_MODE=supabase` ใน `.env.local` (ดู `.env.example`)

```
src/
  theme.css                ชั้นสีของแพลตฟอร์ม — สลับ dark/light ที่นี่
  foundation/              ของกลาง (design · utils · rbac · context · auth · data/apiClient.js)
  shell/                   เปลือกแอป: topbar · ตัวสลับแบรนด์ · nav · routes
  modules/marketing/
    ads/                   Overview (AdsView · AdsWorkspace · WorkspaceTrends) · สถานะ Sync (SyncStatusView ·
                           SalesSyncPanels · syncOverview.js) · ตั้งค่า (AdsControlCenter) · useAdsData ·
                           salesOverview.js (ยอดขาย/เป้าจากระบบขาย → ตัวเลขบนหน้า)
    campaigns/             หน้าแคมเปญ (CampaignsView · CampaignsTable · CampaignDetail)
    creatives/             คลังครีเอทีฟ + ดูตัวอย่างโฆษณา
    adsOverview.js         คำนวณยอด/จังหวะ/ROAS/กฎตัดสินใจ (decideAction) · adsCampaigns.js · adsScope.js
    ui/                    Dropdown · DateRangePicker · Pagination · GoalLine
    work/ detail/ dash/ admin/ results/   ← SOP board เดิม route ไม่ถึงแล้ว เก็บไว้เฉยๆ (ดู PLAN.md)
supabase/
  functions/               ads-sync (ดึง insights) · ads-creatives · ads-reconcile · ads-cron (ตัวตั้งเวลา) ·
                           ads-oauth-* · ads-connections · ads-preview · sales-sync (ยอดขายจากระบบขาย)
    _shared/               logic ล้วนที่มีเทส (metaInsights · adsCron · salesFacts · salesBridge · metaTokenDebug …)
  migrations/              schema + RLS ของฝั่ง marketing
tests/                     vitest — logic ล้วน + component (jsdom ประกาศรายไฟล์)
```

## ข้อมูลไหลยังไง

| ข้อมูล | มาจาก | เข้าเมื่อไร | เก็บที่ |
|---|---|---|---|
| ค่าแอด · คนทักจากแอด · ยอดที่ Meta เห็น | Meta Marketing API (OAuth อ่านอย่างเดียว) | pg_cron ทุกชั่วโมงนาทีที่ 7 · ดึงซ้ำตามรอบที่ตั้ง (ค่าเริ่ม 6 ชม.) | `ad_daily_facts` |
| รูป/ข้อความโฆษณา | Meta (creative + โพสต์เพจ) | วันละครั้งต่อบัญชี | `ad_creatives` |
| ยอดขาย · funnel · เงินเข้า · เป้า | ระบบขายของพี่ทัช (`sale_dashboard_facts` · `sale_goal`) | วันละครั้งหลัง 9 โมง ย้อน 14 วัน | `business_daily_facts` · `ad_sales_goals` |
| ยอดขาย JUNTAKARN (เฉพาะออเดอร์ช่องทาง Facebook) | ระบบ TMK Operation (RPC `jk_ads_daily_facts`) | วันละครั้ง พร้อมรอบยอดขาย | `business_daily_facts` (`source='tmk'`) |
| เป้าเดือนของ JUNTAKARN | ระบบ TMK (RPC `jk_ads_monthly_goal` — เป้าช่อง Facebook + งบแอด FB/IG) | วันละครั้ง เดือนนี้ + เดือนก่อน | `ad_sales_goals` (`goal_source='tmk_month'`) |
| เป้าที่คนแก้เอง | หน้าตั้งค่า › เป้า (หัวหน้าทีมเท่านั้น) | ตอนกดบันทึก · **ชนะค่าที่ดึงมาเสมอ ทีละช่อง ทีละเดือน** | `ad_sales_goal_overrides` |
| ประวัติรอบ | ทุกงานข้างบน | ทุกครั้งที่วิ่ง · เก็บ 90 วัน | `ad_cron_ticks` · `ad_sync_runs` · `data_pipeline_runs` |

กติกาตัวเลข: ยอดขาย ROAS %Ads CPL ระดับแบรนด์/ภาพรวมมาจากระบบขาย · ค่าแอดเป็นของ Meta (ติดป้าย) · ไม่มีข้อมูล = "—" พร้อมเหตุผล ห้ามขึ้น 0 · JUNTAKARN ใช้ระบบ TMK เป็นแหล่ง (funnel มี 2 ขั้น คนทัก → ยืนยันออเดอร์ — ขั้นที่ไม่มีขึ้น "—") · เป้าที่แก้ในหน้าตั้งค่าชนะเป้าที่ดึงมาเสมอ

## คำสั่งที่ใช้บ่อย

```bash
npm test           # vitest ทั้งชุด (hook ก่อน push รันตัวนี้ — มี error ค้างก็ถือว่าไม่ผ่าน)
npm run lint       # oxlint
npm run build      # vite build
```

ขึ้นหน้าเว็บ: push ขึ้น `main` → Vercel build เอง
ขึ้น Edge Function: ผ่าน release gate ก่อน (`.release-ok` ต้องตรง HEAD) แล้วใช้ Supabase CLI ส่งทีละตัวด้วย `--use-api` (`ads-oauth-callback` ต้องเติม `--no-verify-jwt` เพราะ Meta redirect เข้ามาโดยไม่มี JWT)
