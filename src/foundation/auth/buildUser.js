import { permsOf } from "../rbac/can.js";

/* buildUser — แปลงผู้ใช้ Supabase Auth + แถวสิทธิ์ เป็น user ของแอป (pure · มีเทสใน tests/authBuildUser.test.js)
   แหล่งสิทธิ์ 3 ทาง รวมกันได้:
     • user_role       → finance/AP (ถ้าโปรเจกต์มีตารางนี้)
     • sale_user_role  → sale OEM
     • mkt_profile     → marketing ผ่าน auth_user_id (migration 0005) — role เดียวกับโหมดเดโม (MKT_ROLE_PERM) */

const VIEW_ALL_ROLES = ["finance", "accountant", "approver", "viewer", "admin"];

export function buildUser(authUser, roleRows, saleRoleRows, mktProfile = null) {
  const roles = (roleRows ?? []).map((r) => ({
    entity: r.entity,
    role: r.role,
    approveLimit: Number(r.approve_limit) || 0,
  }));
  const roleNames = new Set(roles.map((r) => r.role));
  const isFinanceExec = VIEW_ALL_ROLES.some((r) => roleNames.has(r));

  // any staff can submit a เบิก request ("ขอเบิกเงิน") and read the Knowledge Hub;
  // the finance BACK-OFFICE is finance/exec only.
  const permissions = ["finance.request.view", "km.view"];
  if (isFinanceExec) permissions.push("finance.*");

  const saleRoles = (saleRoleRows ?? []).map((r) => ({ role: r.role, defaultBrand: r.default_brand }));
  const saleRoleNames = new Set(saleRoles.map((r) => r.role));
  if (saleRoleNames.size) permissions.push("sale.oem.view");

  // marketing: เฉพาะโปรไฟล์ที่ active — role/active แก้จาก client ไม่ได้ (trigger mkt_profile_guard_privileges)
  const mkt = mktProfile?.active ? mktProfile : null;
  if (mkt) permissions.push(...permsOf(mkt));

  const email = authUser.email ?? "";
  const allRoleNames = [...roleNames, ...saleRoleNames, ...(mkt ? [mkt.role] : [])];
  return {
    id: authUser.id,
    email,
    name: mkt?.display_name || email.split("@")[0] || "user",
    initial: (mkt?.display_name || email || "u").slice(0, mkt ? 2 : 1).toUpperCase(),
    role: mkt?.role ?? null,
    mktProfileId: mkt?.id ?? null,
    roleLabel: allRoleNames.length ? allRoleNames.join(" · ") : "ยังไม่มี role",
    roles,
    saleRoles,
    permissions,
  };
}

/** ตารางไม่มีในโปรเจกต์นี้ (เช่นเซิร์ฟเทสที่มีแต่ mkt_*) — ถือว่า "ไม่มีแถว" ไม่ใช่ error ชั่วคราวที่ต้อง retry */
export function isMissingTable(error) {
  if (!error) return false;
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return /could not find the table|relation .* does not exist/i.test(error.message ?? "");
}
