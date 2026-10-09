// @vitest-environment jsdom
/* นำเข้าค่าแอดจากไฟล์ — กติกาสำคัญ: เลือกไฟล์แล้ว "ยังไม่เขียน" ต้องให้คนตรวจสรุปก่อนเสมอ
   ไฟล์ตัวอย่างยึดของจริงจาก OpenAI Ads Manager (มี BOM · ทุกช่องมีเครื่องหมายคำพูด) */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportSpendPanel } from "../src/modules/marketing/ads/ImportSpendPanel.jsx";

afterEach(cleanup);

const CSV = '﻿date,campaign_id,campaign_name,campaign_status,impressions,clicks,conversions,spend\n'
  + '"2026-10-06","c1","TD","active","1831","49","0","219.87"\n'
  + '"2026-10-07","c1","TD","active","1018","44","0","216.26"\n';
const conn = { id: "c-1", provider: "openai", external_account_id: "adacct_x", account_name: "TEAMDEE ChatGPT", brand_name: "TEAMDEE" };

const open = (props = {}) => render(<ImportSpendPanel
  connections={[conn]} batches={[]} importFn={vi.fn()} loadExisting={async () => []} {...props} />);

const pickFile = async (text = CSV, name = "campaigns.csv") => {
  const input = document.querySelector('input[type="file"]');
  const file = new File([text], name, { type: "text/csv" });
  Object.defineProperty(file, "text", { value: async () => text });
  fireEvent.change(input, { target: { files: [file] } });
};

describe("ImportSpendPanel", () => {
  it("เลือกไฟล์แล้วขึ้นสรุปก่อน ยังไม่เขียนลงฐาน", async () => {
    const importFn = vi.fn();
    open({ importFn });
    await pickFile();
    expect(await screen.findByText(/฿436.13/)).toBeTruthy();
    expect(importFn).not.toHaveBeenCalled();
  });

  it("สรุปบอกช่วงวันและจำนวนวันที่จะเขียน", async () => {
    open();
    await pickFile();
    const box = await screen.findByRole("group", { name: /ตรวจก่อนนำเข้า/ });
    expect(box.textContent).toContain("2 วัน");
    expect(box.textContent).toMatch(/6.*ต\.ค\..*7.*ต\.ค\./);
  });

  it("กดยืนยันถึงเขียน และส่งแถวที่แกะได้ไปจริง", async () => {
    const importFn = vi.fn().mockResolvedValue({ batch_id: "b1", inserted: 2, updated: 0 });
    open({ importFn });
    await pickFile();
    fireEvent.click(await screen.findByRole("button", { name: /ยืนยันนำเข้า/ }));
    await waitFor(() => expect(importFn).toHaveBeenCalledOnce());
    const payload = importFn.mock.calls[0][0];
    expect(payload.rows).toEqual([
      { fact_date: "2026-10-06", spend: 219.87 },
      { fact_date: "2026-10-07", spend: 216.26 },
    ]);
    expect(payload.batch.connection_id).toBe("c-1");
  });

  it("ไฟล์ที่เคยอัปแล้วขึ้นคำเตือน แต่ยังอัปซ้ำได้ (ยอดไม่บวกซ้ำอยู่แล้ว)", async () => {
    const { fileHashOf } = await import("../src/modules/marketing/ads/importModel.js");
    const hash = await fileHashOf(CSV);
    open({ batches: [{ file_hash: hash, created_at: "2026-10-07T03:00:00Z", connection_id: "c-1" }] });
    await pickFile();
    expect(await screen.findByText(/เคยอัปไฟล์นี้แล้ว/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /ยืนยันนำเข้า/ }).disabled).toBe(false);
  });

  it("ไฟล์ผิดรูป = บอกเป็นคำว่าขาดคอลัมน์อะไร ไม่โชว์ stack และกดยืนยันไม่ได้", async () => {
    open();
    await pickFile("campaign_name,clicks\nA,10\n", "wrong.csv");
    expect(await screen.findByText(/ไม่พบคอลัมน์/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ยืนยันนำเข้า/ })).toBeNull();
  });

  it("ไฟล์ข้ามวัน = เตือนว่าช่วงนี้ขาดวันไหนไปบ้าง ก่อนกดยืนยัน", async () => {
    open();
    await pickFile('﻿date,spend\n"2026-10-01","10"\n"2026-10-04","20"\n', "gap.csv");
    expect(await screen.findByText(/ไม่มีข้อมูล 2 วัน/)).toBeTruthy();
  });

  it("ยังไม่มีบัญชีแบบไฟล์ = ชวนให้เพิ่มบัญชีก่อน ไม่ใช่โชว์ช่องอัปโหลดเปล่าๆ", () => {
    open({ connections: [] });
    expect(screen.getByText(/ยังไม่มีบัญชี/)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

/* 9 ต.ค. 69: ไฟล์ Google บอกสกุลเงินมาด้วย — ไม่ตรงกับบัญชีต้องปฏิเสธ ไม่แปลงค่าเงินเอง */
describe("ImportSpendPanel — Google Ads", () => {
  const G = "รายงานแคมเปญ\n1 - 2 ต.ค.\nวัน,สถานะของแคมเปญ,แคมเปญ,รหัสสกุลเงิน,ค่าใช้จ่าย\n"
    + "2026-10-01,เปิดใช้อยู่,TD Search,THB,100.00\n2026-10-01,ทั้งหมด: แคมเปญ, --,THB,100.00\n,ทั้งหมด: บัญชี,,THB,100.00\n";
  const gconn = (currency) => ({ id: "g-1", provider: "google", external_account_id: "1234567890", account_name: "TD Google", brand_name: "TEAMDEE", currency });

  it("สกุลเงินตรงกัน = ขึ้นสรุป และไม่นับแถวสรุปของไฟล์ซ้ำ", async () => {
    open({ connections: [gconn("THB")] });
    await pickFile(G, "google.csv");
    const box = await screen.findByRole("group", { name: /ตรวจก่อนนำเข้า/ });
    expect(box.textContent).toContain("฿100.00");
  });

  it("สกุลเงินไม่ตรงกับบัญชี = ปฏิเสธทั้งไฟล์ กดยืนยันไม่ได้", async () => {
    open({ connections: [gconn("USD")] });
    await pickFile(G, "google.csv");
    expect(await screen.findByText(/สกุลเงิน THB แต่บัญชีตั้งไว้เป็น USD/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ยืนยันนำเข้า/ })).toBeNull();
  });
});
