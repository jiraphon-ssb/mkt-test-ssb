/* ============================================================
 Icon — ชุดไอคอนเดียวของแอพ (stroke 1.8 เข้าชุดกับ nav เดิม)
 ไม่ใช้ emoji เป็นไอคอน
 ============================================================ */
const PATHS = {
  file: (<>
   <path d="M14 3v5h5"/>
   <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5z"/>
  </>),
  image: (<>
   <rect x="3" y="4" width="18" height="16" rx="2.5"/>
   <circle cx="8.5" cy="9.5" r="1.6"/>
   <path d="M21 16l-5-4.5L7 20"/>
  </>),
  link: (<>
   <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/>
   <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>
  </>),
  download: (<>
   <path d="M12 4v11"/>
   <path d="M8 11l4 4 4-4"/>
   <path d="M5 19h14"/>
  </>),
  external: (<>
   <path d="M14 4h6v6"/>
   <path d="M20 4l-8 8"/>
   <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>
  </>),
  trash: (<>
   <path d="M4 7h16"/>
   <path d="M9 7V5h6v2"/>
   <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/>
  </>),
  plus: (<>
   <path d="M12 5v14M5 12h14"/>
  </>),
  chevron: (<>
   <path d="M8 10l4 4 4-4"/>
  </>),
  arrow: (<>
   <path d="M5 12h13M13 7l5 5-5 5"/>
  </>),
  /* ไอคอนประจำ 7 ขั้นของสายผลิต — ใช้ที่หัวคอลัมน์บอร์ด */
  sliders: (<>
   <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4"/>
   <circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>
  </>),
  bulb: (<>
   <path d="M9 18h6M10 21h4"/>
   <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.3.5.7.5 1.1V16h6v-1c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z"/>
  </>),
  clipboard: (<>
   <path d="M9 4h6v3H9zM8 5H6v15h12V5h-2"/>
   <path d="M9 11h6M9 15h4"/>
  </>),
  eye: (<>
   <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/>
   <circle cx="12" cy="12" r="2.6"/>
  </>),
  calendar: (<>
   <path d="M5 6h14v14H5zM5 10h14M9 4v3M15 4v3"/>
  </>),
  send: (<>
   <path d="M21 4L10 15M21 4l-6.5 17-4-7.5L3 9.5z"/>
  </>),
  chart: (<>
   <path d="M4 20V9M10 20V4M16 20v-7M22 20H3"/>
  </>),
  grid: (<>
   <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
   <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </>),
  columns: (<>
   <rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>
  </>),
  trophy: (<>
   <path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>
   <path d="M9 20h6M10 16v4M14 16v4"/>
  </>),
  check: (<>
   <path d="M5 12.5l4.5 4.5L19 7.5"/>
  </>),
  sparkles: (<>
   <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6 12 3z"/>
   <path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7L19 14z"/>
  </>),
  wallet: (<>
   <path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2z"/>
   <path d="M16.5 13.5h.01"/>
  </>),
  target: (<>
   <circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>
  </>),
  upload: (<>
   <path d="M12 16V5"/>
   <path d="M8 9l4-4 4 4"/>
   <path d="M5 19h14"/>
  </>),
  alert: (<>
   <circle cx="12" cy="12" r="9"/>
   <path d="M12 8v4.5M12 16h.01"/>
  </>),
  clock: (<>
   <circle cx="12" cy="12" r="9"/>
   <path d="M12 7.5V12l3 2"/>
  </>),
  pencil: (<>
   <path d="M4 20h4l10-10-4-4L4 16v4z"/>
   <path d="M13.5 6.5l4 4"/>
  </>),
  users: (<>
   <circle cx="9" cy="9" r="3.2"/>
   <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/>
   <path d="M16 6.4a3.2 3.2 0 0 1 0 5.2M17.5 14.6a5.5 5.5 0 0 1 3 4.9"/>
  </>),
  info: (<>
   <circle cx="12" cy="12" r="9"/>
   <path d="M12 11v5.5M12 7.8h.01"/>
  </>),
  paperclip: (<>
   <path d="M20 11.5l-7.6 7.6a4.2 4.2 0 0 1-6-6l7.7-7.6a2.8 2.8 0 0 1 4 4l-7.7 7.6a1.4 1.4 0 0 1-2-2l7-7"/>
  </>),
  /* คลิป — ใช้กับกลุ่มคลิปอ้างอิงและป้ายชนิดงานที่เป็นวิดีโอ */
  video: (<>
   <rect x="2.6" y="5.4" width="13" height="13.2" rx="2.6"/>
   <path d="M15.6 10.6l4.4-2.7a.7.7 0 0 1 1.1.6v7a.7.7 0 0 1-1.1.6l-4.4-2.7z"/>
  </>),
  user: (<>
   <circle cx="12" cy="8" r="3.6"/>
   <path d="M5 20.2c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>
  </>),
  layers: (<>
   <path d="M12 2.7l9.3 5-9.3 5-9.3-5z"/>
   <path d="M2.7 12.5l9.3 5 9.3-5"/>
   <path d="M2.7 17.3l9.3 5 9.3-5"/>
  </>),
};
export function Icon({ name, size = 16, className, style, }) {
  return (<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flexShrink: 0, ...style }} aria-hidden="true">
   {PATHS[name]}
  </svg>);
}
