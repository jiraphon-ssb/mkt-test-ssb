/* หน้า Sync (รื้อใหม่ 17 ก.ย.) — logic ล้วน · เทสใน tests/syncOverview.test.js
   หน้าตอบคำถามเดียว: ข้อมูลแต่ละแหล่งมาครบ สด เชื่อถือได้ไหม และต้องแก้อะไร
   กติกา: ข้อมูลส่วนไหนยังโหลดไม่เสร็จ = state "loading" ห้ามสรุปว่า "ยังไม่มี/ยังไม่เชื่อม" จากค่าเก่า
   (บน production หน้าเดิมโชว์ "ยังไม่เคยดึง" ระหว่างรอ API ทั้งที่ดึงสำเร็จแล้ว) */
import { fmtNum } from "../dash/charts/theme.js";
import { adsErrorText } from "./adsSyncMessages.js";
import { tokenDaysLeft } from "./syncSources.js";

const HOUR = 3_600_000;
const time = (value) => { const t = Date.parse(value ?? ""); return Number.isFinite(t) ? t : null; };
const num = (value) => Number(value ?? 0).toLocaleString("th-TH");
const SALES_STALE_HOURS = 36;      // ดึงวันละครั้งหลัง 9 โมง — เกินวันครึ่ง = ข้ามไปหนึ่งวันแล้ว
const CREATIVE_WINDOW_HOURS = 48;  // รีเฟรชวันละครั้งต่อบัญชี (ครั้งละบัญชี) — เกิน 2 วัน = ค้าง

/** "53 นาทีก่อน" · "4.9 ชม.ก่อน" · "3 วันก่อน" */
export function ago(value, now = Date.now()) {
  const t = time(value);
  if (t === null) return "—";
  const ms = Math.max(0, now - t);
  if (ms < HOUR) return `${Math.max(1, Math.floor(ms / 60_000))} นาทีก่อน`;
  if (ms < 48 * HOUR) return `${fmtNum((ms / HOUR), 2)} ชม.ก่อน`;
  return `${Math.floor(ms / (24 * HOUR))} วันก่อน`;
}

const STATUS = { success: ["สำเร็จ", "ok"], partial: ["สำเร็จบางส่วน", "warn"], failed: ["ไม่สำเร็จ", "bad"], error: ["ไม่สำเร็จ", "bad"], running: ["กำลังทำงาน", "muted"] };
const statusOf = (status) => STATUS[status] ?? [String(status ?? "ไม่ทราบ"), "muted"];

const loadingRow = (base) => ({ ...base, state: "loading", stateLabel: "กำลังตรวจ…", fresh: null, complete: null });

/** ค่าแอด Meta — สถานะรวมจากทุกบัญชีที่เชื่อม */
export function metaSourceRow({ accounts = [], ready = true, everyHours = null, now = Date.now() } = {}) {
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
    hint: errors ? "ดูรหัสปัญหาในแท็บบัญชี Meta" : missing || stale ? "กดดึงข้อมูลตอนนี้เพื่อเติมช่วงที่ขาด" : null,
    fresh: { text: newest ? `${fmtNum(newest.ageHours, 2)} ชม.ก่อน` : latest ? ago(latest, now) : "ยังไม่เคยดึง", sub: everyHours ? `ดึงทุก ${everyHours} ชม.` : null },
    complete: { text: gap ? `ขาด ${gap} วัน` : "ไม่มีวันขาด", sub: `ตรวจยอดผ่าน ${reconciled}/${connected.length}` },
  };
}

