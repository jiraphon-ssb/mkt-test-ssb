// @vitest-environment jsdom
/* ตารางครีเอทีฟกลาง (25 ก.ย. อาร์ตขอ) — ใช้ทั้งในแผงแคมเปญและหน้าคลัง Creative
   แถว = ชิ้นงาน · ชี้ค้าง = ตัวอย่างคร่าวๆ · คลิก = เปิดเต็ม · บอกสถานะเปิด/ปิดจาก Meta (ไม่ใช่คำแนะนำ) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("../src/modules/marketing/creatives/CreativeMedia.jsx", () => ({ CreativeMedia: () => <div data-testid="media" /> }));
const { CreativeTable } = await import("../src/modules/marketing/creatives/CreativeTable.jsx");

afterEach(() => { cleanup(); vi.useRealTimers(); });

const asset = (patch = {}) => ({ provider: "meta", connectionId: "c1", adId: "11", format: "carousel", status: "ACTIVE", statusAt: "2026-09-25T05:20:00Z",
  media: [{ type: "image", thumbnailUrl: "https://scontent.xx.fbcdn.net/a.jpg" }],
  copy: { headline: "รวมไอเดียเสื้อ", primaryText: "กำลังวางแผนจัดงานอีเวนท์ แต่ยังไม่มีไอเดียเสื้อทีม TEAMDEE พร้อมออกแบบให้ครบ", callToAction: "MESSAGE_PAGE" },
  storyId: "123_456", ...patch });
const row = (key, patch = {}) => ({ key, creative: `Album_TD_${key}`, brand: "TEAMDEE", platform: "Meta Ads", campaigns: ["Sale_Contents_T-D"],
  spend: 7186.01, ctr: 0.0304, linkCtr: 0.0123, frequency: 1.62, roas: 0.17, action: "Stop", tone: "rose", fatigue: false, why: "ROAS 0.17x — ได้กลับน้อยกว่าที่จ่าย",
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
    expect(first.getByText("1.23%")).toBeTruthy();                        // CTR ลิงก์ (สเปก 2026-09-26) ไม่ใช่ CTR ทั้งหมด 3.04%
    expect(first.queryByText("3.04%")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "CTR ลิงก์" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "ROAS (Meta)" })).toBeTruthy();   // ชุด C: ROAS ที่ Meta เห็นต้องบอกฐาน
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
    expect(onOpen.mock.calls[0][0]).toBe(0);   // ส่งตำแหน่ง ให้หน้าต่างเลื่อน ‹ › ต่อได้
  });
  it("ไม่มีการ์ดลอยตอนชี้เมาส์ (สเปก 2026-09-25)", () => {
    vi.useFakeTimers();
    render(<CreativeTable rows={rows} onOpen={() => {}} />);
    fireEvent.mouseEnter(screen.getAllByRole("row")[1]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("หน้าคลัง: บรรทัดรองเป็นแบรนด์ · แคมเปญ · ติ๊กเทียบได้โดยไม่เปิดหน้าต่าง", () => {
    const onOpen = vi.fn(), toggle = vi.fn();
    render(<CreativeTable rows={rows} onOpen={onOpen} context="library"
      selection={{ isChecked: (key) => key === "b", toggle }} />);
    const first = within(screen.getAllByRole("row")[1]);
    expect(first.getByText(/TEAMDEE · Sale_Contents_T-D/)).toBeTruthy();
    fireEvent.click(first.getByRole("checkbox", { name: "เทียบ Album_TD_a" }));
    expect(toggle).toHaveBeenCalledWith("a");
    expect(onOpen).not.toHaveBeenCalled();
  });
  it("ไม่มีแถว = บอกตรงๆ", () => {
    render(<CreativeTable rows={[]} onOpen={() => {}} />);
    expect(screen.getByText("ไม่มีครีเอทีฟในช่วงนี้")).toBeTruthy();
  });
});
