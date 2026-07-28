/* ============================================================
 ตั้งค่าคอนเทนต์ (team_lead) — ทีม · แบรนด์ · กติกากลาง · ข้อมูล
 เลย์เอาต์ 2 คอลัมน์: ซ้าย = "ใคร/แบรนด์ไหน" (แก้บ่อย) ขวา = "กติกา/ข้อมูล" (แก้นานๆ ครั้ง)
 ไม่มีปุ่มลบ: ปิดใช้งาน (active=false) แทน เพื่อไม่ให้ประวัติ/การ์ดเก่าพัง
 ============================================================ */
import { useRef, useState } from "react";
import { useApp } from "../useMkt.jsx";
import { ROLE_LABEL, MODE_LABEL, CHANNEL_KINDS, CHANNEL_KIND_LABEL } from "../mktEngine.js";
import { store } from "../data/DataStore.js";
import { Sheet, Field, SheetActions } from "../detail/Sheet.jsx";
import { Avatar } from "../mktParts.jsx";
import { Panel } from "../mktCard.jsx";
import { Icon } from "../mktIcon.jsx";
import { MktSelect } from "../mktSelect.jsx";
import { genId } from "../mktRules.js";
import { measuredCsv } from "../mktCsv.js";

/** สีแนะนำ — กดเลือกเร็ว แต่เลือกสีอะไรก็ได้จาก color picker */
const SUGGESTED_COLORS = ["#F26B21", "#1F6E4A", "#3E63C4", "#A63D7A", "#7C5CD6", "#0F766E", "#111827", "#D64545"];
const LOGO_MAX = 120 * 1024;   /* เดโมเก็บโลโก้เป็น data URL ใน localStorage — จำกัดขนาดกันเต็ม */

/* ---------- แปลงสี: hex ↔ hsl (ใช้ทำแถบไล่สี/เฉด) ---------- */
function hexToHsl(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return { h: 0, s: 70, l: 50 };
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const l = (max + min) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hue, s: Math.round(sat * 100), l: Math.round(l * 100) };
}
function hslToHex(h, s, l) {
  const S = s / 100, L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => Math.round(255 * (L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ""));

/**
 * เลือกสีได้ไม่จำกัด 4 ทาง:
 *   1) จานสีแนะนำ  2) ลากแถบไล่สี (hue) แล้วเลือกเฉด  3) พิมพ์โค้ด #RRGGBB
 *   4) ตัวเลือกสีของเครื่อง (ลากได้ละเอียด)
 */
function ColorPick({ value, onChange }) {
  const hsl = hexToHsl(value);
  const [hue, setHue] = useState(hsl.h);
  /* เฉดของสีที่เลือก — สว่าง→เข้ม ให้กดได้เลยไม่ต้องไล่เอง */
  const shades = [88, 76, 64, 52, 42, 32, 22].map((l) => hslToHex(hue, Math.max(hsl.s, 45), l));
  return (<div className="colorpick">
   <div className="cp-swatches">
    {SUGGESTED_COLORS.map((c) => (<button key={c} className={value?.toLowerCase() === c.toLowerCase() ? "on" : ""}
      style={{ background: c }} onClick={() => { onChange(c); setHue(hexToHsl(c).h); }} aria-label={c} title={c}/>))}
   </div>

   <input className="cp-hue" type="range" min={0} max={360} value={hue}
    onChange={(e) => { const h = Number(e.target.value); setHue(h); onChange(hslToHex(h, Math.max(hsl.s, 65), hsl.l || 50)); }}
    aria-label="ลากเลือกโทนสี"/>

   <div className="cp-shades">
    {shades.map((c) => (<button key={c} className={value?.toLowerCase() === c.toLowerCase() ? "on" : ""}
      style={{ background: c }} onClick={() => onChange(c)} title={c}/>))}
   </div>

   <div className="cp-custom">
    <span className="cp-now" style={{ background: isHex(value) ? value : "transparent" }}/>
    <input className={`field mono ${value && !isHex(value) ? "invalid" : ""}`} value={value ?? ""} placeholder="#RRGGBB"
     onChange={(e) => { const v = e.target.value.toUpperCase(); onChange(v); if (isHex(v)) setHue(hexToHsl(v).h); }}/>
    <input type="color" value={isHex(value) ? value : "#888888"}
     onChange={(e) => { const v = e.target.value.toUpperCase(); onChange(v); setHue(hexToHsl(v).h); }} aria-label="ตัวเลือกสีของเครื่อง"/>
   </div>
  </div>);
}

/** โลโก้: วางลิงก์รูป หรืออัปโหลดไฟล์ (เก็บเป็น data URL) */
function LogoPick({ value, color, name, onChange, toast }) {
  const ref = useRef(null);
  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > LOGO_MAX) { toast("ไฟล์ใหญ่เกิน 120KB — ย่อรูปก่อน", "bad"); return; }
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(f);
  };
  return (<div className="logopick">
   <span className="lp-preview" style={{ background: value ? "var(--surface)" : color }}>
    {value ? <img src={value} alt=""/> : (name?.[0] ?? "?")}
   </span>
   <div className="lp-actions">
    <input className="field" value={value ?? ""} placeholder="วางลิงก์รูป หรืออัปโหลด" onChange={(e) => onChange(e.target.value)}/>
    <div className="lp-btns">
     <button className="btn ghost small" onClick={() => ref.current?.click()}>อัปโหลด</button>
     {value && <button className="btn ghost small danger-text" onClick={() => onChange("")}>เอาออก</button>}
     <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile}/>
    </div>
   </div>
  </div>);
}

