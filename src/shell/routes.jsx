import {
  Kanban, Gauge,
  ArrowUpRight, ArrowDownLeft, Activity, BarChart3, Target, CheckCheck,
  ShoppingCart, Megaphone, Users, UserRound, LayoutDashboard, HandCoins, ClipboardList,
  CalendarClock, Building2, Store, Sliders, ListTree, Landmark, Shirt, Settings, BookOpen,
} from "lucide-react";

/* Single source of truth for platform navigation + routing.
   Top level = the 6 SSB GROUP PLATFORM modules (FINANCE / SALE·CRM /
   OEM OPERATION / MARKETING / HR·GA / SETTINGS). The Sidebar renders a module
   switcher; below it, the ACTIVE module's nav — groups (หมวดหลัก, collapsible)
   → items (หมวดย่อย). The router + Topbar breadcrumb read the flat ALL_NAV.
   See finance-module-ia-redesign. */

// ── FINANCE — 4 money hubs (transactional) + a reference/master group ────────
export const FINANCE_GROUPS = [
  {
    id: "out", label: "เงินออก",
    items: [
      {
        id: "request", path: "/request", label: "ขอเบิกเงิน", icon: HandCoins,
        perm: "finance.request.view", status: "live",
        purpose: "ยื่นคำขอเบิก/จ่าย — จ่าย vendor · คืนสำรองจ่าย · เคลียร์เงินสดย่อย",
      },
      {
        id: "ap", path: "/ap", label: "อนุมัติจ่าย (AP)", icon: ArrowUpRight,
        perm: "finance.ap.view", status: "live",
        purpose: "คำขอจ่าย → อนุมัติตามวงเงิน → ตั้งจ่าย → คีย์เข้า Flow",
      },
      {
        id: "clearance", path: "/clearance", label: "รายการค้างเคลียร์", icon: ClipboardList,
        perm: "finance.ap.view", status: "live",
        purpose: "เงินสำรอง/ทดรองที่จ่ายแล้ว ตามเก็บคืน — เคลียร์ / ตัดหนี้สูญ (maker≠checker)",
      },
      {
        id: "amort", path: "/amort", label: "จ่ายล่วงหน้า", icon: CalendarClock,
        perm: "finance.ap.view", status: "live",
        purpose: "prepaid (ค่าเช่า/ประกัน จ่ายล่วงหน้า) — ตัดมูลค่าเข้า P/L รายเดือน",
      },
      {
        id: "amort_asset", path: "/amort/asset", label: "ทรัพย์สิน / ค่าเสื่อม", icon: Building2,
        perm: "finance.ap.view", status: "live",
        purpose: "ทรัพย์สินถาวร — ค่าเสื่อมเข้า P/L รายเดือน (ประมาณการบริหาร)",
      },
    ],
  },
  {
    id: "in", label: "เงินเข้า",
    items: [
      {
        id: "ar", path: "/ar", label: "เงินเข้า (AR)", icon: ArrowDownLeft,
        perm: "finance.ar.view", status: "live",
        purpose: "คาดการณ์เงินเข้า + ลูกหนี้/aging · ลูกหนี้อื่น · เงินรับล่วงหน้า · รายได้อื่น",
      },
    ],
  },
  {
    id: "cash", label: "เงินสด",
    items: [
      {
        id: "cashflow", path: "/cashflow", label: "กระแสเงินสด", icon: Activity,
        perm: "finance.cashflow.view", status: "live",
        purpose: "แดชบอร์ดกระแสเงินสด — มอนิเตอร์เงินเข้า/ออกรายสัปดาห์/เดือน",
      },
      {
        id: "recon", path: "/recon", label: "กระทบยอดแบงก์", icon: CheckCheck,
        perm: "finance.recon.view", status: "live",
        purpose: "กระทบยอดสมุด vs แบงก์จริง + จับคู่รายการสเตทเมนต์",
      },
    ],
  },
  {
    id: "rpt", label: "รายงาน",
    items: [
      {
        id: "report", path: "/report", label: "รายงานบริหาร", icon: BarChart3,
        perm: "finance.report.view", status: "live",
        purpose: "P/L บริหาร · กำไรต่องาน — รายกลุ่ม / รายนิติบุคคล",
      },
      {
        id: "budget", path: "/budget", label: "งบประมาณ", icon: Target,
        perm: "finance.budget.view",
        purpose: "ตั้งงบ + budget vs actual รายแบรนด์/แผนก",
      },
    ],
  },
  {
    id: "master", label: "ข้อมูลหลัก / คู่ค้า", divider: true,
    items: [
      {
        id: "vendor", path: "/vendor", label: "ผู้ขาย / คู่ค้า", icon: Store,
        perm: "finance.ap.view", status: "live",
        purpose: "ทะเบียนผู้ขาย + โรงงาน — เพิ่ม/แก้/archive (สิทธิ์ vendor.manage)",
      },
      {
        id: "cost_master", path: "/cost-master", label: "ต้นทุนมาตรฐาน", icon: Sliders,
        perm: "finance.ap.view", status: "live",
        purpose: "เรทต้นทุนรายโรงงาน (พิมพ์ลาย ทรงคอ×ชั้นจำนวน + option) — คิดกำไรต่องาน",
      },
      {
        id: "coa", path: "/coa", label: "ผังบัญชี", icon: ListTree,
        perm: "finance.report.view", status: "live",
        purpose: "map หมวดค่าใช้จ่าย → บรรทัด P/L (Chart of Accounts)",
      },
    ],
  },
];

