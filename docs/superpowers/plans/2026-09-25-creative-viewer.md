# หน้าต่างครีเอทีฟตัวเดียว (ทาง A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทน "ตารางครีเอทีฟกลาง" ของ v0.14.0 ด้วยหน้าต่างครีเอทีฟตัวเดียว (ไม่มีอะไรเด้งซ้อน) + รายการครีเอทีฟที่เหมาะกับพื้นที่ของแต่ละหน้า + ข้อมูลรายแคมเปญในหน้าต่าง

**Architecture:** ข้อมูลรายแคมเปญคิดใน `adsCreativeRows` (pure) → `CreativeViewer` (dialog เดียว มีแท็บ ภาพและข้อมูล / ตัวอย่างจาก Meta, ‹ › เลื่อนชิ้น) ใช้ร่วมทั้งหน้าคลังและแผงแคมเปญ → หน้าคลังเปิดมาเป็นการ์ดรูปเต็ม ส่วนบนยุบเหลือแถบเดียว · แผงแคมเปญใช้ `CreativeList` กะทัดรัด · ลิงก์ `?open=` เปิดแผงแคมเปญ

**Tech Stack:** React 19 + Vite · vitest + @testing-library/react (jsdom) · lucide-react · CSS token ของ `.mkt-root`

**Spec:** `docs/superpowers/specs/2026-09-25-creative-viewer-design.md`

## Global Constraints

- ไม่มีหน้าต่างเด้งซ้อนกันในทุกเส้นทาง — ตัวอย่างจาก Meta เป็นแท็บ ไม่ใช่หน้าต่างใหม่
- คลิกรูปในหน้าต่าง = เลื่อนภาพ ไม่เปิดอย่างอื่น · ไม่มีการ์ดลอยตอนชี้เมาส์
- ตัวเลข: เงิน 2 ตำแหน่งตัดไม่ปัด (`fmtMoney`) · ไม่รู้ = "—" ไม่ใช่ 0 · สถานะไม่รู้ = "ไม่ทราบสถานะ"
- หน้าคลังเปิดมาเป็นรูปเต็มเสมอ (`view` ค่าเริ่ม `cards`) · ตารางผ่าน `?view=table` เท่านั้น ไม่จำข้ามการเปิดหน้า
- ไม่รวม 15 กรณีชื่อซ้ำคนละโพสต์ (กุญแจรวมยังเป็นรหัสโพสต์)
- สีทุกตัวใช้ token (`--line --ink --ink-soft --surface --surface-2 --ok --bad --warn ...`) ใช้ได้ทั้งธีมสว่าง/มืด · ห้าม emoji เป็นไอคอน
- git: **ไม่ commit/push เอง** (กติกาอาร์ต) — จบแต่ละงานรันเทส แล้วรายงานว่าพร้อม commit
- ตอบ/ข้อความบนจอเป็นภาษาไทย

---

### Task 1: ข้อมูลรายแคมเปญ + ดัชนีสถานะแคมเปญ

**Files:**
- Modify: `src/modules/marketing/adsOverview.js` (ฟังก์ชัน `adsCreativeRows`)
- Modify: `src/modules/marketing/creatives/creativeStatus.js`
- Test: `tests/adsOverview.test.js`, `tests/creativeStatus.test.js`

**Interfaces:**
- Produces: `row.perCampaign: Array<{ campaign: string, spend: number, leads: number, revenue: number|null, purchases: number|null|undefined, cpl: number|null, ctr: number|null, roas: number|null, status: string|null, statusAt: string|null }>` เรียงค่าแอดมากก่อน
- Produces: `campaignStatusIndex(rows) → Map<string, {key,label,tone,on}>` ใน `creativeStatus.js`

- [ ] **Step 1: เขียนเทสที่ล้ม** — ต่อท้าย describe ของ `adsCreativeRows` ใน `tests/adsOverview.test.js` (ใช้ `shot`, `RANGE_M`, `brands` ของ describe นั้น):

```js
  /* 25 ก.ย.: หน้าต่างครีเอทีฟต้องบอกว่าชิ้นนี้อยู่แคมเปญไหน · แต่ละแคมเปญได้เท่าไร · เปิด/ปิด */
  it("แยกยอดรายแคมเปญ · ผลรวมเท่ายอดทั้งชิ้น · สถานะมาจากโฆษณาในแคมเปญนั้น (มีตัวเปิด = ACTIVE)", () => {
    const asset = (adId, status) => ({ provider: "meta", connectionId: "conn-1", storyId: "1_2", adId, name: "โพสต์เดียว", media: [], status, statusAt: "2026-07-20T22:05:00Z" });
    const [row] = adsCreativeRows([
      { ...shot("a", "โพสต์เดียว", 5), campaign: "C1", creative_data: asset("ad-1", "PAUSED") },
      { ...shot("b", "โพสต์เดียว", 6), campaign: "C1", creative_data: asset("ad-2", "ACTIVE") },
      { ...shot("c", "โพสต์เดียว", 7, { spend: 500, leads: 0 }), campaign: "C2", creative_data: asset("ad-3", "CAMPAIGN_PAUSED") },
    ], RANGE_M, brands);
    expect(row.perCampaign.map((p) => p.campaign)).toEqual(["C1", "C2"]);
    expect(row.perCampaign.reduce((n, p) => n + p.spend, 0)).toBe(row.spend);
    expect(row.perCampaign[0]).toMatchObject({ spend: 4000, leads: 20, cpl: 200, status: "ACTIVE" });
    expect(row.perCampaign[1]).toMatchObject({ spend: 500, leads: 0, cpl: null, status: "CAMPAIGN_PAUSED" });
    expect(row.perCampaign[0].ctr).toBeCloseTo(0.02);
  });
```

และต่อท้าย `tests/creativeStatus.test.js` (เพิ่ม `campaignStatusIndex` ใน import บรรทัดบน):

