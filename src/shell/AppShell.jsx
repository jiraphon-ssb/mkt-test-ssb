import { lazy, Suspense, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import Login from "./Login.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import ModuleScaffold from "./ModuleScaffold.jsx";
import { ALL_NAV, DEFAULT_ROUTE } from "./routes.jsx";
import { useAuth } from "../foundation/auth/AuthContext.jsx";
import { can } from "../foundation/rbac/can.js";
import { DialogHost } from "../foundation/design/index.js";

// Code-split per module (React.lazy) — each screen loads on first visit, so the
// initial bundle stays light no matter how many modules the platform grows.
/* โปรเจกต์นี้มีเฉพาะโมดูล marketing — โมดูลการเงิน/OEM/CRM ยังอยู่ที่ platform
   nav ของโมดูลเหล่านั้นยังโชว์ (ให้เห็นภาพระบบเต็ม) แต่จะตกไป <ModuleScaffold/> */
const MarketingModule = lazy(() => import("../modules/marketing/MarketingModule.jsx"));
const NotificationsPage = lazy(() => import("./NotificationsPage.jsx"));

/* AppShell — the single outer frame every module renders inside.
   Gates on Supabase auth: no session → Login. Layout (sidebar + topbar) + the
   router; nav + routes are filtered by the user's permissions via can(). */

// Elements that don't depend on the signed-in user (user-bound ones — vendor /
// cost master / ผังบัญชี — are built inside the component where `user` is known).
const MODULE_ELEMENTS = {
  mkt_work: <MarketingModule view="work" />,
  mkt_dash: <MarketingModule view="dash" />,
};

export default function AppShell() {
  const { user, loading, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  /* เดโมนี้ไม่บังคับ Supabase — AuthContext จะแจกผู้ใช้เดโมให้เมื่อยังไม่ได้ตั้ง .env
     (ของจริงบนแพลตฟอร์มจะโชว์หน้าบอกให้ตั้งค่า แล้วปิดทางเข้า) */
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-zinc-950 font-sans text-sm text-zinc-400">กำลังโหลด…</div>;
  }
  if (!user) return <Login />;

  // Routes the user may see; land on cashflow if allowed, else their first nav.
  const allowed = ALL_NAV.filter((n) => can(user, n.perm));
  const defaultRoute = allowed.some((n) => n.path === DEFAULT_ROUTE)
    ? DEFAULT_ROUTE
    : allowed[0]?.path ?? "/ap";

  const elements = MODULE_ELEMENTS;

  return (
    <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-100 font-sans antialiased">
      <DialogHost />
      <Sidebar
        user={user}
        onSignOut={signOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setSidebarOpen(true)} />

        <main className="min-w-0 flex-1 px-5 py-5">
          {/* กันจอขาว: โมดูลพัง/โหลด chunk ไม่ได้ → พังแค่พื้นที่เนื้อหา, key=pathname
              ให้ลองใหม่เมื่อเปลี่ยนหน้า */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<div className="py-20 text-center text-sm text-zinc-400">กำลังโหลด…</div>}>
              <Routes>
                <Route path="/" element={<Navigate to={defaultRoute} replace />} />
                {/* shell-level page — เข้าจากกระดิ่ง ไม่อยู่ใน sidebar nav */}
                <Route path="/notifications" element={<NotificationsPage />} />
                {allowed.map((n) => (
                  <Route
                    key={n.id}
                    path={n.path}
                    element={elements[n.id] ?? <ModuleScaffold nav={n} />}
                  />
                ))}
                <Route path="*" element={<Navigate to={defaultRoute} replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
