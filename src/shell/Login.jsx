import { useState } from "react";
import { useAuth } from "../foundation/auth/AuthContext.jsx";

/* Sign-in screen (Supabase email + password). Shown by AppShell when there's
   no session. Test users are seeded with roles (see supabase/SETUP.md). */

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email.trim(), password);
    if (error) setError(error.message);
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 font-sans text-zinc-100">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-sm font-medium text-zinc-900">S</div>
          <div className="leading-tight">
            <div className="text-sm font-medium">SSB GROUP Platform</div>
            <div className="text-xs text-zinc-400">เข้าสู่ระบบ</div>
          </div>
        </div>

        <label className="mb-1 block text-xs text-zinc-400">อีเมล</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          autoComplete="username"
          className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-700"
        />
        <label className="mb-1 block text-xs text-zinc-400">รหัสผ่าน</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-700"
        />

        {error && (
          <div className="mb-3 rounded-lg border border-rose-900 bg-rose-950 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
