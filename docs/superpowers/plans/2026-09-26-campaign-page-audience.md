# หน้าแคมเปญ กลุ่มเป้าหมาย + ตัวเลขชุดเดียวกับ Creative — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าแคมเปญตอบได้ว่ากลุ่มเป้าหมายไหนได้คนทักถูก และใช้ตัวเลข/กติกาเดียวกับหน้า Creative โดยไม่มีของเทคนิคบนพื้นผิวหลัก

**Architecture:** ตัวเลขใหม่อยู่ใน `adsCampaigns.js` (pure · เทส) — `campaignRows` เพิ่มฟิลด์ลิงก์/ความถี่ช่วงก่อน · `audienceRows` ใหม่รวมการ์ดตาม `ad_group` · `campaignsModel` ส่งทั้งสองชุด · `CampaignsTable` สลับมุม · `CampaignDetail` ปรับช่อง/รายการ

**Tech Stack:** React 19 + Vite · vitest + testing-library (jsdom)

**Spec:** `docs/superpowers/specs/2026-09-26-campaign-page-audience-design.md`

## Global Constraints

- ทศนิยมห้ามปัด (fmtMoney / fmtPct / fmtNum) · ไม่รู้ = null / "—"
- เกณฑ์ CPL เทียบเฉลี่ย: ≥ 1.5 เท่า ควรแก้ · ≤ 0.8 เท่า ต้นทุนดี · ผลลัพธ์ < 5 รอข้อมูล
- ไม่ commit / ไม่แตะ Supabase / Vercel

---

### Task 1: `campaignRows` — ลิงก์ · ROAS null · ความถี่ช่วงก่อน
**Files:** `src/modules/marketing/adsCampaigns.js` (rollup, campaignRows) · Test `tests/adsCampaigns.test.js`
**Produces:** row `{ linkClicks, linkCtr, linkCpc, roas (null เมื่อ revenue ไม่ > 0), delta.frequency }`
- [ ] เทสล้ม: การ์ดมี `link_clicks` → linkCtr = Σlink ÷ Σimpressions · ไม่มี = null · revenue 0 → roas null · ช่วงก่อนมีข้อมูล → delta.frequency
- [ ] rollup เก็บ `linkClicks` (null-aware) · roas = `revenue > 0 ? roasOf : null` · prev frequency = share(p.impressions, p.reach)
- [ ] PASS + เทสทั้งชุด

### Task 2: `audienceRows`
**Files:** `adsCampaigns.js` · Test `tests/adsCampaigns.test.js`
**Produces:** `audienceRows(cards, range, { brands, roasFromMeta }) → Array<{ key, brandId, brand, platform, name, spend, leads, cpl, impressions, reach, linkClicks, linkCtr, frequency, spendShare, brandCpl, cplRatio, campaigns: [{ name, spend, leads, cpl }], decision: { tag, label, tone, why, next } }>` เรียงค่าแอดมากก่อน · `NO_ADSET = "ไม่ระบุชุดโฆษณา"`
- [ ] เทสล้ม: ชื่อชุดเดียวกันสองแคมเปญ = แถวเดียว campaigns 2 · ไม่มี ad_group = NO_ADSET · แคมเปญสองชุด = ตัวเลขแบ่งตามชุด · คำแนะนำ fix/good/wait/watch ตามเกณฑ์ · spendShare รวม = 1
- [ ] โค้ด (ใช้ `adFactRows`, `share`, `fmtMoney`, `fmtNum`, `fmtPct`)
- [ ] PASS

### Task 3: model + ตัวกรองสถานะ + loading
**Files:** `campaigns/campaignsModel.js`, `campaigns/CampaignsView.jsx` · Test `tests/campaignsModel.test.js` (ถ้ามี) หรือ component
- [ ] model คืน `audiences` (กรองแบรนด์/ค้นหาเหมือนแถว) · ตัวกรองสถานะใช้ `campaignDeliveryOf(r).key` ("active"/"paused") · ถอดตัวกรองเป้าหมาย/งบ · View ส่ง `audiences`, `loading`
- [ ] PASS

### Task 4: ตาราง — ปุ่มสลับมุม · คอลัมน์ CTR ลิงก์ · ความถี่ · มุมกลุ่มเป้าหมาย · loading
**Files:** `campaigns/CampaignsTable.jsx`, `campaigns.css` · Test `tests/campaignsTable.component.test.jsx`
- [ ] เทสล้ม: ปุ่ม [แคมเปญ | กลุ่มเป้าหมาย] (aria-pressed) · ไม่มีปุ่ม "ตัวเลขละเอียด" · คอลัมน์ "CTR ลิงก์ · ความถี่" · มุมกลุ่มเป้าหมายแสดงแถวกลุ่ม + กางดูแคมเปญ + กดชื่อแคมเปญเปิดแผง · loading = "กำลังโหลดแคมเปญ…"
- [ ] โค้ด + CSS
- [ ] PASS

### Task 5: แผงรายละเอียด
**Files:** `campaigns/CampaignDetail.jsx` · Test `tests/campaignDetail.component.test.jsx`
- [ ] เทสล้ม: ช่องที่ 4 = ความถี่ · การเข้าถึงมีคลิกลิงก์/CTR ลิงก์/CPC ลิงก์/CTR ทั้งหมด · ผลลัพธ์มี ROAS (Meta) "—" เมื่อไม่มียอด · บรรทัดความพร้อมขึ้นเฉพาะยังตัดสินไม่ได้ · ไม่มีป้าย "รอ Creative API"/"มีสื่อ" · ที่มาไม่มีบรรทัดงบเมื่อไม่มีงบ
- [ ] โค้ด · PASS

### Task 6: ตรวจ
- [ ] vitest + lint + build · ภาพจริง JK 1440/768/375 (มุมแคมเปญ · มุมกลุ่มเป้าหมาย · แผง) · design-critic · รายงาน
