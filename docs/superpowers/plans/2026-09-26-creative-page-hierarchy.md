# หน้า Creative จัดลำดับข้อมูลใหม่ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** การ์ด/ตาราง/หน้าต่างครีเอทีฟโชว์ตัวเลขที่ใช้คัดชิ้นงานจริง (ต่อผลลัพธ์ · CTR ลิงก์ · ROAS ที่ไม่หลอกตา · ชุดโฆษณา) และเอาแคปชั่น/แถบที่มา/เชิงอรรถออกจากพื้นผิวหลัก

**Architecture:** ตัวเลขใหม่คิดที่ `adsCreativeRows` ที่เดียว (pure · มีเทส) แล้ว UI ทุกจุดอ่านฟิลด์เดียวกัน · `AdsSourceNotice` ใช้ร่วม 3 หน้า เปลี่ยนเป็นขึ้นเฉพาะตอนมีปัญหา · เชิงอรรถรวมเป็น `<details>` "สูตรและที่มา" ท้ายหน้าคลัง

**Tech Stack:** React 19 + Vite · vitest + @testing-library/react (jsdom)

**Spec:** `docs/superpowers/specs/2026-09-26-creative-page-hierarchy-design.md`

## Global Constraints

- ทศนิยมห้ามปัด: เงิน 2 ตำแหน่ง · อัตราส่วนตัด 2 ตำแหน่ง (ใช้ `fmtMoney` / `fmtPct` / `fmtNum` ของ `dash/charts/theme.js` เท่านั้น)
- ไม่รู้ = null / "—" ห้ามเดาเป็น 0
- ไม่เปลี่ยนความหมาย `ctr` (คลิกทั้งหมด) — ยังเป็นฐานของกฎเริ่มล้าและกฎคัดครีเอทีฟ
- ไม่ commit / push จนกว่าอาร์ตสั่ง (กฎข้อ 2) — ขั้น commit ในแผนนี้ = "รายงานว่าพร้อม commit"
- ไม่แตะ Supabase / Vercel

## File Structure

| ไฟล์ | หน้าที่ในแผนนี้ |
|---|---|
| `src/modules/marketing/ads/AdsView.jsx` | บั๊ก `st.tone` (Task 1) |
| `src/modules/marketing/campaigns/CampaignDetail.jsx` | บั๊กป้าย "ข้อมูลจำลอง" (Task 1) |
| `src/modules/marketing/adsOverview.js` | `adsCreativeRows`: linkClicks/linkCtr/linkCpc · ROAS null เมื่อไม่มียอด · adsets ต่อแคมเปญ (Task 2) |
| `src/modules/marketing/creatives/CreativeCard.jsx` + `creativeCard.css` | 4 ช่อง · ไม่มีแคปชั่น (Task 3) |
| `src/modules/marketing/creatives/CreativeTable.jsx` | CTR ลิงก์ (Task 4) |
| `src/modules/marketing/creatives/CreativeViewer.jsx` + `creativeViewer.css` | กลุ่มคลิกลิงก์ · ชุดโฆษณา · ตัดบรรทัดเทคนิค (Task 5) |
| `src/modules/marketing/ads/AdsSourceControl.jsx` + ผู้เรียก 3 หน้า | ขึ้นเฉพาะมีปัญหา · ธงวันนี้ตาม prop (Task 6) |
| `src/modules/marketing/creatives/CreativeLibraryView.jsx` + `creativeLibrary.css` | "สูตรและที่มา" (Task 7) |

---

### Task 1: บั๊ก 2 ตัว (systematic-debugging → TDD)

**Files:** Modify `ads/AdsView.jsx:263` · `campaigns/CampaignDetail.jsx:98` · Test `tests/channelCard.component.test.jsx`, `tests/campaignDetail.component.test.jsx`