```js
describe("campaignStatusIndex — สถานะแคมเปญจากทุกชิ้นในแคมเปญเดียวกัน", () => {
  const row = (per) => ({ perCampaign: per });
  it("รวมข้ามชิ้น: มีชิ้นไหนเปิดในแคมเปญนั้น = เปิดอยู่ · แคมเปญหยุด = ปิดอยู่ · ไม่รู้ = ไม่ทราบ", () => {
    const index = campaignStatusIndex([
      row([{ campaign: "C1", status: "PAUSED" }, { campaign: "C2", status: "CAMPAIGN_PAUSED" }]),
      row([{ campaign: "C1", status: "ACTIVE" }, { campaign: "C3", status: null }]),
    ]);
    expect(index.get("C1")).toMatchObject({ key: "active", label: "เปิดอยู่" });
    expect(index.get("C2")).toMatchObject({ key: "paused", label: "ปิดอยู่" });
    expect(index.get("C3")).toMatchObject({ key: "unknown" });
  });
});
```

- [ ] **Step 2: รันให้ล้ม** — `npx vitest run tests/adsOverview.test.js tests/creativeStatus.test.js` → FAIL (`perCampaign` undefined / `campaignStatusIndex` is not a function)

- [ ] **Step 3: เขียนโค้ด** — ใน `adsCreativeRows` (adsOverview.js)
  - ตอนสร้าง `row` ใหม่ เพิ่ม `byCampaign: new Map(),` ต่อจาก `complete: true,`
  - แทนบรรทัด `row.campaigns.add(c.campaign ?? c.brief?.campaign ?? "ไม่ระบุแคมเปญ");` ด้วย:

```js
    const campName = c.campaign ?? c.brief?.campaign ?? "ไม่ระบุแคมเปญ";
    row.campaigns.add(campName);
    /* ยอดแยกตามแคมเปญ — หน้าต่างครีเอทีฟแสดง "อยู่ใน N แคมเปญ" (สเปก 2026-09-25) · กติกา null เหมือนยอดรวมของชิ้น */
    let pc = row.byCampaign.get(campName);
    if (!pc) { pc = { campaign: campName, spend: 0, leads: 0, revenue: 0, purchases: undefined, impressions: 0, clicks: 0, status: null, statusAt: null }; row.byCampaign.set(campName, pc); }
    pc.spend += m.spend ?? 0;
    pc.leads += m.leads ?? 0;
    pc.revenue = pc.revenue == null || m.revenue == null ? null : pc.revenue + m.revenue;
    pc.purchases = pc.purchases === null || m.purchases == null ? null : (pc.purchases ?? 0) + m.purchases;
    pc.impressions += m.impressions ?? 0;
    pc.clicks += m.clicks ?? m.link_clicks ?? 0;
    // โพสต์เดียวอาจอยู่หลายชุดโฆษณาในแคมเปญเดียว — มีตัวไหนเปิด = ถือว่าเปิดในแคมเปญนั้น
    if (asset?.status && (pc.status == null || asset.status === "ACTIVE")) { pc.status = asset.status; pc.statusAt = asset.statusAt ?? null; }
```

  - ใน `.map(({ early, late, campaigns, ... }) =>` เพิ่ม `byCampaign` ในการแยกตัวแปร และเพิ่มใน `base`:

```js
      perCampaign: [...byCampaign.values()].map(({ impressions, clicks, ...p }) => ({
        ...p, cpl: p.leads > 0 ? p.spend / p.leads : null, ctr: share(clicks, impressions), roas: roasOf(p.revenue, p.spend),
      })).sort((a, b) => b.spend - a.spend),
```

  ต่อท้าย `creativeStatus.js`:

```js
/** สถานะแคมเปญจากทุกชิ้นในแคมเปญเดียวกัน (row.perCampaign[].status) → Map<ชื่อแคมเปญ, สถานะ> */
export function campaignStatusIndex(rows = []) {
  const byCampaign = new Map();
  for (const row of rows) for (const p of row?.perCampaign ?? []) {
    byCampaign.set(p.campaign, [...(byCampaign.get(p.campaign) ?? []), { asset: { status: p.status } }]);
  }
  return new Map([...byCampaign].map(([name, ads]) => [name, campaignStatusOf(ads)]));
}
```

- [ ] **Step 4: รันให้ผ่าน** — คำสั่งเดิม → PASS · แล้ว `npx vitest run` ทั้งชุดต้องเขียว

### Task 2: CreativeViewer — หน้าต่างเดียว มีแท็บ + เลื่อนชิ้น

**Files:**
- Create: `src/modules/marketing/creatives/CreativeViewer.jsx`, `src/modules/marketing/creatives/creativeViewer.css`
- Modify: `src/modules/marketing/creatives/CreativePreview.jsx` (แยก `MetaPreviewPane` ออกมา export · CreativePreview เดิมเรียกใช้ pane นี้)
- Delete: `src/modules/marketing/creatives/CreativeDetail.jsx`
- Test: `tests/creativeViewer.component.test.jsx` (แทนส่วน CreativeDetail ใน `tests/creativeTable.component.test.jsx` — ลบ describe "CreativeDetail (ดูเต็ม)")

**Interfaces:**
- Consumes: `row.perCampaign`, `campaignStatusIndex` (Task 1) · `adStatusOf`, `actionLabel`, `actionTone` (creativeStatus.js)
- Produces: `<CreativeViewer rows index onIndex onClose canPreview campaignStatus highlightCampaign />`
  - `rows` ลำดับที่แสดงอยู่ · `index` ตัวที่เปิด · `onIndex(i)` เปลี่ยนชิ้น · `campaignStatus: Map` · `highlightCampaign?: string`
- Produces: `export function MetaPreviewPane({ row })` ใน CreativePreview.jsx

- [ ] **Step 1: เขียนเทสที่ล้ม** — `tests/creativeViewer.component.test.jsx`:

