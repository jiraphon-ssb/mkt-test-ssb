// @vitest-environment jsdom
/* ตารางครีเอทีฟกลาง (25 ก.ย. อาร์ตขอ) — ใช้ทั้งในแผงแคมเปญและหน้าคลัง Creative
   แถว = ชิ้นงาน · ชี้ค้าง = ตัวอย่างคร่าวๆ · คลิก = เปิดเต็ม · บอกสถานะเปิด/ปิดจาก Meta (ไม่ใช่คำแนะนำ) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: () => <div data-testid="media" /> }));
vi.mock("../src/modules/marketing/creatives/CreativePreview.jsx", () => ({ CreativePreview: ({ onClose }) => <div role="dialog" aria-label="ตัวอย่างจาก Meta"><button onClick={onClose}>ปิดตัวอย่าง</button></div> }));
const { CreativeTable } = await import("../src/modules/marketing/creatives/CreativeTable.jsx");
const { CreativeDetail } = await import("../src/modules/marketing/creatives/CreativeDetail.jsx");

afterEach(() => { cleanup(); vi.useRealTimers(); });

const asset = (patch = {}) => ({ provider: "meta", connectionId: "c1", adId: "11", format: "carousel", status: "ACTIVE", statusAt: "2026-09-25T05:20:00Z",
  media: [{ type: "image", thumbnailUrl: "https://scontent.xx.fbcdn.net/a.jpg" }],
  copy: { headline: "รวมไอเดียเสื้อ", primaryText: "กำลังวางแผนจัดงานอีเวนท์ แต่ยังไม่มีไอเดียเสื้อทีม TEAMDEE พร้อมออกแบบให้ครบ", callToAction: "MESSAGE_PAGE" },
  storyId: "123_456", ...patch });
const row = (key, patch = {}) => ({ key, creative: `Album_TD_${key}`, brand: "TEAMDEE", platform: "Meta Ads", campaigns: ["Sale_Contents_T-D"],
  spend: 7186.01, ctr: 0.0304, frequency: 1.62, roas: 0.17, action: "Stop", tone: "rose", fatigue: false, why: "ROAS 0.17x — ได้กลับน้อยกว่าที่จ่าย",
  asset: asset(), ...patch });
const rows = [row("a"), row("b", { asset: asset({ status: "PAUSED" }), action: "Scale", tone: "emerald", roas: 3.2 }), row("c", { asset: null })];

describe("CreativeTable", () => {
  it("หนึ่งแถวต่อชิ้น · ตัวเลขตัดไม่ปัด · สถานะจาก Meta แยกจากคำแนะนำ · คำแนะนำเป็นภาษาไทย", () => {
    render(<CreativeTable rows={rows} onOpen={() => {}} />);
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(3);
    const first = within(body[0]);
    expect(first.getByText("Album_TD_a")).toBeTruthy();
    expect(first.getByText("฿7,186.01")).toBeTruthy();
    expect(first.getByText("3.04%")).toBeTruthy();
    expect(first.getByText("เปิด")).toBeTruthy();
    expect(first.getByText("ควรหยุด")).toBeTruthy();
    expect(within(body[1]).getByText("ปิด")).toBeTruthy();
    expect(within(body[2]).getByText("ไม่ทราบสถานะ")).toBeTruthy();       // ไม่มีข้อมูล = ไม่เดาว่าเปิด
    expect(screen.queryByText("Stop")).toBeNull();
  });
  it("คลิกแถวหรือกด Enter = เปิดดูเต็ม", () => {
    const onOpen = vi.fn();
    render(<CreativeTable rows={rows} onOpen={onOpen} />);
    const target = screen.getAllByRole("row")[1];
    fireEvent.click(target);
    fireEvent.keyDown(target, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen.mock.calls[0][0].key).toBe("a");
  });
  it("ชี้ค้างที่แถว = การ์ดตัวอย่างคร่าวๆ (หัวข้อ · ข้อความ · สถานะ) · ออกจากแถว = หาย", () => {
    vi.useFakeTimers();
    render(<CreativeTable rows={rows} onOpen={() => {}} />);
    const target = screen.getAllByRole("row")[1];
    fireEvent.mouseEnter(target);
    expect(screen.queryByRole("tooltip")).toBeNull();                         // ยังไม่ขึ้นทันที กันกระพริบตอนลากเมาส์ผ่าน
    act(() => { vi.advanceTimersByTime(400); });
    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toContain("รวมไอเดียเสื้อ");
    expect(tip.textContent).toContain("เปิด");
    expect(tip.textContent).toContain("คลิกเพื่อดูเต็ม");
    fireEvent.mouseLeave(target);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("หน้าคลัง: มีชื่อแบรนด์/แคมเปญ + สถานะแคมเปญ · ติ๊กเทียบได้โดยไม่เปิดหน้าต่าง", () => {
    const onOpen = vi.fn(), toggle = vi.fn();
    render(<CreativeTable rows={rows} onOpen={onOpen} context="library"
      campaignStatus={() => ({ key: "active", label: "เปิดอยู่", tone: "emerald", on: true })}
      selection={{ isChecked: (key) => key === "b", toggle }} />);
    const first = within(screen.getAllByRole("row")[1]);
    expect(first.getByText(/TEAMDEE · Sale_Contents_T-D/)).toBeTruthy();
    expect(first.getByText("แคมเปญเปิดอยู่")).toBeTruthy();
    fireEvent.click(first.getByRole("checkbox", { name: "เทียบ Album_TD_a" }));
    expect(toggle).toHaveBeenCalledWith("a");
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("ไม่มีแถว = บอกตรงๆ", () => {
    render(<CreativeTable rows={[]} onOpen={() => {}} />);
    expect(screen.getByText("ไม่มีครีเอทีฟในช่วงนี้")).toBeTruthy();
  });
});

describe("CreativeDetail (ดูเต็ม)", () => {
  it("ข้อความโฆษณาเต็ม · สถานะโฆษณาพร้อมเวลาที่อ่าน · ตัวเลข · คำแนะนำ · ลิงก์โพสต์", () => {
    render(<CreativeDetail row={rows[0]} campaignStatus={{ key: "active", label: "เปิดอยู่", tone: "emerald", on: true }} onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Album_TD_a" });
    expect(dialog.textContent).toContain("กำลังวางแผนจัดงานอีเวนท์ แต่ยังไม่มีไอเดียเสื้อทีม TEAMDEE พร้อมออกแบบให้ครบ");
    expect(dialog.textContent).toContain("โฆษณาเปิด");
    expect(dialog.textContent).toContain("แคมเปญเปิดอยู่");
    expect(dialog.textContent).toMatch(/สถานะจาก Meta · 25 ก\.ย\./);
    expect(dialog.textContent).toContain("ROAS 0.17x — ได้กลับน้อยกว่าที่จ่าย");
    expect(within(dialog).getByRole("link", { name: /โพสต์ Facebook/ }).getAttribute("href")).toBe("https://www.facebook.com/123_456");
  });
  it("ปุ่มตัวอย่างจาก Meta มีเฉพาะเมื่อดูตัวอย่างได้ · กดแล้วเปิดตัวอย่าง · Esc ปิดหน้าต่าง", () => {
    const onClose = vi.fn();
    const { rerender } = render(<CreativeDetail row={rows[0]} onClose={onClose} />);
    expect(screen.queryByRole("button", { name: /ดูตัวอย่างโฆษณาจริง/ })).toBeNull();
    rerender(<CreativeDetail row={rows[0]} canPreview onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /ดูตัวอย่างโฆษณาจริง/ }));
    expect(screen.getByRole("dialog", { name: "ตัวอย่างจาก Meta" })).toBeTruthy();
    fireEvent.click(screen.getByText("ปิดตัวอย่าง"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
