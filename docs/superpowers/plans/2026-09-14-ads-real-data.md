# Ads Real Data (Meta Pilot) Implementation Plan

**Goal:** ดึง Insights รายวันของ Meta ลง `ad_daily_facts` แล้วแสดงบนหน้า ads ผ่านตัวเลือก "Meta Pilot" โดยใช้ตัวคำนวณเดิม

**Spec:** `docs/superpowers/specs/2026-09-14-ads-real-data-design.md`

## Global Constraints
- ไม่คิดเลขในหน้าจอ — logic ใหม่ทุกตัวเป็น pure + เทส (โค้ดฝั่ง Edge Function ที่ต้องเทส ใช้ `.js` ใน `supabase/functions/_shared/` แบบ `returnTo.js`)
- null ≠ 0 · ไม่ผสมยอดจำลองกับยอดจริง · browser ไม่เห็น token
- ห้ามแตะ Supabase (push/deploy/query) และห้าม commit จนกว่าผู้ใช้สั่ง

## Tasks
1. **metaInsights.js** — `buildInsightsParams` · `normalizeInsightRow` · `syncRange` · `isRetryableMetaError` · `fetchAllPages` (fetch/sleep ฉีดได้) · `chunk` — `tests/metaInsights.test.js`
2. **migration 0010** — `ad_connections.authorization_id` · RPC `ads_replace_daily_facts(connection, level, from, to, rows)` security definer, revoke จาก client — เทสใน `tests/adsMigrations.test.js`
3. **ads-sync Edge Function** — team_lead หรือ service role · สร้าง run → ดึงทุกหน้า → RPC แทนที่ช่วง → อัปเดต run + connection
4. **adsConnections.js + ads-connections Edge Function** — `planConnections(mappings, authorizedAccounts, existing)` + เทส · หน้าตั้งค่าเรียกหลังบันทึก
5. **adsFacts.js** — `factsToAdCards` · `adsCardsForSource` · `pilotSummary` + เทส · `apiClient.ads.facts`
6. **AdsDataProvider** — context แหล่งข้อมูล + ปุ่มสลับ (team_lead) + ป้ายแหล่งข้อมูลแทน "Mock data" · หน้าจอใช้การ์ดตามแหล่ง · `mockFallback` ยอดใหม่เฉพาะ mock
7. **หน้าสถานะ Sync** — ปุ่ม "ดึงข้อมูลตอนนี้" (backfill ถ้ายังไม่เคยสำเร็จ ไม่งั้น incremental)
8. **ตรวจ** — vitest · lint · build · หน้าจอโหมดจำลองไม่เปลี่ยน · Pilot ไม่มีข้อมูลขึ้น empty state
