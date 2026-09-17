// @vitest-environment jsdom
/* กระดิ่งแจ้งเตือน — โปรเจกต์ ads ไม่มีตาราง app_notification (ยกเปลือกมาจากแพลตฟอร์ม)
   เดิมกระดิ่งยังขึ้นแต่กดแล้วว่างเปล่า + ยิง 404 ทุกครั้งที่กลับมาที่แท็บ + subscribe realtime ตารางที่ไม่มี */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const api = { unreadCount: vi.fn(), subscribe: vi.fn(() => () => {}), list: vi.fn(async () => []) };
vi.mock("../src/foundation/data/apiClient.js", () => ({ apiClient: { notifications: api } }));
vi.mock("../src/foundation/auth/AuthContext.jsx", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
const { default: NotificationBell } = await import("../src/shell/NotificationBell.jsx");

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const show = async () => { await act(async () => { render(<MemoryRouter><NotificationBell /></MemoryRouter>); }); };

describe("NotificationBell", () => {
  it("ไม่มีตาราง app_notification = ไม่แสดงกระดิ่ง · ไม่ subscribe · กลับมาที่แท็บไม่ยิงซ้ำ", async () => {
    api.unreadCount.mockRejectedValue({ code: "PGRST205", message: "Could not find the table 'public.app_notification'" });
    await show();
    expect(screen.queryByRole("button")).toBeNull();
    expect(api.subscribe).not.toHaveBeenCalled();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(api.unreadCount).toHaveBeenCalledTimes(1);
  });
  it("มีตาราง = แสดงกระดิ่งและ subscribe ตามปกติ · error ชั่วคราวไม่ซ่อนกระดิ่ง", async () => {
    api.unreadCount.mockResolvedValue(2);
    await show();
    expect(screen.getByRole("button")).toBeTruthy();
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    cleanup();
    api.unreadCount.mockRejectedValue(new Error("network"));
    await show();
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
