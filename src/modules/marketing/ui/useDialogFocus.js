/* focus ของ dialog/แผงเลื่อน (ชุด B ตรวจรอบละเอียด 26 ก.ย.) — ใช้ร่วมกันทั้งแผงแคมเปญและหน้าต่างครีเอทีฟ
   เปิด: จำตัวที่เปิด + ย้าย focus เข้า · Tab/Shift+Tab วนในกล่อง · Esc ปิด · ปิด: คืน focus ให้ตัวที่เปิด
   มี dialog ซ้อนข้างใน (หน้าต่างครีเอทีฟในแผงแคมเปญ) = ให้ตัวในจัดการ Esc/Tab เอง */
import { useEffect, useRef } from "react";

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const nestedDialog = (root, from) => {
  const inner = from?.closest?.("[role='dialog']");
  return inner && inner !== root ? inner : root.querySelector("[role='dialog']");
};

/** active: dialog เปิดอยู่ · ref: กล่อง dialog · onClose: ปิด (อ่านค่าล่าสุดเสมอ) · initialFocus: ref ของตัวที่ควรได้ focus แรก */
export function useDialogFocus(active, ref, onClose, initialFocus = null) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const opener = document.activeElement;
    (initialFocus?.current ?? root.querySelector(FOCUSABLE) ?? root).focus?.();
    const onKey = (event) => {
      if (event.key === "Escape") {
        if (nestedDialog(root, event.target)) return;   // หน้าต่างที่ซ้อนอยู่ปิดตัวเองก่อน
        close.current?.();
        return;
      }
      if (event.key !== "Tab" || !root.contains(event.target)) return;
      if (nestedDialog(root, event.target)) return;
      const items = [...root.querySelectorAll(FOCUSABLE)].filter((el) => !nestedDialog(root, el));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