- [ ] เทสล้ม: ChannelCard กด "ดูรายละเอียด" แล้วไม่ throw และเห็น "CPL ในเดือน"
```jsx
it("กดดูรายละเอียดแล้วไม่พัง (บั๊ก st.tone 26 ก.ย.)", () => {
  render(<ChannelCard c={{ ...c, cplSeries: [90, 95] }} />);
  fireEvent.click(screen.getByRole("button", { name: /ดูรายละเอียด/ }));
  expect(screen.getByText("CPL ในเดือน")).toBeTruthy();
});
```
- [ ] เทสล้ม: CampaignDetail ไม่มีคำว่า "ข้อมูลจำลอง"
```jsx
it("ที่มาไม่อ้างว่าเป็นข้อมูลจำลอง", () => {
  render(<CampaignDetail row={row} compareLabel="ช่วงก่อนหน้า" />);
  expect(document.body.textContent).not.toContain("ข้อมูลจำลอง");
});
```
- [ ] แก้: `tone={st.tone}` → `tone={tone}` (ตัวแปร `tone = paceTone(state)` มีอยู่แล้วในฟังก์ชัน) · บรรทัดที่มา → `ค่าแอดรายวันจาก Meta · รันมา {row.days} วันในช่วง`
- [ ] รันสองไฟล์เทส → PASS

### Task 2: ตัวเลขใหม่ใน `adsCreativeRows`

**Files:** Modify `adsOverview.js` (ส่วน `adsCreativeRows` ~บรรทัด 735–805) · Test `tests/adsOverview.test.js`

**Interfaces — Produces** (ต่อชิ้น และต่อแถวใน `perCampaign`):
- `linkClicks: number|null` — Σ`m.link_clicks`; ไม่มีการ์ดไหนมี `link_clicks` = null
- `linkCtr: number|null` = linkClicks ÷ impressions · `linkCpc: number|null` = spend ÷ linkClicks
- `roas: number|null` — **null เมื่อไม่มียอดที่ Meta เห็น** (`!(purchases > 0) && !(revenue > 0)`)
- `perCampaign[].adsets: string[]` — ชื่อชุดโฆษณา (`c.ad_group`) ไม่ซ้ำ เรียงตามเจอ

- [ ] เทสล้ม (เพิ่มใน describe ของ adsCreativeRows):
```js
it("CTR ลิงก์ · CPC ลิงก์ จาก link_clicks · ไม่มี link_clicks = null ไม่เดาจากคลิกทั้งหมด", () => {
  const withLink = cardFor({ metrics: { spend: 100, leads: 2, revenue: 0, purchases: 0, impressions: 1000, clicks: 40, link_clicks: 10, reach: 800 } });
  const [row] = adsCreativeRows([withLink], RANGE, BRANDS);
  expect(row).toMatchObject({ linkClicks: 10, linkCtr: 0.01, linkCpc: 10 });
  const [noLink] = adsCreativeRows([cardFor({ metrics: { spend: 100, leads: 2, revenue: 0, impressions: 1000, clicks: 40, reach: 800 } })], RANGE, BRANDS);
  expect(noLink).toMatchObject({ linkClicks: null, linkCtr: null, linkCpc: null });
});
it("ROAS = null เมื่อ Meta ไม่เห็นการซื้อ/รายได้ (ชิ้นทักแชท) · มีรายได้ = คิดตามจริง", () => {
  const chat = adsCreativeRows([cardFor({ metrics: { spend: 100, leads: 5, revenue: 0, purchases: 0, impressions: 1000, clicks: 10, reach: 900 } })], RANGE, BRANDS)[0];
  expect(chat.roas).toBeNull();
  expect(chat.perCampaign[0].roas).toBeNull();
  const sale = adsCreativeRows([cardFor({ metrics: { spend: 100, leads: 5, revenue: 7, purchases: 1, impressions: 1000, clicks: 10, reach: 900 } })], RANGE, BRANDS)[0];
  expect(sale.roas).toBe(0.07);
});
it("perCampaign บอกชื่อชุดโฆษณาที่ชิ้นนี้อยู่", () => {
  const rows = adsCreativeRows([cardFor({ ad_group: "หว่าน 25-45" }), cardFor({ ad_group: "INT หน่วยงาน" }), cardFor({ ad_group: "หว่าน 25-45" })], RANGE, BRANDS);
  expect(rows[0].perCampaign[0].adsets).toEqual(["หว่าน 25-45", "INT หน่วยงาน"]);
});
```
(`cardFor` = helper ในไฟล์เทสที่สร้างการ์ดครีเอทีฟชิ้นเดียวกัน · ถ้ายังไม่มี ให้สร้างจาก fixture เดิมของ describe นั้น)
- [ ] รัน → FAIL
- [ ] โค้ด: สะสม `linkClicks` (null-aware: เริ่ม `undefined`, เจอ `m.link_clicks != null` บวก) ทั้งชิ้นและ `pc` · `pc.adsets = new Set()` เพิ่ม `c.ad_group` · ฟังก์ชันช่วย
```js
const salesRoas = (revenue, purchases, spend) => (purchases > 0 || revenue > 0 ? roasOf(revenue, spend) : null);
```
  ใช้แทน `roasOf(...)` ทั้งชิ้นและ `perCampaign` · map `perCampaign` เพิ่ม `linkClicks`, `linkCtr`, `adsets: [...adsets]`