/** กติกากลาง — เก็บ label/หน่วย/คำอธิบายไว้ที่เดียว เพิ่มค่าใหม่แก้ที่นี่จุดเดียว */
const RULES = [
  { key: "sla_hours", label: "SLA รอตรวจ", unit: "ชม.", min: 1, max: 168,
    help: "รอเกินนี้แล้วยังไม่ตรวจ คิวจะขึ้นสีแดงและนับเป็นงานเกินกำหนด" },
  { key: "first_pass_target", label: "เป้าผ่านรอบแรก", unit: "%", min: 0, max: 100, pct: true,
    help: "สัดส่วนงานที่ Team Lead อนุมัติรอบแรกโดยไม่ตีกลับ" },
  { key: "first_pass_window_weeks", label: "หน้าต่างนับผ่านรอบแรก", unit: "สัปดาห์", min: 1, max: 26,
    help: "ถึงเป้าติดกันครบกี่สัปดาห์จึงปลดตรวจรายชิ้นได้" },
  { key: "idea_purge_days", label: "กวาดล้างไอเดีย", unit: "วัน", min: 1, max: 365,
    help: "ไอเดียที่ไม่ขยับเกินจำนวนวันนี้จะถูกทำเครื่องหมายให้เคลียร์" },
  { key: "flex_slot_per_week", label: "Flex slot", unit: "ช่อง/สัปดาห์", min: 0, max: 20,
    help: "ช่องว่างที่กันไว้ให้งาน Realtime แทรกโดยไม่ดันแผนเดิม" },
];

