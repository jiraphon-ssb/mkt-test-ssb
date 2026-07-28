import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Tag, Check } from "lucide-react";
import { useEntityContext } from "../foundation/context/EntityContext.jsx";

/* The entity/brand switcher. Lives in the shell topbar — it is the ONLY place
   context changes. Modules read context; they never render their own switcher. */

export default function ContextSwitcher() {
  const { ctx, setCtx, entities, brands, label } = useEntityContext();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (next) => {
    setCtx(next);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-shrink items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-900 bg-emerald-950 px-2 py-1.5 text-sm text-emerald-300 hover:border-emerald-800 sm:gap-2 sm:px-2.5"
        title={`กำลังดู ${label}`}
      >
        <Building2 size={15} className="flex-shrink-0" />
        {/* คำว่า "กำลังดู" ซ่อนบนจอเล็ก — ป้ายเดียวเบียด topbar จนขึ้น 2 บรรทัด */}
        <span className="hidden text-emerald-200 sm:inline">กำลังดู</span>
        <span className="truncate font-medium text-zinc-100">{label}</span>
        <ChevronDown size={14} className="flex-shrink-0 text-emerald-200" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-56 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl">
          <div className="px-2 py-1 text-xs tracking-wide text-zinc-400">นิติบุคคล</div>
          {Object.values(entities).map((e) => (
            <Opt
              key={e.key}
              on={ctx.kind === "entity" && ctx.key === e.key}
              icon={<Building2 size={15} />}
              label={e.label}
              sub={e.sub}
              onClick={() => pick({ kind: "entity", key: e.key })}
            />
          ))}

          <div className="my-1 border-t border-zinc-800" />
          <div className="px-2 py-1 text-xs tracking-wide text-zinc-400">แบรนด์</div>
          {Object.values(brands).map((b) => (
            <Opt
              key={b.key}
              on={ctx.kind === "brand" && ctx.key === b.key}
              icon={<Tag size={15} />}
              label={b.label}
              onClick={() => pick({ kind: "brand", key: b.key })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Opt({ on, icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${
        on ? "bg-zinc-800 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      <span className={on ? "text-emerald-400" : "text-zinc-400"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {sub && <span className="text-xs text-zinc-400">{sub}</span>}
      {on && <Check size={14} className="text-emerald-400" />}
    </button>
  );
}
