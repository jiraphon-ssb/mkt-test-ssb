# ระบบแมทรายการตัดบัตร (ชั้น ①) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หน้าบิลบอกได้ว่าแต่ละครั้งที่ Meta ตัดบัตรครอบคลุมค่าแอดช่วงไหน และจับได้เมื่อ Meta ตัดเกินค่าแอดที่ระบบเห็นหรือยอดค้างไม่ตรง

**Architecture:** ตรรกะ pure ใน `ads/chargeMatch.js` (ไม่ขึ้นกับรูปแบบไฟล์) → `billingModel` เรียกต่อบัญชีจาก `ad_billing_charges` ที่มีอยู่ → `BillingView` คอลัมน์ + เจาะดู + แถบเตือน · ตัวแกะ CSV/RPC นำเข้าเป็นเฟสถัดไป (รอไฟล์จริง + อนุมัติ Supabase)

**Tech Stack:** React 19 · vitest

**Spec:** `docs/superpowers/specs/2026-09-26-charge-match-design.md`

## Global Constraints
- ทศนิยมห้ามปัด · ไม่รู้ = null · fixture ใช้ตัวเลข/เลขบัญชีสมมุติ (repo public)
- ไม่แตะ Supabase / ไม่ commit

### Task 1: `chargeMatch.js`
**Produces:** `matchAccountCharges({ charges, daily, balance, today }) → { vatMode, charges[{date,amount,net,reference,coverFrom,coverTo,covered,uncovered,status}], unbilled, balance, balanceGap, overCount, overAmount }` · `monthChargeSummary(match, month, { current }) → { charged, chargedNet, count, overCount, overAmount, status }`
- [ ] เทสล้ม (จัดสรร · ย้อนรายการแรก · ตัดเกิน · ย้อนไม่ถึง · VAT อัตโนมัติ · vat ในไฟล์ · unbilled/balance · รายเดือน) → โค้ด → PASS

### Task 2: `billingModel` ต่อแมท
- [ ] `buildBillingModel({ …, charges, today })` → แถวมี `charge` (monthChargeSummary) + `chargeMatch` · flag/alerts ตามสเปก · เทสล้ม → โค้ด → PASS

### Task 3: `BillingView`
- [ ] คอลัมน์ "Meta ตัดจริง" · เจาะดูรายการตัด (ช่วงค่าแอด · ป้ายผิดปกติ · ยังไม่ถูกตัด vs ยอดค้าง) · ไม่มีไฟล์ = "—" + บรรทัดบอกที่นำเข้า · เทสล้ม → โค้ด → PASS

### Task 4: ตรวจ
- [ ] vitest + lint + build · เปิดหน้าจริง (ยังไม่มีรายการตัด) · รายงาน + ขอไฟล์ CSV + รายการ Supabase ที่ต้องอนุมัติ
