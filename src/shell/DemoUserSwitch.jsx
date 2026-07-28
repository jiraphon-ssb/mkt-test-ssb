/* สลับผู้ใช้ในโหมดเดโม — โผล่เฉพาะเมื่อ auth เป็น demo (ยังไม่ได้ตั้ง .env)
   ของจริงบนแพลตฟอร์มจะไม่มีปุ่มนี้ (auth มาจาก Supabase session)

   ตอนนี้ "ไม่ได้ถูกเรียกใช้" แล้ว — ถอดออกจาก Topbar ตามที่สั่ง
   ถ้าต้องสลับ role ตอนสาธิต ให้ import กลับเข้า Topbar.jsx บรรทัดข้าง NotificationBell */

import { useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { useAuth } from "../foundation/auth/AuthContext.jsx";

export default function DemoUserSwitch() {
  const { user, users, signInAs, demo } = useAuth();
  const [open, setOpen] = useState(false);
  if (!demo || !user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-700"
        title="เดโม — สลับผู้ใช้เพื่อดูสิทธิ์"
      >
        <UserRound size={14} />
        {user.display_name}
        <span className="text-zinc-400">· {user.roleLabel}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[240px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">
              โหมดเดโม — สลับผู้ใช้เพื่อดูสิทธิ์
            </div>
            {(users ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => { signInAs(p.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-zinc-800 ${
                  p.id === user.id ? "bg-emerald-950/40 text-emerald-400" : "text-zinc-200"
                }`}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {p.initial}
                </span>
                {p.display_name}
                <span className="ml-auto text-[11px] text-zinc-400">{p.roleLabel}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