```jsx
// @vitest-environment jsdom
/* หน้าต่างครีเอทีฟตัวเดียว (สเปก 2026-09-25) — ห้ามมี dialog ซ้อน · ‹ › เลื่อนชิ้น · อยู่ใน N แคมเปญ */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: ({ onPreview }) => <div data-testid="media" data-open={onPreview ? "yes" : "no"} /> }));
vi.mock("../src/modules/marketing/creatives/CreativePreview.jsx", () => ({ MetaPreviewPane: () => <div data-testid="meta-pane">iframe</div> }));
const { CreativeViewer } = await import("../src/modules/marketing/creatives/CreativeViewer.jsx");
afterEach(cleanup);

const asset = (status = "ACTIVE") => ({ provider: "meta", connectionId: "c1", adId: "11", status, statusAt: "2026-09-25T05:20:00Z", media: [], storyId: "1_2",
  copy: { headline: "หัวข้อ", primaryText: "ข้อความโฆษณาเต็มๆ ยาวมาก", callToAction: "MESSAGE_PAGE" } });
const row = (key, patch = {}) => ({ key, creative: `ชิ้น ${key}`, brand: "TEAMDEE", platform: "Meta Ads", campaigns: ["C1", "C2"], spend: 1000.555, ctr: 0.0304, frequency: 1.2, roas: 0.5,
  action: "Stop", tone: "rose", why: "ROAS ต่ำ", asset: asset(),
  perCampaign: [{ campaign: "C1", spend: 800, leads: 4, cpl: 200, ctr: 0.03, roas: 0.4, status: "ACTIVE" }, { campaign: "C2", spend: 200.555, leads: 0, cpl: null, ctr: null, roas: null, status: "CAMPAIGN_PAUSED" }], ...patch });
const rows = [row("a"), row("b"), row("c")];
const status = new Map([["C1", { key: "active", label: "เปิดอยู่", tone: "emerald", on: true }], ["C2", { key: "paused", label: "ปิดอยู่", tone: "zinc", on: false }]]);
const show = (props = {}) => render(<MemoryRouter><CreativeViewer rows={rows} index={0} onIndex={() => {}} onClose={() => {}} campaignStatus={status} {...props} /></MemoryRouter>);

describe("CreativeViewer", () => {
  it("dialog เดียว · ชื่อชิ้นงาน · ตำแหน่ง 1/3 · รูปในหน้าต่างไม่เปิดอะไรต่อ", () => {
    show();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "ชิ้น a" })).toBeTruthy();
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByTestId("media").dataset.open).toBe("no");
  });
  it("อยู่ใน N แคมเปญ: แถวละแคมเปญ · สถานะแคมเปญ + สถานะชิ้นในแคมเปญ · ตัวเลขตัดไม่ปัด · ไม่รู้ = —", () => {
    show();
    const section = screen.getByRole("region", { name: "อยู่ใน 2 แคมเปญ" });
    const rowsIn = within(section).getAllByRole("row").slice(1);
    expect(within(rowsIn[0]).getByText("C1")).toBeTruthy();
    expect(rowsIn[0].textContent).toContain("เปิดอยู่");
    expect(rowsIn[0].textContent).toContain("฿800.00");
    expect(rowsIn[1].textContent).toContain("ปิดอยู่");
    expect(rowsIn[1].textContent).toContain("ปิด · แคมเปญหยุด");
    expect(rowsIn[1].textContent).toContain("฿200.55");
    expect(rowsIn[1].textContent).toContain("—");
    expect(within(rowsIn[0]).getByRole("link", { name: "C1" }).getAttribute("href")).toBe("/mkt/campaigns?open=C1");
  });
  it("‹ › และลูกศรคีย์บอร์ดเปลี่ยนชิ้น · สุดขอบปุ่มกดไม่ได้", () => {
    const onIndex = vi.fn();
    show({ onIndex });
    expect(screen.getByRole("button", { name: "ชิ้นก่อนหน้า" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "ชิ้นถัดไป" }));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(1);
    expect(onIndex).toHaveBeenCalledTimes(2);
  });
  it("แท็บตัวอย่างจาก Meta อยู่ในหน้าต่างเดิม (ไม่มี dialog ที่สอง) · ดูไม่ได้ = ไม่มีแท็บ", () => {
    const { unmount } = show({ canPreview: true });
    fireEvent.click(screen.getByRole("tab", { name: "ตัวอย่างจาก Meta" }));
    expect(screen.getByTestId("meta-pane")).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    unmount();
    show({ canPreview: false });
    expect(screen.queryByRole("tab", { name: "ตัวอย่างจาก Meta" })).toBeNull();
  });
  it("Esc ปิด · ข้อความโฆษณาเต็ม · คำแนะนำภาษาไทย", () => {
    const onClose = vi.fn();
    show({ onClose });
    expect(screen.getByText("ข้อความโฆษณาเต็มๆ ยาวมาก")).toBeTruthy();
    expect(screen.getByText("ควรหยุด")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: รันให้ล้ม** — `npx vitest run tests/creativeViewer.component.test.jsx` → FAIL (ไม่มีไฟล์)

- [ ] **Step 3: แยก MetaPreviewPane** — ใน `CreativePreview.jsx` ย้ายส่วน state/effect เรียก ads-preview + แท็บตำแหน่ง + iframe ไปเป็น:

```jsx
/** ตัวอย่างโฆษณาจริงจาก Meta แบบฝังในหน้าต่างอื่น (ไม่มีฉากหลัง/ปุ่มปิดของตัวเอง) — src ตรวจด้วย isPreviewSrc เหมือนเดิม */
export function MetaPreviewPane({ row }) {
  const asset = row.asset;
  const [format, setFormat] = useState(FORMATS[0][0]);
  const [state, setState] = useState({ status: "loading", src: null, error: null });
  useEffect(() => { /* เนื้อเดิมของ effect ที่เรียก apiClient.ads.creativePreview + cache */ }, [asset.adId, asset.connectionId, format]);
  const height = FORMATS.find(([key]) => key === format)?.[2] ?? 690;
  return <div className="cl-preview-pane">
    <div className="cl-preview-formats" role="tablist" aria-label="ตำแหน่งที่แสดงโฆษณา">{/* ปุ่มเดิม */}</div>
    <div className="cl-preview-frame" style={{ minHeight: Math.min(height, 720) }}>{/* loading / error / iframe เดิม */}</div>
  </div>;
}
```

  (ย้ายโค้ดเดิมทั้งก้อนมาวางตรงนี้โดยไม่แก้ logic — effect, cache, FORMATS, iframe `sandbox`/`referrerPolicy` คงเดิม) · `CreativePreview` เดิมให้ render `<MetaPreviewPane row={row} />` แทนส่วนที่ย้ายออก

- [ ] **Step 4: เขียน CreativeViewer.jsx**

```jsx
/* หน้าต่างครีเอทีฟตัวเดียว (สเปก 2026-09-25 ทาง A) — ใช้ทั้งหน้าคลังและแผงแคมเปญ
   ไม่มีอะไรเด้งซ้อน: ตัวอย่างจาก Meta เป็นแท็บ · คลิกรูป = เลื่อนภาพ (CreativeMedia ไม่ได้รับ onPreview)
   ‹ › และลูกศรซ้าย/ขวา = ชิ้นก่อน/ถัดไป · Esc ปิด */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { fmtInt, fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { postLinksOf } from "../ads/metaCreativeContract.js";
import { CreativeMedia } from "./CreativeMedia.jsx";
import { MetaPreviewPane } from "./CreativePreview.jsx";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import "./creativePreview.css";
import "./creativeViewer.css";

const times = (x) => (x == null ? "—" : `${fmtNum(x, 2)}x`);
const pct = (x) => (x == null ? "—" : fmtPct(x, 2));
const when = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(t)) : null;
};
export function Dot({ status, prefix = "" }) {
  return <span className={`cv-status cv-status--${status.tone}`}><i aria-hidden="true" />{prefix}{status.label}</span>;
}

