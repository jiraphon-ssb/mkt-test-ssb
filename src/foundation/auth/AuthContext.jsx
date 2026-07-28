import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../data/supabaseClient.js";
import { permsOf } from "../rbac/can.js";


/* Real auth (Supabase) — replaces the Phase-1 stub. On sign-in we load the
   user's role rows (user_role, RLS-scoped to self) and derive:
     • roles[]        — {entity, role, approveLimit} for AP fine-grained checks
     • permissions[]  — coarse nav perms for can() / the Sidebar
   Finance/exec roles see the whole finance nav; a plain requester sees AP only. */

const AuthCtx = createContext(null);

const VIEW_ALL_ROLES = ["finance", "accountant", "approver", "viewer", "admin"];

function buildUser(authUser, roleRows, saleRoleRows) {
  const roles = (roleRows ?? []).map((r) => ({
    entity: r.entity,
    role: r.role,
    approveLimit: Number(r.approve_limit) || 0,
  }));
  const roleNames = new Set(roles.map((r) => r.role));
  const isFinanceExec = VIEW_ALL_ROLES.some((r) => roleNames.has(r));

  // any staff can submit a เบิก request ("ขอเบิกเงิน") and read the Knowledge Hub
  // (ทุกคน = Reader per the KM vision); the finance BACK-OFFICE ("เงินออก AP" +
  // AR/cashflow/report/…) is finance/exec only.
  const permissions = ["finance.request.view", "km.view"];
  if (isFinanceExec) permissions.push("finance.*"); // + the finance back-office / full nav

  // Sale OEM roles (separate from AP) — gate the sales nav + manager actions
  const saleRoles = (saleRoleRows ?? []).map((r) => ({ role: r.role, defaultBrand: r.default_brand }));
  const saleRoleNames = new Set(saleRoles.map((r) => r.role));
  if (saleRoleNames.size) permissions.push("sale.oem.view");

  const email = authUser.email ?? "";
  const allRoleNames = [...roleNames, ...saleRoleNames];
  return {
    id: authUser.id,
    email,
    name: email.split("@")[0] || "user",
    initial: (email[0] || "u").toUpperCase(),
    roleLabel: allRoleNames.length ? allRoleNames.join(" · ") : "ยังไม่มี role",
    roles,
    saleRoles,
    permissions,
  };
}


/* ── โหมดเดโม (ยังไม่ได้ตั้ง .env) ─────────────────────────────────────────────
   ยกไฟล์นี้มาจากแพลตฟอร์มทั้งไฟล์ · เพิ่มทางนี้ไว้ทางเดียวเพื่อให้เดโมเปิดดูได้
   โดยไม่ต้องมีบัญชี Supabase — ผู้ใช้มาจาก profiles ในข้อมูลเครื่อง สลับตัวได้
   วันต่อของจริง: ตั้ง .env แล้วโค้ดจะไหลเข้าทาง Supabase เองโดยไม่ต้องแก้อะไร */
function demoUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: `${profile.id}@demo.local`,
    name: profile.display_name,
    display_name: profile.display_name,
    initial: profile.display_name.slice(0, 2),
    role: profile.role,
    roleLabel: profile.role,
    roles: [],
    saleRoles: [],
    /* perm ของโมดูล marketing + km.view (ทุกคนอ่านคลังความรู้ได้ ตาม vision) */
    permissions: [...permsOf(profile), "km.view"],
  };
}

function DemoAuthProvider({ profiles, children }) {
  const pool = (profiles ?? []).filter((p) => p.active && !p.id.startsWith("hist"));
  const [id, setId] = useState(() => pool.find((p) => p.role === "team_lead")?.id ?? pool[0]?.id ?? null);
  const value = {
    user: demoUser(pool.find((p) => p.id === id) ?? pool[0]),
    users: pool.map(demoUser),
    loading: false,
    configured: true,        // เดโมถือว่าพร้อมใช้
    demo: true,
    signInAs: setId,
    signIn: async () => ({ error: null }),
    signOut: () => {},
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

function SupabaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const retriedRef = useRef(false); // กันลูป retry ตอน role query ล้มซ้ำ

  async function loadFromSession(session) {
    if (!session?.user) {
      setUser(null);
      setLoading(false);
      return;
    }
    const [roleRes, saleRes] = await Promise.all([
      supabase.from("user_role").select("entity, role, approve_limit").eq("user_id", session.user.id),
      supabase.from("sale_user_role").select("role, default_brand").eq("user_id", session.user.id),
    ]);
    // role query ล้มชั่วคราว (เน็ต/DB สะดุด) → อย่าสร้าง user ไร้สิทธิ์ทับของเดิม
    // (จะเด้งผู้ใช้ไป /request ทั้งที่สิทธิ์จริงมี) — เก็บ user เดิมไว้ + ลองใหม่ 1 ครั้ง
    if (roleRes.error || saleRes.error) {
      console.error("[auth] โหลด role ไม่สำเร็จ", roleRes.error || saleRes.error);
      setUser((prev) => prev ?? buildUser(session.user, [], []));
      setLoading(false);
      if (!retriedRef.current) {
        retriedRef.current = true;
        setTimeout(() => loadFromSession(session), 4000);
      }
      return;
    }
    retriedRef.current = false;
    setUser(buildUser(session.user, roleRes.data, saleRes.data));
    setLoading(false);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => loadFromSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      loadFromSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    configured: isSupabaseConfigured,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* เลือกทางด้วยธง VITE_AUTH_MODE — ไม่ผูกกับ "มีคีย์ Supabase ไหม" อีกแล้ว
   เพราะโปรเจกต์นี้ใช้ Supabase เก็บข้อมูล แต่ยัง "ไม่ต้องล็อกอิน" (สลับ user ได้จาก topbar)
     ไม่ตั้งค่า / อะไรก็ตาม = โหมดเดโม ไม่มีหน้าล็อกอิน  ← ค่าเริ่มต้น
     VITE_AUTH_MODE=supabase   = auth จริงของแพลตฟอร์ม (email/password + user_role) */
const useRealAuth = import.meta.env.VITE_AUTH_MODE === "supabase" && isSupabaseConfigured;

export function AuthProvider({ profiles, children }) {
  return useRealAuth
    ? <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
    : <DemoAuthProvider profiles={profiles}>{children}</DemoAuthProvider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be used within <AuthProvider>");
  return v;
}
