import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, X, ChevronDown, Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MODULES, moduleByPath, moduleDefaultPath } from "./routes.jsx";
import { can } from "../foundation/rbac/can.js";

/* Sidebar — SSB GROUP PLATFORM. โมดูลหลักเรียงลงมาเป็นแถว (accordion — กดแล้ว
   roll-up เมนูย่อยข้างใน): module → หมวดหลัก (collapsible) → หมวดย่อย, filtered
   by can() (กติกาเหล็ก #4). พับเก็บได้เป็นแถบไอคอน (desktop, persisted) —
   ตอนพับ กดไอคอนโมดูล = ไปหน้าแรกของโมดูลนั้น. Locked modules show dimmed.
   `.ssb-side` scopes the light-theme navy remap (index.css) — sidebar stays
   dark navy in the light theme, per the vision doc. */

const COLLAPSE_KEY = "ssb.sidebar.collapsed";

export default function Sidebar({ user, open, onClose, onSignOut }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // filter each module's items by permission; a module is navigable if it keeps ≥1 item
  const modules = MODULES.map((m) => ({
    ...m,
    groups: (m.groups ?? [])
      .map((g) => ({ ...g, items: g.items.filter((n) => can(user, n.perm)) }))
      .filter((g) => g.items.length > 0),
  }));
  const navigable = (m) => !m.locked && m.groups.length > 0;
  const activeModuleId = moduleByPath(pathname)?.id ?? "finance";

  // พับเป็นแถบไอคอน (desktop เท่านั้น — mobile drawer เต็มเสมอ) · persisted
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  const setRail = (v) => {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };
  const rail = collapsed && !open; // ตอน mobile drawer เปิด ให้เต็มเสมอ

  // module accordion + หมวดหลัก collapse — ทุกชั้นพับเป็นค่าเริ่มต้น กดแล้วค่อยกาง
  // (ไม่กางเอง). Sidebar never unmounts (it lives outside <Routes>), so manual
  // toggles persist across navigation — เมนูที่กดเปิดไว้ไม่หุบเองตอนเปลี่ยนหน้า.
  const [modOpen, setModOpen] = useState({});
  const [grpOpen, setGrpOpen] = useState({});
  const isModOpen = (m) => modOpen[m.id] ?? false;
  const toggleModule = (m) => {
    if (!navigable(m)) return;
    setModOpen((mp) => ({ ...mp, [m.id]: !isModOpen(m) }));
  };
  const gKey = (m, g) => `${m.id}:${g.id}`;
  const isGrpOpen = (m, g) => grpOpen[gKey(m, g)] ?? false;
  const toggleGroup = (m, g) => setGrpOpen((mp) => ({ ...mp, [gKey(m, g)]: !isGrpOpen(m, g) }));

  // ตอนพับเป็นแถบไอคอน: กดไอคอนโมดูล = ไปหน้าแรกของโมดูล
  const jumpModule = (m) => {
    if (!navigable(m)) return;
    const to = moduleDefaultPath(m);
    if (to) { navigate(to); onClose?.(); }
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        className={`ssb-side ${open ? "fixed inset-y-0 left-0 z-30 flex w-60" : "hidden"} ${
          rail ? "md:w-14" : "md:w-60"
        } flex-shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-zinc-800 bg-zinc-900 p-3 text-zinc-100 transition-[width] duration-200 md:flex md:sticky md:top-0 md:h-screen`}
      >
        <div className={`flex items-center gap-2 pb-3 pt-1 ${rail ? "justify-center px-0" : "px-2"}`}>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-zinc-100 text-sm font-bold text-zinc-900">S</div>
          {!rail && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-wide">SSB GROUP</div>
              <div className="text-[11px] text-zinc-500">Platform</div>
            </div>
          )}
          {!rail && (
            <button
              className="ml-auto hidden text-zinc-500 hover:text-zinc-300 md:block"
              onClick={() => setRail(true)}
              aria-label="พับเมนู"
              title="พับเมนู"
            >
              <PanelLeftClose size={17} />
            </button>
          )}
          <button className="ml-auto text-zinc-500 md:hidden" onClick={onClose} aria-label="ปิดเมนู"><X size={18} /></button>
        </div>

        {rail && (
          <button
            className="mb-2 flex h-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={() => setRail(false)}
            aria-label="กางเมนู"
            title="กางเมนู"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}

        {/* โมดูลหลักเรียงลงมา — กดแล้ว roll-up เมนูย่อยข้างใน */}
        <div className="flex flex-col gap-0.5">
          {modules.map((m) => {
            const Icon = m.icon;
            const active = m.id === activeModuleId;
            const can_ = navigable(m);
            const expanded = !rail && can_ && isModOpen(m);

            if (rail) {
              return (
                <button
                  key={m.id}
                  onClick={() => jumpModule(m)}
                  disabled={!can_}
                  aria-current={active ? "true" : undefined}
                  title={m.label}
                  className={`flex h-9 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-emerald-500/15 text-emerald-400"
                      : can_
                      ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      : "cursor-default text-zinc-600"
                  }`}
                >
                  <Icon size={17} />
                </button>
              );
            }

            return (
              <div key={m.id}>
                <button
                  onClick={() => toggleModule(m)}
                  disabled={!can_}
                  aria-expanded={can_ ? expanded : undefined}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors ${
                    active
                      ? `text-white ${expanded ? "" : "bg-emerald-500/15"}`
                      : can_
                      ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                      : "cursor-default text-zinc-600"
                  }`}
                >
                  <Icon size={17} className={`flex-shrink-0 ${active ? "text-emerald-400" : ""}`} />
                  <span className="truncate">{m.label}</span>
                  {m.locked ? (
                    <Lock size={12} className="ml-auto flex-shrink-0" />
                  ) : can_ ? (
                    <ChevronDown size={15} className={`ml-auto flex-shrink-0 text-zinc-500 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                  ) : null}
                </button>

                {/* เมนูย่อยของโมดูล — หมวดหลัก (collapsible) → หมวดย่อย */}
                {expanded && (
                  <div className="mb-1 ml-[17px] flex flex-col gap-0.5 border-l border-zinc-800 pb-1 pl-2 pt-0.5">
                    {m.groups.map((g) => {
                      const labeled = Boolean(g.label);
                      const gOpen = !labeled || isGrpOpen(m, g);
                      return (
                        <div key={g.id} className={g.divider ? "mt-1.5 border-t border-zinc-800/70 pt-1.5" : ""}>
                          {labeled && (
                            <button
                              onClick={() => toggleGroup(m, g)}
                              aria-expanded={gOpen}
                              className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-semibold text-zinc-200 transition-colors hover:text-white"
                            >
                              {g.label}
                              <ChevronDown size={14} className={`ml-auto text-zinc-500 transition-transform ${gOpen ? "" : "-rotate-90"}`} />
                            </button>
                          )}
                          {gOpen && (
                            <nav className="flex flex-col gap-0.5 pb-0.5 pt-0.5">
                              {g.items.map((n) => {
                                const ItemIcon = n.icon;
                                return (
                                  <NavLink
                                    key={n.id}
                                    to={n.path}
                                    end
                                    onClick={onClose}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                                        isActive ? "bg-zinc-800 font-medium text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                                      } ${labeled ? "ml-1" : ""}`
                                    }
                                  >
                                    {({ isActive }) => (
                                      <>
                                        <ItemIcon size={16} className={`flex-shrink-0 ${isActive ? "text-emerald-400" : ""}`} />
                                        <span className="truncate">{n.label}</span>
                                        {n.status === "พร้อมเริ่ม" && !isActive && <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />}
                                      </>
                                    )}
                                  </NavLink>
                                );
                              })}
                            </nav>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className={`mt-auto flex items-center gap-2.5 border-t border-zinc-800 pb-1 pt-3 ${rail ? "justify-center px-0" : "px-2"}`}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-950 text-xs font-medium text-emerald-400" title={rail ? user.name : undefined}>
            {user.initial}
          </div>
          {!rail && (
            <>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-zinc-500">{user.roleLabel}</div>
              </div>
              {onSignOut && (
                <button onClick={onSignOut} className="ml-auto text-zinc-500 hover:text-zinc-300" aria-label="ออกจากระบบ" title="ออกจากระบบ">
                  <LogOut size={16} />
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
