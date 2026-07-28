import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./theme.css";
import App from "./App.jsx";
import { bootstrapSupabase } from "./modules/marketing/data/supabaseStore.js";

/* โหลด state จาก Supabase ครั้งเดียวก่อน render (ไม่ได้ใส่คีย์ = ข้ามทันที)
   ต่อไม่ติดก็ยัง render ได้ — ใช้ข้อมูลเดโมในหน่วยความจำแทน แล้วขึ้น error ใน console
   ไม่ปล่อยให้จอขาวเพราะฐานข้อมูลล่ม */
try {
  await bootstrapSupabase();
} catch (err) {
  console.error("[supabase] ต่อฐานข้อมูลไม่สำเร็จ — ใช้ข้อมูลเดโมชั่วคราว:", err.message);
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
