# Changelog

รูปแบบตาม [Keep a Changelog](https://keepachangelog.com/) · เวอร์ชันตาม SemVer · รายการสร้างจาก conventional commits

## [0.2.0] — 2026-09-14

### feat
- ads: targets for ROAS, %Ads, CPL and sales funnel with progress on every ads page (b984c83)
  - หน้าตั้งค่า: เป้ารายแบรนด์ 3 กลุ่ม — เงินต่อเดือน · ประสิทธิภาพ · กรวยยอดขายต่อเดือน (คนทัก · Lead · มัดจำ · ออเดอร์ปิดแล้ว)
  - Overview ภาพรวม + รายแบรนด์ และแถบสรุปหน้าแคมเปญ แสดง "ทำได้กี่ % จากเป้า" พร้อมสถานะ ถึง/ใกล้/ต่ำกว่าเป้า
  - การ์ดประสิทธิภาพขึ้นก่อนการ์ดงบ

### fix
- ads: navigate to ads settings without reloading the app — ค่าที่บันทึกไม่หายเมื่อออกจากหน้าตั้งค่า (b81660a)
- auth: grant marketing permissions from mkt_profile in supabase auth mode (5350065)

### ฐานข้อมูล
- migration 0009: `mkt_settings.ads_control` เก็บ mapping · เป้า · กฎ ลงฐาน (เขียนได้เฉพาะ team_lead)

### security
- `mkt_settings`: ปิดการเขียนตรงผ่าน REST จาก anon/authenticated (เขียนผ่าน `mkt_save_state` เท่านั้น) · anon อ่านไม่ได้ · เพดานขนาด `ads_control`
- ความเสี่ยงที่ยอมรับ (Medium): ผู้ใช้ที่ล็อกอินแต่ไม่ใช่ team_lead ยังอ่าน `ads_control` (account id, เป้า) ได้ — ไม่มี token

## [0.1.0] — 2026-09-14

รีลีสแรกของชุด **Ads** (Overview · แคมเปญ · Creative · สถานะ Sync) บน Content Pipeline — ข้อมูลยังเป็น mock ทั้งหมด รีลีสนี้เตรียมฐานข้อมูลและ Meta OAuth (อ่านอย่างเดียว) สำหรับขั้น Pilot

### feat
- ads: adapt ads migrations and Meta OAuth functions to the deployed mkt_* schema (fc51691)
- ads: add read-only Meta OAuth foundation (3a606b1)
- ads: date range picker, dropdown menus, range-mode overview and chart fixes (12e904f)
- ads: daily mock ad cards per campaign incl. today (a1273d6)
- ads: add creative library and sync status (6b62ae9)
- ads: prepare Meta creative ingestion (654ed59)
- ads: gate live data with health checks (09e267a)
- ads: add campaign analysis controls (3915dcc)
- ads: campaign detail row with daily chart, creatives and findings (b6d7c8a)
- ads: campaigns table with saved views, totals and sorting (6823026)
- ads: campaigns route, menu and page shell (0b279d2)
- ads: shared period scope helpers (22e6b4c)
- ads: campaign decision tags, saved views, totals, sort (84f86a6)
- ads: campaignRows model (a7d6405)
- ads: campaign budget share/objective/status mock (35f2c40)

### fix
- ads: align workspace layout and navigation (3e250e8)
- ads: lock campaign drawer background (16944a3)
- ads: harden campaign reporting states (3c1ea5f)
- ads: let campaign detail row text wrap inside the table wrap (8b8fe8b)
- ads: campaigns table desktop layout — rename cp-row to avoid mktStyles collision, fit 1500px (36bdf05)
- ads: normalize campaign budget channel lookup (4565b2a)

### refactor
- ads: group workspaces under overview tabs (5c78920)
- ads: turn campaigns into decision workspace (a304daa)
- ads: rebuild campaign decision workspace (6ab9ca9)

### style
- ads: full-width suite layout, unified page headers and controls across tabs (171b417)
- ads: campaigns responsive + audit fixes (ec05b58)

### security (จาก security review 2026-09-14 — `docs/superpowers/security-review-2026-09-14-meta-oauth.md`)
- mkt_profile: trigger กัน client แก้ `auth_user_id` / `role` / `active` ทั้ง insert และ update (H1, H2) · เช็คด้วย connection role (M4)
- `mkt_save_state`: ห่อใหม่ — ต้องมี session · anon เรียกไม่ได้ · คง `auth_user_id` · ไม่ใช่ team_lead ยกระดับสิทธิ์ไม่ได้ (H3) — migration 0008
- OAuth callback: ตรวจ `returnTo` ด้วย parsed origin กัน open redirect (H4) · รหัส error แบบปิด ไม่รั่วข้อความ DB/Meta (M2) · ใช้ state ได้ครั้งเดียวแบบ atomic (L2) · CORS ไม่ fallback (L1) · pin supabase-js (L5)
- ตาราง ads อ่านได้เฉพาะ `authenticated`
- FK ของตาราง ads ไป `mkt_brand`/`mkt_profile` เป็น `NO ACTION DEFERRABLE INITIALLY DEFERRED` แทน cascade — กันข้อมูล ads หายทุกครั้งที่บันทึกบอร์ด (round 2 NEW-1)
- trigger กันลบโปรไฟล์ team_lead/ที่ผูกผู้ใช้ · wrapper `mkt_save_state` ใส่คืนโปรไฟล์ที่มีสิทธิ์ถ้า payload ไม่ส่งมา · `search_path = ''` (round 2 NEW-2, L4)

### chore
- deps: `npm audit fix` — react-router / react-router-dom / nanoid (high) ตามผล `npm audit --audit-level=high`

### ฐานข้อมูล (ยังไม่ apply ในรีลีสนี้ — ทำในขั้น deploy)
- `src/supabase/migrations/0005_ads_data.sql` · `0006_ad_creatives.sql` · `0007_meta_oauth.sql` · `0008_harden_mkt_save_state.sql` (ปรับให้เข้ากับ schema `mkt_*` ที่ deploy จริง) · rollback ใน `src/supabase/migrations/rollback/`
- Edge Functions: `ads-oauth-start` · `ads-oauth-status` · `ads-oauth-disconnect` · `ads-oauth-callback` (`--no-verify-jwt`)

### ก่อนหน้า
- ประวัติก่อน `38fd2c2` (Content Pipeline บอร์ดคอนเทนต์, การ์ด, ปฏิทิน, backfill) ยังไม่ได้ออกเป็นเวอร์ชัน — ถือเป็นฐาน 0.0.0
