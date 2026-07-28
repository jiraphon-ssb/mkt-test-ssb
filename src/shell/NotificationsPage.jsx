import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, CheckCheck } from "lucide-react";
import { apiClient } from "../foundation/data/apiClient.js";
import { thaiDate } from "../foundation/utils/format.js";
import { NotifRow } from "./notifMeta.jsx";

/* หน้ารวมแจ้งเตือน (/notifications) — ลิสต์เต็ม จัดกลุ่มตามวัน + filter
   ทั้งหมด/ยังไม่อ่าน + อ่านทั้งหมด + โหลดเพิ่มทีละหน้า. shell-level page
   (ไม่อยู่ใน sidebar — เข้าจากกระดิ่ง). */

const PAGE = 40;

const dayKey = (iso) => {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "เมื่อวาน";
  return thaiDate(d, { year: true });
};

export default function NotificationsPage() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all"); // all | unread
  const [full, setFull] = useState(false);     // โหลดครบแล้ว (หน้าสุดท้าย)
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = (offset = 0) => {
    setBusy(true);
    apiClient.notifications.list(PAGE, offset)
      .then((rows) => {
        setItems((xs) => (offset === 0 ? rows : [...(xs ?? []), ...rows]));
        if (rows.length < PAGE) setFull(true);
      })
      // ตาราง 0069 ยังไม่รัน / query error → แสดง empty แทนค้าง "กำลังโหลด…"
      .catch(() => { setItems((xs) => xs ?? []); setFull(true); })
      .finally(() => setBusy(false));
  };
  useEffect(() => { load(0); }, []);

  const shown = useMemo(
    () => (items ?? []).filter((n) => (filter === "unread" ? !n.read_at : true)),
    [items, filter]
  );
  const groups = useMemo(() => {
    const g = [];
    let cur = null;
    for (const n of shown) {
      const k = dayKey(n.created_at);
      if (!cur || cur.key !== k) { cur = { key: k, rows: [] }; g.push(cur); }
      cur.rows.push(n);
    }
    return g;
  }, [shown]);
  const unreadCount = (items ?? []).filter((n) => !n.read_at).length;

  const openItem = (n) => {
    if (!n.read_at) {
      apiClient.notifications.markRead([n.id]).catch(() => {});
      setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    apiClient.notifications.markAll().catch(() => {});
    setItems((xs) => xs?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-medium text-zinc-100">
          <BellRing size={18} className="text-emerald-400" /> แจ้งเตือน
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            {[["all", "ทั้งหมด"], ["unread", `ยังไม่อ่าน${unreadCount ? ` (${unreadCount})` : ""}`]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1 text-xs transition ${
                  filter === k ? "bg-zinc-700 font-medium text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <CheckCheck size={13} /> อ่านทั้งหมด
            </button>
          )}
        </div>
      </div>

      {items == null ? (
        <div className="py-20 text-center text-sm text-zinc-400">กำลังโหลด…</div>
      ) : shown.length === 0 && full ? (
        // ว่างจริงต่อเมื่อโหลดครบทุกหน้าแล้ว — ไม่งั้นที่ยังไม่อ่านอาจอยู่หน้าถัดไป
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 py-16 text-center text-sm text-zinc-400">
          {filter === "unread" ? "อ่านครบทุกรายการแล้ว 🎉" : "ยังไม่มีแจ้งเตือน"}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.length === 0 && filter === "unread" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 py-10 text-center text-sm text-zinc-400">
              ไม่พบที่ยังไม่อ่านในหน้านี้ — โหลดเพิ่มเพื่อค้นต่อ
            </div>
          )}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{g.key}</div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-1.5">
                {g.rows.map((n) => <NotifRow key={n.id} n={n} onOpen={openItem} />)}
              </div>
            </div>
          ))}
          {!full && (
            <button
              onClick={() => load(items.length)}
              disabled={busy}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              {busy ? "กำลังโหลด…" : "โหลดเพิ่ม"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
