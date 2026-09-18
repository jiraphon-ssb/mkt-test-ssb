/* หน้าตั้งค่าเป้า (แท็บ "เป้า" ในหน้าตั้งค่าโฆษณา)
   ตอบสองคำถาม: เดือนนี้ได้เป้าอะไรมาแล้วจากไหน · ยังขาดอะไร — แล้วเติมเองได้ตรงนั้นเลย
   กติกา 18 ก.ย. 69: ค่าที่แก้ที่นี่ชนะค่าที่ดึงมาเสมอ ทีละช่อง ทีละเดือน (ตรรกะอยู่ใน goalOverrides.js)
   เก็บคนละตารางกับเป้าที่ดึงมา ท่อ sync จึงเขียนทับไม่ได้ */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, CopyPlus, LoaderCircle, RotateCcw, Save } from "lucide-react";
import { apiClient } from "../../../foundation/data/apiClient.js";
import { fmtMoney, fmtNum, fmtPct } from "../dash/charts/theme.js";
import { Dropdown } from "../ui/Dropdown.jsx";
import { BrandMark } from "./BrandMark.jsx";
import { adsErrorText } from "./adsSyncMessages.js";
import { GOAL_EDIT_FIELDS, GOAL_FIELD_GROUPS, changedFromSource, goalRowFor, mergeGoals, missingGoalFields, parseGoalInput } from "./goalOverrides.js";
import { SALES_BRAND_IDS } from "./syncSources.js";

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthStart = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (month, by) => { const [y, m] = month.split("-").map(Number); return monthStart(new Date(y, m - 1 + by, 1)); };
const monthLabel = (month) => { const [y, m] = month.split("-").map(Number); return `${THAI_MONTHS[m - 1]} ${y + 543}`; };
const SOURCE_TEXT = { sale_goal: "ระบบขาย", sale_target: "ระบบขาย (เป้าแบบเก่า)", tmk_month: "ระบบ TMK", manual: "ตั้งค่าเอง" };

/** ค่าที่โชว์ในช่องกรอก — มีคอมมาให้อ่านง่าย (parseGoalInput ตัดคอมมาให้อยู่แล้ว)
    %Ads เก็บเป็นสัดส่วน แต่คนอ่าน/พิมพ์เป็นเปอร์เซ็นต์ · ระหว่างพิมพ์ใช้ข้อความที่พิมพ์ตรงๆ ไม่จัดรูปแบบทับ */
const group = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });
const textOf = (value, unit) => {
  if (value == null) return "";
  if (unit === "pct") return `${Number((value * 100).toFixed(4))}%`;
  if (unit === "ratio") return String(value);
  return group.format(value);
};
/** ค่าที่โชว์ใต้ช่อง (ค่าจากระบบขายที่ถูกทับไว้) — ทศนิยมตามกติกา ห้ามปัด */
const displayOf = (value, unit) => {
  if (value == null) return "—";
  if (unit === "money") return fmtMoney(value);
  if (unit === "pct") return fmtPct(value);
  if (unit === "ratio") return `${fmtNum(value, 2)}×`;
  return fmtNum(value, 0);
};

