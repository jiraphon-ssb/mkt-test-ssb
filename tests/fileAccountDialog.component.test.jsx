// @vitest-environment jsdom
/* เพิ่มบัญชีที่ป้อนข้อมูลด้วยไฟล์ (ChatGPT ads — ไม่มี API ให้เชื่อม)
   ต้อง map บัญชี → แบรนด์ ก่อนอัปไฟล์ ไม่งั้นค่าแอดไม่รู้ว่าเป็นของแบรนด์ไหน */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileAccountDialog } from "../src/modules/marketing/ads/FileAccountDialog.jsx";

afterEach(cleanup);
const brands = [{ id: "b_td", name: "TEAMDEE" }, { id: "b_jd", name: "JK Design" }];
const open = (props = {}) => render(<FileAccountDialog brands={brands} onClose={() => {}} onCreated={() => {}} {...props} />);

describe("FileAccountDialog", () => {
  it("ยังไม่กรอกรหัสบัญชี = บันทึกไม่ได้", () => {
    open();
    expect(screen.getByRole("button", { name: /บันทึก/ }).disabled).toBe(true);
  });

  it("กรอกครบแล้วส่งค่าที่กรอกไปสร้างบัญชี พร้อม provider openai", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "c9" });
    const onCreated = vi.fn();
    open({ createFn, onCreated });
    fireEvent.change(screen.getByLabelText(/รหัสบัญชี/), { target: { value: "adacct_6ab4de65" } });
    fireEvent.change(screen.getByLabelText(/ชื่อบัญชี/), { target: { value: "TEAMDEE ChatGPT" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(createFn).toHaveBeenCalledWith({
      provider: "openai", brandId: "b_td", accountId: "adacct_6ab4de65",
      accountName: "TEAMDEE ChatGPT", currency: "THB",
    }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "c9" }));
  });

  it("ไม่ใส่ชื่อบัญชี = ใช้รหัสแทน ไม่ปล่อยว่างให้คนงงทีหลัง", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "c1" });
    open({ createFn });
    fireEvent.change(screen.getByLabelText(/รหัสบัญชี/), { target: { value: "adacct_x" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(createFn.mock.calls[0][0].accountName).toBe("adacct_x"));
  });

  it("สร้างไม่สำเร็จ = บอกเป็นคำ ไม่ปิดหน้าต่าง ไม่ทิ้งของที่กรอก", async () => {
    const createFn = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    const onClose = vi.fn();
    open({ createFn, onClose });
    fireEvent.change(screen.getByLabelText(/รหัสบัญชี/), { target: { value: "adacct_x" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/รหัสบัญชี/).value).toBe("adacct_x");
  });

  it("ไม่มีแบรนด์ให้เลือก = บอกให้ไปตั้งแบรนด์ก่อน ไม่ใช่ปล่อยฟอร์มเปล่า", () => {
    open({ brands: [] });
    expect(screen.getByRole("alert").textContent).toMatch(/แบรนด์/);
    expect(screen.getByRole("button", { name: /บันทึก/ }).disabled).toBe(true);
  });
});

/* 9 ต.ค. 69: นำเข้าไฟล์ Google Ads ได้ระหว่างที่ยังไม่ได้เชื่อม API */
describe("FileAccountDialog — Google Ads", () => {
  it("เลือก Google แล้วรหัสบัญชีถูกเก็บเป็นตัวเลขล้วน (ตัดขีด) ให้ตรงกับที่การเชื่อม API ใช้", async () => {
    const createFn = vi.fn().mockResolvedValue({ id: "g1" });
    open({ createFn });
    fireEvent.click(screen.getByRole("button", { name: "Google Ads" }));
    fireEvent.change(screen.getByLabelText(/Customer ID/), { target: { value: "123-456-7890" } });
    fireEvent.click(screen.getByRole("button", { name: /บันทึก/ }));
    await waitFor(() => expect(createFn.mock.calls[0][0]).toMatchObject({ provider: "google", accountId: "1234567890" }));
  });
  it("Google: พิมพ์แต่ตัวอักษรไม่มีตัวเลข = บันทึกไม่ได้", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Google Ads" }));
    fireEvent.change(screen.getByLabelText(/Customer ID/), { target: { value: "teamdee" } });
    expect(screen.getByRole("button", { name: /บันทึก/ }).disabled).toBe(true);
  });
});