/** ยอดขาย TD · JD · TA จากระบบขาย */
export function salesSourceRow({ runs = [], facts = [], ready = true, today, now = Date.now() } = {}) {
  const base = { key: "sales", name: "ยอดขาย TD · JD · TA", sub: "ระบบขาย", icon: "sales" };
  if (!ready) return loadingRow(base);
  const last = runs.filter((run) => run.pipeline === "sales").sort((a, b) => (time(b.started_at) ?? 0) - (time(a.started_at) ?? 0))[0];
  const month = String(today ?? "").slice(0, 7);
  // วันนี้ที่ทีมยังไม่กรอก ไม่นับเป็นวันที่ขาด (วันยังไม่จบ)
  // เฉพาะแถวจากระบบขายพี่ทัช — แถว source 'tmk' (JUNTAKARN) มีแถวของตัวเอง ถ้านับรวมที่นี่ตัวหารจะบวมเท่าตัว
  const monthFacts = facts.filter((fact) => (fact.source ?? "crm") === "crm" && String(fact.fact_date ?? "").startsWith(month) && (fact.fact_date !== today || fact.inquiry_filled === true));
  const filled = monthFacts.filter((fact) => fact.inquiry_filled === true).length;
  const complete = monthFacts.length ? { text: `คนทักทีมกรอก ${filled}/${monthFacts.length} วัน`, sub: "ยอด · ลีด · ออเดอร์ มาครบ" } : null;
  if (!last) return { ...base, state: "bad", stateLabel: "ยังไม่เคยดึง", hint: "กดดึงยอดขายตอนนี้ในเมนู หรือตรวจคีย์ระบบขาย", fresh: { text: "—", sub: "วันละครั้ง หลัง 9 โมง" }, complete };
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
    fresh: { text: ago(last.started_at, now), sub: "วันละครั้ง หลัง 9 โมง" }, complete,
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
  if (!mine.length) return { ...base, state: "waiting", stateLabel: "รอรอบแรก", hint: null, fresh: { text: "ยังไม่มีรอบที่บันทึก", sub: "วันละครั้งต่อบัญชี" }, complete: null };
  const recent = mine.filter((run) => now - (time(run.started_at) ?? 0) <= CREATIVE_WINDOW_HOURS * HOUR);
  const failed = mine.filter((run) => run.status === "failed");
  const newest = mine.map((run) => run.started_at).sort().at(-1);
  const state = failed.length ? "bad" : recent.length === 0 ? "warn" : "ok";
  return {
    ...base, state,
    stateLabel: failed.length ? `รีเฟรชไม่สำเร็จ ${failed.length} บัญชี` : recent.length === 0 ? "ค้าง" : "ปกติ",
    hint: failed.length ? adsErrorText(failed[0].error_code, "ดูรายบัญชีในแท็บบัญชี Meta") : recent.length === 0 ? "ไม่ได้รีเฟรชเกิน 2 วัน" : null,
    fresh: { text: ago(newest, now), sub: "วันละครั้งต่อบัญชี" },
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
      out.push({ key: "goals", level: "wait", text: `เป้าเดือนนี้ยังไม่ตั้ง: ${fields.join(" · ")} (${lacking.length} แบรนด์)`, hint: "ทีมขายตั้งที่หน้าเป้าหมายของระบบขาย", tab: "sales" });
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

/** ตัวตั้งเวลาเรียก ads-cron ทุกชั่วโมงนาทีที่ 7 */
export function nextCronAt(now = Date.now()) {
  const d = new Date(now);
  d.setUTCMinutes(7, 0, 0);
  if (d.getTime() <= now) d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString();
}

/** ดึงค่าแอดรอบถัดไปจริง — tick นาทีที่ 7 ตัวแรกที่ครบรอบ (ผ่อนผัน 10 นาทีเท่ากับ cronDue ใน _shared/adsCron.js) */
export function nextSyncAt(lastSuccessAt, everyHours = 6, now = Date.now()) {
  const last = time(lastSuccessAt);
  const hours = Number(everyHours) > 0 ? Math.min(24, Number(everyHours)) : 6;
  const dueAt = last === null ? now : last + hours * HOUR - 10 * 60_000;
  return nextCronAt(Math.max(now, dueAt) - 1);
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
