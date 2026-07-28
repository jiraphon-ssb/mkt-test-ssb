/* ============================================================
   App — ลำดับ provider เดียวกับ platform/src/App.jsx
   ThemeProvider → AuthProvider → EntityProvider → AppShell
   (routing อยู่ใน AppShell · <BrowserRouter> mount ที่ main.jsx)

   ต่างจากแพลตฟอร์มจุดเดียว: ส่ง profiles เข้า AuthProvider เพื่อให้โหมดเดโม
   (ยังไม่ตั้ง .env) มีผู้ใช้ให้สลับ — ของจริง auth มาจาก Supabase session
   ============================================================ */

import { ThemeProvider } from "./foundation/context/ThemeContext.jsx";
import { AuthProvider } from "./foundation/auth/AuthContext.jsx";
import { EntityProvider } from "./foundation/context/EntityContext.jsx";
import { apiClient } from "./foundation/data/apiClient.js";
import AppShell from "./shell/AppShell.jsx";
import { AppProvider } from "./modules/marketing/useMkt.jsx";

const boot = apiClient.marketing.load();

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider profiles={boot.profiles}>
        <EntityProvider>
          {/* state ของโมดูล marketing — อยู่ใต้ EntityProvider เพราะโมดูลอ่านบริบทจาก shell */}
          <AppProvider>
            <AppShell />
          </AppProvider>
        </EntityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