- [ ] รันไฟล์ + เทสทั้งชุด → แก้เทสเดิมที่พึ่ง ROAS 0 ของชิ้นไม่มียอด (บันทึกว่าคำแนะนำชิ้นทักแชทไม่ขึ้น "ควรหยุด" จาก ROAS 0 อีก)

### Task 3: การ์ด 4 ช่อง ไม่มีแคปชั่น

**Files:** Modify `creatives/CreativeCard.jsx`, `creativeCard.css` · Test `tests/creativeCard.component.test.jsx`
**Consumes:** `row.cpl`, `row.linkCtr`, `row.roas` (Task 2)

- [ ] เทสล้ม:
```jsx
it("ตัวเลข 4 ช่อง: ค่าแอด · ต่อผลลัพธ์ · CTR ลิงก์ · ROAS · ไม่มีแคปชั่น", () => {
  render(<CreativeCard row={{ ...row, cpl: 43.67, linkCtr: 0.0123, roas: null }} onOpen={() => {}} />);
  expect([...document.querySelectorAll(".cc-facts dt")].map((n) => n.textContent)).toEqual(["ค่าแอด", "ต่อผลลัพธ์", "CTR ลิงก์", "ROAS"]);
  expect(document.querySelector(".cc-copy")).toBeNull();
  const roas = [...document.querySelectorAll(".cc-facts dd")][3];
  expect(roas.textContent).toBe("—");
  expect(roas.className).not.toContain("bad");
});
it("ROAS แดงเฉพาะมียอดจริงแต่ต่ำกว่า 1", () => {
  render(<CreativeCard row={{ ...row, roas: 0.5 }} onOpen={() => {}} />);
  expect([...document.querySelectorAll(".cc-facts dd")][3].className).toContain("bad");
});
```
- [ ] โค้ด: ลบ `copy` และ `<p className="cc-copy">` · `cc-facts` 4 ช่อง (`fmtMoney(row.cpl)` / `fmtPct(row.linkCtr)` / ROAS) · CSS `.cc-facts` เป็น `repeat(4,minmax(0,1fr))` · ลบ `.cc-copy`
- [ ] PASS

### Task 4: ตาราง CTR ลิงก์

**Files:** Modify `creatives/CreativeTable.jsx:35,49` · Test `tests/creativeTable.component.test.jsx`
- [ ] เทสล้ม: หัวคอลัมน์ "CTR ลิงก์" และค่า `linkCtr` (fixture `linkCtr: 0.0123` → "1.23%")
- [ ] โค้ด: `<th>CTR ลิงก์</th>` · `row.linkCtr`
- [ ] PASS

### Task 5: หน้าต่างครีเอทีฟ

**Files:** Modify `creatives/CreativeViewer.jsx`, `creativeViewer.css` · Test `tests/creativeViewer.component.test.jsx`
- [ ] เทสล้ม:
  - กลุ่ม "การเข้าถึง" มี dt `คลิกลิงก์`, `CTR ลิงก์`, `CPC ลิงก์` และยังมี `CTR ทั้งหมด`
  - ตารางแคมเปญ: หัว "CTR ลิงก์" · ใต้ชื่อแคมเปญมี `หว่าน 25-45 · INT หน่วยงาน`
  - ไม่รู้สถานะ = ไม่มี `.cv-state` และไม่มีข้อความ "รอบดึงตี 5"
