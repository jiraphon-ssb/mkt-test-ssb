/* RBAC — permission checks. The sidebar and (later) route guards call can()
   to decide what a user may see. Phase 1 the user is a hardcoded CEO, but the
   check is real, so adding restricted roles in Phase 2 needs no shell changes.

   Permission grammar:
   - "*"            grants everything
   - "finance.*"    grants any permission under finance.
   - "finance.ap.view"  exact grant */

export function can(user, permission) {
  const grants = user?.permissions;
  if (!Array.isArray(grants)) return false;
  return grants.some((g) => {
    if (g === "*" || g === permission) return true;
    if (g.endsWith(".*")) return permission.startsWith(g.slice(0, -1));
    return false;
  });
}

/* ── AP fine-grained access (mirror of the SQL ap_role_perm map) ────────────
   For gating BUTTONS only — every AP mutation is re-checked server-side by the
   RPCs in 0003 (permission + entity scope + limit + dual + maker≠checker). */

export const AP_ROLE_PERM = {
  requester: ["request.create", "request.view_own", "request.edit"],
  approver: ["approve", "view_all"],
  finance: ["review", "schedule", "pay", "vendor.manage", "view_all", "view_margin"],
  accountant: ["post_flow", "review", "view_all", "view_margin"],
  viewer: ["view_all"],
  admin: ["config", "view_all", "view_margin"],
};

/** Roles the user holds in a given entity (or any entity if `entity` omitted). */
function rolesIn(user, entity) {
  return (user?.roles ?? []).filter((r) => !entity || r.entity === entity);
}

/** Does the user have an AP permission in `entity`? */
export function apHas(user, perm, entity) {
  return rolesIn(user, entity).some((r) => (AP_ROLE_PERM[r.role] ?? []).includes(perm));
}

/** Max approve limit the user holds in `entity` (0 if none). */
export function apApproveLimit(user, entity) {
  return rolesIn(user, entity)
    .filter((r) => r.role === "approver" || r.role === "admin")
    .reduce((m, r) => Math.max(m, r.approveLimit), 0);
}

/** Is this user finance/exec (sees the full finance nav + finance AP view)? */
export function isFinanceExec(user) {
  return ["finance", "accountant", "approver", "viewer", "admin"].some((role) =>
    (user?.roles ?? []).some((r) => r.role === role)
  );
}

/* ── AR fine-grained access (mirror of the SQL ar_has_perm map seeded in 0013) ─
   finance.ar.view is also covered by the finance.* wildcard (nav visibility);
   these gate the sensitive ACTIONS — collect (track) and writeoff — server-side
   re-checked by ar_followup_upsert. AR maps off the AP finance roles. */
export const AR_ROLE_PERM = {
  finance: ["finance.ar.view", "finance.ar.collect", "finance.ar.writeoff", "finance.ar.other_income"],
  accountant: ["finance.ar.view", "finance.ar.collect", "finance.ar.other_income"],
  approver: ["finance.ar.view", "finance.ar.collect"],
  viewer: ["finance.ar.view"],
  admin: ["finance.ar.view", "finance.ar.collect", "finance.ar.writeoff", "finance.ar.other_income"],
};

/** Does the user hold an AR permission (collect / writeoff)? */
export function arHas(user, perm) {
  return (user?.roles ?? []).some((r) => (AR_ROLE_PERM[r.role] ?? []).includes(perm));
}

/* ── Sale OEM fine-grained access (mirror of the SQL sale_role_perm map) ─────
   Gates BUTTONS only — every Sale OEM mutation is re-checked server-side by the
   RPCs in 0011 (role + brand lock + stage machine + atomic codes). */

export const SALE_ROLE_PERM = {
  sales_rep: ["deal.create", "deal.edit", "stage.advance", "payment.add", "extra.add",
    "deal.cancel", "job.close", "view_all"],
  sales_manager: ["deal.create", "deal.edit", "stage.advance", "payment.add", "extra.add",
    "deal.cancel", "job.close", "brand.change", "total.correct", "void.receipt", "revert.confirm",
    "config", "view_all", "bill.attach"],
  sales_viewer: ["view_all"],
  // admin co — ประสานโรงงาน + จัดส่ง: เห็นทั้งทีม + ปิดงาน/ส่งของ (ไม่สร้างดีล/ไม่รับเงิน)
  admin_co: ["job.close", "view_all"],
  // accounting (0057) — เห็นทั้งทีม + แนบบิล/ใบกำกับต่อรอบชำระเท่านั้น
  accounting: ["view_all", "bill.attach"],
};

/** Does the user hold a Sale OEM permission? */
export function saleHas(user, perm) {
  return (user?.saleRoles ?? []).some((r) => (SALE_ROLE_PERM[r.role] ?? []).includes(perm));
}

/** The brand a rep is locked to (null = manager / any brand). */
export function saleDefaultBrand(user) {
  if (saleHas(user, "brand.change")) return null; // managers pick any
  const rep = (user?.saleRoles ?? []).find((r) => r.role === "sales_rep" && r.defaultBrand);
  return rep?.defaultBrand ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════════
   MARKETING — Content Pipeline (โมดูลที่พัฒนาใน ssb-content-pipeline)
   โครงเดียวกับ AP/SALE ข้างบน: role → perm list แล้วให้ can() ตัดสิน
   ⚠️ ฝั่ง client ใช้ซ่อน/ปิดปุ่มเท่านั้น — ของจริงต้องตรวจซ้ำที่ SECURITY DEFINER RPC
   ══════════════════════════════════════════════════════════════════════════════ */

export const MKT_ROLE_PERM = {
  // หัวหน้าทีม — ตรวจงาน + ตั้งกติกา + เห็นตัวเลขทุกคน
  team_lead: [
    "marketing.work.view", "marketing.work.edit", "marketing.review.decide",
    "marketing.dash.view", "marketing.results.view", "marketing.results.export",
    "marketing.people.view", "marketing.admin",
  ],
  // เจ้าของงาน — ทำงานของตัวเอง เห็นภาพรวมธุรกิจ แต่ไม่เห็นคะแนนคนอื่น (Spec ข้อ 2)
  content_owner: [
    "marketing.work.view", "marketing.work.edit",
    "marketing.dash.view", "marketing.results.view",
  ],
  // ยิงแอด — คุมงาน project/ads + เห็นตัวเลขทุกคน (ต้องใช้วางแผนงบ)
  performance_marketer: [
    "marketing.work.view", "marketing.work.edit",
    "marketing.dash.view", "marketing.results.view", "marketing.results.export",
    "marketing.people.view",
  ],
};

/** perm ทั้งหมดของ profile คนหนึ่งในโมดูล marketing */
export function permsOf(profile) {
  if (!profile) return [];
  return MKT_ROLE_PERM[profile.role] ?? [];
}

/** ตัดสินงานใน Review ได้ (กติกาเหล็ก: ออกจาก Review ทางปุ่มของ Team Lead เท่านั้น) */
export const canDecide = (user) => can(user, "marketing.review.decide");

/** เห็นตัวเลขรายบุคคลของคนอื่น (content_owner เห็นแค่ของตัวเอง) */
export const canSeePeople = (user) => can(user, "marketing.people.view");
