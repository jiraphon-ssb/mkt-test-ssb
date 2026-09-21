// @vitest-environment jsdom
/* บั๊กโหลดช้า 21 ก.ย. ค่ำ: getSession + onAuthStateChange(INITIAL_SESSION) เรียก loadFromSession ซ้ำ
   → mkt_profile โดนยิง 2–3 ครั้งตอนเปิดแอป · เซสชันเดิม (key เดียวกัน) ต้องโหลด role แค่ครั้งเดียว */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const session = { access_token: "tok-1", user: { id: "u1", email: "a@b.co" } };
const calls = { profile: 0 };
const chain = (result) => {
  const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve(result), then: (fn) => Promise.resolve(result).then(fn) };
  return q;
};
let fireAuthEvent;
vi.mock("../src/foundation/data/supabaseClient.js", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: (cb) => { fireAuthEvent = cb; cb("INITIAL_SESSION", session); return { data: { subscription: { unsubscribe: () => {} } } }; },
      signInWithPassword: () => {}, signOut: () => {},
    },
    from: (table) => {
      if (table === "mkt_profile") { calls.profile += 1; return chain({ data: { id: "p1", display_name: "อาร์ต", role: "team_lead", active: true }, error: null }); }
      return chain({ data: [], error: null });
    },
  },
}));
/* useRealAuth ถูกคำนวณตอน import จาก VITE_AUTH_MODE — ต้อง stub ก่อน import
   ไม่งั้นเทสผ่านเฉพาะเครื่องที่ .env ตั้ง supabase แล้วแดงบน CI (เจอจริง run 35557428719) */
vi.stubEnv("VITE_AUTH_MODE", "supabase");
const { AuthProvider, useAuth } = await import("../src/foundation/auth/AuthContext.jsx");

afterEach(cleanup);
function Probe() { const { user, loading } = useAuth(); return <div>{loading ? "loading" : user?.name ?? "none"}</div>; }

describe("SupabaseAuthProvider — เซสชันเดียว โหลด role ครั้งเดียว", () => {
  it("getSession + INITIAL_SESSION + SIGNED_IN ของเซสชันเดิม = mkt_profile ยิงครั้งเดียว", async () => {
    render(<AuthProvider profiles={[]}><Probe/></AuthProvider>);
    await waitFor(() => expect(screen.getByText("อาร์ต")).toBeTruthy());
    fireAuthEvent("SIGNED_IN", session);               // supabase ชอบยิงเหตุการณ์ซ้ำหลัง getSession
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.profile).toBe(1);
  });
});
