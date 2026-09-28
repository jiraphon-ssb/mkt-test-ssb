# หน้าภาพรวม เงินจริง + เชิงอรรถที่เดียว + สถานะโหลด — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าภาพรวมบอกเงินที่เข้าจริงเทียบยอดขาย/ค่าแอด พร้อมมัดจำและยกเลิก โดยย้ายเชิงอรรถไปที่เดียวและไม่แสดงค่าหลอกระหว่างโหลด

**Architecture:** ตัวเลขใน `ads/salesOverview.js` (pure) → `ads/overviewModel.js` คืน `cash` → `ads/AdsWorkspace.jsx` กล่อง `CashPanel` + คอลัมน์ตาราง + `<details>` สูตรและที่มา + loading

**Tech Stack:** React 19 + Vite · vitest

**Spec:** `docs/superpowers/specs/2026-09-26-overview-cash-design.md`

## Global Constraints
- ทศนิยมห้ามปัด · ไม่รู้ = null/"—" · ระบบ TMK (source `tmk`) ไม่มีเงินเข้า/มัดจำ
- ไม่ commit · ไม่แตะ Supabase/Vercel

### Task 1: `salesFactsByBrand` + `cashSummary`
**Files:** `ads/salesOverview.js` · Test `tests/salesOverview.test.js` (มีอยู่ — เพิ่ม describe)
**Produces:** `salesFactsByBrand` → `{ …, cancelledValue, refunds, cashTracked }` · `cashSummary({ sales: Map, brands: [{id,name,spend}] , names }) → { byBrand: { [id]: CashRow }, overall: CashRow & { excluded: string[] } }` โดย `CashRow = { tracked, cash, deposits, depositValue, revenue, gap, cashPerSpend, cancelled, cancelledValue, refunds, spend }`
- [ ] เทสล้ม → โค้ด → PASS

### Task 2: model
**Files:** `ads/overviewModel.js` · Test `tests/overviewModel.test.js` (ถ้ามี) หรือผ่าน component
- [ ] `cash: real ? cashSummary({ sales, brands: brandTotals, names }) : null`

### Task 3: กล่องเงินจริง + คอลัมน์ตาราง
**Files:** `ads/AdsWorkspace.jsx`, `ads/adsWorkspace.css` · Test `tests/adsWorkspace.component.test.jsx`
- [ ] เทสล้ม: กล่อง "เงินจริง" (group) ตัวใหญ่ · gap ข้อความ · มัดจำ · เงินเข้าต่อค่าแอด · ยกเลิกเฉพาะเมื่อมี · TMK ข้อความ · ป้ายไม่รวม · คอลัมน์ "เงินเข้า"
- [ ] โค้ด → PASS

### Task 4: เชิงอรรถที่เดียว + loading
**Files:** `ads/AdsWorkspace.jsx`, `ads/WorkspaceTrends.jsx` · Test component
- [ ] เทสล้ม: มุมเดือนไม่มี `.aw-key` นอก "สูตรและที่มา" (ยกเว้นข้อความเตือน stale) · details "สูตรและที่มา" มีขีดบนแถบ/สูตร/แบรนด์ที่ไม่รวม · loading = "กำลังโหลดตัวเลข…" ไม่มี hero
- [ ] โค้ด → PASS

### Task 5: ตรวจ
- [ ] vitest + lint + build · ภาพจริง 1440/768/375 (ทุกแบรนด์ · TEAMDEE · JK · JUNTAKARN) · design-critic · รายงาน