export function CreativeViewer({ rows, index, onIndex, onClose, canPreview = false, campaignStatus = new Map(), highlightCampaign = null }) {
  const row = rows[index];
  const [tab, setTab] = useState("info");
  const closeRef = useRef(null);
  const nav = useRef({ index, count: rows.length, onIndex, onClose });
  nav.current = { index, count: rows.length, onIndex, onClose };
  const previewable = Boolean(canPreview && row?.asset?.adId && row?.asset?.connectionId);

  useEffect(() => { setTab("info"); }, [index]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => {
      const { index: i, count, onIndex: go, onClose: close } = nav.current;
      if (event.key === "Escape") close();
      // ลูกศรในกรอบรูปใช้เลื่อนภาพ (CreativeMedia จัดการเอง) — เลื่อนชิ้นเฉพาะเมื่อโฟกัสไม่อยู่ในกรอบรูป
      if (event.target?.closest?.(".cl-media")) return;
      if (event.key === "ArrowRight" && i < count - 1) go(i + 1);
      if (event.key === "ArrowLeft" && i > 0) go(i - 1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, []);
  if (!row) return null;

  const status = adStatusOf(row.asset?.status);
  const statusAt = when(row.asset?.statusAt);
  const copy = row.asset?.copy ?? {};
  const links = postLinksOf(row.asset);
  const per = row.perCampaign ?? [];
  const facts = [
    ["ค่าแอด", fmtMoney(row.spend)], ["CTR", pct(row.ctr)], ["ความถี่", times(row.frequency)], ["ROAS", times(row.roas)],
    row.cpl !== undefined && [row.resultLabel && row.resultLabel !== "ผลลัพธ์" ? `ต่อ${row.resultLabel}` : "ต่อผลลัพธ์", row.cpl == null ? "—" : fmtMoney(row.cpl)],
    row.purchases !== undefined && ["การซื้อ (Meta)", row.purchases == null ? "—" : fmtInt(row.purchases)],
  ].filter(Boolean);

  return <div className="cl-preview-layer" role="presentation">
    <button type="button" className="cl-preview-backdrop" aria-label="ปิด" onClick={onClose} tabIndex={-1} />
    <section className="cl-preview cv" role="dialog" aria-modal="true" aria-labelledby="cv-title">
      <header className="cv-head">
        <div><span>{[row.brand, row.platform].filter(Boolean).join(" · ")}</span><h2 id="cv-title">{row.creative}</h2></div>
        <div className="cv-nav">
          <button type="button" aria-label="ชิ้นก่อนหน้า" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={16} /></button>
          <span>{index + 1} / {rows.length}</span>
          <button type="button" aria-label="ชิ้นถัดไป" disabled={index >= rows.length - 1} onClick={() => onIndex(index + 1)}><ChevronRight size={16} /></button>
          <button ref={closeRef} type="button" className="cl-preview-close" aria-label="ปิด" onClick={onClose}><X size={16} /></button>
        </div>
      </header>
      {previewable && <div className="cv-tabs" role="tablist" aria-label="มุมมอง">
        <button type="button" role="tab" aria-selected={tab === "info"} onClick={() => setTab("info")}>ภาพและข้อมูล</button>
        <button type="button" role="tab" aria-selected={tab === "meta"} onClick={() => setTab("meta")}>ตัวอย่างจาก Meta</button>
      </div>}
      {tab === "meta" && previewable ? <div className="cv-body cv-body--meta"><MetaPreviewPane row={row} /></div> : <div className="cv-body">
        <div className="cv-media"><CreativeMedia key={row.key} row={row} /></div>
        <div className="cv-side">
          <div className="cv-state"><Dot status={status} prefix="โฆษณา" /><small>{statusAt ? `สถานะจาก Meta · ${statusAt}` : "ยังไม่มีสถานะจาก Meta"}</small></div>
          <dl className="cv-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          <p className={`cv-advice cv-advice--${actionTone(row)}`}><b>{actionLabel(row)}</b>{row.why && <span>{row.why}</span>}</p>
          {copy.headline && <p className="cv-copy"><small>หัวข้อ</small><strong>{copy.headline}</strong></p>}
          {copy.primaryText && <p className="cv-copy"><small>ข้อความโฆษณา</small><span>{copy.primaryText}</span></p>}
          {(links.length > 0 || row.asset?.destinationUrl) && <div className="cl-preview-links">
            {links.map((link) => <a key={link.key} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={12} aria-hidden="true" /></a>)}
            {row.asset?.destinationUrl && <a href={row.asset.destinationUrl} target="_blank" rel="noreferrer">หน้าปลายทาง <ExternalLink size={12} aria-hidden="true" /></a>}
          </div>}
        </div>
        {per.length > 0 && <section className="cv-campaigns" aria-label={`อยู่ใน ${per.length} แคมเปญ`}>
          <h3>อยู่ใน {per.length} แคมเปญ</h3>
          <table>
            <thead><tr><th>แคมเปญ</th><th>สถานะแคมเปญ</th><th>ชิ้นนี้</th><th className="num">ค่าแอด</th><th className="num">ผลลัพธ์</th><th className="num">CTR</th><th className="num">ROAS</th></tr></thead>
            <tbody>{per.map((p) => <tr key={p.campaign} className={p.campaign === highlightCampaign ? "is-here" : undefined}>
              <th><Link to={`/mkt/campaigns?open=${encodeURIComponent(p.campaign)}`} onClick={onClose}>{p.campaign}</Link></th>
              <td><Dot status={campaignStatus.get(p.campaign) ?? adStatusOf(null)} /></td>
              <td><Dot status={adStatusOf(p.status)} /></td>
              <td className="num">{fmtMoney(p.spend)}</td>
              <td className="num">{fmtInt(p.leads)}{p.cpl != null && <small> · {fmtMoney(p.cpl)}</small>}</td>
              <td className="num">{pct(p.ctr)}</td>
              <td className="num">{times(p.roas)}</td>
            </tr>)}</tbody>
          </table>
        </section>}
      </div>}
    </section>
  </div>;
}
```


- [ ] **Step 5: creativeViewer.css**

```css
/* หน้าต่างครีเอทีฟตัวเดียว — กรอบ .cl-preview เดิม · token กลางทั้งหมด (สว่าง/มืดชุดเดียว) */
.cv { width:min(1100px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); display:flex; flex-direction:column; }
.cv-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
.cv-head h2 { overflow-wrap:anywhere; }
.cv-nav { display:flex; align-items:center; gap:6px; flex:none; }
.cv-nav > span { min-width:64px; text-align:center; color:var(--ink-soft); font-size:12px; font-variant-numeric:tabular-nums; }
.mkt-root .cv-nav > button:not(.cl-preview-close), .cv-nav > button:not(.cl-preview-close) { display:grid; place-items:center; width:36px; height:36px; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink); cursor:pointer; }
.cv-nav > button:disabled { opacity:.4; cursor:default; }
.cv-tabs { display:flex; gap:4px; padding:0 20px; border-bottom:1px solid var(--line); }
.mkt-root .cv-tabs button, .cv-tabs button { min-height:40px; padding:0 14px; border:0; border-bottom:2px solid transparent; background:none; color:var(--ink-soft); font:inherit; font-size:13px; font-weight:650; cursor:pointer; }
.cv-tabs button[aria-selected="true"] { color:var(--ink); border-bottom-color:var(--aw-accent,var(--accent)); }
.cv-body { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:20px; padding:18px 20px 22px; overflow:auto; }
.cv-body--meta { display:block; }
.cv-media { border:1px solid var(--line); border-radius:12px; overflow:hidden; align-self:start; }
.cv-side { display:flex; flex-direction:column; gap:14px; min-width:0; }
.cv-state { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
.cv-state small { color:var(--ink-soft); font-size:11px; }
.cv-status { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); white-space:nowrap; }
.cv-status i { width:7px; height:7px; border-radius:50%; background:var(--ink-faint,var(--ink-soft)); }
.cv-status--emerald i { background:var(--ok); } .cv-status--amber i { background:var(--warn); }
.cv-status--rose { color:var(--bad-text); } .cv-status--rose i { background:var(--bad); } .cv-status--zinc { color:var(--ink-soft); }
.cv-facts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px 14px; margin:0; padding:12px 0; border-block:1px solid var(--line); }
.cv-facts dt { color:var(--ink-soft); font-size:11px; } .cv-facts dd { margin:2px 0 0; font-size:15px; font-weight:650; font-variant-numeric:tabular-nums; }
.cv-advice { display:grid; gap:3px; margin:0; padding:10px 12px; border:1px solid var(--line); border-radius:10px; font-size:13px; }
.cv-advice span { color:var(--ink-soft); } .cv-advice--rose b { color:var(--bad-text); } .cv-advice--emerald b { color:var(--ok-text); } .cv-advice--amber b { color:var(--warn-text,var(--ink)); }
.cv-copy { display:grid; gap:3px; margin:0; font-size:13px; line-height:1.6; } .cv-copy small { color:var(--ink-soft); font-size:11px; } .cv-copy span { white-space:pre-wrap; }
.cv-campaigns { grid-column:1/-1; }
.cv-campaigns h3 { margin:0 0 8px; font-size:14px; }
.cv-campaigns table { width:100%; border-collapse:collapse; font-size:12.5px; font-variant-numeric:tabular-nums; }
.cv-campaigns th, .cv-campaigns td { padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; }
.cv-campaigns thead th { color:var(--ink-soft); font-size:11px; font-weight:700; }
.cv-campaigns .num { text-align:right; white-space:nowrap; }
.cv-campaigns tbody th a { color:var(--ink); font-weight:650; text-decoration:underline; text-decoration-color:var(--line); text-underline-offset:3px; }
.cv-campaigns tr.is-here { background:color-mix(in srgb,var(--aw-accent,var(--accent)) 8%,transparent); }
@media (max-width:760px) {
  .cl-preview.cv { width:100vw; max-height:100dvh; border-radius:0; }
  .cv-body { grid-template-columns:1fr; } .cv-facts { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .cv-campaigns { overflow-x:auto; }
}
```

- [ ] **Step 6: ลบ CreativeDetail.jsx และ describe "CreativeDetail (ดูเต็ม)" ใน tests/creativeTable.component.test.jsx** (รวมบรรทัด mock CreativePreview และ import CreativeDetail)

- [ ] **Step 7: รันให้ผ่าน** — `npx vitest run tests/creativeViewer.component.test.jsx` → PASS · `npx vitest run` ทั้งชุด (ไฟล์ที่ import CreativeDetail จะล้ม — แก้ใน Task 3/4)

### Task 3: แผงแคมเปญ — CreativeList กะทัดรัด + ลิงก์ ?open=

**Files:**
- Create: `src/modules/marketing/creatives/CreativeList.jsx` (+ CSS ใน creativeViewer.css)
- Modify: `src/modules/marketing/campaigns/CampaignDetail.jsx`, `src/modules/marketing/campaigns/CampaignsTable.jsx`, `src/modules/marketing/campaigns/CampaignsView.jsx`
- Modify: `src/modules/marketing/adsCampaigns.js` (เพิ่ม `openKeyFor`)
- Test: `tests/creativeList.component.test.jsx`, `tests/adsCampaigns.test.js`

**Interfaces:**
- Consumes: `CreativeViewer`, `campaignStatusIndex`
- Produces: `<CreativeList rows onOpen(index) />` · CampaignsTable prop `initialOpenName?: string` · `openKeyFor(rows, name) → string|null` ใน adsCampaigns.js

- [ ] **Step 1: เทสที่ล้ม** — `tests/creativeList.component.test.jsx`:

```jsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
const { CreativeList } = await import("../src/modules/marketing/creatives/CreativeList.jsx");
afterEach(cleanup);
const row = (key, patch = {}) => ({ key, creative: `Album_TD_${key}`, spend: 7186.019, roas: 0.17, action: "Stop", tone: "rose", asset: { status: "PAUSED", format: "carousel", media: [] }, ...patch });

describe("CreativeList (แผงแคมเปญ)", () => {
  it("แถวละชิ้น: ชื่อ · รูปแบบ · สถานะ · ค่าแอด ตัดไม่ปัด · ROAS · คำแนะนำไทย", () => {
    render(<CreativeList rows={[row("a"), row("b", { asset: null })]} onOpen={() => {}} />);
    const items = screen.getAllByRole("button", { name: /Album_TD_/ });
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("฿7,186.01")).toBeTruthy();
    expect(items[0].textContent).toContain("ปิด");
    expect(items[0].textContent).toContain("ควรหยุด");
    expect(items[1].textContent).toContain("ไม่ทราบสถานะ");
  });
  it("คลิกชิ้น = onOpen(index)", () => {
    const onOpen = vi.fn();
    render(<CreativeList rows={[row("a"), row("b")]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Album_TD_b/ }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
});
```

  ต่อท้าย `tests/adsCampaigns.test.js` (เพิ่ม `openKeyFor` ใน import จาก adsCampaigns.js):

```js
/* ลิงก์จากหน้าต่างครีเอทีฟ → /mkt/campaigns?open=<ชื่อแคมเปญ> เปิดแผงของแคมเปญนั้น (สเปก 2026-09-25) */
describe("openKeyFor", () => {
  const rows = [{ key: "k1", name: "C1" }, { key: "k2", name: "C2" }];
  it("ชื่อตรง = key ของแถวนั้น · ไม่เจอ/ว่าง = null", () => {
    expect(openKeyFor(rows, "C2")).toBe("k2");
    expect(openKeyFor(rows, "ไม่มี")).toBeNull();
    expect(openKeyFor(rows, "")).toBeNull();
  });
});
```

- [ ] **Step 2: รันให้ล้ม**

- [ ] **Step 3: CreativeList.jsx**

```jsx
/* รายการครีเอทีฟกะทัดรัดในแผงแคมเปญ (สเปก 2026-09-25) — รูป 72px · ชื่อ 2 บรรทัด · สถานะ · ค่าแอด/ROAS · คำแนะนำ
   คลิกทั้งแถว = หน้าต่างครีเอทีฟ (CreativeViewer) · ไม่มีการ์ดลอยตอนชี้ */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { fmtMoney, fmtNum } from "../dash/charts/theme.js";
import { mediaView } from "./creativeMedia.js";
import { FORMAT_LABELS, creativeFormatOf } from "./creativeLibrary.js";
import { actionLabel, actionTone, adStatusOf } from "./creativeStatus.js";
import { Dot } from "./CreativeViewer.jsx";

function Thumb({ asset }) {
  const src = mediaView(asset).items[0]?.src ?? null;
  const [broken, setBroken] = useState(false);
  return <span className="cvl-thumb">{src && !broken ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <ImageOff size={18} aria-hidden="true" />}</span>;
}

export function CreativeList({ rows = [], onOpen }) {
  if (!rows.length) return <p className="cvl-empty">ไม่มีครีเอทีฟในช่วงนี้</p>;
  return <ul className="cvl">{rows.map((row, i) => <li key={row.key}>
    <button type="button" className="cvl-item" onClick={() => onOpen(i)} aria-label={`${row.creative} · เปิดดู`}>
      <Thumb asset={row.asset} />
      <span className="cvl-main"><b>{row.creative}</b><small>{FORMAT_LABELS[creativeFormatOf(row)]}</small><Dot status={adStatusOf(row.asset?.status)} /></span>
      <span className="cvl-nums"><b>{fmtMoney(row.spend)}</b><small>ROAS {row.roas == null ? "—" : `${fmtNum(row.roas, 2)}x`}</small><span className={`cvl-action cvl-action--${actionTone(row)}`}>{actionLabel(row)}</span></span>
    </button>
  </li>)}</ul>;
}
```

  CSS ต่อท้าย creativeViewer.css:

```css
/* รายการกะทัดรัด (แผงแคมเปญ) */
.cvl { display:grid; gap:0; margin:0; padding:0; list-style:none; }
.mkt-root .cvl-item, .cvl-item { display:grid; grid-template-columns:72px minmax(0,1fr) auto; gap:12px; align-items:center; width:100%; padding:10px 6px; border:0; border-bottom:1px solid var(--line); background:none; color:var(--ink); font:inherit; text-align:left; cursor:pointer; }
.cvl-item:hover { background:color-mix(in srgb,var(--ink) 4%,transparent); }
.cvl-item:focus-visible { outline:2px solid var(--aw-accent,var(--accent)); outline-offset:-2px; }
.cvl-thumb { display:grid; place-items:center; width:72px; height:72px; overflow:hidden; border:1px solid var(--line); border-radius:8px; background:var(--surface-2); color:var(--ink-soft); }
.cvl-thumb img { width:100%; height:100%; object-fit:cover; }
.cvl-main { display:grid; gap:3px; min-width:0; }
.cvl-main b { display:-webkit-box; overflow:hidden; font-size:13px; font-weight:650; line-height:1.35; overflow-wrap:anywhere; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.cvl-main small { color:var(--ink-soft); font-size:11px; }
.cvl-nums { display:grid; justify-items:end; gap:3px; font-variant-numeric:tabular-nums; }
.cvl-nums b { font-size:13px; } .cvl-nums small { color:var(--ink-soft); font-size:11px; }
.cvl-action { padding:2px 8px; border:1px solid var(--line); border-radius:99px; font-size:11px; font-weight:700; white-space:nowrap; }
.cvl-action--rose { color:var(--bad-text); border-color:color-mix(in srgb,var(--bad) 45%,var(--line)); }
.cvl-action--emerald { color:var(--ok-text); border-color:color-mix(in srgb,var(--ok) 45%,var(--line)); }
.cvl-action--amber { color:var(--warn-text,var(--ink)); border-color:color-mix(in srgb,var(--warn) 45%,var(--line)); }
.cvl-empty { margin:0; padding:16px 0; color:var(--ink-soft); font-size:12.5px; }
```

- [ ] **Step 4: CampaignDetail.jsx** — แทน `CreativeTable`/`CreativeDetail` ด้วย:

```jsx
import { CreativeList } from "../creatives/CreativeList.jsx";
import { CreativeViewer, Dot } from "../creatives/CreativeViewer.jsx";
import { campaignDeliveryOf, campaignStatusIndex } from "../creatives/creativeStatus.js";
// ...ใน component:
  const [openIndex, setOpenIndex] = useState(null);
  const delivery = campaignDeliveryOf(row);
  const statusIndex = useMemo(() => campaignStatusIndex(row.creatives), [row.creatives]);
// หัว section: <p>{row.creatives.length} ชิ้นในแคมเปญ · แคมเปญ<Dot status={delivery} /></p>
// เนื้อ:       {row.creatives.length ? <CreativeList rows={row.creatives} onOpen={setOpenIndex} /> : <p className="cp-no-value">ไม่มีข้อมูลครีเอทีฟ</p>}
// ท้าย:       {openIndex != null && <CreativeViewer rows={row.creatives} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} canPreview={canPreview} campaignStatus={statusIndex} highlightCampaign={row.name} />}
```

  (เพิ่ม `useMemo` ใน import ของ react · ลบ import CreativeTable/StatusDot/CreativeDetail)

- [ ] **Step 5: ?open=** — CampaignsView: เพิ่ม `open: { default: "" }` ใน `CAMPAIGN_FILTERS` แล้วส่ง `initialOpenName={filters.open}` ให้ CampaignsTable · CampaignsTable:

```jsx
export function CampaignsTable({ rows, compareLabel, renderDetail, scopeEmpty, revenueLabel, goalTargets = null, targetPeriod = null, salesSummary = null, initialOpenName = "" }) {
  const [openKey, setOpenKey] = useState(() => openKeyFor(rows, initialOpenName));
  // ข้อมูลมาช้ากว่าหน้า (โหลดจริง) → เปิดตามลิงก์เมื่อเจอแถวครั้งแรก
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    const key = openKeyFor(rows, initialOpenName);
    if (key) { opened.current = true; setOpenKey(key); }
  }, [rows, initialOpenName]);
```

  ใน adsCampaigns.js:

```js
/** แถวที่ลิงก์ ?open=<ชื่อแคมเปญ> ขอให้เปิด — ไม่เจอ = null (เงียบ ไม่ error) */
export const openKeyFor = (rows = [], name = "") => (name ? rows.find((row) => row.name === name)?.key ?? null : null);
```

  StatusDot ที่ใช้ในรายการแคมเปญ: เปลี่ยน import เป็น `Dot` จาก CreativeViewer.jsx (CreativeTable จะถูกรื้อใน Task 4)

- [ ] **Step 6: รันให้ผ่าน** — ไฟล์เทส Task 3 + ทั้งชุด

### Task 4: หน้าคลัง — รูปเต็มเป็นค่าเริ่ม · ส่วนบนแถบเดียว · ตารางรื้อ · คลิก = viewer

**Files:**
- Modify: `src/modules/marketing/creatives/CreativeLibraryView.jsx`, `CreativeTable.jsx`, `creativeTable.css`, `creativeLibrary.css`, `CreativeMedia.jsx` (prop `openLabel`)
- Test: `tests/creativeLibraryView.component.test.jsx`, `tests/creativeTable.component.test.jsx`, `tests/creativeMedia.component.test.jsx`

**Interfaces:**
- Consumes: `CreativeViewer`, `campaignStatusIndex`, `Dot`
- Produces: CreativeMedia prop `openLabel?: string` (ป้ายของปุ่มเปิดบนรูป — ค่าเดิม "ดูตัวอย่างโฆษณา")

- [ ] **Step 1: เทสที่ล้ม** — แก้ `tests/creativeLibraryView.component.test.jsx`:
  - `withView` เดิมเติม `view=cards` → ลบ helper ทิ้ง (ค่าเริ่มเป็นการ์ดแล้ว) ให้ `view` render url ตรงๆ
  - แทน describe "มุมมองตาราง (ค่าเริ่ม)" ด้วย:

```jsx
describe("หน้าคลัง (สเปก 2026-09-25)", () => {
  it("เปิดมาเป็นรูปเต็ม · ปุ่ม รูป/ตาราง อยู่ในหัวหน้า", () => {
    view();
    const head = document.querySelector(".cl-command header");
    expect(within(head).getByRole("button", { name: "รูป" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".cl-card")).toBeTruthy();
    fireEvent.click(within(head).getByRole("button", { name: "ตาราง" }));
    expect(document.querySelector(".cl-card")).toBeNull();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(4);
  });
  it("ส่วนบนยุบ: แถบสรุปบรรทัดเดียว · ไม่มีการ์ดสรุป 5 ใบ · ตารางรูปแบบพับอยู่", () => {
    view();
    expect(document.querySelector(".cl-summary")).toBeNull();
    expect(document.querySelector(".cl-strip").textContent).toMatch(/4 ชิ้น · ค่าแอด ฿7,300\.00/);
  });
  it("คลิกการ์ด (รวมรูป) หรือแถวตาราง = หน้าต่างเดียว", () => {
    view();
    fireEvent.click(screen.getByText("ชิ้นแพง").closest("article"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "ชิ้นแพง" })).toBeTruthy();
  });
});
```

  - เทสกฎเดิมที่อ่าน `.cl-rule-summary` ปุ่ม "ไม่ผ่าน/ผ่าน" ให้คงชื่อปุ่มเดิม (ชิปใหม่ยังเป็นปุ่มชื่อ "ไม่ผ่าน 1" ฯลฯ → ปรับ selector เป็น `getByRole("button", { name: /^ไม่ผ่าน/ })`)
  - `tests/creativeTable.component.test.jsx`: ลบ it "ชี้ค้างที่แถว…" (HoverCard ถูกถอด) · เพิ่ม:

```jsx
  it("ไม่มีการ์ดลอยตอนชี้เมาส์", () => {
    vi.useFakeTimers();
    render(<CreativeTable rows={rows} onOpen={() => {}} />);
    fireEvent.mouseEnter(screen.getAllByRole("row")[1]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
```

- [ ] **Step 2: รันให้ล้ม**

- [ ] **Step 3: CreativeMedia `openLabel`** — เพิ่ม prop `openLabel = "ดูตัวอย่างโฆษณา"` ใช้แทนข้อความใน `cl-media-hint` และ `aria-label` ของปุ่ม `cl-media-open` (`${openLabel} ${row.creative}`) และข้อความ fallback "กดเพื่อดูตัวอย่างโฆษณาจาก Meta" → `กดเพื่อ${openLabel}`

- [ ] **Step 4: CreativeTable รื้อ** — ลบ `HoverCard`, state/timer hover, `createPortal` import · `StatusDot` → ใช้ `Dot` จาก CreativeViewer · ช่องชื่อ: เปลี่ยน `<td className="ct-name">` ให้เป็น td ปกติที่มี `<div className="ct-name">` ข้างใน · รูปย่อ 56px · สถานะบรรทัดเดียว (เลิกบรรทัด "แคมเปญ…" ในตาราง — อยู่ใน viewer แล้ว) · `onOpen(index)` ส่ง index ของแถว · CSS: `.ct-name` ย้ายไปอยู่บน div, `.ct-thumb` 56px, ลบ `.ct-hover*`

- [ ] **Step 5: CreativeLibraryView**
  - `view: { default: "cards", allowed: ["cards", "table"] }`
  - ปุ่ม `<div className="cl-view-switch" role="group" aria-label="รูปแบบรายการ"><button aria-pressed={view==="cards"}>รูป</button><button aria-pressed={view==="table"}>ตาราง</button></div>` ย้ายไปใน `cl-head-actions` (ก่อน AdsSourceControl)
  - ถอด `<RuleCatalog …/>` (และฟังก์ชัน RuleCatalog) · ถอด `<section className="cl-summary">`
  - แทนด้วยแถบ:

```jsx
    <section className="cl-strip" aria-label="สรุปและผลกฎ">
      <p>{v.summary.count} ชิ้น · ค่าแอด {metric(v.summary.spend, "money")} · การซื้อ {metric(v.summary.purchases, "count")}{v.summary.tired ? ` · เริ่มล้า ${v.summary.tired}` : ""}</p>
      {v.ruleSummary ? <div className="cl-rule-chips" role="group" aria-label="กรองตามผลกฎ">
        <button type="button" className="fail" aria-pressed={outcome === "fail"} onClick={() => setOutcome(outcome === "fail" ? "all" : "fail")}>ไม่ผ่าน {v.ruleSummary.fail}</button>
        <button type="button" className="pass" aria-pressed={outcome === "pass"} onClick={() => setOutcome(outcome === "pass" ? "all" : "pass")}>ผ่าน {v.ruleSummary.pass}</button>
        <button type="button" aria-pressed={outcome === "pending"} onClick={() => setOutcome(outcome === "pending" ? "all" : "pending")}>ยังตัดสินไม่ได้ {v.ruleSummary.pending + v.ruleSummary.nodata}</button>
        <Link to="/mkt/ads?panel=settings&tab=rules">แก้กฎ</Link>
      </div> : !configuredRules.length && <Link className="cl-rule-set" to="/mkt/ads?panel=settings&tab=rules">ตั้งกฎคัดครีเอทีฟ</Link>}
    </section>
```

  - ตารางรูปแบบ: ห่อ `<details className="cl-formats-fold"><summary>เทียบตามรูปแบบชิ้นงาน</summary>…section เดิม…</details>` (เงื่อนไขแสดงเดิม)
  - viewer: `const [openIndex, setOpenIndex] = useState(null);` · `const statusIndex = useMemo(() => campaignStatusIndex(v.all), [v.all]);` · การ์ด: `<article onClick={() => setOpenIndex(i)}>` (ช่องติ๊กเทียบ/ลิงก์ FB/IG เรียก `event.stopPropagation()`) และ `CreativeMedia onPreview={() => setOpenIndex(i)} openLabel="เปิดดูชิ้นนี้"` · ตาราง `onOpen={setOpenIndex}` · ท้ายหน้า `{openIndex != null && <CreativeViewer rows={pager.pageItems} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} canPreview={ads.canPreview} campaignStatus={statusIndex} />}` · ลบ `previewRow`/`CreativePreview`/`CreativeDetail`/`openRow`/`campaignStatusFor`
  - การ์ด: เพิ่ม `<Dot status={adStatusOf(row.asset?.status)} />` ในหัวการ์ดใต้ชื่อ
  - CSS (creativeLibrary.css): `.cl-strip { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px 16px; margin:0 0 12px; font-size:13px; }` · `.cl-rule-chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }` · ปุ่มชิป min-height 32px เส้น `var(--line)` · `.fail[aria-pressed=true]` ขอบ `--bad` · `.cl-card { cursor:pointer; }` · `.cl-formats-fold > summary` แบบเดียวกับ `.aw-formula summary`

- [ ] **Step 6: รันให้ผ่าน** — ไฟล์เทสของงานนี้ + ทั้งชุด · `npm run lint` 0 error · `npm run build`

### Task 5: ตรวจด้วยตาบนข้อมูลจริง + ออดิต

- [ ] **Step 1:** เปิด `http://localhost:5173` (ล็อกอินค้างในแผงเบราว์เซอร์) · หน้าคลังและแผงแคมเปญ ที่ 1440 / 1024 / 375 · ถ่ายภาพ: หน้าคลังจอแรก (รายการต้องเห็นในจอแรก), หน้าต่างครีเอทีฟ (ภาพ + อยู่ใน N แคมเปญ), แท็บ Meta, แผงแคมเปญรายการกะทัดรัด, มือถือ viewer เต็มจอ
- [ ] **Step 2:** ยืนยันด้วยสคริปต์: หลังคลิกการ์ด/รูป/แถว/แท็บ Meta มี `[role=dialog]` = 1 เสมอ · `document.documentElement.scrollWidth === innerWidth` ที่ 375
- [ ] **Step 3:** รัน skill `design-with-claude:design-critic` กับภาพ · `design-with-claude:table-designer` กับตาราง · `design-with-claude:anti-slop-designer` · แก้ข้อที่รุนแรงสูง
- [ ] **Step 4:** `verification-before-completion` · รายงานอาร์ตพร้อมภาพ · รายงานว่าพร้อม commit (ไม่ commit เอง)