export function Admin() {
  const { data, currentUser, updateSettings, resetData, importData, toast, confirm } = useApp();
  const fileRef = useRef(null);
  const [editUser, setEditUser] = useState(null);
  const [editBrand, setEditBrand] = useState(null);
  const [editChannel, setEditChannel] = useState(null);
  const [editSize, setEditSize] = useState(null);
  const [editShot, setEditShot] = useState(null);
  const [editLen, setEditLen] = useState(null);

  if (currentUser.role !== "team_lead") {
    return (<div className="empty">
     <div className="t">เฉพาะ Team Lead</div>
     <div style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>สลับ user เป็น "คุณตะ" ที่มุมบนขวาเพื่อเข้าหน้านี้</div>
    </div>);
  }

  const download = (name, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportJson = () => {
    download("ssb-content-pipeline-backup.json", store.export(), "application/json");
    toast("ดาวน์โหลด backup แล้ว", "ok");
  };
  /** Spec 7: ส่งข้อมูลการ์ดที่วัดผลแล้วให้ Dashboard (posts_raw) */
  const exportMeasuredCsv = () => {
    const rows = data.cards.filter((c) => c.metrics?.measured_at != null);
    if (rows.length === 0) {
      toast("ยังไม่มีการ์ดที่กรอกผล", "bad");
      return;
    }
    download("ssb-measured.csv", measuredCsv(rows, data), "text/csv;charset=utf-8");
    toast(`Export ${rows.length} การ์ดที่วัดผลแล้ว`, "ok");
  };
  const onImport = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => importData(String(reader.result));
    reader.readAsText(f);
  };

  const S = data.settings;
  const users = data.profiles.filter((p) => !p.id.startsWith("hist"));
  const setRule = (r, raw) => updateSettings({ [r.key]: r.pct ? raw / 100 : raw });
  const ruleValue = (r) => (r.pct ? Math.round(S[r.key] * 100) : S[r.key]);

  return (<>
   <div className="adm-grid">
    {/* ---------- คอลัมน์ซ้าย: ทีม + แบรนด์ ---------- */}
    <div className="adm-col">
     <Panel
      title="ทีม"
      count={users.filter((p) => p.active).length}
      hint="role กำหนดสิทธิ์ทั้งโมดูล · ปิดใช้งานแทนการลบ ประวัติเก่าจึงไม่พัง"
      tools={<button className="btn ghost small" onClick={() => setEditUser({ id: genId("u"), display_name: "", role: "content_owner", active: true })}>
       <Icon name="plus"/> เพิ่มคน
      </button>}
     >
      <div className="adm-list">
       {users.map((p) => (<button className={`adm-item ${p.active ? "" : "off"}`} key={p.id} onClick={() => setEditUser(p)}>
         <Avatar profile={p} size={26}/>
         <span className="ai-main">
          <span className="ai-name">{p.display_name}{!p.active && <span className="off-tag">ปิดใช้งาน</span>}</span>
          <span className="ai-sub">{ROLE_LABEL[p.role]}</span>
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>

     <Panel
      title="แบรนด์"
      count={data.brands.filter((b) => b.active).length}
      hint="สีที่เลือกใช้เป็นป้ายแบรนด์ทั้งระบบ · mode คุมลำดับความสำคัญของงาน"
      tools={<button className="btn ghost small" onClick={() => setEditBrand({
        id: genId("b"), name: "", mode: "maintain",
        default_owner: users[0]?.id ?? "", color: SUGGESTED_COLORS[0], logo: "", active: true,
      })}>
       <Icon name="plus"/> เพิ่มแบรนด์
      </button>}
     >
      <div className="adm-list">
       {data.brands.map((b) => (<button className={`adm-item ${b.active ? "" : "off"}`} key={b.id} onClick={() => setEditBrand(b)}>
         <span className="ai-dot" style={{ background: b.color }}/>
         <span className="ai-main">
          <span className="ai-name">{b.name}{!b.active && <span className="off-tag">ปิดใช้งาน</span>}</span>
          <span className="ai-sub">
           {MODE_LABEL[b.mode]} · {data.profiles.find((p) => p.id === b.default_owner)?.display_name ?? "—"}
          </span>
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>

     <Panel
      title="ช่องทาง"
      count={data.channels.filter((c) => c.active).length}
      hint="ช่องทางที่เลือกได้ตอนกรอก Brief · สีและโลโก้ใช้แสดงทั้งฟอร์มและหน้าผลตอบรับ"
      tools={<button className="btn ghost small" onClick={() => setEditChannel({ id: genId("ch"), name: "", kind: "feed", tool: "", best_time: "", color: SUGGESTED_COLORS[0], logo: "", active: true })}>
       <Icon name="plus"/> เพิ่มช่องทาง
      </button>}
     >
      <div className="adm-list">
       {data.channels.map((ch) => (<button className={`adm-item ${ch.active ? "" : "off"}`} key={ch.id} onClick={() => setEditChannel(ch)}>
         {ch.logo
           ? <img className="ai-logo" src={ch.logo} alt=""/>
           : <span className="ai-dot" style={{ background: ch.color }}/>}
         <span className="ai-main">
          <span className="ai-name">{ch.name}{!ch.active && <span className="off-tag">ปิดใช้งาน</span>}</span>
          <span className="ai-sub">
           {CHANNEL_KIND_LABEL[ch.kind ?? "feed"]}
           {ch.tool ? ` · ${ch.tool}` : ""}
           {ch.best_time ? ` · ${ch.best_time}` : ""}
          </span>
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>

     <Panel
      title="ขนาดภาพ"
      count={(data.size_presets ?? []).length}
      hint="ตัวเลือกที่ขึ้นในฟอร์ม Brief — เพิ่มอัตราส่วนเองได้ไม่จำกัด เช่น 1:3 · 4:2"
      tools={<button className="btn ghost small" onClick={() => setEditSize({ id: genId("sz"), ratio: "", w: 1080, h: 1080, note: "" })}>
       <Icon name="plus"/> เพิ่มขนาด
      </button>}
     >
      <div className="adm-list">
       {(data.size_presets ?? []).map((sp) => (<button className="adm-item" key={sp.id} onClick={() => setEditSize(sp)}>
         <span className="sz-thumb" style={{ aspectRatio: `${sp.w} / ${sp.h}` }}/>
         <span className="ai-main">
          <span className="ai-name">{sp.ratio}</span>
          <span className="ai-sub mono">{sp.w} × {sp.h} px{sp.note ? ` · ${sp.note}` : ""}</span>
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>

     {/* คลิปต้องบรีฟรายฉาก — สองรายการนี้คือตัวเลือกที่ขึ้นในไทม์ไลน์ */}
     <Panel
      title="มุมกล้อง"
      count={(data.shot_types ?? []).length}
      hint="ตัวเลือกในป็อปอัปรายฉากของคลิป — เพิ่มได้ไม่จำกัด"
      tools={<button className="btn ghost small" onClick={() => setEditShot({ id: genId("sh"), name: "", note: "" })}>
       <Icon name="plus"/> เพิ่มมุมกล้อง
      </button>}
     >
      <div className="adm-list">
       {(data.shot_types ?? []).map((st) => (<button className="adm-item" key={st.id} onClick={() => setEditShot(st)}>
         <span className="ai-main">
          <span className="ai-name">{st.name}</span>
          {st.note && <span className="ai-sub">{st.note}</span>}
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>

     <Panel
      title="ความยาวคลิป"
      count={(data.video_lengths ?? []).length}
      hint="ปุ่มลัดตอนกรอกความยาว — กรอกตัวเลขเองก็ยังได้"
      tools={<button className="btn ghost small" onClick={() => setEditLen({ id: genId("vl"), seconds: 30, note: "" })}>
       <Icon name="plus"/> เพิ่มความยาว
      </button>}
     >
      <div className="adm-list">
       {(data.video_lengths ?? []).map((vl) => (<button className="adm-item" key={vl.id} onClick={() => setEditLen(vl)}>
         <span className="ai-main">
          <span className="ai-name mono">{vl.seconds} วินาที</span>
          {vl.note && <span className="ai-sub">{vl.note}</span>}
         </span>
         <Icon name="pencil"/>
        </button>))}
      </div>
     </Panel>
    </div>

    {/* ---------- คอลัมน์ขวา: กติกา + ข้อมูล ---------- */}
    <div className="adm-col">
     <Panel title="กติกากลาง" count={RULES.length}
      hint="ค่าเหล่านี้มีผลกับทุกการ์ดทันที — บอร์ด คิวรอตรวจ และ Dashboard อ่านค่าเดียวกัน">
      <div className="rule-grid">
       {RULES.map((r) => (<label className="rule" key={r.key}>
         <span className="rule-l">{r.label}</span>
         <span className="rule-in">
          <input type="number" min={r.min} max={r.max} value={ruleValue(r)}
           onChange={(e) => setRule(r, Number(e.target.value))}/>
          <span className="rule-u">{r.unit}</span>
         </span>
         <span className="rule-h">{r.help}</span>
        </label>))}
      </div>
     </Panel>

     <Panel title="ข้อมูล" hint="เดโมเก็บใน localStorage ของเบราว์เซอร์ — สำรอง กู้คืน หรือส่งต่อให้ Dashboard">
      <div className="adm-actions">
       <button className="btn dark small" onClick={exportMeasuredCsv}>
        <Icon name="download"/> ข้อมูลวัดผล (CSV)
       </button>
       <button className="btn ghost small" onClick={exportJson}>สำรองทั้งหมด (JSON)</button>
       <button className="btn ghost small" onClick={() => fileRef.current?.click()}>กู้คืนจากไฟล์</button>
       <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={onImport}/>
      </div>
      <div className="adm-danger">
       <div>
        <b>รีเซ็ตกลับเป็นข้อมูลตัวอย่าง</b>
        <div className="desc" style={{ marginBottom: 0 }}>การ์ด ประวัติ และผลตรวจทั้งหมดหายถาวร</div>
       </div>
       <button className="btn ghost small danger-text" onClick={async () => {
        const ok = await confirm({
          title: "รีเซ็ตข้อมูล demo?",
          message: "การ์ด ประวัติ และผลตรวจทั้งหมดจะกลับเป็นชุดเริ่มต้น — ย้อนกลับไม่ได้",
          confirmLabel: "รีเซ็ต", danger: true,
        });
        if (ok) resetData();
       }}>
        รีเซ็ต
       </button>
      </div>
     </Panel>
    </div>
   </div>

   {editUser && <UserForm value={editUser} onClose={() => setEditUser(null)}/>}
   {editBrand && <BrandForm value={editBrand} onClose={() => setEditBrand(null)}/>}
   {editChannel && <ChannelForm value={editChannel} onClose={() => setEditChannel(null)}/>}
   {editSize && <SizeForm value={editSize} onClose={() => setEditSize(null)}/>}
   {editShot && <ShotForm value={editShot} onClose={() => setEditShot(null)}/>}
   {editLen && <LengthForm value={editLen} onClose={() => setEditLen(null)}/>}
  </>);
}

/* ---------- ฟอร์ม user ---------- */
function UserForm({ value, onClose }) {
  const { data, upsertProfile, toast } = useApp();
  const [v, setV] = useState(value);
  const isNew = !data.profiles.some((p) => p.id === value.id);
  const valid = v.display_name.trim().length > 0;
  return (<Sheet eyebrow={isNew ? "เพิ่มคน" : "แก้ไข"} title={isNew ? "เพิ่มสมาชิกทีม" : v.display_name} onClose={onClose}
   dirty={JSON.stringify(v) !== JSON.stringify(value)}
   dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
   footer={<SheetActions primaryLabel="บันทึก" onPrimary={() => {
        upsertProfile({ ...v, display_name: v.display_name.trim() });
        toast(isNew ? "เพิ่มคนแล้ว" : "บันทึกแล้ว", "ok");
        onClose();
      }} primaryDisabled={!valid} secondaryLabel="ยกเลิก" onSecondary={onClose} help="ปิดใช้งานแทนการลบ — การ์ดและประวัติเก่ายังอ้างชื่อได้"/>}>
   <Field label="ชื่อเรียกในทีม" required>
    <input className="field" value={v.display_name} autoFocus onChange={(e) => setV({ ...v, display_name: e.target.value })}/>
   </Field>
   <Field label="Role" required>
    <MktSelect value={v.role} onChange={(role) => setV({ ...v, role })}
     options={Object.keys(ROLE_LABEL).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}/>
   </Field>
   <label className={`check ${v.active ? "on" : ""}`} onClick={() => setV({ ...v, active: !v.active })}>
    <span className="cbox">✓</span>
    <span>เปิดใช้งาน</span>
   </label>
  </Sheet>);
}

/* ---------- ฟอร์ม brand ---------- */
function BrandForm({ value, onClose }) {
  const { data, upsertBrand, toast } = useApp();
  const [v, setV] = useState(value);
  const isNew = !data.brands.some((b) => b.id === value.id);
  const valid = v.name.trim().length > 0 && v.default_owner !== "";
  const owners = data.profiles.filter((p) => p.active && !p.id.startsWith("hist"));
  return (<Sheet eyebrow={isNew ? "เพิ่มแบรนด์" : "แก้ไข"} title={isNew ? "เพิ่มแบรนด์" : v.name} onClose={onClose}
   dirty={JSON.stringify(v) !== JSON.stringify(value)}
   dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
   footer={<SheetActions primaryLabel="บันทึก" onPrimary={() => {
        upsertBrand({ ...v, name: v.name.trim() });
        toast(isNew ? "เพิ่มแบรนด์แล้ว" : "บันทึกแล้ว", "ok");
        onClose();
      }} primaryDisabled={!valid} secondaryLabel="ยกเลิก" onSecondary={onClose} help="ปิดใช้งานแทนการลบ — การ์ดเก่ายังอ้าง brand ได้"/>}>
   <Field label="ชื่อแบรนด์" required>
    <input className="field" value={v.name} autoFocus onChange={(e) => setV({ ...v, name: e.target.value })}/>
   </Field>
   <Field label="สีประจำแบรนด์" hint="ใช้เป็นป้ายแบรนด์ทุกที่ในระบบ — เลือกสีอะไรก็ได้">
    <ColorPick value={v.color} onChange={(color) => setV({ ...v, color })}/>
   </Field>
   <Field label="โลโก้แบรนด์" hint="ไม่ใส่ก็ได้ — จะใช้จุดสีแทน">
    <LogoPick value={v.logo} color={v.color} name={v.name} onChange={(logo) => setV({ ...v, logo })} toast={toast}/>
   </Field>
   <Field label="Mode (Brand Priority)" required>
    <MktSelect value={v.mode} onChange={(mode) => setV({ ...v, mode })}
     options={Object.keys(MODE_LABEL).map((m) => ({ value: m, label: MODE_LABEL[m] }))}/>
   </Field>
   <Field label="Content Owner ประจำแบรนด์" required>
    <MktSelect value={v.default_owner} onChange={(default_owner) => setV({ ...v, default_owner })}
     placeholder="— เลือกผู้ดูแล —"
     options={owners.map((o) => ({ value: o.id, label: o.display_name }))}/>
   </Field>
   <label className={`check ${v.active ? "on" : ""}`} onClick={() => setV({ ...v, active: !v.active })}>
    <span className="cbox">✓</span>
    <span>เปิดใช้งาน</span>
   </label>
  </Sheet>);
}

/* ---------- ฟอร์มช่องทาง ---------- */
function ChannelForm({ value, onClose }) {
  const { data, upsertChannel, toast } = useApp();
  const [v, setV] = useState(value);
  const isNew = !data.channels.some((c) => c.id === value.id);
  const valid = v.name.trim().length > 0;
  /** จำนวนการ์ดที่อ้างชื่อเดิมอยู่ — เตือนก่อนเปลี่ยนชื่อ */
  const usedBy = data.cards.filter((c) => c.brief.channels.includes(value.name)).length;
  const renaming = !isNew && v.name.trim() !== value.name;
  return (<Sheet
    eyebrow={isNew ? "เพิ่มช่องทาง" : "แก้ไข"}
    title={isNew ? "เพิ่มช่องทาง" : value.name}
    onClose={onClose}
    dirty={JSON.stringify(v) !== JSON.stringify(value)}
    dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
    footer={<SheetActions
      primaryLabel="บันทึก"
      onPrimary={() => {
        upsertChannel({ ...v, name: v.name.trim() }, value.name);
        toast(renaming ? `เปลี่ยนชื่อแล้ว — อัปเดตการ์ด ${usedBy} ใบให้ด้วย` : isNew ? "เพิ่มช่องทางแล้ว" : "บันทึกแล้ว", "ok");
        onClose();
      }}
      primaryDisabled={!valid}
      secondaryLabel="ยกเลิก" onSecondary={onClose}
      help="ปิดใช้งานแทนการลบ — การ์ดเก่าที่ลงช่องทางนี้ยังอ้างชื่อได้"/>}
  >
   <Field label="ชื่อช่องทาง" required hint={renaming && usedBy > 0 ? `มีการ์ด ${usedBy} ใบอ้างชื่อเดิมอยู่ — ระบบจะตามไปแก้ให้ทั้งหมด` : undefined}>
    <input className="field" value={v.name} autoFocus onChange={(e) => setV({ ...v, name: e.target.value })}/>
   </Field>
   <Field label="ชนิดช่องทาง" required hint="กำหนดว่าขั้น Measured จะถามตัวเลขชุดไหน — เปลี่ยนแล้วฟอร์มในการ์ดเปลี่ยนตามทันที">
    <div className="chips-input">
     {CHANNEL_KINDS.map((k) => (<button key={k.id} className={(v.kind ?? "feed") === k.id ? "on" : ""} title={k.hint}
       onClick={() => setV({ ...v, kind: k.id })}>{k.label}</button>))}
    </div>
   </Field>
   <div className="grid2">
    <Field label="เครื่องมือตั้งเวลา" hint="ค่าตั้งต้นตอนกรอกขั้น Scheduled">
     <input className="field" value={v.tool ?? ""} placeholder="เช่น Meta Business Suite"
      onChange={(e) => setV({ ...v, tool: e.target.value })}/>
    </Field>
    <Field label="เวลาแนะนำ" hint="ขึ้นเตือนตอนตั้งเวลาโพสต์ของช่องทางนี้">
     <input className="field" value={v.best_time ?? ""} placeholder="เช่น 19:00–21:00"
      onChange={(e) => setV({ ...v, best_time: e.target.value })}/>
    </Field>
   </div>
   <Field label="สีประจำช่องทาง" hint="ใช้ในกราฟ 'ช่องทางไหนได้ผล' และชิปในฟอร์ม Brief">
    <ColorPick value={v.color} onChange={(color) => setV({ ...v, color })}/>
   </Field>
   <Field label="โลโก้ช่องทาง" hint="ไม่ใส่ก็ได้ — จะใช้จุดสีแทน">
    <LogoPick value={v.logo} color={v.color} name={v.name} onChange={(logo) => setV({ ...v, logo })} toast={toast}/>
   </Field>
   <label className={`check ${v.active ? "on" : ""}`} onClick={() => setV({ ...v, active: !v.active })}>
    <span className="cbox">✓</span>
    <span>เปิดใช้งาน</span>
   </label>
  </Sheet>);
}

/* ---------- ฟอร์มขนาดภาพ ---------- */
/* ---------- มุมกล้อง ---------- */
function ShotForm({ value, onClose }) {
  const { data, upsertShotType, removeShotType, toast, confirm } = useApp();
  const [v, setV] = useState(value);
  const isNew = !(data.shot_types ?? []).some((p) => p.id === value.id);
  return (<Sheet
    compact
    dirty={JSON.stringify(v) !== JSON.stringify(value)}
    dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
    eyebrow={isNew ? "เพิ่มมุมกล้อง" : "แก้ไข"}
    title={isNew ? "เพิ่มมุมกล้อง" : value.name}
    onClose={onClose}
    footer={<SheetActions primaryLabel="บันทึก" primaryDisabled={v.name.trim() === ""}
      onPrimary={() => { upsertShotType({ ...v, name: v.name.trim() }); toast(isNew ? "เพิ่มแล้ว" : "บันทึกแล้ว", "ok"); onClose(); }}
      secondaryLabel="ยกเลิก" onSecondary={onClose}
      help="ขึ้นเป็นตัวเลือกในป็อปอัปรายฉากทันที"/>}
  >
   <Field label="ชื่อมุมกล้อง" required hint="คำที่คนถ่ายเข้าใจตรงกัน เช่น โคลสอัพ · ไวด์">
    <input className="field" autoFocus value={v.name} placeholder="เช่น โคลสอัพ"
     onChange={(e) => setV({ ...v, name: e.target.value })}/>
   </Field>
   <Field label="ใช้ตอนไหน" hint="ขึ้นเป็น tooltip ตอนเลือก">
    <input className="field" value={v.note ?? ""} placeholder="เช่น เจาะรายละเอียดสินค้า"
     onChange={(e) => setV({ ...v, note: e.target.value })}/>
   </Field>
   {!isNew && (<button className="btn ghost small danger-text" onClick={async () => {
     const ok = await confirm({ title: `ลบ ${value.name}?`, message: "ฉากที่เลือกไว้แล้วไม่กระทบ — แค่หายจากตัวเลือก", confirmLabel: "ลบ", danger: true });
     if (ok) { removeShotType(value.id); toast("ลบแล้ว", "ok"); onClose(); }
    }}>ลบมุมกล้องนี้</button>)}
  </Sheet>);
}

/* ---------- ความยาวคลิปยอดใช้ ---------- */
function LengthForm({ value, onClose }) {
  const { data, upsertVideoLength, removeVideoLength, toast, confirm } = useApp();
  const [v, setV] = useState(value);
  const isNew = !(data.video_lengths ?? []).some((p) => p.id === value.id);
  return (<Sheet
    compact
    dirty={JSON.stringify(v) !== JSON.stringify(value)}
    dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
    eyebrow={isNew ? "เพิ่มความยาว" : "แก้ไข"}
    title={isNew ? "เพิ่มความยาวคลิป" : `${value.seconds} วินาที`}
    onClose={onClose}
    footer={<SheetActions primaryLabel="บันทึก" primaryDisabled={!(v.seconds > 0)}
      onPrimary={() => { upsertVideoLength(v); toast(isNew ? "เพิ่มแล้ว" : "บันทึกแล้ว", "ok"); onClose(); }}
      secondaryLabel="ยกเลิก" onSecondary={onClose}
      help="ขึ้นเป็นปุ่มลัดในฟอร์ม Brief ของคลิป"/>}
  >
   <Field label="ความยาว (วินาที)" required>
    <input className="field mono" type="number" min={1} max={600} autoFocus value={v.seconds}
     onChange={(e) => setV({ ...v, seconds: Number(e.target.value) || 0 })}/>
   </Field>
   <Field label="ใช้กับอะไร" hint="ขึ้นเป็น tooltip ตอนเลือก">
    <input className="field" value={v.note ?? ""} placeholder="เช่น Reels / TikTok มาตรฐาน"
     onChange={(e) => setV({ ...v, note: e.target.value })}/>
   </Field>
   {!isNew && (<button className="btn ghost small danger-text" onClick={async () => {
     const ok = await confirm({ title: `ลบ ${value.seconds} วินาที?`, message: "คลิปที่ตั้งความยาวนี้ไว้แล้วไม่กระทบ", confirmLabel: "ลบ", danger: true });
     if (ok) { removeVideoLength(value.id); toast("ลบแล้ว", "ok"); onClose(); }
    }}>ลบความยาวนี้</button>)}
  </Sheet>);
}

function SizeForm({ value, onClose }) {
  const { data, upsertSizePreset, removeSizePreset, toast, confirm } = useApp();
  const [v, setV] = useState(value);
  const isNew = !(data.size_presets ?? []).some((p) => p.id === value.id);
  const valid = v.ratio.trim().length > 0 && v.w > 0 && v.h > 0;
  /** เติมอัตราส่วนให้อัตโนมัติจาก px ที่กรอก (ผู้ใช้พิมพ์ทับได้) */
  const autoRatio = () => {
    const g = (a, b) => (b === 0 ? a : g(b, a % b));
    const d = g(v.w, v.h) || 1;
    setV({ ...v, ratio: `${v.w / d}:${v.h / d}` });
  };
  return (<Sheet
    compact
    dirty={JSON.stringify(v) !== JSON.stringify(value)}
    dirtyMessage="แก้ค่าไว้แล้วแต่ยังไม่ได้กดบันทึก — ปิดแล้วค่าที่แก้จะหายไป"
    eyebrow={isNew ? "เพิ่มขนาด" : "แก้ไข"}
    title={isNew ? "เพิ่มขนาดภาพ" : value.ratio}
    onClose={onClose}
    footer={<SheetActions primaryLabel="บันทึก" primaryDisabled={!valid}
      onPrimary={() => { upsertSizePreset({ ...v, ratio: v.ratio.trim() }); toast(isNew ? "เพิ่มขนาดแล้ว" : "บันทึกแล้ว", "ok"); onClose(); }}
      secondaryLabel="ยกเลิก" onSecondary={onClose}
      help="ขนาดนี้จะขึ้นเป็นตัวเลือกในฟอร์ม Brief ทันที"/>}
  >
   <div className="grid2">
    <Field label="กว้าง (px)" required>
     <input className="field mono" type="number" min={1} value={v.w}
      onChange={(e) => setV({ ...v, w: Number(e.target.value) || 0 })}/>
    </Field>
    <Field label="สูง (px)" required>
     <input className="field mono" type="number" min={1} value={v.h}
      onChange={(e) => setV({ ...v, h: Number(e.target.value) || 0 })}/>
    </Field>
   </div>
   <Field label="อัตราส่วน" required hint="ชื่อที่ขึ้นบนปุ่ม เช่น 4:5 · 1:3">
    <div className="size-custom">
     <input className="field" value={v.ratio} placeholder="4:5"
      onChange={(e) => setV({ ...v, ratio: e.target.value })}/>
     <button className="btn ghost small" onClick={autoRatio} disabled={!(v.w > 0 && v.h > 0)}>คำนวณให้</button>
    </div>
   </Field>
   <Field label="ใช้กับอะไร" hint="ขึ้นเป็น tooltip ตอนเลือก">
    <input className="field" value={v.note ?? ""} placeholder="เช่น ฟีดแนวตั้ง"
     onChange={(e) => setV({ ...v, note: e.target.value })}/>
   </Field>
   {!isNew && (<button className="btn ghost small danger-text" onClick={async () => {
     const ok = await confirm({ title: `ลบขนาด ${value.ratio}?`, message: "การ์ดที่เลือกขนาดนี้ไว้แล้วไม่กระทบ — แค่หายจากตัวเลือก", confirmLabel: "ลบ", danger: true });
     if (ok) { removeSizePreset(value.id); toast("ลบขนาดแล้ว", "ok"); onClose(); }
    }}>ลบขนาดนี้</button>)}
  </Sheet>);
}