// ── SALE / CRM — ลูกค้า + แดชบอร์ดยอดขาย (อ่านต่อยอดจาก OEM operation) ──────────
const SALE_GROUPS = [
  {
    id: "sale_main",
    items: [
      {
        id: "oem_crm", path: "/oem/crm", label: "ฐานลูกค้า (CRM)", icon: UserRound,
        perm: "sale.oem.view", status: "live",
        purpose: "ฐานลูกค้า + RFM + ป้ายสงสัยซ้ำ + คิวติดตาม/ชวนสั่งซ้ำ (อ่านต่อยอดจาก OEM)",
      },
      {
        id: "oem_report", path: "/oem/dashboard", label: "แดชบอร์ดยอดขาย", icon: LayoutDashboard,
        perm: "sale.oem.view", status: "ลำดับถัดไป",
        purpose: "แดชบอร์ดยอดขาย/Bookings/AR รายแบรนด์ · รายเซล · รายช่วงเวลา",
        plan: [
          "Bookings / รายได้ตามแบรนด์ × เดือน",
          "ยอดคงค้าง (AR) + funnel conversion",
          "อันดับเซล / สินค้า / ลูกค้า",
          "เชื่อม revenue เข้า P/L (รายงานบริหาร)",
        ],
        note: "อ่าน read-only จากข้อมูล OEM operation",
      },
    ],
  },
];

// ── OEM OPERATION — order pipeline ทั้งเส้น (Lead → มัดจำ → งวดแรก → จัดส่ง) ───
const OEM_GROUPS = [
  {
    id: "oem_main",
    items: [
      {
        id: "oem_ops", path: "/oem", label: "ออเดอร์ OEM", icon: ShoppingCart,
        perm: "sale.oem.view", status: "พร้อมเริ่ม",
        purpose: "ออเดอร์ OEM 4 สเตป (Lead → มัดจำ → งวดแรก → จัดส่ง) → รับรู้รายได้",
      },
    ],
  },
];

// ── KNOWLEDGE HUB — ศูนย์กลางความรู้ (โครงรอ spec นิ่ง — SSB_Knowledge_Hub_Vision) ──
// ทุกคน = Reader (perm km.view แจกทุก user ใน AuthContext). เนื้อจริงสร้างเป็นเฟส
// เมื่อเคาะ 3 เรื่อง: สิทธิ์ 4 ระดับ map user_role · ฟิลด์ MetaHeader · ขอบเขต v1.
const KM_GROUPS = [
  {
    id: "km_main",
    items: [
      {
        id: "km_home", path: "/km", label: "คลังความรู้", icon: BookOpen,
        perm: "km.view", status: "รอ spec นิ่ง",
        purpose: "ศูนย์กลางความรู้ SSB — คลังเอกสารที่เชื่อถือได้ + กระจายความรู้ + เทรนนิ่ง + AI ถาม-ตอบ (อยู่ใต้สิทธิ์ชุดเดียว)",
        plan: [
          "เฟส 1 · คลังเอกสาร: หมวดความรู้ + หน้าเอกสาร + MetaHeader (owner / รอบ review / ระดับ / effective date) + สิทธิ์ 4 ระดับ (Admin·Maintainer·Lead·Reader)",
          "เฟส 2 · ค้นหาภาษาไทยทั้งคลัง + Glossary (ศัพท์บริษัท hover เห็นความหมาย) + Asset Library",
          "เฟส 3 · ประกาศ & กดรับทราบ — push แจ้งคนที่เกี่ยวข้อง + admin เห็นว่าใครยังไม่อ่าน",
          "เฟส 4 · เทรนนิ่ง (คอร์ส = playlist หน้า KB) + quiz + AI ผู้ช่วยตอบจากคลังพร้อมอ้างอิง (RAG ตามสิทธิ์)",
        ],
        note: "รอเคาะก่อนเริ่มเฟส 1: สิทธิ์ 4 ระดับ map เข้า user_role ยังไง · ฟิลด์ MetaHeader (= schema จริง) · ขอบเขต v1",
      },
    ],
  },
];


