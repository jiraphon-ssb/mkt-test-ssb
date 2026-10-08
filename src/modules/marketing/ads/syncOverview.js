/* หน้า Sync (รื้อใหม่ 17 ก.ย.) — logic ล้วน · เทสใน tests/syncOverview.test.js
   หน้าตอบคำถามเดียว: ข้อมูลแต่ละแหล่งมาครบ สด เชื่อถือได้ไหม และต้องแก้อะไร
   กติกา: ข้อมูลส่วนไหนยังโหลดไม่เสร็จ = state "loading" ห้ามสรุปว่า "ยังไม่มี/ยังไม่เชื่อม" จากค่าเก่า
   (บน production หน้าเดิมโชว์ "ยังไม่เคยดึง" ระหว่างรอ API ทั้งที่ดึงสำเร็จแล้ว) */
import { adsErrorText } from "./adsSyncMessages.js";
import { tokenDaysLeft } from "./syncSources.js";
import { DAILY_RUN_LABEL, DAILY_TZ, dayIn, doneToday, nextDailyRunAt, nextDailyTickAt } from "../../../../supabase/functions/_shared/dailySchedule.js";

const HOUR = 3_600_000;
const time = (value) => { const t = Date.parse(value ?? ""); return Number.isFinite(t) ? t : null; };
const num = (value) => Number(value ?? 0).toLocaleString("th-TH");
const SALES_STALE_HOURS = 36;      // ดึงวันละครั้ง (09:00) — เกินวันครึ่ง = ข้ามไปหนึ่งวันแล้ว
const DAILY_SUB = `ดึงวันละครั้ง · ${DAILY_RUN_LABEL}`;   // เวลาอ่านจาก dailySchedule.js ที่เดียว (28 ก.ย. ย้ายเป็น 09:00)
const CREATIVE_WINDOW_HOURS = 48;  // รีเฟรชวันละครั้งต่อบัญชี (ครั้งละบัญชี) — เกิน 2 วัน = ค้าง

/** "53 นาทีก่อน" · "4 ชม. 54 นาทีก่อน" · "3 วันก่อน" — หน่วยเดียวกันทุกแถวบนหน้า Sync
    เดิมช่วงชั่วโมงเขียนเป็นทศนิยม ("4.90 ชม.ก่อน") ซึ่งเป็นแถวเดียวในหน้าที่ใช้ทศนิยมกับเวลา
    อ่านเทียบกับ "3 นาทีก่อน" ข้างๆ ไม่ได้ — ชม.+นาที บอกเวลาจริงตรงกว่าและไม่ทิ้งความละเอียด */
