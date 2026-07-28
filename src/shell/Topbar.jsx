import { useLocation } from "react-router-dom";
import { Menu, ChevronRight, Sun, Moon } from "lucide-react";
import ContextSwitcher from "./ContextSwitcher.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { navByPath, moduleByPath } from "./routes.jsx";
import { useTheme } from "../foundation/context/ThemeContext.jsx";

/* Topbar — breadcrumb (<โมดูล> › <เมนู>) + the ContextSwitcher + theme toggle
   (มืด/สว่าง) + กระดิ่งแจ้งเตือน. */

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const nav = navByPath(pathname);
  const mod = moduleByPath(pathname);
  // shell-level pages (นอก module nav) — breadcrumb พิเศษ
  const shellLabel = pathname === "/notifications" ? "แจ้งเตือน" : null;

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button
          className="text-zinc-400 md:hidden"
          onClick={onMenu}
          aria-label="เปิดเมนู"
        >
          <Menu size={20} />
        </button>
        {/* ชื่อโมดูลซ่อนบนจอเล็ก — เหลือชื่อหน้าเพื่อไม่ให้ breadcrumb ถูกตัดคำ */}
        <span className="hidden text-zinc-400 sm:inline">{mod?.label ?? "SSB GROUP"}</span>
        <ChevronRight size={14} className="hidden text-zinc-400 sm:inline" />
        <span className="truncate text-zinc-100">{shellLabel ?? nav?.label ?? ""}</span>
      </div>

      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <ContextSwitcher />
        <button
          className="text-zinc-400 hover:text-zinc-200"
          onClick={toggle}
          aria-label={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
          title={theme === "dark" ? "ธีมสว่าง" : "ธีมมืด"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {/* ปุ่มสลับผู้ใช้ของเดโมเอาออกจาก topbar แล้ว — ของจริง auth มาจาก session
            ยังสลับ role ดูสิทธิ์ได้ที่การ์ดผู้ใช้มุมล่างซ้ายของ sidebar */}
        <NotificationBell />
      </div>
    </header>
  );
}