/* ── MARKETING — Content Pipeline (digital twin ของ SOP v1.1) ──────────────────
   โมดูลนี้คือของที่พัฒนาในโปรเจกต์ ssb-content-pipeline แล้วยกเข้ามา
   ทุกหน้าอยู่ใน src/modules/marketing/ · view ส่งเข้าโมดูลตัวเดียว (โมดูลไม่มี nav เอง) */
const MARKETING_GROUPS = [
  {
    id: "mkt_main",
    items: [
      {
        id: "mkt_work", path: "/mkt/work", label: "Content Planner", icon: Kanban,
        perm: "marketing.work.view", status: "live", view: "work",
        purpose: "บอร์ด 7 ขั้น · ลิสต์ · คิวรอตรวจ (SLA) · ปฏิทิน · ตั้งค่าทีม/แบรนด์/กติกา — การ์ดเดียวเดินทั้งสาย",
      },
      {
        id: "mkt_dash", path: "/mkt/dashboard", label: "Dashboard", icon: Gauge,
        perm: "marketing.dash.view", status: "live", view: "dash",
        purpose: "ภาพรวม · ผลตอบรับ (ช่องทาง/อันดับโพสต์/เจาะรายมิติ/เวลาโพสต์/ยิงแอด) · กระบวนการ",
      },
    ],
  },
];

// The 7 platform modules. `short` labels the switcher chip; `label` the breadcrumb.
// Locked modules are shown dimmed in the switcher (not yet built).
export const MODULES = [
  { id: "finance", label: "FINANCE", short: "FINANCE", icon: Landmark, locked: true, groups: FINANCE_GROUPS },
  { id: "sale", label: "SALE / CRM", short: "SALE/CRM", icon: UserRound, locked: true, groups: SALE_GROUPS },
  { id: "oem", label: "OEM OPERATION", short: "OEM", icon: Shirt, locked: true, groups: OEM_GROUPS },
  { id: "km", label: "KNOWLEDGE HUB", short: "KM", icon: BookOpen, locked: true, groups: KM_GROUPS },
  { id: "marketing", label: "MARKETING", short: "MKT", icon: Megaphone, groups: MARKETING_GROUPS },
  { id: "hr", label: "HR / GA", short: "HR/GA", icon: Users, locked: true, groups: [] },
  { id: "settings", label: "SETTINGS", short: "SETTINGS", icon: Settings, locked: true, groups: [] },
];

// Flat list of every routable nav item (for the router + breadcrumb lookup).
export const ALL_NAV = MODULES.flatMap((m) => (m.groups ?? []).flatMap((g) => g.items ?? []));

/* เดโมนี้โฟกัสโมดูล marketing — หน้าแรกจึงเป็นงานคอนเทนต์
   (ของจริงบนแพลตฟอร์มคือ "/cashflow") */
export const DEFAULT_ROUTE = "/mkt/work";

/** Look up a nav entry by its route path (for the topbar breadcrumb). */
export function navByPath(pathname) {
  return ALL_NAV.find((n) => n.path === pathname);
}

/** Which platform module owns this route (for the switcher + breadcrumb). */
export function moduleByPath(pathname) {
  return MODULES.find((m) => (m.groups ?? []).some((g) => (g.items ?? []).some((i) => i.path === pathname)));
}

/** The route a module lands on when its switcher chip is picked (first item). */
export function moduleDefaultPath(m) {
  return m?.groups?.find((g) => (g.items ?? []).length)?.items?.[0]?.path ?? null;
}

/** view ที่จะส่งเข้า MarketingModule สำหรับ path นี้ */
export function viewByPath(pathname) {
  return navByPath(pathname)?.view ?? "work";
}
