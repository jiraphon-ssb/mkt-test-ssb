/* Design system primitives — extracted from the design reference
   (reference/SSBFinanceShell.jsx). Edit here once; every module inherits.
   Theme: zinc surfaces, emerald accent, font-mono + tabular-nums for figures. */

/** Standard panel/card surface. */
export function Card({ className = "", children, ...rest }) {
  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900 p-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/** KPI tile. `big` for headline figures, `tone="emerald"` for positive net. */
export function Kpi({ label, value, tone, big }) {
  return (
    <div className="rounded-lg bg-zinc-900 p-3.5">
      <div className="mb-1.5 text-xs text-zinc-500">{label}</div>
      <div
        className={`font-mono tabular-nums ${big ? "text-2xl" : "text-lg"} font-medium ${
          tone === "emerald" ? "text-emerald-400" : "text-zinc-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** Small swatch + label, e.g. chart legends. */
export function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

const PILL_TONES = {
  emerald: "bg-emerald-950 text-emerald-400",
  amber: "bg-amber-950 text-amber-400",
  rose: "bg-rose-950 text-rose-400",
  zinc: "bg-zinc-800 text-zinc-300",
};

/** Status pill / badge. */
export function Badge({ tone = "zinc", className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Secondary button matching the reference's outlined style. */
export function Button({ className = "", children, ...rest }) {
  return (
    <button
      className={`rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Centered empty / informational state inside a bordered card. */
export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium">{title}</h3>
      {children && (
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
