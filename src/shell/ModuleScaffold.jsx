import { CircleDot } from "lucide-react";

/* Generic placeholder screen for finance modules that aren't built yet.
   Renders from a nav config entry (label, status, purpose, plan, note).
   Sits on the same shell as live modules — it inherits entity/brand context,
   permissions, and the single apiClient automatically. */

const STATUS_TONE = {
  "พร้อมเริ่ม": "text-emerald-400 bg-emerald-950",
  "ลำดับถัดไป": "text-zinc-300 bg-zinc-800",
};

export default function ModuleScaffold({ nav }) {
  const Icon = nav.icon;
  const statusTone = STATUS_TONE[nav.status] ?? "text-amber-400 bg-amber-950";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-emerald-400">
          {Icon && <Icon size={22} />}
        </div>
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-medium">
            {nav.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusTone}`}>
              {nav.status}
            </span>
          </h1>
          {nav.purpose && <p className="text-sm text-zinc-400">{nav.purpose}</p>}
        </div>
      </div>

      {nav.plan?.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-3 text-sm font-medium text-zinc-300">โครงที่วางไว้</div>
          <ul className="space-y-2.5">
            {nav.plan.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-400">
                <CircleDot size={15} className="mt-0.5 flex-shrink-0 text-zinc-400" />
                {p}
              </li>
            ))}
          </ul>
          {nav.note && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-zinc-400">
              {nav.note}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-zinc-400">
        โมดูลนี้นั่งบน shell เดียวกับ cashflow — รับบริบทนิติบุคคล/แบรนด์, สิทธิ์
        และ apiClient ตัวเดียวกันอัตโนมัติ
      </p>
    </div>
  );
}
