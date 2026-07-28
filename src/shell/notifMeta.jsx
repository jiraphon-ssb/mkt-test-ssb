import { HandCoins, CheckCircle2, XCircle, Banknote, Undo2, Factory, Receipt, Wrench, Sun } from "lucide-react";
import { timeAgo } from "../foundation/utils/format.js";

/* ทะเบียนประเภทแจ้งเตือน — จุดเดียวที่ผูก type (จาก DB trigger, 0069) กับ
   ไอคอน/สี. ใช้ร่วมโดยกระดิ่ง (NotificationBell) และหน้ารวม (NotificationsPage).
   type ใหม่ที่ยังไม่รู้จัก = fallback กระดิ่งเทา — เพิ่ม type ฝั่ง SQL ได้โดย FE ไม่พัง. */

export const TYPE_META = {
  ap_submitted:    { icon: HandCoins,    cls: "text-emerald-400", label: "คำขอเบิกใหม่" },
  ap_await_approve:{ icon: CheckCircle2, cls: "text-amber-400",   label: "รออนุมัติ" },
  ap_approved:     { icon: CheckCircle2, cls: "text-emerald-400", label: "อนุมัติแล้ว" },
  ap_rejected:     { icon: XCircle,      cls: "text-rose-400",    label: "ตีกลับ" },
  ap_paid:         { icon: Banknote,     cls: "text-emerald-400", label: "จ่ายแล้ว" },
  oem_revert_wait: { icon: Undo2,        cls: "text-rose-400",    label: "ขอถอนออเดอร์" },
  oem_new_job:     { icon: Factory,      cls: "text-sky-400",     label: "งานใหม่" },
  oem_payment:     { icon: Receipt,      cls: "text-sky-400",     label: "รับเงิน" },
  oem_rework:      { icon: Wrench,       cls: "text-amber-400",   label: "งานแก้" },
  digest:          { icon: Sun,          cls: "text-amber-400",   label: "สรุปเช้า" },
};

const FALLBACK = { icon: HandCoins, cls: "text-zinc-400", label: "" };

/** แถวแจ้งเตือนหนึ่งรายการ — ใช้ทั้งใน dropdown และหน้ารวม */
export function NotifRow({ n, onOpen, compact = false }) {
  const meta = TYPE_META[n.type] ?? FALLBACK;
  const Icon = meta.icon;
  const unread = !n.read_at;
  return (
    <button
      onClick={() => onOpen(n)}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-800/60 ${
        unread ? "bg-zinc-800/40" : ""
      }`}
    >
      <Icon size={16} className={`mt-0.5 shrink-0 ${meta.cls}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${unread ? "font-medium text-zinc-100" : "text-zinc-300"}`}>
          {n.title}
        </span>
        {n.body && (
          <span className={`mt-0.5 block text-xs leading-snug text-zinc-400 ${compact ? "line-clamp-2" : ""}`}>
            {n.body}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-zinc-400">{timeAgo(n.created_at)}</span>
      </span>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
    </button>
  );
}