export function GoalSettingsPanel({ brands = [], isLead = false, toast }) {
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [state, setState] = useState({ status: "loading", goals: [], overrides: [], error: null });
  const [draft, setDraft] = useState({});        // { brandId: { field: ข้อความที่พิมพ์ } }
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const canEdit = isLead && !state.overrideError;
  const sourceBrands = useMemo(() => brands.filter((brand) => SALES_BRAND_IDS.includes(brand.id)), [brands]);
  const waitingBrands = useMemo(() => brands.filter((brand) => !SALES_BRAND_IDS.includes(brand.id)), [brands]);

  const load = useCallback(async (target) => {
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    let overrideError = null;
    try {
      /* อ่านค่าที่แก้เองไม่ได้ (ตารางยังไม่ถูกสร้าง / สิทธิ์) ไม่ควรทำให้ทั้งหน้าพัง —
         ครึ่งหนึ่งของงานหน้านี้คือ "ดูว่าได้เป้าอะไรมาแล้ว" ซึ่งยังทำได้ · แค่แก้ไม่ได้ชั่วคราว */
      const [goals, overrides] = await Promise.all([
        apiClient.ads.salesGoals(target),
        apiClient.ads.goalOverrides({ months: [target] }).catch((error) => { overrideError = error; return []; }),
      ]);
      setState({ status: "ready", goals: goals ?? [], overrides: overrides ?? [], error: null, overrideError });
      setDraft({});                                  // สลับเดือนแล้วต้องไม่เอาค่าที่ค้างในฟอร์มข้ามเดือน
    } catch (error) {
      setState({ status: "error", goals: [], overrides: [], error, overrideError });
    }
  }, []);
  useEffect(() => { load(month); }, [load, month]);

  const merged = useMemo(() => mergeGoals(state.goals, state.overrides), [state.goals, state.overrides]);
  const rowOf = useCallback((brandId) => goalRowFor(merged, brandId, month), [merged, month]);

  /* ค่าที่อยู่ในช่อง = สิ่งที่พิมพ์ไว้ (ถ้ามี) ไม่งั้นคือค่าที่ใช้จริงตอนนี้ */
  const valueText = (brandId, field) => draft[brandId]?.[field.key] ?? textOf(rowOf(brandId)?.[field.key], field.unit);
  const setValue = (brandId, key, text) => setDraft((prev) => ({ ...prev, [brandId]: { ...prev[brandId], [key]: text } }));

  /* แปลงฟอร์มทั้งแบรนด์เป็นค่าที่จะบันทึก — เขียน override เฉพาะช่องที่ต่างจากค่าต้นทางจริงๆ
     (พิมพ์เลขเดิมซ้ำ = ไม่สร้าง override ที่ไม่มีความหมาย) */
  const valuesOf = (brandId) => {
    const row = rowOf(brandId);
    const out = {};
    let invalid = null;
    for (const field of GOAL_EDIT_FIELDS) {
      const typed = draft[brandId]?.[field.key];
      if (typed === undefined) {                                   // ไม่ได้แตะช่องนี้ → คงสถานะเดิมไว้
        out[field.key] = row?.sources?.[field.key] === "manual" ? row[field.key] : null;
        continue;
      }
      const parsed = parseGoalInput(typed, field.unit);
      if (parsed === undefined) { invalid = invalid ?? field; continue; }
      const synced = row?.synced?.[field.key] ?? null;
      out[field.key] = parsed === null || parsed === synced ? null : parsed;
    }
    return { values: out, invalid };
  };

  const fieldError = (brandId, field) => {
    const typed = draft[brandId]?.[field.key];
    return typed !== undefined && parseGoalInput(typed, field.unit) === undefined;
  };
  const dirty = Object.values(draft).some((brand) => Object.keys(brand ?? {}).length > 0);
  const anyInvalid = sourceBrands.some((brand) => GOAL_EDIT_FIELDS.some((field) => fieldError(brand.id, field)));

  const save = async () => {
    if (!canEdit || saving || !dirty) return;
    setSaving(true);
    const failed = [];
    try {
      for (const brand of sourceBrands) {
        if (!draft[brand.id] || !Object.keys(draft[brand.id]).length) continue;
        const { values, invalid } = valuesOf(brand.id);
        if (invalid) { failed.push(`${brand.name} (${invalid.label} กรอกไม่ถูก)`); continue; }
        const hasAny = Object.values(values).some((value) => value != null);
        try {
          if (hasAny) await apiClient.ads.saveGoalOverride({ brandId: brand.id, month, values });
          else await apiClient.ads.clearGoalOverride(brand.id, month);
        } catch (error) { failed.push(`${brand.name} (${adsErrorText(error, "บันทึกไม่สำเร็จ")})`); }
      }
      await load(month);
      setSavedAt(new Date().toISOString());
      toast?.(failed.length ? `บันทึกไม่ครบ — ${failed.join(" · ")}` : `บันทึกเป้าเดือน ${monthLabel(month)} แล้ว`, failed.length ? "bad" : "ok");
    } finally {
      setSaving(false);
    }
  };

  /** คัดลอกจากเดือนก่อน — เติมเฉพาะช่องที่เดือนนี้ยังว่าง ไม่ทับของที่ตั้งไว้แล้ว */
  const copyPrev = async () => {
    if (!canEdit) return;
    const prev = shiftMonth(month, -1);
    try {
      const [goals, overrides] = await Promise.all([
        apiClient.ads.salesGoals(prev),
        apiClient.ads.goalOverrides({ months: [prev] }),
      ]);
      const prevMerged = mergeGoals(goals ?? [], overrides ?? []);
      const next = { ...draft };
      let filled = 0;
      for (const brand of sourceBrands) {
        const from = goalRowFor(prevMerged, brand.id, prev);
        const now = rowOf(brand.id);
        if (!from) continue;
        for (const field of GOAL_EDIT_FIELDS) {
          const already = draft[brand.id]?.[field.key] ?? textOf(now?.[field.key], field.unit);
          if (already !== "" || from[field.key] == null) continue;
          next[brand.id] = { ...next[brand.id], [field.key]: textOf(from[field.key], field.unit) };
          filled += 1;
        }
      }
      setDraft(next);
      toast?.(filled ? `เติมจากเดือน ${monthLabel(prev)} ให้ ${filled} ช่อง — ตรวจแล้วกดบันทึก` : `เดือน ${monthLabel(prev)} ไม่มีช่องที่เติมให้ได้`, filled ? "ok" : "warn");
    } catch (error) {
      toast?.(adsErrorText(error, "อ่านเป้าเดือนก่อนไม่สำเร็จ"), "bad");
    }
  };

  /* เดือนที่เลือกได้ — ล่วงหน้า 6 เดือน (ตั้งเป้าล่วงหน้าได้) ถึงย้อนหลัง 8 เดือน
     เดือนข้างหน้าติดป้ายไว้ ไม่งั้นเผลอตั้งเป้าผิดเดือนแล้วไม่รู้ตัว */
  const monthOptions = useMemo(() => {
    const now = monthStart(new Date());
    const offsets = [];
    for (let by = 6; by >= -8; by -= 1) offsets.push(by);
    return offsets.map((by) => {
      const value = shiftMonth(now, by);
      return [value, by > 0 ? `${monthLabel(value)} · ล่วงหน้า` : monthLabel(value)];
    });
  }, []);

  /* สรุปหัวหน้า: ได้อะไรมาแล้ว · ยังขาดอะไร (ขาด = ไม่มีทั้งค่าจากระบบขายและที่ตั้งเอง) */
  const summary = useMemo(() => {
    const from = new Map();
    const gaps = new Map();
    const none = [];
    for (const brand of sourceBrands) {
      const row = rowOf(brand.id);
      const base = row?.goal_source ? SOURCE_TEXT[row.goal_source] ?? row.goal_source : null;
      if (base) from.set(base, [...(from.get(base) ?? []), brand.name]);
      const missing = missingGoalFields(row);
      // แบรนด์ที่ยังไม่ตั้งอะไรเลย บอกเป็นชื่อแบรนด์ทีเดียว ไม่ไล่ทีละ 11 ช่อง (บรรทัดจะยาวจนไม่มีใครอ่าน)
      if (missing.length === GOAL_EDIT_FIELDS.length) { none.push(brand.name); continue; }
      for (const field of missing) gaps.set(field.label, [...(gaps.get(field.label) ?? []), brand.name]);
    }
    return { from: [...from.entries()], gaps: [...gaps.entries()], none };
  }, [sourceBrands, rowOf]);

  if (state.status === "error") {
    return <section className="acc-sheet gs" aria-label="ตั้งค่าเป้า">
      <p className="gs-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> โหลดเป้าไม่สำเร็จ — {adsErrorText(state.error, "ลองใหม่อีกครั้ง")}
        <button type="button" onClick={() => load(month)}>ลองใหม่</button></p>
    </section>;
  }

  return <section className="acc-sheet gs" aria-label="ตั้งค่าเป้า">
    <header className="gs-head">
      <div className="gs-head-left">
        <Dropdown label="เดือน" ariaLabel="เดือนของเป้า" options={monthOptions} value={month} onChange={setMonth} active />
        {canEdit && <button type="button" className="gs-ghost" onClick={copyPrev}><CopyPlus size={14} aria-hidden="true" /> คัดลอกจากเดือนก่อน</button>}
      </div>
      {canEdit
        ? <button type="button" className="acc-save" onClick={save} disabled={!dirty || saving || anyInvalid} aria-busy={saving}
            title={anyInvalid ? "มีช่องที่กรอกไม่ถูก" : !dirty ? "ยังไม่มีอะไรเปลี่ยน" : undefined}>
            {saving ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
            {saving ? "กำลังบันทึก…" : dirty ? "บันทึกเป้าเดือนนี้" : savedAt ? "บันทึกแล้ว" : "บันทึก"}
          </button>
        : <span className="gs-readonly">{isLead ? "ดูอย่างเดียวชั่วคราว — ยังบันทึกค่าที่แก้ไม่ได้" : "ดูอย่างเดียว — เฉพาะหัวหน้าทีมแก้เป้าได้"}</span>}
    </header>

    {state.overrideError && <p className="gs-changed" role="alert">
      ยังแก้เป้าเองไม่ได้ — {adsErrorText(state.overrideError, "อ่านค่าที่แก้เองไม่สำเร็จ")} · ตอนนี้แสดงเฉพาะเป้าที่ดึงมาจากระบบขาย
    </p>}
    {state.status === "loading"
      ? <p className="gs-loading" role="status"><LoaderCircle size={14} className="spin" aria-hidden="true" /> กำลังโหลดเป้าเดือน {monthLabel(month)}…</p>
      : <>
        <p className="gs-summary" role="status">
          {summary.from.length
            ? summary.from.map(([source, names]) => <span key={source}><b>{source}</b> — {names.join(" · ")}</span>)
            : <span>เดือนนี้ยังไม่มีเป้าจากที่ไหนเลย</span>}
          {summary.none.length > 0 && <span className="gs-gap">ยังไม่ตั้งเป้าเลย: {summary.none.join(" · ")}</span>}
          {summary.gaps.length > 0 && <span className="gs-gap">ยังขาดบางช่อง: {summary.gaps.map(([label, names]) => `${label} (${names.length === sourceBrands.length - summary.none.length ? "ทุกแบรนด์ที่ตั้งแล้ว" : names.join(" · ")})`).join(" · ")}</span>}
        </p>

        <div className="gs-brands">
          {sourceBrands.map((brand) => {
            const row = rowOf(brand.id);
            const manual = Object.entries(row?.sources ?? {}).filter(([, from]) => from === "manual").map(([key]) => key);
            const changed = changedFromSource(row);
            return <article key={brand.id} className="gs-brand">
              <header>
                <span className="gs-brand-name"><BrandMark brand={brand} size={20} /> <b>{brand.name}</b></span>
                <span className="gs-brand-src">
                  <span className="sy-chip ok">{row?.goal_source ? SOURCE_TEXT[row.goal_source] ?? row.goal_source : "ยังไม่ตั้งเป้า"}</span>
                  {manual.length > 0 && row?.goal_source !== "manual" && <span className="sy-chip ok">ตั้งค่าเอง {manual.length} ช่อง</span>}
                  {row?.updated_at && <small>แก้ล่าสุด {new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.updated_at))}</small>}
                </span>
              </header>
              {changed.length > 0 && <p className="gs-changed" role="note">
                ต้นทางเปลี่ยนหลังจากตั้งค่าไว้: {changed.map((item) => `${item.label} (ระบบขายให้มา ${displayOf(item.source, GOAL_EDIT_FIELDS.find((f) => f.key === item.key)?.unit)})`).join(" · ")} — ค่าที่ตั้งเองยังถูกใช้อยู่
              </p>}
              {GOAL_FIELD_GROUPS.map((group) => <div key={group.key} className="gs-group">
                <p className="gs-group-label">{group.label}</p>
                <div className="gs-grid">
                  {group.fields.map((key) => {
                    const field = GOAL_EDIT_FIELDS.find((item) => item.key === key);
                    const source = row?.sources?.[field.key] ?? null;
                    const synced = row?.synced?.[field.key] ?? null;
                    const bad = fieldError(brand.id, field);
                    /* ใต้ช่องเขียนเฉพาะตอนที่ "ไม่ปกติ" — พิมพ์ผิด หรือ ตั้งค่าเองทับค่าที่ดึงมา
                       ของเดิมเขียน "จากระบบขาย"/"ยังไม่ตั้ง" ใต้ทุกช่อง = ตัวหนังสือซ้ำ 44 บรรทัดต่อหน้า */
                    const note = bad ? "bad" : source === "manual" ? "manual" : null;
                    return <label key={field.key} className={`gs-field${bad ? " bad" : ""}`} title={field.hint}>
                      <span className="gs-label">{field.label}</span>
                      <input type="text" inputMode="decimal" autoComplete="off" disabled={!canEdit} aria-label={field.label}
                        value={valueText(brand.id, field)} placeholder="—"
                        onChange={(event) => setValue(brand.id, field.key, event.target.value)} />
                      {note && <span className="gs-under">
                        {note === "bad"
                          ? <b className="gs-bad">กรอกเป็นตัวเลข เช่น 1,300,000 หรือ 12%</b>
                          : <>ตั้งค่าเอง{synced != null && <> · เดิม {displayOf(synced, field.unit)}</>}
                            {canEdit && synced != null && <button type="button" className="gs-restore" onClick={() => setValue(brand.id, field.key, textOf(synced, field.unit))}><RotateCcw size={11} aria-hidden="true" /> คืนค่า</button>}</>}
                      </span>}
                    </label>;
                  })}
                </div>
              </div>)}
            </article>;
          })}
        </div>

        {waitingBrands.length > 0 && <p className="gs-note">{waitingBrands.map((brand) => brand.name).join(" · ")}: ยังไม่มีแหล่งยอดขาย จึงยังไม่มีเป้าให้ตั้ง</p>}
        <p className="gs-note">เป้าที่ตั้งที่นี่ชนะค่าที่ดึงมาจากระบบขายเสมอ เฉพาะช่องที่กรอกและเฉพาะเดือนนี้ · ล้างช่องให้ว่าง = กลับไปใช้ค่าจากระบบขาย · ดูว่าเดือนนี้ครบหรือยังได้ที่ <Link to="/mkt/ads/sync?tab=sales">สถานะ Sync</Link></p>
      </>}
  </section>;
}
