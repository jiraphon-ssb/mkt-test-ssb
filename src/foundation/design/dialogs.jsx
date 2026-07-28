/* In-app dialogs — replace the browser's confirm()/prompt()/alert() (which look
   out of place + can't be themed) with one styled modal. Promise-based so call
   sites stay ~1:1:  if (await confirmDialog({...})) ...  /  const s = await promptDialog({...})
   Mount <DialogHost/> once at the app root; then any module can import the
   functions from foundation/design (กติกาเหล็ก #1 — shared code lives in foundation). */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// module-level bridge to the mounted host; set by DialogHost on mount
const bridge = { open: null };

function ask(opts) {
  if (bridge.open) return bridge.open(opts);
  // fallback if host isn't mounted yet (defensive — shouldn't happen in-app)
  if (opts.kind === "confirm") return Promise.resolve(window.confirm(opts.message || opts.title || ""));
  if (opts.kind === "prompt") return Promise.resolve(window.prompt(opts.message || opts.title || "", opts.defaultValue || ""));
  window.alert(opts.message || opts.title || "");
  return Promise.resolve();
}

/** Yes/No. Resolves true on confirm, false otherwise. */
export const confirmDialog = (opts = {}) => ask({ kind: "confirm", ...opts });
/** Text input. Resolves the trimmed string on confirm, or null if cancelled. */
export const promptDialog = (opts = {}) => ask({ kind: "prompt", ...opts });
/** Message + OK. Resolves when dismissed. */
export const alertDialog = (opts = {}) => ask({ kind: "alert", ...opts });

const toneCls = (tone) =>
  tone === "amber" ? "bg-amber-600 hover:bg-amber-500"
  : tone === "emerald" ? "bg-emerald-600 hover:bg-emerald-500"
  : "bg-rose-600 hover:bg-rose-500";

export function DialogHost() {
  const [state, setState] = useState(null);   // { kind, ..., resolve } | null
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    bridge.open = (opts) => new Promise((resolve) => {
      setValue(opts.defaultValue || "");
      setState({ ...opts, resolve });
    });
    return () => { bridge.open = null; };
  }, []);

  useEffect(() => {
    if (state && (state.kind === "prompt")) {
      // focus the input once the modal is in the DOM
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state) return null;

  const { kind, title, message, resolve } = state;
  const isPrompt = kind === "prompt";
  const isAlert = kind === "alert";
  const required = isPrompt && state.required;
  const canConfirm = !required || value.trim() !== "";

  const done = (result) => { setState(null); resolve(result); };
  const onCancel = () => done(isPrompt ? null : isAlert ? undefined : false);
  const onConfirm = () => {
    if (isPrompt) { if (canConfirm) done(value.trim()); return; }
    done(isAlert ? undefined : true);
  };

  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    else if (e.key === "Enter" && (!isPrompt || !state.multiline)) { e.preventDefault(); onConfirm(); }
  };
  const closeIfSelf = (e) => { if (e.target === e.currentTarget) onCancel(); };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={closeIfSelf} onKeyDown={onKey}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl" role="dialog" aria-modal="true">
        {title && <div className="text-base font-medium text-zinc-100">{title}</div>}
        {message && <p className={`whitespace-pre-line text-sm leading-relaxed text-zinc-300 ${title ? "mt-1.5" : ""}`}>{message}</p>}

        {isPrompt && (
          state.multiline ? (
            <textarea ref={inputRef} rows={3} value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={state.placeholder || ""}
              className="mt-3 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700" />
          ) : (
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)}
              placeholder={state.placeholder || ""}
              className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-700" />
          )
        )}

        <div className="mt-4 flex justify-end gap-2">
          {!isAlert && (
            <button onClick={onCancel}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {state.cancelLabel || "ยกเลิก"}
            </button>
          )}
          <button onClick={onConfirm} disabled={!canConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${isAlert ? "bg-emerald-600 hover:bg-emerald-500" : toneCls(state.tone)}`}>
            {state.confirmLabel || "ตกลง"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
