import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { apiClient } from "../foundation/data/apiClient.js";
import { useAuth } from "../foundation/auth/AuthContext.jsx";
import { NotifRow } from "./notifMeta.jsx";

/* กระดิ่งแจ้งเตือนบน Topbar — badge ยังไม่อ่าน + dropdown 15 รายการล่าสุด.
   สด: Supabase Realtime (INSERT ของฉัน) + refetch ตอนแท็บกลับมา focus.
   กดรายการ → mark อ่าน + เด้งไปหน้างานนั้น (n.link). ทั้งหมด → /notifications. */

const PANEL_W = 380;

export default function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null); // null = ยังไม่โหลด
  const [unread, setUnread] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const refreshCount = useCallback(() => {
    apiClient.notifications.unreadCount().then(setUnread).catch(() => {});
  }, []);

  // นับตอน mount + realtime เข้าใหม่ + กลับมาที่แท็บ
  useEffect(() => {
    refreshCount();
    const onFocus = () => refreshCount();
    window.addEventListener("focus", onFocus);
    const unsub = apiClient.notifications.subscribe(userId, (row) => {
      setUnread((c) => c + 1);
      // ถ้าเคยโหลดลิสต์แล้ว (dropdown เปิดอยู่/เคยเปิด) เติมอันใหม่ไว้บนสุด —
      // อย่า null ทิ้ง ไม่งั้นถ้าเปิดค้างจะค้าง "กำลังโหลด…"
      setItems((xs) => (xs == null ? xs : [row, ...xs].slice(0, 15)));
    });
    return () => { window.removeEventListener("focus", onFocus); unsub?.(); };
  }, [userId, refreshCount]);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - PANEL_W, window.innerWidth - PANEL_W - 8)) });
  };

  const toggle = () => {
    if (open) { setOpen(false); return; }
    place();
    setOpen(true);
    if (items == null) {
      apiClient.notifications.list(15).then(setItems).catch(() => setItems([]));
    }
  };

  // ปิดเมื่อคลิกนอก/Esc (Esc: capture + stopPropagation — อย่าปิด modal อื่นพ่วง)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!btnRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // เลื่อนหน้า → ตามปุ่มกระดิ่ง
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const openItem = (n) => {
    if (!n.read_at) {
      apiClient.notifications.markRead([n.id]).catch(() => {});
      setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    apiClient.notifications.markAll().catch(() => {});
    setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`relative ${open ? "text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
        aria-label="แจ้งเตือน"
        title="แจ้งเตือน"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_W, zIndex: 80 }}
          className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="text-sm font-medium text-zinc-100">แจ้งเตือน</span>
            {unread > 0 && (
              <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200">
                <CheckCheck size={13} /> อ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {items == null ? (
              <div className="py-10 text-center text-xs text-zinc-400">กำลังโหลด…</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-400">ยังไม่มีแจ้งเตือน</div>
            ) : (
              items.map((n) => <NotifRow key={n.id} n={n} onOpen={openItem} compact />)
            )}
          </div>
          <button
            onClick={() => { setOpen(false); navigate("/notifications"); }}
            className="block w-full border-t border-zinc-800 px-4 py-2.5 text-center text-xs text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            ดูทั้งหมด →
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