function since(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / 60_000))} นาทีก่อน`;
  if (ms < 48 * HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / 60_000);
    return minutes ? `${hours} ชม. ${minutes} นาทีก่อน` : `${hours} ชม.ก่อน`;
  }
  return `${Math.floor(ms / (24 * HOUR))} วันก่อน`;
}

export function ago(value, now = Date.now()) {
  const t = time(value);
  if (t === null) return "—";
  return since(Math.max(0, now - t));
}

/** แถวที่รู้แค่ "กี่ชั่วโมงมาแล้ว" (ไม่มี timestamp) — ต้องอ่านออกเป็นแบบเดียวกับ ago */
export function agoHours(hours) {
  // null/undefined = ยังไม่รู้ ไม่ใช่ 0 ชั่วโมง (Number(null) = 0 จะกลายเป็น "1 นาทีก่อน" ทั้งที่ยังไม่เคยดึง)
  if (hours === null || hours === undefined || !Number.isFinite(Number(hours))) return "—";
  return since(Math.max(0, Number(hours)) * HOUR);
}

const STATUS = { success: ["สำเร็จ", "ok"], partial: ["สำเร็จบางส่วน", "warn"], failed: ["ไม่สำเร็จ", "bad"], error: ["ไม่สำเร็จ", "bad"], running: ["กำลังทำงาน", "muted"] };
const statusOf = (status) => STATUS[status] ?? [String(status ?? "ไม่ทราบ"), "muted"];

const loadingRow = (base) => ({ ...base, state: "loading", stateLabel: "กำลังตรวจ…", fresh: null, complete: null });

/** ค่าแอด Meta — สถานะรวมจากทุกบัญชีที่เชื่อม */
export function metaSourceRow({ accounts = [], ready = true, now = Date.now() } = {}) {
  const base = { key: "meta", name: "ค่าแอด Meta", icon: "meta" };
  const connected = accounts.filter((row) => row.connected);
  if (!ready) return loadingRow({ ...base, sub: accounts.length ? `${accounts.length} บัญชี` : null });
  if (!connected.length) return { ...base, sub: "ยังไม่มีบัญชี", state: "waiting", stateLabel: "ยังไม่เชื่อม", hint: "เชื่อม Meta และผูกบัญชีในหน้าตั้งค่า", fresh: null, complete: null };
  const count = (states) => connected.filter((row) => states.includes(row.state)).length;
  const errors = count(["error"]), missing = count(["missing"]), stale = count(["stale"]);
  const [state, stateLabel] = errors ? ["bad", `ดึงไม่สำเร็จ ${errors} บัญชี`] : missing ? ["bad", `ข้อมูลขาด ${missing} บัญชี`] : stale ? ["warn", `ล่าช้า ${stale} บัญชี`] : ["ok", "ปกติ"];
  const latest = connected.map((row) => row.lastSuccessAt).filter(Boolean).sort().at(-1) ?? null;
  const newest = connected.filter((row) => row.ageHours != null).sort((a, b) => a.ageHours - b.ageHours)[0];
  const gap = connected.reduce((n, row) => n + (row.missingDays || 0), 0);
  const reconciled = connected.filter((row) => row.reconciliation?.ready).length;
  return {
    ...base, sub: `${connected.length} บัญชี`, state, stateLabel,
    hint: errors ? "ดูรหัสปัญหาในแท็บบัญชี Meta" : missing || stale ? "กดดึงข้อมูลทั้งหมดเพื่อเติมช่วงที่ขาด" : null,
    fresh: { text: newest ? agoHours(newest.ageHours) : latest ? ago(latest, now) : "ยังไม่เคยดึง", sub: DAILY_SUB },
    complete: { text: gap ? `ขาด ${gap} วัน` : "ไม่มีวันขาด", sub: `ตรวจยอดผ่าน ${reconciled}/${connected.length}` },
  };
}

/* ค่าแอดที่เข้าระบบด้วยการอัปไฟล์ (ChatGPT ads) — ไม่มี cron ดึงให้ คนต้องอัปเอง
   เกินกี่วันถึงเตือน: 7 วัน = หนึ่งรอบสัปดาห์ ถ้าเกินนี้แปลว่าลืม ไม่ใช่แค่ยังไม่ถึงรอบ */
const FILE_STALE_DAYS = 7;
const DAY_MS = 86_400_000;

/** คืน null เมื่อไม่มีบัญชีแบบไฟล์เลย — จะได้ไม่ขึ้นแถวเปล่าให้คนที่ไม่ได้ใช้ช่องทางนี้ */
export function fileImportSourceRow({ connections = [], batches = [], ready = true, now = Date.now() } = {}) {
  if (connections.length === 0) return null;
  const base = { key: "fileimport", name: "ค่าแอดที่นำเข้าจากไฟล์", icon: "upload", sub: `${connections.length} บัญชี` };
  if (!ready) return loadingRow(base);

  const latestOf = (connectionId) => batches
    .filter((batch) => batch.connection_id === connectionId)
    .map((batch) => Date.parse(batch.created_at))
    .filter(Number.isFinite).sort().at(-1) ?? null;

  const times = connections.map((connection) => latestOf(connection.id));
  const never = times.filter((time) => time === null).length;
  const oldest = times.filter(Boolean).sort()[0] ?? null;
  const newest = times.filter(Boolean).sort().at(-1) ?? null;
  const staleDays = oldest ? Math.floor((now - oldest) / DAY_MS) : null;

  if (never === connections.length) {
    return { ...base, state: "waiting", stateLabel: "ยังไม่เคยนำเข้า",
      hint: "อัปไฟล์จาก Ads Manager ที่การ์ดด้านล่าง", fresh: null, complete: null };
  }
  const stale = never > 0 || (staleDays != null && staleDays > FILE_STALE_DAYS);
  return {
    ...base,
    state: stale ? "warn" : "ok",
    stateLabel: never > 0 ? `ยังไม่เคยนำเข้า ${never} บัญชี` : stale ? `ค้างอัป ${staleDays} วัน` : "ปกติ",
    hint: stale ? "อัปไฟล์รอบใหม่ที่การ์ดด้านล่าง" : null,
    fresh: { text: newest ? ago(new Date(newest).toISOString(), now) : "ยังไม่เคยนำเข้า", sub: "คนอัปเอง · ไม่มีรอบดึงอัตโนมัติ" },
    complete: { text: `นำเข้าแล้ว ${batches.length} ไฟล์`, sub: never > 0 ? `${never} บัญชียังไม่มีข้อมูล` : null },
  };
}

/** ยอดขาย TD · JD · TA จากระบบขาย */
export function salesSourceRow({ runs = [], facts = [], ready = true, today, now = Date.now() } = {}) {
  const base = { key: "sales", name: "ยอดขาย TD · JD · TA", sub: "ระบบขาย", icon: "sales" };
  if (!ready) return loadingRow(base);
  const last = runs.filter((run) => run.pipeline === "sales").sort((a, b) => (time(b.started_at) ?? 0) - (time(a.started_at) ?? 0))[0];
  const month = String(today ?? "").slice(0, 7);
  // วันนี้และเมื่อวานที่ทีมยังไม่กรอก ไม่นับเป็นวันที่ขาด — วันนี้ยังไม่จบ · ทีมกรอกของเมื่อวานตอนเช้า
  // (ตรวจรอบ 28 ก.ย.: เลยเที่ยงคืนตัวหารกระโดด 74/78 → 74/81 ทั้งที่ยังไม่ถึงเวลากรอก)
  const [ty, tm, td] = String(today ?? "").split("-").map(Number);
  const yesterday = Number.isFinite(td) ? new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10) : null;
  // เฉพาะแถวจากระบบขายพี่ทัช — แถว source 'tmk' (JUNTAKARN) มีแถวของตัวเอง ถ้านับรวมที่นี่ตัวหารจะบวมเท่าตัว
  const monthFacts = facts.filter((fact) => (fact.source ?? "crm") === "crm" && String(fact.fact_date ?? "").startsWith(month) && (fact.inquiry_filled === true || !(yesterday && fact.fact_date >= yesterday)));
  const filled = monthFacts.filter((fact) => fact.inquiry_filled === true).length;
  // หลายแบรนด์ = นับวัน × แบรนด์ (เดือนมี 27 วันแต่ขึ้น 78) → บอกว่ารวมกี่แบรนด์ (ทดสอบแบบผู้ใช้จริง)
  const brandCount = new Set(monthFacts.map((fact) => fact.brand_id)).size;
  const complete = monthFacts.length ? { text: `คนทักทีมกรอก ${filled}/${monthFacts.length} วัน${brandCount > 1 ? ` (รวม ${brandCount} แบรนด์)` : ""}`, sub: "ยอด · Lead · ออเดอร์ มาครบ" } : null;
  if (!last) return { ...base, state: "bad", stateLabel: "ยังไม่เคยดึง", hint: "กดดึงยอดขายตอนนี้ในเมนู หรือตรวจคีย์ระบบขาย", fresh: { text: "—", sub: DAILY_SUB }, complete };
  const [label] = statusOf(last.status);
  const failed = last.status === "failed";
  const old = now - (time(last.started_at) ?? 0) > SALES_STALE_HOURS * HOUR;
  /* รอบเป็น partial เพราะเฟส JUNTAKARN พังอย่างเดียว = ท่อของ TD·JD·TA ยังเขียนครบ → แถวนี้ไม่ต้องเตือน
     (เรื่องของ JK ขึ้นบนแถว "ยอดขาย JUNTAKARN" ของมันเอง) */
  const partial = last.status === "partial" && !(last.summary?.jk?.error && !last.summary?.goals?.error);
  const state = failed ? "bad" : old || partial ? "warn" : last.status === "running" ? "muted" : "ok";
  return {
    ...base, state,
    stateLabel: failed ? "ดึงไม่สำเร็จ" : old ? "ล่าช้า" : partial ? label : last.status === "running" ? "กำลังดึง" : "ปกติ",
    hint: failed ? adsErrorText(last.error_code, "ดูประวัติรอบในแท็บยอดขาย")
      : old ? "ไม่ได้ดึงเกินวันครึ่ง — ตรวจตัวดึงอัตโนมัติ"
        : partial ? adsErrorText(last.summary?.goals?.error ?? last.error_code, "ดูประวัติรอบในแท็บยอดขาย") : null,
    fresh: { text: ago(last.started_at, now), sub: DAILY_SUB }, complete,
  };
}

/** Creative Meta — รอบล่าสุดต่อบัญชี */
export function creativeSourceRow({ runs = [], accounts = [], ready = true, now = Date.now() } = {}) {
  const base = { key: "creatives", name: "Creative Meta", sub: "รูปและข้อความโฆษณา", icon: "creative" };
  if (!ready) return loadingRow(base);
  const ids = accounts.filter((row) => row.connectionId && row.connected !== false).map((row) => row.connectionId);
  const latest = new Map();
  for (const run of runs.filter((r) => r.pipeline === "creatives")) {
    const prev = latest.get(run.connection_id);
    if (!prev || (time(run.started_at) ?? 0) > (time(prev.started_at) ?? 0)) latest.set(run.connection_id, run);
  }
  const mine = ids.map((id) => latest.get(id)).filter(Boolean);
  if (!mine.length) return { ...base, state: "waiting", stateLabel: "รอรอบแรก", hint: null, fresh: { text: "ยังไม่มีรอบที่บันทึก", sub: "ดึงวันละครั้ง · ต่อบัญชี" }, complete: null };
  const recent = mine.filter((run) => now - (time(run.started_at) ?? 0) <= CREATIVE_WINDOW_HOURS * HOUR);
  const failed = mine.filter((run) => run.status === "failed");
  const newest = mine.map((run) => run.started_at).sort().at(-1);
  const state = failed.length ? "bad" : recent.length === 0 ? "warn" : "ok";
  return {
    ...base, state,
    stateLabel: failed.length ? `รีเฟรชไม่สำเร็จ ${failed.length} บัญชี` : recent.length === 0 ? "ล่าช้า" : "ปกติ",
    hint: failed.length ? adsErrorText(failed[0].error_code, "ดูรายบัญชีในแท็บบัญชี Meta") : recent.length === 0 ? "ไม่ได้รีเฟรชเกิน 2 วัน" : null,
    fresh: { text: ago(newest, now), sub: "ดึงวันละครั้ง · ต่อบัญชี" },
    complete: { text: `${recent.length}/${ids.length} บัญชีรีเฟรชใน 2 วัน`, sub: null },
  };
}

const LEVEL_ORDER = { bad: 0, warn: 1, wait: 2 };

/** เรื่องที่ควรดู เรียง ต้องแก้ → เตือน → รอคนอื่น · ส่วนที่ยังโหลดไม่เสร็จ = ไม่พูดถึง */
export function syncIssues({ rows = {}, authorizations = { ready: false, items: [] }, cron = null, goals = { ready: false, missingByBrand: [] }, now = Date.now() } = {}) {
  const out = [];
  for (const row of Object.values(rows)) {
    if (row && (row.state === "bad" || row.state === "warn")) out.push({ key: `source:${row.key}`, level: row.state, text: `${row.name}: ${row.stateLabel}`, hint: row.hint ?? null, source: row.key });
  }
  if (cron && ["error", "stale", "idle"].includes(cron.state)) out.push({ key: "cron", level: "bad", text: `ตัวดึงอัตโนมัติ: ${cron.label}`, hint: "ข้อมูลจะไม่อัปเดตเองจนกว่าจะกลับมาทำงาน", tab: "history" });
  if (authorizations?.ready) {
    const active = (authorizations.items ?? []).filter((item) => item?.status === "connected");
    if (!active.length) out.push({ key: "token", level: "bad", text: "ยังไม่ได้เชื่อม Meta", hint: "เชื่อมในหน้าตั้งค่า › บัญชี", tab: "access" });
    else {
      const days = active.map((item) => tokenDaysLeft(item.expires_at, now));
      const soonest = days.filter((d) => d != null).sort((a, b) => a - b)[0];
      if (soonest != null && soonest <= 7) out.push({ key: "token", level: "bad", text: `token Meta เหลือ ${soonest} วัน`, hint: "กดเชื่อม Meta ใหม่ก่อนหมดอายุ", tab: "access" });
      else if (soonest != null && soonest <= 21) out.push({ key: "token", level: "warn", text: `token Meta เหลือ ${soonest} วัน`, hint: "เชื่อมใหม่ก่อนหมดอายุ", tab: "access" });
      else if (days.some((d) => d == null)) out.push({ key: "token", level: "warn", text: "token Meta ไม่รู้วันหมดอายุ", hint: "ระบบอ่านวันหมดอายุจาก Meta ในรอบดึงถัดไป", tab: "access" });
    }
  }
  if (goals?.ready) {
    const lacking = (goals.missingByBrand ?? []).filter((item) => item.missing?.length);
    if (lacking.length) {
      const fields = [...new Set(lacking.flatMap((item) => item.missing))];
      out.push({ key: "goals", level: "wait", text: `เป้าเดือนนี้ยังไม่ตั้ง: ${fields.join(" · ")} (${lacking.map((item) => item.name).join(" · ")})`, hint: "ทีมขายตั้งที่หน้าเป้าหมายของระบบขาย", tab: "sales" });
    }
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** สรุปบนสุด — ยังโหลดอยู่ไม่รีบบอกว่าพร้อมใช้ แต่ถ้าเจอเรื่องต้องแก้แล้วบอกเลย */
export function syncVerdict({ loading = false, issues = [] } = {}) {
  const bad = issues.filter((issue) => issue.level === "bad").length;
  if (bad) return { state: "bad", title: `ต้องแก้ ${bad} เรื่อง` };
  if (loading) return { state: "loading", title: "กำลังตรวจข้อมูล…" };
  if (issues.length) return { state: "warn", title: `ข้อมูลใช้ได้ · มี ${issues.length} เรื่องควรดู` };
  return { state: "ok", title: "ข้อมูลพร้อมใช้" };
}

/** ตัวตั้งเวลาเรียก ads-cron รอบถัดไป — ช่วงเช้า 09:00–09:50 ไทยทุก 10 นาที (ตารางจริงอยู่ที่ _shared/dailySchedule.js) */
export function nextCronAt(now = Date.now()) {
  return nextDailyTickAt(now);
}

/** ดึงค่าแอดรอบถัดไปจริง — ดึงไปแล้ววันนี้ = 09:00 พรุ่งนี้ · ยังไม่ได้ดึง = รอบถัดไปของตัวตั้งเวลา (ในช่วงเช้าคือรอบเก็บตก) */
export function nextSyncAt(lastSuccessAt, now = Date.now()) {
  return doneToday(lastSuccessAt, dayIn(now, DAILY_TZ)) ? nextDailyRunAt(now) : nextDailyTickAt(now);
}

const MODE = { incremental: "ล่าสุด", backfill: "ย้อนหลัง" };
const PIPELINE = { sales: "ดึงยอดขาย", inventory: "สำรวจแหล่งข้อมูลระบบขาย", creatives: "รีเฟรช Creative" };

/** ประวัติทุกแหล่งเป็นเส้นเวลาเดียว (ใหม่ก่อน) · kind = all | cron | meta | sales | creatives */
export function historyTimeline({ ticks = [], syncRuns = [], pipelineRuns = [], accounts = [], kind = "all", limit = 60 } = {}) {
  const names = new Map(accounts.map((row) => [row.connectionId, row.brand]));
  const items = [];
  for (const run of pipelineRuns) {
    const k = run.pipeline === "inventory" ? "sales" : run.pipeline;
    const [statusLabel, tone] = statusOf(run.status);
    const brand = run.connection_id ? names.get(run.connection_id) : null;
    const detail = [run.rows_written != null && run.pipeline !== "inventory" ? `เขียน ${num(run.rows_written)} ${run.pipeline === "creatives" ? "ชิ้น" : "แถว"}` : null, run.error_code ? adsErrorText(run.error_code, run.error_code) : null].filter(Boolean).join(" · ");
    items.push({ id: `p:${run.id}`, at: run.started_at, kind: k, sort: run.pipeline === "inventory" ? "inventory" : k,
      title: `${PIPELINE[run.pipeline] ?? run.pipeline}${brand ? ` · ${brand}` : ""}`, detail: detail || null, statusLabel, tone, auto: run.trigger_kind !== "manual" });
  }
  for (const run of syncRuns) {
    // รอบที่ถูกยกเลิกโดยตั้งใจ (เช่นแก้การนับ purchase แล้วดึงใหม่) ไม่ใช่ความผิดพลาด — อย่าขึ้นแดง
    const [statusLabel, tone] = String(run.errorCode ?? "").startsWith("SUPERSEDED_") ? ["ยกเลิกแล้ว", "muted"] : statusOf(run.status);
    const brand = names.get(run.connectionId) ?? "ไม่ทราบบัญชี";
    const reconcile = run.mode === "reconcile";
    const detail = reconcile ? null : [MODE[run.mode] ?? run.mode, `เขียน ${num(run.rowsWritten)} แถว`, run.errorCode ? adsErrorText(run.errorCode, run.errorCode) : null].filter(Boolean).join(" · ");
    items.push({ id: `s:${run.id}`, at: run.startedAt, kind: "meta", title: `${reconcile ? "ตรวจยอด Meta" : "ดึงค่าแอด Meta"} · ${brand}`, detail, statusLabel, tone, auto: run.auto });
  }
  for (const tick of ticks) {
    const worked = tick.synced || tick.reconciled || tick.rowsWritten || tick.sales || tick.creatives || tick.status !== "success";
    if (!worked) continue;
    const [statusLabel, tone] = statusOf(tick.status);
    const detail = [tick.synced ? `ดึง ${tick.synced} ก้อน` : null, tick.reconciled ? `ตรวจยอด ${tick.reconciled} บัญชี` : null, tick.rowsWritten ? `เขียน ${num(tick.rowsWritten)} แถว` : null, tick.errorCode ? adsErrorText(tick.errorCode, tick.errorCode) : null].filter(Boolean).join(" · ");
    items.push({ id: `t:${tick.id}`, at: tick.startedAt, kind: "cron", title: tick.auto ? "รอบอัตโนมัติ" : "รอบที่สั่งเอง", detail: detail || null, statusLabel, tone, auto: tick.auto });
  }
  return items
    .filter((item) => kind === "all" || item.kind === kind)
    .sort((a, b) => (time(b.at) ?? 0) - (time(a.at) ?? 0))
    .slice(0, limit)
    .map(({ sort, ...item }) => ({ ...item, kind: sort === "inventory" ? "inventory" : item.kind }));
}

/** Snapshot บัญชีแอดทุกตัวที่ token เห็น (หน้า บิล & กระทบยอด · spec 2026-09-22) — ads-cron เก็บวันละครั้ง 09:00
    RLS อ่านได้เฉพาะ team_lead → allowed:false = บอกตรงๆ ไม่หลอกว่า "รอรอบแรก" */
const SNAPSHOT_STALE_HOURS = 26;   // เก็บวันละครั้งตอนเช้า — เกิน 26 ชม. = พลาดรอบเช้า
export function snapshotSourceRow({ snapshots = [], ready = true, allowed = true, now = Date.now() } = {}) {
  const base = { key: "snapshots", name: "ยอดค้างบัญชีแอด", sub: "หน้า บิล & กระทบยอด", icon: "billing" };
  if (!allowed) return { ...base, state: "muted", stateLabel: "เฉพาะหัวหน้าทีม", hint: null, fresh: null, complete: null };
  if (!ready) return loadingRow(base);
  const freshSub = `เก็บวันละครั้ง · ${DAILY_RUN_LABEL}`;
  if (!snapshots.length) return { ...base, state: "waiting", stateLabel: "รอรอบแรก", hint: `จะเริ่มมีข้อมูลในรอบ ${DAILY_RUN_LABEL} · หรือกดดึง Snapshot เองในเมนู`, fresh: { text: "ยังไม่มีข้อมูล", sub: freshSub }, complete: null };
  const newest = snapshots.map((s) => s.fetched_at).filter(Boolean).sort().at(-1);
  const stale = now - (time(newest) ?? 0) > SNAPSHOT_STALE_HOURS * HOUR;
  const badStatus = snapshots.filter((s) => s.account_status != null && s.account_status !== 1).length;
  // สถานะบัญชีผิดปกติ = เรื่องเงินหยุดไหล สำคัญกว่าความสด — ชนะป้ายล่าช้า
  const state = badStatus ? "warn" : stale ? "warn" : "ok";
  return {
    ...base, state,
    stateLabel: badStatus ? `บัญชีสถานะผิดปกติ ${badStatus}` : stale ? "ล่าช้า" : "ปกติ",
    hint: badStatus ? "ดูรายบัญชีในหน้า บิล & กระทบยอด" : stale ? "เกิน 26 ชม. — ตรวจ ads-cron ในแท็บประวัติ" : null,
    fresh: { text: ago(newest, now), sub: freshSub },
    complete: { text: `${snapshots.length} บัญชีที่เข้าถึงได้`, sub: badStatus ? `สถานะผิดปกติ ${badStatus} บัญชี — ดูในหน้า บิล & กระทบยอด` : null },
  };
}

/** เวลาของ "ข้อมูลล่าสุด" — วันเดียวกับตอนนี้ = เวลาอย่างเดียว · คนละวัน = ใส่วันที่ (ตรวจรอบ 28 ก.ย.: หลังเที่ยงคืน "05:20" อ่านเป็นเช้าวันนี้ที่ยังไม่ถึง) */
export function lastClock(value, now = new Date()) {
  if (!value) return "—";
  const at = new Date(value);
  const tz = { timeZone: "Asia/Bangkok" };
  const day = (d) => new Intl.DateTimeFormat("en-CA", tz).format(d);
  const time = new Intl.DateTimeFormat("th-TH", { ...tz, hour: "2-digit", minute: "2-digit" }).format(at);
  return day(at) === day(new Date(now)) ? time : `${new Intl.DateTimeFormat("th-TH", { ...tz, day: "numeric", month: "short" }).format(at)} ${time}`;
}