- [ ] โค้ด: Group การเข้าถึง = การแสดงผล · เข้าถึง · ความถี่ · คลิกลิงก์ · CTR ลิงก์ · CPC ลิงก์ · CTR ทั้งหมด · CTR ครึ่งแรก→หลัง · `.cv-state` แสดงเมื่อ `status.key !== "unknown"` พร้อมเวลา (ถ้ามี) · `<th>` แคมเปญเพิ่ม `<small className="cv-adsets">{p.adsets.join(" · ")}</small>` เมื่อมี
- [ ] PASS

### Task 6: แถบที่มาข้อมูลขึ้นเฉพาะมีปัญหา

**Files:** Modify `ads/AdsSourceControl.jsx` · ผู้เรียก `ads/AdsWorkspace.jsx:96,220`, `campaigns/CampaignsView.jsx:55`, `creatives/CreativeLibraryView.jsx:106` · Test `tests/adsSourceNotice.component.test.jsx`
**Produces:** `AdsSourceNotice({ ads, todayOnly = false })`
- [ ] เทสล้ม:
  - verdict `ok` → render ว่าง (`container.firstChild === null`)
  - verdict `warn`/`muted` → ยังเห็นแถบ + ปุ่มโหลดใหม่ + fold ที่มา
  - ธง "วันนี้ยังไม่สิ้นสุด" ขึ้นเฉพาะ `todayOnly && summary.provisionalToday`
  - loading / error / empty คงเดิม
- [ ] โค้ด: `if (verdict.state === "ok" && !(todayOnly && summary.provisionalToday)) return null;` · ธงใช้ `todayOnly && summary.provisionalToday` · ผู้เรียกส่ง `todayOnly={period === "today"}`
- [ ] ปรับเทสเดิม "ชั้นที่ 1–3" ให้ใช้ fixture ที่มีแหล่งมีปัญหา
- [ ] PASS

### Task 7: "สูตรและที่มา" ท้ายหน้าคลัง

**Files:** Modify `creatives/CreativeLibraryView.jsx`, `creativeLibrary.css` · Test `tests/creativeLibraryView.component.test.jsx`
- [ ] เทสล้ม: ไม่มี `.cl-formats .aw-key` · มี `<details>` summary "สูตรและที่มา" ปิดไว้ · เปิดแล้วเห็น "CTR ลิงก์" และ "รูปแบบมาจาก Meta"
- [ ] โค้ด: ลบ `<p className="aw-key">` ใต้ตารางรูปแบบ · ท้าย `<main>` เพิ่ม
```jsx
<details className="cl-notes"><summary>สูตรและที่มา</summary><ul>
  <li>CTR ลิงก์ = คลิกลิงก์ ÷ การแสดงผล · CTR ทั้งหมดนับทุกคลิก (ไลก์ กดดูรูป) ใช้เป็นฐานกฎเริ่มล้าและกฎคัดครีเอทีฟ</li>
  <li>ROAS = รายได้ที่ Meta เห็น ÷ ค่าแอด · Meta ไม่เห็นการซื้อ (ชิ้นทักแชท) = "—" ไม่ใช่ 0</li>
  <li>รูปแบบมาจาก Meta ถ้าไม่ระบุ อ่านจากคำนำหน้าชื่อ (VDO · PIC · Album) · "ต่ำสุด" เทียบเฉพาะรูปแบบที่มีตั้งแต่ 3 ชิ้น</li>
  <li>สถานะเปิด/ปิดมาจากรอบดึง 05:00 ทุกวัน · ชิ้นนอก 400 อันดับค่าแอดไม่มีภาพ/สถานะ</li>
</ul></details>
```
- [ ] PASS

### Task 8: ตรวจก่อนบอกเสร็จ

- [ ] `npx vitest run` + `npm run lint` + `npm run build` เขียว
- [ ] ภาพจริง JK (:5173) 3 ขนาด 1440 / 768 / 375: หน้าคลัง (รูป + ตาราง) · หน้าต่างครีเอทีฟ · หน้าแคมเปญ (แถบที่มาหาย)
- [ ] `design-critic` + `anti-slop-designer` บนภาพจริง → แก้ข้อ blocking/significant
- [ ] รายงานอาร์ต: หลักฐาน + ผลกระทบคำแนะนำชิ้นทักแชท + พร้อม commit (รอสั่ง)
