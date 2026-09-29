/* กันเปลี่ยนหน้าระหว่างดึงข้อมูล (29 ก.ย. — อาร์ต: "กดดึงข้อมูลแล้วจะไปหน้าอื่นไม่ได้ หรือมีเตือนห้ามเปลี่ยนหน้า")
   - คลิกลิงก์ในแอป (เมนูซ้าย · แท็บ · ลิงก์ในหน้า) = ยังไม่ไป เด้งถามก่อน ("อยู่หน้านี้ต่อ" เป็นปุ่มหลัก)
   - รีเฟรช / ปิดแท็บ / พิมพ์ URL ใหม่ = เบราว์เซอร์ถามยืนยันเอง (beforeunload) — ตรงนี้การดึงจะหยุดกลางทางจริง
   แอปใช้ BrowserRouter ไม่ใช่ data router → useBlocker ของ react-router ใช้ไม่ได้ จึงดักคลิกที่ document (capture) เอง
   ข้อจำกัด: ปุ่ม Back ของเบราว์เซอร์ไม่ถูกดัก (ต้องย้ายไป data router ทั้งแอป) */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../detail/Sheet.jsx";

export function LeaveGuard({ active, message }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!active) return undefined;
    const here = location.pathname + location.search;
    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target?.closest?.("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;           // ลิงก์ออกนอกแอป — beforeunload ถามแทน
      if (url.pathname + url.search === here) return;               // ลิงก์มาหน้าเดิม ไม่ต้องถาม
      event.preventDefault();
      event.stopPropagation();                                       // ไม่ให้ถึงตัวจัดการคลิกของ react-router
      setTarget(url.pathname + url.search + url.hash);
    };
    const onBeforeUnload = (event) => { event.preventDefault(); event.returnValue = ""; };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, location.pathname, location.search]);

  /* ดึงเสร็จระหว่างที่กล่องค้างอยู่ = ปิดกล่องเอง ไม่ต้องถามแล้ว */
  useEffect(() => { if (!active) setTarget(null); }, [active]);

  if (!target) return null;
  return <ConfirmDialog
    options={{
      title: "กำลังดึงข้อมูลอยู่",
      message: message ?? "รอให้ดึงเสร็จก่อนค่อยเปลี่ยนหน้า — ถ้าออกตอนนี้จะไม่เห็นผลว่าขั้นไหนสำเร็จหรือล้ม และถ้าปิดหรือรีเฟรชหน้า การดึงจะหยุดกลางทาง",
      confirmLabel: "ออกจากหน้านี้",
      cancelLabel: "อยู่หน้านี้ต่อ",
      danger: true,
    }}
    onResolve={(leave) => { const to = target; setTarget(null); if (leave) navigate(to); }}
  />;
}
