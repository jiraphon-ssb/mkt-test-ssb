/* apiClient — THE single data-access layer (กติกาเหล็ก #2).
   Every module fetches through this. Modules must never hit Google Sheets /
   Supabase / fetch() directly. When the backend changes (Sheets -> Supabase),
   ONLY this file changes; module code stays untouched.

   Phase 1: returns embedded sample data. The live Google-Sheets path
   (gviz CSV + the quote-aware parser ported faithfully from the original app)
   is included below but DISABLED until a sheet is configured — flip it on by
   setting VITE_SHEET_ID once the user gives the go-ahead. The return shape is
   identical either way: { CONS, DD, SSB, TMK }, each { name, monthly, weekly }. */

import { sampleCashflow, buildMonthly, consolidate } from "./sampleData.js";
import { supabase, requireSupabase } from "./supabaseClient.js";
import { AR_MAIN_STAGES, arEligible, buildForecast, buildAging, arKpis } from "./arModel.js";
/* เดโม marketing — วันต่อ Supabase จริง 2 บรรทัดนี้จะถูกแทนด้วย db.from/db.rpc */
import { store as mktStore } from "../../modules/marketing/data/DataStore.js";
import { hoursWaitingInReview as mktHoursWaiting } from "../../modules/marketing/mktRules.js";

/* AP (เงินออก) data surface — spec §17. All AP reads/writes go through here;
   writes call SECURITY DEFINER RPCs so the maker≠checker / dual / limit guards
   run server-side. This session: list/get/create/review/transition + vendor +
   audit + attachments. (run / petty / import are deferred — spec §19.) */

// tab (spec §2.3) → query filter. This session ships "ค่าใช้จ่ายปกติ" + "COGS".
// "normal" also surfaces not-yet-reviewed requests (pl_treatment null) so
// finance can pick them up to review.
// แท็บ "รายการจ่าย" = เงินออกทุกประเภท ยกเว้น COGS (ซึ่งมีแท็บ line-level แยก).
// เดิมกรองแค่ pl_treatment null/expense ทำให้ สำรองจ่าย/ทรัพย์สิน/ลดหนี้ หลุดหาย —
// ตอนนี้โชว์ทุกอย่างที่ไม่ใช่ cogs (มีคอลัมน์ "ประเภทเงินออก" บอกชนิด).
const TAB_FILTER = {
  normal: (q) => q.or("category_key.is.null,category_key.neq.cogs"),
  cogs: (q) => q.eq("category_key", "cogs"),
};

// Supabase Storage rejects object keys with Thai chars / spaces / ( ) — build the
// key from a safe ASCII slug (the original filename still shows in notes/feed).
const safeStorageName = (name = "") => {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "file";
  return ext ? `${base}.${ext}` : base;
};

const ap = {
  async list({ entity, tab, status } = {}) {
    const db = requireSupabase();
    let q = db.from("ap_request").select("*").order("created_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    if (status) q = q.eq("status", status);
    if (tab && TAB_FILTER[tab]) q = TAB_FILTER[tab](q);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async get(id) {
    const db = requireSupabase();
    const { data, error } = await db.from("ap_request").select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  async create(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_create", { payload });
    if (error) throw error;
    return data;
  },

  async review(id, accountingFields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_review", { p_id: id, fields: accountingFields });
    if (error) throw error;
    return data;
  },

  // requester แก้คำขอของตัวเอง เฉพาะสถานะ submitted (รอการเงินตรวจ) — restate, log เดิม→ใหม่ (2.3)
  async editRequest(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_edit_request", { p_id: id, fields });
    if (error) throw error;
    return data;
  },

  // action: submit-handled-by-create | approve | reject | edit | schedule | pay | post_flow | cancel
  async transition(id, action, payload = {}) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_transition", { p_id: id, p_action: action, payload });
    if (error) throw error;
    return data;
  },

  // finance ตีกลับตอนตรวจ (submitted → rejected + note) — สิทธิ์ review (0040).
  // คนละทางกับ transition('reject') ที่ใช้ตอนอนุมัติ (pending_approval, สิทธิ์ approve).
  async reviewReject(id, reason) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_review_reject", { p_id: id, p_reason: reason });
    if (error) throw error;
    return data;
  },

  // เพิ่มโน้ต (any stage) → log 'note' ใน audit (0042). สิทธิ์ = ผู้เห็นคำขอ.
  async note(id, note) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_note", { p_id: id, p_note: note });
    if (error) throw error;
    return data;
  },

  // ไดเรกทอรีชื่อผู้ใช้ (uuid → ชื่อ) สำหรับแสดงใน timeline (0043). อาจไม่มีก่อนรัน 0043.
  async userDirectory() {
    const db = requireSupabase();
    const { data, error } = await db.from("user_directory").select("id, name");
    if (error) throw error;
    return data ?? [];
  },

  // ตั้งแท็กของรายการจ่าย (0043). สิทธิ์ review/requester.
  async setTags(id, tags) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ap_set_tags", { p_id: id, p_tags: tags });
    if (error) throw error;
    return data;
  },

  async audit(id) {
    const db = requireSupabase();
    const { data, error } = await db
      .from("ap_audit_log").select("*").eq("request_id", id).order("at", { ascending: true });
    if (error) throw error;
    return data;
  },

  async attachments(requestId) {
    const db = requireSupabase();
    const { data, error } = await db
      .from("ap_attachment").select("*").eq("request_id", requestId).order("at");
    if (error) throw error;
    return data;
  },

  // temporary viewable URL for a private ap-attachments file (preview/download).
  // bucket is private; storage RLS allows authenticated read (0002) → signed URL.
  async attachmentUrl(storagePath, expiresIn = 3600) {
    const db = requireSupabase();
    const { data, error } = await db.storage.from("ap-attachments").createSignedUrl(storagePath, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  // upload a file to Storage then record the attachment row
  // key = sanitized name + timestamp (unique → no upsert overwrite; Thai names OK)
  async attach(requestId, file, type = "invoice") {
    const db = requireSupabase();
    const path = `${requestId}/${type}-${Date.now()}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("ap-attachments").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    const { data, error } = await db
      .from("ap_attachment").insert({ request_id: requestId, type, storage_path: path }).select().single();
    if (error) throw error;
    return data;
  },

  // delete an attachment — guarded server-side (uploader/review only, blocked
  // once paid/flow_posted, audited). RPC removes the row + returns the path;
  // the storage object is removed best-effort after (orphan > lost evidence).
  async detach(attachmentId) {
    const db = requireSupabase();
    const { data: path, error } = await db.rpc("ap_attachment_delete", { p_id: attachmentId });
    if (error) throw error;
    if (path) { try { await db.storage.from("ap-attachments").remove([path]); } catch { /* orphan ok */ } }
    return path;
  },

  vendor: {
    // active-only by default → bill pickers / factory link never see archived vendors
    async list({ includeInactive = false } = {}) {
      const db = requireSupabase();
      let q = db.from("ap_vendor").select("*").order("name");
      if (!includeInactive) q = q.eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async upsert(payload) {                       // create/edit (perm vendor.manage; audits bank changes)
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_vendor_upsert", { payload });
      if (error) throw error;
      return data;
    },
    async setStatus(id, status) {                 // archive / unarchive (no hard-delete)
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_vendor_set_status", { p_id: id, p_status: status });
      if (error) throw error;
      return data;
    },
    async audit(vendorId) {
      const db = requireSupabase();
      const { data, error } = await db.from("ap_vendor_audit")
        .select("*").eq("vendor_id", vendorId).order("at", { ascending: false });
      if (error) throw error;
      return data;
    },
  },

  // บัญชีที่จ่าย (master) — dropdown ในฟอร์มการเงิน กรองตามนิติบุคคล (2.2)
  payAccount: {
    async list({ entity, includeInactive = false } = {}) {
      const db = requireSupabase();
      let q = db.from("ap_pay_account").select("*").order("account_name");
      if (entity && entity !== "CONS") q = q.eq("entity", entity);
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async upsert(payload) {                         // create/edit (perm review ในนิติบุคคลนั้น)
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_pay_account_upsert", { payload });
      if (error) throw error;
      return data;
    },
    async setActive(id, active) {                   // archive / unarchive
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_pay_account_set_active", { p_id: id, p_active: active });
      if (error) throw error;
      return data;
    },
  },

  // per-FN lines under a COGS request
  async lines(requestId) {
    const db = requireSupabase();
    const { data, error } = await db
      .from("ap_request_line").select("*").eq("request_id", requestId).order("created_at");
    if (error) throw error;
    return data;
  },

  // COGS request summary list (with line count) — spec §11 / demo page 2
  async cogsList(entity) {
    const db = requireSupabase();
    let q = db.from("ap_request")
      .select("*, ap_request_line(count)")
      .eq("pl_treatment", "cogs")
      .order("created_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => ({ ...r, line_count: r.ap_request_line?.[0]?.count ?? 0 }));
  },

  import: {
    /**
     * Read a factory bill PDF/image → structured FN lines via Claude (Edge
     * Function "cogs-parse", holding ANTHROPIC_API_KEY server-side). The user
     * reviews/edits every field before commit. entity/brand are set in the
     * review screen, not by AI. With no backend configured we keep a small
     * sample so the COGS flow still demos offline.
     */
    async factoryBill(file) {
      if (!supabase) {   // offline demo (cashflow-only) — sample bill
        await delay(700);
        const lines = [
          { work_order_ref: "FN2606022", descr: "TPAC-TPCC", collar: "คอกลม 2 ชั้น", sleeve: "สั้น", option_label: "", qty: 24, unit_price: 145 },
          { work_order_ref: "FN2606030", descr: "ALL FOR ONE", collar: "คอวี", sleeve: "สั้น", option_label: "", qty: 43, unit_price: 135 },
          { work_order_ref: "FN2606050", descr: "Riverside", collar: "คอปกทอ", sleeve: "สั้น", option_label: "", qty: 150, unit_price: 135 },
        ];
        const lineSum = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
        const vat = Math.round(lineSum * 0.07 * 100) / 100;
        return { header: { factory: "ว้าว 1971", bill_no: "202606-016", doc_date: "2026-06-12", brand_tags: ["TEAMDEE"], entity: "DDFINIX", pre_vat: lineSum, vat, total: Math.round((lineSum + vat) * 100) / 100, file_name: file?.name ?? "factory-bill.pdf" }, lines };
      }
      const file_b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error("อ่านไฟล์ไม่ได้"));
        r.onload = () => { const b = String(r.result).split(",")[1] || ""; b ? res(b) : rej(new Error("อ่านไฟล์ไม่ได้ (ไฟล์ว่าง)")); };
        r.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("cogs-parse", { body: { file_b64, media_type: file?.type || "application/pdf" } });
      if (error) throw new Error(error.message || String(error));
      if (data?.error) throw new Error("AI อ่านบิลไม่สำเร็จ: " + data.error);
      const lines = Array.isArray(data.lines) ? data.lines : [];
      const lineSum = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
      const total = Number(data.total) || lineSum;   // never leave the header at 0 when lines exist (review/sum-check needs a real total)
      return {
        header: {
          factory: data.factory || "", bill_no: data.bill_no || "", doc_date: data.doc_date || "",
          brand_tags: [], entity: "",
          pre_vat: Number(data.pre_vat) || total, vat: Number(data.vat) || 0, total,
          file_name: file?.name ?? "factory-bill.pdf",
        },
        lines,
      };
    },

    async commit({ header, lines }) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_import_commit", { header, lines });
      if (error) throw error;
      return data;
    },
  },

  cost: {
    async factories() {
      const db = requireSupabase();
      const { data, error } = await db.from("factory").select("*").order("name");
      if (error) throw error;
      return data;
    },
    async setFactoryVendor(factoryId, vendorId) {   // link a factory → ap_vendor (for advance netting)
      const db = requireSupabase();
      const { data, error } = await db.rpc("factory_set_vendor", { p_factory: factoryId, p_vendor: vendorId || null });
      if (error) throw error;
      return data;
    },
    async ensureFactoryVendor(factoryId) {          // one-click: create a vendor named after the factory + link
      const db = requireSupabase();
      const { data, error } = await db.rpc("factory_ensure_vendor", { p_factory: factoryId });
      if (error) throw error;
      return data;
    },
    async rates(factoryId) {
      const db = requireSupabase();
      const { data, error } = await db.from("cost_rate").select("*")
        .eq("factory_id", factoryId).order("collar_group").order("qty_min");
      if (error) throw error;
      return data;
    },
    async addons(factoryId) {
      const db = requireSupabase();
      const { data, error } = await db.from("cost_addon").select("*")
        .eq("factory_id", factoryId).order("name");
      if (error) throw error;
      return data;
    },
    // cost master edits — RLS enforces finance-only (vendor.manage). payload.id null = insert.
    async rateSave({ id, ...row }) {
      const db = requireSupabase();
      const q = id ? db.from("cost_rate").update(row).eq("id", id) : db.from("cost_rate").insert(row);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    async rateDelete(id) {
      const db = requireSupabase();
      const { error } = await db.from("cost_rate").delete().eq("id", id);
      if (error) throw error;
    },
    async addonSave({ id, ...row }) {
      const db = requireSupabase();
      const q = id ? db.from("cost_addon").update(row).eq("id", id) : db.from("cost_addon").insert(row);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    async addonDelete(id) {
      const db = requireSupabase();
      const { error } = await db.from("cost_addon").delete().eq("id", id);
      if (error) throw error;
    },
    // all rates + addons (factory name resolved) for the Job Margin cost engine
    async forJobMargin() {
      const db = requireSupabase();
      const [rr, ar] = await Promise.all([
        db.from("cost_rate").select("*, factory!factory_id(name)"),
        db.from("cost_addon").select("*, factory!factory_id(name)"),
      ]);
      if (rr.error) throw rr.error;
      if (ar.error) throw ar.error;
      return {
        rates: (rr.data ?? []).map((r) => ({ ...r, factory: r.factory?.name })),
        addons: (ar.data ?? []).map((a) => ({ ...a, factory: a.factory?.name })),
      };
    },
  },

  // COGS-Match (the FN matcher — backend join lives in vw_cogs_match, 0014).
  // Phase 2: match() returns MOCK rows so the panel renders vs demo v4; Phase 3
  // swaps it to the real view query. The write RPCs are wired now (no-op until
  // the panel calls them in Phase 3).
  cogs: {
    // matched FN rows for a COGS request — read straight from the backend view
    // (the OEM↔AP join lives only there; the AP frontend never touches OEM).
    async match(requestId) {
      const db = requireSupabase();
      const { data, error } = await db.from("vw_cogs_match")
        .select("*").eq("request_id", requestId).order("work_order_ref");
      if (error) throw error;
      return data ?? [];
    },
    async setForecast(lineId, cost, note = null) {
      const db = requireSupabase();
      const { error } = await db.rpc("rpc_cogs_set_forecast", { p_line: lineId, p_forecast: cost, p_note: note });
      if (error) throw error;
    },
    async confirm(lineIds) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("rpc_cogs_confirm", { p_lines: lineIds });
      if (error) throw error; return data;
    },
    async manualMatch(lineId, jobCode) {
      const db = requireSupabase();
      const { error } = await db.rpc("rpc_cogs_manual_match", { p_line: lineId, p_job_code: jobCode });
      if (error) throw error;
    },
    async approve(requestId, payScope) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("rpc_cogs_approve", { p_request: requestId, p_pay_scope: payScope });
      if (error) throw error; return data;
    },
  },

  run: {
    async open(cycleType) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_run_open", { p_cycle: cycleType });
      if (error) throw error;
      return data;
    },
    async list() {
      const db = requireSupabase();
      const { data, error } = await db.from("payment_run").select("*").order("opened_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    // in_run requests of a run, grouped into pay batches by entity + account
    async batches(runId) {
      const db = requireSupabase();
      const { data, error } = await db.from("ap_request")
        .select("id, entity, pay_account_id, descr, net_transfer, req_amount, status, pay_ref, advance_applied, other_deduction")
        .eq("run_id", runId);
      if (error) throw error;
      const groups = {};
      for (const r of data) {
        const acct = r.pay_account_id || "—";
        const key = `${r.entity}__${acct}`;
        (groups[key] ??= { entity: r.entity, pay_account_id: acct, items: [], total: 0, openCount: 0 });
        // real cash that leaves the bank = net_transfer − advance_applied − other_deduction
        // (matches ap_cash_event_net_advance) so the amount shown next to pay_ref
        // reconciles to the actual SCB line even when an advance/discount was netted
        const cashOut = (Number(r.net_transfer ?? r.req_amount) || 0) - (Number(r.advance_applied) || 0) - (Number(r.other_deduction) || 0);
        groups[key].items.push({ ...r, cash_out: cashOut });
        groups[key].total += cashOut;
        if (r.status === "in_run") groups[key].openCount += 1;
      }
      return Object.values(groups);
    },
    async uploadSlip(runId, entity, account, file) {
      const db = requireSupabase();
      // account may be "—" (no master) and filenames may be Thai → sanitize both
      const path = `runs/${runId}/${safeStorageName(`${entity}-${account}`)}-${Date.now()}-${safeStorageName(file.name)}`;
      const up = await db.storage.from("ap-attachments").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      return path;
    },
    async payBatch(runId, entity, account, slipPath = null) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_run_pay_batch", {
        p_run: runId, p_entity: entity, p_account: account === "—" ? "" : account, p_slip: slipPath,
      });
      if (error) throw error;
      return data; // number paid
    },
    async close(runId) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("ap_run_close", { p_run: runId });
      if (error) throw error;
      return data;
    },
    // project approved/in_run outflows into the next matching cycle → cashflow forecast
    // (เฉพาะโอนแบงก์ — channel แพลตฟอร์ม/บัตร เงินไม่ออกจากบัญชี ไม่ใช่ยอดรอบโอน · 0074)
    async forecast() {
      const db = requireSupabase();
      const { data, error } = await db.from("ap_request")
        .select("entity, pl_treatment, net_transfer, req_amount, due_date, status, channel")
        .in("status", ["approved", "in_run"])
        .or("channel.is.null,channel.eq.transfer");
      if (error) throw error;
      const now = new Date();
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
      const day = now.getDate();
      const cogsDate = new Date(now);
      if (day < 15) cogsDate.setDate(15);
      else if (day < 30) cogsDate.setDate(30);
      else { cogsDate.setMonth(now.getMonth() + 1, 15); }
      const iso = (d) => d.toISOString().slice(0, 10);
      const acc = {
        weekly_opex: { cycle: "weekly_opex", label: "รอบ OPEX (จันทร์หน้า)", date: iso(nextMonday), count: 0, total: 0 },
        cogs_15_30: { cycle: "cogs_15_30", label: "รอบ COGS (15/30)", date: iso(cogsDate), count: 0, total: 0 },
      };
      for (const r of data) {
        const bucket = r.pl_treatment === "cogs" ? acc.cogs_15_30 : acc.weekly_opex;
        bucket.count += 1;
        bucket.total += Number(r.net_transfer ?? r.req_amount) || 0;
      }
      return Object.values(acc);
    },
  },

  petty: {
    async boxes() {
      const db = requireSupabase();
      const { data, error } = await db.from("petty_box").select("*").order("entity");
      if (error) throw error;
      return data;
    },
    async moves(boxId) {
      const db = requireSupabase();
      const { data, error } = await db.from("petty_move").select("*")
        .eq("box_id", boxId).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
    async topup(boxId, amount) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("petty_topup", { p_box: boxId, p_amount: amount });
      if (error) throw error;
      return data;
    },
    async clear({ box_id, amount, category_key, brand_tags = [], note = null }) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("petty_clear", {
        p_box: box_id, p_amount: amount, p_category: category_key, p_brands: brand_tags, p_note: note,
      });
      if (error) throw error;
      return data;
    },
  },

  cc: {
    async wallets() {
      const db = requireSupabase();
      const { data, error } = await db.from("cc_wallet").select("*").order("entity");
      if (error) throw error;
      return data;
    },
    // add/edit a card master (perm vendor.manage). payload.id null = create.
    async upsertWallet(payload) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_wallet_upsert", { payload });
      if (error) throw error;
      return data;
    },
    // charges for a wallet; optional status filter (e.g. 'draft' for the import review) + batch
    async charges(walletId, { status, batchId, limit = 50 } = {}) {
      const db = requireSupabase();
      let q = db.from("cc_charge").select("*").eq("wallet_id", walletId)
        .order("charge_date", { ascending: false }).limit(limit);
      if (status) q = Array.isArray(status) ? q.in("status", status) : q.eq("status", status);
      if (batchId) q = q.eq("import_batch_id", batchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    // weekly CSV import → draft lines (idempotent on file_hash). lines = [{charge_date,
    // merchant, descr, amount, category_key, ai_category, brand_tags, disposition}]
    async import({ wallet_id, week_start = null, week_end = null, file_hash = null, lines }) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_import", {
        p_wallet: wallet_id, p_week_start: week_start, p_week_end: week_end, p_file_hash: file_hash, p_lines: lines,
      });
      if (error) throw error;
      return data;
    },
    async editCharge(id, patch) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_charge_edit", { p_charge: id, p_patch: patch });
      if (error) throw error;
      return data;
    },
    // AI guess categories for a batch of merchant rows (Edge Function "cc-categorize").
    // Best-effort helper: returns [{category_key}] aligned to rows; caller fills the gaps
    // and the user still reviews/edits. "unknown" = couldn't tell.
    async categorize(rows, categories) {
      const db = requireSupabase();
      const { data, error } = await db.functions.invoke("cc-categorize", { body: { rows, categories } });
      if (error) throw new Error(error.message || String(error));
      if (data?.error) throw new Error(data.error);
      return Array.isArray(data?.results) ? data.results : [];
    },
    async recognize(chargeIds) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_recognize", { p_charges: chargeIds });
      if (error) throw error;
      return data;
    },
    async voidCharge(id) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_charge_void", { p_charge: id });
      if (error) throw error;
      return data;
    },
    async statements({ entity } = {}) {
      const db = requireSupabase();
      let q = db.from("cc_statement").select("*").order("cycle_label", { ascending: false });
      if (entity && entity !== "CONS") q = q.eq("entity", entity);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    async approveStatement(id) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_statement_approve", { p_statement: id });
      if (error) throw error;
      return data;
    },
    // amount optional — server pays exactly the reconciled business charges (cross-checks if passed)
    async settleStatement(id, amount = null) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_settle_statement", { p_statement: id, p_amount: amount });
      if (error) throw error;
      return data;
    },
    // ② statement match: open (no lock) → ingest uploaded lines → matchApply (lock)
    async openStatement({ wallet_id, cycle, statement_total = null }) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_statement_open", { p_wallet: wallet_id, p_cycle: cycle, p_statement_total: statement_total });
      if (error) throw error;
      return data;
    },
    async ingestStatementLines(statementId, lines) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_statement_ingest", { p_statement: statementId, p_lines: lines });
      if (error) throw error;
      return data;
    },
    async statementLines(statementId) {
      const db = requireSupabase();
      const { data, error } = await db.from("cc_statement_line").select("*").eq("statement_id", statementId).order("trans_date");
      if (error) throw error;
      return data ?? [];
    },
    async matchApply(statementId, matches, adds) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_match_apply", { p_statement: statementId, p_matches: matches, p_adds: adds });
      if (error) throw error;
      return data;
    },
    async discardStatement(id) {   // delete an abandoned 'open' statement
      const db = requireSupabase();
      const { error } = await db.rpc("cc_statement_discard", { p_statement: id });
      if (error) throw error;
    },
    // attachments (private bucket cc-files, path {entity}/{statement_id}/{kind}). kind = 'statement' | 'slip'
    async uploadFile({ statement_id, entity, kind, file }) {
      const db = requireSupabase();
      const path = `${entity}/${statement_id}/${kind}`;
      const up = await db.storage.from("cc-files").upload(path, file, { upsert: true, contentType: file.type || undefined });
      if (up.error) throw up.error;
      const { error } = await db.rpc("cc_statement_set_file", { p_statement: statement_id, p_kind: kind, p_path: path });
      if (error) throw error;
      return path;
    },
    async fileUrl(path) {   // short-lived signed URL for viewing
      const db = requireSupabase();
      const { data, error } = await db.storage.from("cc-files").createSignedUrl(path, 120);
      if (error) throw error;
      return data.signedUrl;
    },
    // legacy per-swipe quick add — still works (tagged recognized/business)
    async charge({ wallet_id, charge_date, descr, category_key, amount, brand_tags = [] }) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_charge_add", {
        p_wallet: wallet_id,
        p_date: charge_date || new Date().toISOString().slice(0, 10), // p_date has no SQL default
        p_descr: descr, p_category: category_key, p_amount: amount, p_brands: brand_tags,
      });
      if (error) throw error;
      return data;
    },
    // legacy settle — neutralized server-side (raises). Use settleStatement. Kept so the
    // old WalletsView button surfaces the message instead of crashing (rebuilt in Round C).
    async settle(walletId, amount) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("cc_settle", { p_wallet: walletId, p_amount: amount });
      if (error) throw error;
      return data;
    },
  },

  // รายการค้างเคลียร์ (posting_group='advance' = สำรอง/ทดรอง) — PostingType §4
  pending: {
    async list({ entity, status } = {}) {
      const db = requireSupabase();
      let q = db.from("pending_clearance")
        .select("*, source:ap_request!source_ap_id(descr,payee_name,doc_date,vendor_id)")
        .order("created_at", { ascending: false });
      if (entity && entity !== "CONS") q = q.eq("entity", entity);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    async clear(id, amount, note = null) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("pending_clear", { p_id: id, p_amount: amount, p_note: note });
      if (error) throw error;
      return data;
    },
    async writeoff(id, reason) {
      const db = requireSupabase();
      const { data, error } = await db.rpc("pending_writeoff", { p_id: id, p_reason: reason });
      if (error) throw error;
      return data;
    },
    // open supplier advances (kind=supplier_advance) — optionally only for one vendor
    async supplierAdvances({ entity, vendorId } = {}) {
      const db = requireSupabase();
      let q = db.from("pending_clearance")
        .select("*, source:ap_request!source_ap_id(payee_name,doc_date,vendor_id)")
        .eq("kind", "supplier_advance").in("status", ["open", "partial"]).order("created_at");
      if (entity && entity !== "CONS") q = q.eq("entity", entity);
      const { data, error } = await q;
      if (error) throw error;
      let rows = data ?? [];
      if (vendorId) rows = rows.filter((r) => r.source?.vendor_id === vendorId);
      return rows;
    },
    // payable bills of a vendor that an advance can be netted against (not yet paid)
    async vendorBills({ entity, vendorId }) {
      const db = requireSupabase();
      let q = db.from("ap_request")
        .select("id, descr, payee_name, req_amount, net_transfer, advance_applied, other_deduction, status, doc_date")
        .eq("vendor_id", vendorId).in("status", ["submitted", "pending_approval", "approved", "in_run"])
        .order("doc_date", { ascending: false });
      if (entity && entity !== "CONS") q = q.eq("entity", entity);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    async applyToBill(advanceId, billId, amount) {   // หัก advance กับบิล (supplier_advance_apply)
      const db = requireSupabase();
      const { data, error } = await db.rpc("supplier_advance_apply", { p_advance: advanceId, p_bill: billId, p_amount: amount });
      if (error) throw error;
      return data;
    },
  },
};

const SHEET_ID = import.meta.env.VITE_SHEET_ID ?? null; // null in Phase 1 → sample
const YEAR = Number(import.meta.env.VITE_SHEET_YEAR ?? 2026);

// Sheet tab names — must match the sheet EXACTLY (incl. the "•" and spaces).
const SHEETS = {
  consMonthly: "CONSOLIDATED • รายเดือน",
  ddWeekly: "DD FINIX • รายสัปดาห์",
  ddMonthly: "DD FINIX • รายเดือน",
  ssbWeekly: "SSB • รายสัปดาห์",
  ssbMonthly: "SSB • รายเดือน",
  tmkWeekly: "TMK • รายสัปดาห์",
  tmkMonthly: "TMK • รายเดือน",
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Live source: Google Sheets gviz CSV (ported bug-for-bug; disabled) ──── */

// Thai-formatted number → JS number. "(123)" → negative; -/—/blank → null;
// tolerates ฿ % , and wrapping quotes.
function num(tok) {
  if (tok == null) return null;
  let t = String(tok).replace(/^"+|"+$/g, "").trim();
  if (!t || t === "-" || t === "—") return null;
  const neg = /^\(.*\)$/.test(t);
  t = t.replace(/[(),%฿\s]/g, "").replace(/,/g, "");
  const v = parseFloat(t);
  if (isNaN(v)) return null;
  return neg ? -v : v;
}

// Quote-aware CSV parser — gviz quotes any cell containing a comma (every
// thousands-separated number), and "" escapes a quote. A naive split(',')
// shreds those numbers. Do NOT simplify.
function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

// First row whose label cell STARTS WITH `label` (not includes) → 13 numbers
// (12 months + year total). startsWith avoids section headers shadowing data.
function readRow(rows, label) {
  const r = rows.find((row) => row[0] && row[0].trim().startsWith(label));
  return r ? r.slice(1, 14).map(num) : null;
}

function parseMonthly(csv) {
  const rows = parseCSV(csv);
  return {
    opening: readRow(rows, "เงินสดต้นงวด (Opening)"),
    cashIn: readRow(rows, "รวม Cash In"),
    cashOut: readRow(rows, "รวม Cash Out"),
    net: readRow(rows, "▸ Net Cash Flow"),
    closing: readRow(rows, "เงินสดปลายงวด (Closing)"),
    cogs: readRow(rows, "ต้นทุนสินค้า (COGS)"),
    salary: readRow(rows, "เงินเดือนพนักงาน"),
    director: readRow(rows, "เงินเดือนกรรมการ"),
    mkt: readRow(rows, "ค่าใช้จ่ายการตลาด"),
    selling: readRow(rows, "ค่าใช้จ่ายในการขาย"),
    admin: readRow(rows, "บริหาร"),
    opex: readRow(rows, "รวม OPEX"),
    debt: readRow(rows, "เงินต้นหนี้ที่จ่ายจริง"),
    interest: readRow(rows, "ดอกเบี้ยจ่าย"),
    tax: readRow(rows, "ภาษีที่จ่ายจริง"),
    capex: readRow(rows, "เงินลงทุน / Capex"),
    ownerDraw: readRow(rows, "เจ้าของถอนใช้ส่วนตัว"),
    l4: readRow(rows, "รวม Layer 4"),
  };
}

// Weekly tab — fixed column template (read by index, not label).
function parseWeekly(csv) {
  const out = [];
  for (const row of parseCSV(csv)) {
    const wk = (row[0] || "").trim();
    if (!/^\d+$/.test(wk)) continue;
    out.push({
      wk: +wk, date: (row[1] || "").trim(), mo: num(row[2]),
      opening: num(row[3]), cashIn: num(row[4]),
      cashOut: num(row[18]), net: num(row[19]), closing: num(row[20]),
    });
  }
  return out;
}

async function fetchSheet(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok || /<html/i.test(t.slice(0, 200))) {
    throw new Error(`อ่านชีท "${name}" ไม่ได้ — ตรวจ SHEET_ID / การแชร์ / ชื่อแท็บ`);
  }
  return t;
}

async function getCashflowLive() {
  const [consM, ddW, ddM, ssbW, ssbM, tmkW, tmkM] = await Promise.all([
    fetchSheet(SHEETS.consMonthly), fetchSheet(SHEETS.ddWeekly), fetchSheet(SHEETS.ddMonthly),
    fetchSheet(SHEETS.ssbWeekly), fetchSheet(SHEETS.ssbMonthly),
    fetchSheet(SHEETS.tmkWeekly), fetchSheet(SHEETS.tmkMonthly),
  ]);
  return {
    CONS: { name: "รวม 3 บริษัท", monthly: parseMonthly(consM), weekly: null },
    DD: { name: "DD FINIX", monthly: parseMonthly(ddM), weekly: parseWeekly(ddW) },
    SSB: { name: "SSB", monthly: parseMonthly(ssbM), weekly: parseWeekly(ssbW) },
    TMK: { name: "TMK", monthly: parseMonthly(tmkM), weekly: parseWeekly(tmkW) },
  };
}

/* Cashflow from Supabase — assembles the SAME {CONS,DD,SSB,TMK} contract from real
   data: spend keys + cash-in from vw_cashflow_month, opening balance per entity
   from cash_recon (R1). Reuses buildMonthly/consolidate so the 13-length arrays,
   identities, null discipline + CONS=sum are byte-identical to the sample/gviz
   paths. weekly = null in v1 (deferred — monthly drives everything else). */
const CF_KEYS = ["cogs", "salary", "director", "mkt", "selling", "admin", "debt", "interest", "tax", "capex", "ownerDraw"];
const CF_ENTITIES = ["DDFINIX", "SSB", "TMK"];
async function getCashflowFromDb() {
  const db = requireSupabase();
  const now = new Date();
  const mp = YEAR === now.getFullYear() ? now.getMonth() + 1 : 12; // months present (year-to-date)
  const [cf, rec] = await Promise.all([
    db.from("vw_cashflow_month").select("entity, ym, key, amt"),
    db.from("cash_recon").select("entity, ym, opening_actual"),
  ]);
  if (cf.error) throw cf.error;
  if (rec.error) throw rec.error;

  // pivot long rows → per-entity leaf arrays (mp months; 0 where no data)
  const blank = () => Object.fromEntries(["cashIn", ...CF_KEYS].map((k) => [k, Array(mp).fill(0)]));
  const leaf = { DDFINIX: blank(), SSB: blank(), TMK: blank() };
  for (const r of cf.data ?? []) {
    if (!leaf[r.entity] || r.ym?.slice(0, 4) !== String(YEAR)) continue;
    const i = Number(r.ym.slice(5, 7)) - 1;
    const bucket = r.key === "cashIn" ? "cashIn" : (CF_KEYS.includes(r.key) ? r.key : null);
    if (i < 0 || i >= mp || !bucket) continue;
    leaf[r.entity][bucket][i] += Number(r.amt) || 0;
  }
  // Jan opening per entity from the reconciliation (else 0 → balances relative to 0)
  const openJan = { DDFINIX: 0, SSB: 0, TMK: 0 };
  for (const r of rec.data ?? []) {
    if (r.ym === `${YEAR}-01` && openJan[r.entity] != null) openJan[r.entity] = Number(r.opening_actual) || 0;
  }
  const m = {};
  for (const e of CF_ENTITIES) m[e] = buildMonthly(leaf[e], openJan[e], mp);
  return {
    CONS: { name: "รวม 3 บริษัท", monthly: consolidate([m.DDFINIX, m.SSB, m.TMK]), weekly: null },
    DD: { name: "DD FINIX", monthly: m.DDFINIX, weekly: null },
    SSB: { name: "SSB", monthly: m.SSB, weekly: null },
    TMK: { name: "TMK", monthly: m.TMK, weekly: null },
  };
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/* P/L (รายงานบริหาร) surface — read-only report. Revenue + matched COGS come from
   the OEM views (vw_pl_revenue / vw_pl_cogs, accrual|cash mode); other expense
   sections come from AP (pl_line → P/L section). All aggregation centralised here. */

// AP category_key → P/L section (v1 coarse map; precise per-line + salary-by-
// department needs ap_request.pl_line captured at AP review — TODO).
const PL_SECTION = {
  cogs: "cogs", mkt: "mkt", selling: "selling",
  salary: "admin", director: "admin", admin: "admin",
  interest: "interest", tax: "tax",
  // debt / capex / ownerDraw → in_pl = false (not P/L expenses)
};
const PL_AP_ENTITY = { ddfinix: "DDFINIX", ssb: "SSB", tmk: "TMK" };
const PL_RECOGNIZED = ["approved", "in_run", "paid", "flow_posted"];

// pl_line_map.pl_section → P/L report bucket (precise: salary splits by dept).
const PLSEC_TO_REPORT = { COGS: "cogs", Marketing: "mkt", Selling: "selling", RND: "rnd", Admin: "admin" };
// resolve a request to a report section. A2+ requests carry pl_line_id → resolve by
// the precise pl_section (salary splits by dept); never guess from the coarse
// category_key, which can't tell the merged Admin/tax line from real income tax.
function reportSection(r, lineById) {
  if (r.pl_line_id) {
    const m = lineById.get(r.pl_line_id);
    if (!m || !m.in_pl) return null;           // unresolved ref or non-P/L (debt/capex/ownerDraw)
    if (m.pl_section === "Below") return m.cashflow_key === "interest" ? "interest" : m.cashflow_key === "tax" ? "tax" : null;
    return PLSEC_TO_REPORT[m.pl_section] ?? null;
  }
  return PL_SECTION[r.category_key] ?? null;   // legacy (pre-A2) requests only
}

// Does this AP row feed the P/L? MIRROR of SQL ap_eff_posting(...)->pl_yes (0020)
// — keep in sync (same convention as can.js mirroring SQL perms). Needed because
// tax_remit uses category_key='tax' (same as income tax) but must NOT enter P/L
// (§7#3): the posting_type — not the category — decides.
function apFeedsPl(r) {
  if (r.posting_group) return r.posting_group === "expense";   // only expense feeds P/L
  // legacy derive (no posting_type): non-P/L destinations
  if (r.category_key === "capex" || r.category_key === "debt" || r.category_key === "ownerDraw") return false;
  if (r.pl_treatment === "settlement" || r.pl_treatment === "suspense" || r.pl_treatment === "capex") return false;
  return r.category_key != null;                                // else (has a category) → P/L
}

// report section for a prepaid amortization slice's target P/L line (same rule as
// reportSection's pl_line_id branch — Below resolves to interest/tax by cashflow_key).
function amortSection(lm) {
  if (!lm || !lm.in_pl) return null;
  if (lm.pl_section === "Below") return lm.cashflow_key === "interest" ? "interest" : lm.cashflow_key === "tax" ? "tax" : null;
  return PLSEC_TO_REPORT[lm.pl_section] ?? null;
}

// fold a vw_pl_* view (rows of {entity, ym:'YYYY-MM', <cols>}) into a month→value
// map for one report entity. cons = sum of every entity; a named entity = its own.
function foldByMonth(rows, entityKey, year, valueKey) {
  const want = PL_AP_ENTITY[entityKey];              // undefined for cons (sum all)
  const out = {};
  for (const r of rows ?? []) {
    if (!r.ym || r.ym.slice(0, 4) !== String(year)) continue;
    if (want && r.entity !== want) continue;
    const i = Number(r.ym.slice(5, 7)) - 1;
    out[i] = (out[i] || 0) + (Number(r[valueKey]) || 0);
  }
  return out;
}

const pl = {
  async lineMap() {
    const db = requireSupabase();
    const { data, error } = await db.from("pl_line_map").select("*").order("sort");
    if (error) throw error;
    return data;
  },
  // chart-of-accounts editor (admin/finance) — guarded server-side by pl_can_edit_chart
  async upsertLine(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("pl_line_upsert", { payload });
    if (error) throw error;
    return data;
  },
  async setLineActive(id, active) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("pl_line_set_active", { p_id: id, p_active: active });
    if (error) throw error;
    return data;
  },
  async config() {
    const db = requireSupabase();
    const { data, error } = await db.from("pl_config").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  },
  // AI headline for the period (Edge Function "pl-ai") → { status, summary, bullets }.
  // Read-only commentary on numbers already computed client-side; no DB writes.
  async ai(payload) {
    const db = requireSupabase();
    const { data, error } = await db.functions.invoke("pl-ai", { body: payload });
    if (error) throw new Error(error.message || String(error));
    if (data?.error) throw new Error(data.error);
    return data;
  },
  // monthly section figures: revenue + matched COGS from the OEM views (by mode),
  // other expense sections from AP. mode = 'accrual' (รับรู้เต็มตอนงวดแรก) | 'cash' (เงินสด)
  // shareAlloc = true → "P/L มุมบริหาร": ต้นทุนที่ติ๊กแชร์ (shared_entities) จะถูก
  // หารเท่ากันให้ทุกนิติบุคคลที่ร่วม (หลัก + ที่แชร์) แทนที่จะกองที่ผู้จ่าย 100%.
  // แชร์เฉพาะต้นทุน AP โดยตรง (rent/utilities ฯลฯ) — ไม่แตะ revenue/COGS/ค่าเสื่อม/บัตร.
  // ที่ group total ไม่เปลี่ยน (แค่ย้ายต้นทุนภายในกลุ่ม). ไม่กระทบ P/L ตามกฎหมาย (shareAlloc=false).
  async report(entityKey, year, mode = "accrual", { shareAlloc = false } = {}) {
    const db = requireSupabase();
    const apEntity = PL_AP_ENTITY[entityKey];
    const lineById = new Map((await pl.lineMap()).map((l) => [l.id, l]));

    // real OEM revenue + job-matched COGS (both bases per entity×month)
    const [revRes, cogsRes] = await Promise.all([
      db.from("vw_pl_revenue").select("entity, ym, accrual_rev, cash_rev"),
      db.from("vw_pl_cogs").select("entity, ym, accrual_cogs, cash_cogs"),
    ]);
    if (revRes.error) throw revRes.error;
    if (cogsRes.error) throw cogsRes.error;
    const rev = foldByMonth(revRes.data, entityKey, year, mode === "cash" ? "cash_rev" : "accrual_rev");
    const cogs = foldByMonth(cogsRes.data, entityKey, year, mode === "cash" ? "cash_cogs" : "accrual_cogs");

    // รายได้อื่น (Other Income) — point-in-time so accrual=cash. Graceful: vw_pl_other_income
    // exists only after 0033, so a missing view leaves other income = 0 (P/L still loads).
    let otherInc = {};
    const othRes = await db.from("vw_pl_other_income").select("entity, ym, accrual_amt, cash_amt");
    if (!othRes.error) otherInc = foldByMonth(othRes.data, entityKey, year, mode === "cash" ? "cash_amt" : "accrual_amt");

    let q = db.from("ap_request")
      .select("entity, category_key, pl_line_id, posting_group, pl_treatment, net_transfer, req_amount, doc_date, created_at, status, shared_entities")
      .in("status", PL_RECOGNIZED).not("category_key", "is", null);
    // มุมบริหาร: ดึงรายการที่ entity นี้เป็นผู้จ่ายหลัก "หรือ" อยู่ในนิติบุคคลที่แชร์
    if (apEntity) q = shareAlloc
      ? q.or(`entity.eq.${apEntity},shared_entities.cs.{${apEntity}}`)
      : q.eq("entity", apEntity);
    const { data, error } = await q;
    if (error) throw error;

    const now = new Date();
    const maxIdx = year === now.getFullYear() ? now.getMonth() : 11;
    const months = [];
    for (let i = 0; i <= maxIdx; i++) {
      const r = rev[i] || 0;
      months.push({ idx: i, rev: r, bud: Math.round(r * 0.97),   // budget = placeholder until per-entity targets
        cogs: cogs[i] || 0, otherIncome: otherInc[i] || 0, mkt: 0, selling: 0, rnd: 0, admin: 0, interest: 0, tax: 0, dep: 0 });
    }
    for (const r of data ?? []) {
      if (!apFeedsPl(r)) continue;                  // posting decides P/L, not category (§7#3: tax_remit excluded)
      const d = new Date(r.doc_date || r.created_at);
      if (d.getFullYear() !== year) continue;
      const i = d.getMonth();
      if (i > maxIdx) continue;
      const sec = reportSection(r, lineById);
      if (!sec || sec === "cogs") continue;        // cogs comes from vw_pl_cogs (job-matched)
      let amt = Number(r.net_transfer ?? r.req_amount) || 0;
      if (shareAlloc && apEntity)                  // หารเท่ากันตามจำนวนผู้ร่วม (หลัก + ที่แชร์)
        amt /= 1 + (Array.isArray(r.shared_entities) ? r.shared_entities.length : 0);
      months[i][sec] += amt;
    }

    // non-cash recognition (ค่าเสื่อม + prepaid ตัดจ่าย) — straight-line slices from the
    // amortization register; capex → dep (below EBITDA), prepaid → its line's section.
    // P/L only (these emit no cash event → cashflow untouched).
    const want = PL_AP_ENTITY[entityKey];
    const { data: amortData } = await db.from("vw_amortization_month").select("entity, ym, kind, pl_line_id, amount");
    for (const a of amortData ?? []) {
      if (want && a.entity !== want) continue;
      if (!a.ym || a.ym.slice(0, 4) !== String(year)) continue;
      const i = Number(a.ym.slice(5, 7)) - 1;
      if (i > maxIdx) continue;
      const amt = Number(a.amount) || 0;
      if (a.kind === "capex") { months[i].dep += amt; continue; }
      const sec = amortSection(a.pl_line_id ? lineById.get(a.pl_line_id) : null);  // prepaid → its line's section
      if (sec && sec !== "cogs") months[i][sec] += amt;
    }

    // credit-card recognized/reconciled BUSINESS charges — same non-cash feed: they carry
    // a category_key (no pl_line_id) so resolve the section the legacy way (PL_SECTION).
    // No cash event here (cash only at cc_settle_statement) → cashflow untouched. report()
    // and the drill read the SAME cc_charge rows (RLS), so the drilled lines foot the cell.
    const { data: ccData } = await db.from("cc_charge")
      .select("charge_date, category_key, amount, wallet:cc_wallet!inner(entity)")
      .in("status", ["recognized", "reconciled"]).eq("disposition", "business").not("category_key", "is", null);
    for (const c of ccData ?? []) {
      if (want && c.wallet?.entity !== want) continue;
      const d = new Date(c.charge_date);
      if (d.getFullYear() !== year) continue;
      const i = d.getMonth();
      if (i > maxIdx) continue;
      const sec = PL_SECTION[c.category_key];
      if (!sec || sec === "cogs") continue;        // non-expense category → skip; cogs via vw_pl_cogs
      months[i][sec] += Number(c.amount) || 0;
    }

    // เงินรับล่วงหน้า (มัดจำลูกค้า) — ยอดคงค้าง ณ ปัจจุบัน (snapshot, ไม่ใช่ flow รายเดือน).
    // ใช้แสดงเป็น "หมายเหตุท้ายงบ" เท่านั้น — ไม่เข้า months/ROWS/การคำนวณงบ. Graceful:
    // vw_pl_customer_deposit มีหลัง 0035 เท่านั้น → ไม่มี view = 0 (งบยังโหลดได้).
    let depositOutstanding = 0;
    const depRes = await db.from("vw_pl_customer_deposit").select("entity, amount_outstanding");
    if (!depRes.error) {
      depositOutstanding = (depRes.data ?? [])
        .filter((d) => !apEntity || d.entity === apEntity)
        .reduce((a, d) => a + (Number(d.amount_outstanding) || 0), 0);
    }
    return { year, entity: entityKey, months, depositOutstanding };
  },
  // AP transactions behind a section/month cell (drill). `sections` = report-section
  // keys (cogs/mkt/selling/rnd/admin/interest/tax) — matched by the SAME precise map
  // as report() so the drilled rows always sum to the cell total. `monthIdx = null`
  // returns the WHOLE year (for the per-month pivot drill); a number filters to it.
  // Each returned row is augmented with: _month (0–11), _section, _line (resolved
  // chart-of-accounts label) + _lineId — so the caller can pivot by line × month.
  async transactions(entityKey, year, monthIdx, sections, { shareAlloc = false } = {}) {
    const db = requireSupabase();
    const apEntity = PL_AP_ENTITY[entityKey];
    const lineById = new Map((await pl.lineMap()).map((l) => [l.id, l]));
    let q = db.from("ap_request")
      .select("entity, descr, payee_name, vendor_id, category_key, pl_line, pl_line_id, posting_group, pl_treatment, net_transfer, req_amount, doc_date, created_at, shared_entities")
      .in("status", PL_RECOGNIZED).not("category_key", "is", null);
    if (apEntity) q = shareAlloc
      ? q.or(`entity.eq.${apEntity},shared_entities.cs.{${apEntity}}`)
      : q.eq("entity", apEntity);
    const { data, error } = await q;
    if (error) throw error;
    const want = new Set(sections);
    const out = [];
    for (const r of data ?? []) {
      if (!apFeedsPl(r)) continue;                  // same P/L gate as report() so the drill reconciles
      const d = new Date(r.doc_date || r.created_at);
      if (d.getFullYear() !== year) continue;
      if (monthIdx != null && d.getMonth() !== monthIdx) continue;
      const sec = reportSection(r, lineById);
      if (sec == null || !want.has(sec)) continue;
      const lm = r.pl_line_id ? lineById.get(r.pl_line_id) : null;
      // มุมบริหาร: แสดงเฉพาะ "ส่วนแบ่ง" ของ entity นี้ (net_transfer/จำนวนผู้ร่วม) ให้ยอด drill ตรงกับ cell
      const parts = (shareAlloc && apEntity) ? 1 + (Array.isArray(r.shared_entities) ? r.shared_entities.length : 0) : 1;
      const net = (Number(r.net_transfer ?? r.req_amount) || 0) / parts;
      out.push({ ...r, net_transfer: net, req_amount: net, _shareParts: parts, _month: d.getMonth(), _section: sec,
        _lineId: r.pl_line_id || null,
        _line: r.pl_line || lm?.pl_line || r.payee_name || r.descr || "อื่นๆ" });
    }

    // prepaid amortization slices as synthetic non-AP rows — report() folds them into
    // the section cell, so the drill must too or the subtotal won't foot. (capex → dep,
    // which isn't drillable, so only non-capex amort can land in a drilled section.)
    const { data: amortData } = await db.from("vw_amortization_month").select("entity, ym, kind, pl_line_id, amount");
    for (const a of amortData ?? []) {
      if (a.kind === "capex") continue;
      if (apEntity && a.entity !== apEntity) continue;
      if (!a.ym || a.ym.slice(0, 4) !== String(year)) continue;
      const mi = Number(a.ym.slice(5, 7)) - 1;
      if (monthIdx != null && mi !== monthIdx) continue;
      const sec = amortSection(a.pl_line_id ? lineById.get(a.pl_line_id) : null);
      if (sec == null || sec === "cogs" || !want.has(sec)) continue;
      const label = `ตัดจ่าย: ${lineById.get(a.pl_line_id)?.pl_line ?? "—"}`;
      out.push({ entity: a.entity, _month: mi, _section: sec, _lineId: "amort:" + a.pl_line_id, _line: label,
        net_transfer: Number(a.amount) || 0, payee_name: "ตัดจ่ายรายเดือน (ประมาณการ)", descr: label,
        doc_date: `${a.ym}-15` });
    }

    // credit-card charges as individual drill rows (recognized/reconciled, business) —
    // report() folds the same rows by category, so these must appear or the cell won't foot.
    const { data: ccRows } = await db.from("cc_charge")
      .select("charge_date, merchant, descr, category_key, amount, wallet:cc_wallet!inner(entity, name)")
      .in("status", ["recognized", "reconciled"]).eq("disposition", "business").not("category_key", "is", null);
    for (const c of ccRows ?? []) {
      const ent = c.wallet?.entity;
      if (apEntity && ent !== apEntity) continue;
      const d = new Date(c.charge_date);
      if (d.getFullYear() !== year) continue;
      if (monthIdx != null && d.getMonth() !== monthIdx) continue;
      const sec = PL_SECTION[c.category_key];
      if (sec == null || sec === "cogs" || !want.has(sec)) continue;
      out.push({ entity: ent, _month: d.getMonth(), _section: sec, _lineId: null,  // group by merchant (_line), like legacy AP
        _line: c.merchant || c.descr || "บัตรเครดิต",
        net_transfer: Number(c.amount) || 0,
        payee_name: c.wallet?.name ? "บัตร " + c.wallet.name : "บัตรเครดิต",
        descr: c.descr || c.merchant || "", doc_date: c.charge_date });
    }
    return out;
  },

  // กำไรต่องาน — ข้อเท็จจริงต่องาน (perm-gated RPC job_margins; เซลล์เรียก = 403).
  // entityKey จาก shell → DB entity; group/cons → null = ทุกนิติบุคคลที่มีสิทธิ์.
  async jobMargins(entityKey) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("job_margins", { p_entity: PL_AP_ENTITY[entityKey] ?? null });
    if (error) throw error;
    return data ?? [];
  },
  // manual cost estimate per job (ปัก/สกรีน + override) — via definer RPC that re-checks
  // view_margin on the job's OWN entity (no direct table access; no cross-entity write)
  async setJobEst(job_code, est_cost, method = null, note = null) {
    const db = requireSupabase();
    const { error } = await db.rpc("job_est_set", { p_job: job_code, p_cost: est_cost, p_method: method, p_note: note });
    if (error) throw error;
  },
  async clearJobEst(job_code) {
    const db = requireSupabase();
    const { error } = await db.rpc("job_est_clear", { p_job: job_code });
    if (error) throw error;
  },
};

/* Sale OEM Operation surface — source of truth for revenue (bookings). All
   reads go through here; writes call the SECURITY DEFINER RPCs in 0011 so the
   atomic running-code + role/brand/stage guards run server-side. */
const sale = {
  // deal list (with customer rollup join), optionally filtered to brand codes
  async deals(brands) {
    const db = requireSupabase();
    let q = db.from("sale_deal")
      .select(`*, customer:sale_customer(customer_code,display_name,chat_user_id,chat_channel,phone,customer_category),
        payments:sale_payment(id,amount,receipt_type,deposit_disposition,voided_by,void_of,paid_date)`)
      .order("updated_at", { ascending: false });
    if (brands && brands.length) q = q.in("brand", brands);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  // full deal detail: header + customer + lines + payments + extra + cancellation
  async deal(id) {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_deal")
      .select(`*, customer:sale_customer(*),
        lines:sale_deal_line(*), payments:sale_payment(*),
        extra:sale_extra_work(*), cancellation:sale_cancellation(*)`)
      .eq("id", id).single();
    if (error) throw error;
    // bills (0057) fetched separately so the card still opens pre-migration
    // (embedding an unknown relationship would fail the whole deal query).
    data.bills = await sale.bills(id);
    return data;
  },

  // bills/ใบกำกับ for a deal (+ which payment rows each covers). Graceful [] if
  // the 0057 table isn't there yet (schema cache miss) so the card never breaks.
  async bills(dealId) {
    const db = requireSupabase();
    try {
      const { data, error } = await db.from("sale_bill")
        .select("*, covers:sale_bill_payment(payment_id)")
        .eq("deal_id", dealId);
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },

  async audit(dealId) {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_audit_log")
      .select("*").eq("deal_id", dealId).order("at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  // existing customers for the "สั่งซ้ำ" picker (returning-customer reorder) —
  // excludes internal accounts; recent-first. Filtering/search is client-side.
  async customers() {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_customer")
      .select("id, customer_code, display_name, phone, customer_category, chat_channel, chat_user_id, last_order_at, is_internal")
      .eq("is_internal", false)
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  },

  // แก้ข้อมูลลูกค้า (0066 — ปลดล็อค STOP v1): ชื่อ/เบอร์/ประเภท/โน้ต ทุก sale role ·
  // is_internal เฉพาะหัวหน้า (perm config) · ห้ามแตะ chat_user_id/customer_code —
  // RPC re-check ทุกอย่างฝั่ง server + ลง sale_audit_log
  async updateCustomer(customerId, fields) {
    const db = requireSupabase();
    const { error } = await db.rpc("sale_customer_update", { p_customer: customerId, fields });
    if (error) throw error;
  },

  // dedup lookup before issuing codes (§9): chat_user_id → phone → none
  async customerLookup({ chat_user_id, phone } = {}) {
    const db = requireSupabase();
    if (chat_user_id) {
      const { data } = await db.from("sale_customer").select("*").eq("chat_user_id", chat_user_id).maybeSingle();
      if (data) return { status: "matched", customer: data };
    }
    if (phone) {
      const { data } = await db.from("sale_customer").select("*").eq("phone", phone).limit(1).maybeSingle();
      if (data) return { status: "matched", customer: data };
    }
    return { status: "new" };
  },

  // ── write RPCs (only path) ──────────────────────────────────────────────
  async createDeal(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_deal_create", { payload });
    if (error) throw error; return data;
  },
  async toDesignDeposit(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_to_design_deposit", { p_deal: id, fields });
    if (error) throw error; return data;
  },
  // edit the deposit-time forecast fields later (qty/method/collar/value only)
  async updateEstimate(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_update_estimate", { p_deal: id, fields });
    if (error) throw error; return data;
  },
  // เปลี่ยนวิธีจัดการมัดจำตัวอย่าง (deduct/refund/forfeit) — forfeit ป้อนคิวให้การเงินรับรู้
  async dispositionSample(extraWorkId, disposition) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_disposition_sample", { p_extra_work: extraWorkId, p_disposition: disposition });
    if (error) throw error; return data;
  },
  async confirmOrder(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_confirm_order", { p_deal: id, fields });
    if (error) throw error; return data;
  },
  async deliver(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_deliver", { p_deal: id, fields });
    if (error) throw error; return data;
  },
  async addPayment(id, pay) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_add_payment", { p_deal: id, p_pay: pay });
    if (error) throw error; return data;
  },
  async addExtra(id, x) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_add_extra", { p_deal: id, p_x: x });
    if (error) throw error; return data;
  },
  async cancel(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_cancel", { p_deal: id, fields });
    if (error) throw error; return data;
  },
  async changeBrand(id, brand) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_change_brand", { p_deal: id, p_brand: brand });
    if (error) throw error; return data;
  },

  /* ── ledger (Re-model แกน B, 0047) — ทางเขียนการเงินชุดใหม่ ──────────────
     r: { receipt_type payment|design_deposit|sample_deposit|refund, amount,
          method, paid_date, receipt_link, note, ref_id (refund เท่านั้น) } */
  async addReceipt(id, r) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_add_receipt", { p_deal: id, p_r: r });
    if (error) throw error; return data;
  },
  // void = ติดธง append-only (หัวหน้า + เหตุผลบังคับ) — แถวไม่หายจาก ledger
  async voidReceipt(receiptId, reason) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_void_receipt", { p_receipt: receiptId, p_reason: reason });
    if (error) throw error; return data;
  },
  // disposition มัดจำ (design + sample): deduct | return | forfeit
  async dispositionDeposit(receiptId, disposition) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_disposition_deposit", { p_receipt: receiptId, p_disposition: disposition });
    if (error) throw error; return data;
  },

  /* ── บิล/ใบกำกับ (0057) — บัญชีแนบต่อรอบชำระ (M:N) ────────────────────────
     บิลจริงออกที่ FlowAccount; ที่นี่เก็บสำเนา (ไฟล์) หรือ ลิงก์ + เลขที่. */
  // upload a bill file (PDF/รูป) → returns storage path to pass into attachBill.
  async uploadBill(file) {
    const db = requireSupabase();
    const path = `bill-file/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return path;
  },
  // attach one bill covering 1+ payment rows. bill: { kind 'file'|'link',
  // file_path?, url?, bill_no?, note? } · payments: array of sale_payment ids.
  async attachBill(paymentIds, bill) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_attach_bill", { p_payments: paymentIds, p_bill: bill });
    if (error) throw error; return data;
  },
  // soft-remove a wrongly-attached bill (attacher or manager) — append-only.
  async removeBill(billId, reason) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_remove_bill", { p_bill: billId, p_reason: reason || null });
    if (error) throw error; return data;
  },

  /* ── stage (Re-model แกน A, 0048) ─────────────────────────────────────── */
  async moveStage(id, main, sub) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_move_stage", { p_deal: id, p_main: main, p_sub: sub });
    if (error) throw error; return data;
  },
  async stageHistory(id) {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_stage_history")
      .select("*").eq("deal_id", id).order("moved_at", { ascending: true });
    if (error) throw error; return data ?? [];
  },
  // ถอน confirmed แบบ 2 คน (maker≠checker): request → approve
  async requestRevert(id, reason) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_request_revert", { p_deal: id, p_reason: reason });
    if (error) throw error; return data;
  },
  async approveRevert(id) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_approve_revert", { p_deal: id });
    if (error) throw error; return data;
  },

  /* ── follow engine + leads (Re-model เฟส 4, 0050) ─────────────────────── */
  async followups(id) {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_followup")
      .select("*").eq("deal_id", id).order("followed_at", { ascending: false });
    if (error) throw error; return data ?? [];
  },
  async addFollowup(id, f) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_add_followup", { p_deal: id, p_f: f });
    if (error) throw error; return data;
  },
  async markLost(id, reason, note) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_mark_lost", { p_deal: id, p_reason: reason, p_note: note || null });
    if (error) throw error; return data;
  },
  async reopen(id) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_reopen", { p_deal: id });
    if (error) throw error; return data;
  },

  /* ── production: checklist + factory + worksheet (Re-model เฟส 5, 0051) ── */
  async factories() {
    const db = requireSupabase();
    const { data, error } = await db.from("factory").select("id, name").order("name");
    if (error) throw error; return data ?? [];
  },
  async setChecklist(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_set_checklist", { p_deal: id, p_f: fields });
    if (error) throw error; return data;
  },
  async worksheetDone(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_worksheet_done", { p_deal: id, p_f: fields || {} });
    if (error) throw error; return data;
  },
  async selectFactory(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_select_factory", { p_deal: id, p_f: fields });
    if (error) throw error; return data;
  },

  // upload delivery proof (slip/parcel photo) → returns the storage path to pass
  // into closeJob. Mirrors ap.run.uploadSlip (upload now, record in the RPC).
  async uploadDelivery(dealId, file) {
    const db = requireSupabase();
    const path = `${dealId}/${Date.now()}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return path;
  },
  // lead sample slip/photo — uploaded BEFORE the deal exists (no deal id yet), so
  // it lives under a user-scoped path; the returned path rides in createDeal's
  // `sample.attachment_path`. Same private bucket as delivery proof.
  async uploadSampleSlip(file) {
    const db = requireSupabase();
    const path = `lead-sample/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return path;
  },
  // payment slip (มัดจำ / งวดแรก) — uploaded during the create wizard (deal may not
  // exist yet), path stored in sale_payment.receipt_link via the payment RPCs.
  async uploadSlip(file) {
    const db = requireSupabase();
    const path = `payment-slip/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return path;
  },
  // worksheet image (รูปใบงาน — หลายรูปต่อดีล) → {path, name} to push into
  // sale_deal.worksheet_files. Same shape as note files.
  async uploadWorksheet(file) {
    const db = requireSupabase();
    const path = `worksheet/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return { path, name: file.name };
  },
  // แก้รหัสไฟล์ของแบบ (สูตร -1/-2 ไม่ตรงหน้างาน 100%) — logs edit_line audit
  async lineSetFileCode(lineId, code) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_line_set_file_code", { p_line: lineId, p_code: code });
    if (error) throw error; return data;
  },
  // แก้ "พาร์ทใบงาน" (สเปค/วันที่/รูปเสื้อ) — perm stage.advance · log 'edit'
  // f = { work_name, factory, job_sent_date, job_due_date, deadline_date,
  //       lines:[{id, product_name, collar, sleeve, fabric, options[], line_note, design_image}] }
  async updateOrderInfo(id, f) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_update_order_info", { p_deal: id, p_f: f });
    if (error) throw error; return data;
  },
  // แก้ "พาร์ทเงิน" (จำนวน/ราคา/รายการ/ส่วนลด) — perm total.correct · reason บังคับ · restate/net
  // f = { lines:[{id,quantity,unit_price,product_name}], new_lines:[...], delete_lines:[uuid],
  //       discount_pct, discount_amount, discount_note }
  async updateMoney(id, f, reason) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_update_money", { p_deal: id, p_f: f, p_reason: reason });
    if (error) throw error; return data;
  },
  // รูปเสื้อต่อแบบ (design mockup image) → {path, name} เก็บใน sale_deal_line.design_image
  async uploadDesignImage(file) {
    const db = requireSupabase();
    const path = `design/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return { path, name: file.name };
  },
  // signed URL ที่บังคับดาวน์โหลด (Content-Disposition: attachment ชื่อไฟล์เดิม) —
  // ใช้กับปุ่มดาวน์โหลดใน lightbox รูปใบงาน
  async slipDownloadUrl(path, name) {
    const db = requireSupabase();
    const { data, error } = await db.storage.from("sale-delivery").createSignedUrl(path, 120, { download: name || true });
    if (error) throw error;
    return data.signedUrl;
  },
  // short-lived signed URL for any sale-delivery path (slip/delivery proof) so the
  // user can preview or save it — the bucket is private.
  async slipUrl(path, expiresIn = 120) {
    const db = requireSupabase();
    const { data, error } = await db.storage.from("sale-delivery").createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },
  // close job: ready_to_ship → shipped (stamps delivery_date, records the proof)
  async closeJob(id, { shipping_method, delivery_date, attachment_path, note } = {}) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_close_job", {
      p_deal: id, p_shipping_method: shipping_method,
      p_delivery_date: delivery_date || null, p_attachment_path: attachment_path,
      p_note: note || null,
    });
    if (error) throw error; return data;
  },

  /* ── ส่งของหลายรอบ (Re-model เฟส 5.5, 0052) ───────────────────────────────
     each shipment row = one round; is_final closes the job → Done. */
  async shipments(id) {
    const db = requireSupabase();
    const { data, error } = await db.from("sale_shipment")
      .select("*").eq("deal_id", id).order("round", { ascending: true });
    if (error) throw error; return data ?? [];
  },
  async ship(id, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_ship", { p_deal: id, p_f: fields });
    if (error) throw error; return data;
  },

  /* ── งานพิเศษ 2 ขั้น (Re-model เฟส 6, 0053) ────────────────────────────────
     sendSample = ส่งตัวอย่าง/แถม (pending→sent, tracking) · resolveRework = ปิดงานแก้. */
  async sendSample(extraWorkId, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_send_sample", { p_extra_work: extraWorkId, p_f: fields });
    if (error) throw error; return data;
  },
  async resolveRework(extraWorkId, fields) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_resolve_rework", { p_extra_work: extraWorkId, p_f: fields });
    if (error) throw error; return data;
  },

  /* ── โน้ต (0058, D3) — ตาราง sale_note แยกจาก audit; tag + ไฟล์ + 📌 ติดลูกค้า ──── */
  // โน้ตของดีลนี้ + โน้ตปักหมุด (📌) ของลูกค้าคนเดียวกันจากดีลอื่น. graceful [] ก่อนรัน mig.
  async notes(dealId, customerId) {
    const db = requireSupabase();
    try {
      let q = db.from("sale_note").select("*").is("deleted_at", null)
        .order("created_at", { ascending: false });
      q = customerId
        ? q.or(`deal_id.eq.${dealId},and(pinned.eq.true,customer_id.eq.${customerId})`)
        : q.eq("deal_id", dealId);
      const { data, error } = await q;
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },
  async noteTags() {
    const db = requireSupabase();
    try {
      const { data, error } = await db.from("sale_note_tag").select("*")
        .eq("active", true).order("sort");
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },
  async noteAdd(dealId, { body, tags = [], files = [] }) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_note_add", { p_deal: dealId, p_body: body, p_tags: tags, p_files: files });
    if (error) throw error; return data;
  },
  async noteEdit(noteId, { body, tags }) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_note_edit", { p_note: noteId, p_body: body, p_tags: tags ?? null });
    if (error) throw error; return data;
  },
  async noteDelete(noteId) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_note_delete", { p_note: noteId });
    if (error) throw error; return data;
  },
  async notePin(noteId, pinned) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_note_pin", { p_note: noteId, p_pinned: pinned });
    if (error) throw error; return data;
  },
  async noteTagSet(label, active = true, sort = 0) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("sale_note_tag_set", { p_label: label, p_active: active, p_sort: sort });
    if (error) throw error; return data;
  },
  // note attachment (รูป/ไฟล์) → returns {path, name} to push into files[].
  async uploadNoteFile(file) {
    const db = requireSupabase();
    const path = `note-file/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageName(file.name)}`;
    const up = await db.storage.from("sale-delivery").upload(path, file, { upsert: true });
    if (up.error) throw up.error;
    return { path, name: file.name };
  },
};

/* AR (เงินเข้า) surface — forecast-first receivables read-model over Sale OEM.
   Reads only (sale_deal + sale_payment); never recognizes revenue. The AR math
   lives in arModel.js (pure). Recording a receipt reuses sale.addPayment — no
   new cash ledger. Collection log + perms land in Phase 4 (migration 0013). */
const todayISO = () => new Date().toISOString().slice(0, 10);

const ar = {
  // AR-eligible deals (booked + still owing) enriched with outstanding +
  // expected-receipt-date + aging + overdue flag. Optionally brand-filtered.
  async listDeals(brands) {
    const db = requireSupabase();
    let q = db.from("sale_deal")
      .select(`*, customer:sale_customer(customer_code,display_name,phone,customer_category),
        payments:sale_payment(id,amount,receipt_type,deposit_disposition,voided_by,void_of)`)
      .in("main_stage", AR_MAIN_STAGES)
      .order("job_due_date", { ascending: true });
    if (brands && brands.length) q = q.in("brand", brands);
    const { data, error } = await q;
    if (error) throw error;
    // collection statuses (graceful — ar_followup may not exist until 0013 runs)
    const { data: fu } = await db.from("ar_followup").select("deal_id,status,promised_date,owner_id,note");
    const byDeal = Object.fromEntries((fu ?? []).map((f) => [f.deal_id, f]));
    const rows = (data ?? []).map((d) => ({ ...d, followup: byDeal[d.id] ?? null }));
    return arEligible(rows, todayISO());
  },

  // forecast view payload: KPI strip + timeline buckets + overdue/unknown split.
  // returns `deals` too so the UI doesn't re-query for the ledger.
  async forecast(brands, granularity = "week") {
    const deals = await ar.listDeals(brands);
    return { ...buildForecast(deals, todayISO(), granularity), kpis: arKpis(deals, todayISO()), deals };
  },

  // aging summary (credit, shipped) — bucket totals
  async aging(brands) {
    return buildAging(await ar.listDeals(brands));
  },

  // overdue deals (the §6.1 flag → click to filter the ledger)
  async overdue(brands) {
    return (await ar.listDeals(brands)).filter((d) => d.overdue);
  },

  // upsert a deal's collection status (RPC re-checks finance.ar.collect; the
  // หนี้สูญ write-off additionally needs finance.ar.writeoff)
  async followupUpsert(dealId, { status, promised_date, note, owner_id } = {}) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("ar_followup_upsert", {
      p_deal: dealId, p_status: status, p_promised_date: promised_date || null,
      p_note: note || null, p_owner: owner_id || null,
    });
    if (error) throw error; return data;
  },

  // ลูกหนี้อื่น (สำรองจ่ายแทนลูกค้า) — PostingType advances where the money is
  // recovered from a customer. Kept SEPARATE from revenue aging (§5): these are
  // non-sales receivables (e.g. ค่าส่งออกแทนลูกค้า) from pending_clearance, still
  // outstanding. Read-only here; cleared on the รายการค้างเคลียร์ page.
  async otherReceivables(entity) {
    const db = requireSupabase();
    let q = db.from("pending_clearance")
      .select("*, source:ap_request!source_ap_id(descr,payee_name,doc_date)")
      .eq("kind", "advance").eq("recover_from", "customer").in("status", ["open", "partial"])
      .order("created_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  // เงินรับล่วงหน้า (มัดจำลูกค้า) — derived liability from vw_customer_deposit_outstanding
  // (design deposits ยังค้างขั้นมัดจำ + มัดจำตัวอย่างที่ยังไม่ตัดสิน). คนละตัวกับลูกหนี้การค้า
  // และคนละตัวกับ pending_clearance: เป็นกระจกของลูกหนี้ (เราติดงาน/ติดคืนลูกค้า). อ่านอย่างเดียว
  // entity-scoped; หลุดเองตามสถานะดีล (ไม่มีทะเบียนเคลียร์). migration 0035.
  async customerDeposits(entity) {
    const db = requireSupabase();
    let q = db.from("vw_customer_deposit_outstanding").select("*").order("ym", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
};

/* รายได้อื่น (Other Income) — AR แท็บ "รายได้อื่น". รายได้นอกการขายปกติ (ดอกเบี้ย,
   ขายเศษผ้า, เงินอุดหนุน BOI ฯลฯ) บันทึกตรงในตาราง other_income_event อิสระจากลูกหนี้
   การค้า. read = finance.ar.view (entity filter ฝั่ง client); write ผ่าน RPC (re-check
   finance.ar.other_income). feed P/L บรรทัด "รายได้อื่น" = Phase B (ยังไม่เชื่อมในนี้). */
const otherIncome = {
  // รายการรายได้อื่นของ entity (CONS = ทุกนิติบุคคล), ใหม่สุดอยู่บน
  async list(entity) {
    const db = requireSupabase();
    let q = db.from("other_income_event").select("*").order("event_date", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // เพิ่ม/แก้ (id ว่าง = เพิ่มใหม่) — RPC re-check finance.ar.other_income
  async upsert(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("other_income_upsert", { payload });
    if (error) throw error;
    return data;
  },
  async remove(id) {
    const db = requireSupabase();
    const { error } = await db.rpc("other_income_delete", { p_id: id });
    if (error) throw error;
  },

  // ── ริบมัดจำตัวอย่าง → รายได้อื่น (maker≠checker, migration 0036) ───────────
  // คิว "รอการเงินรับรู้": ตัวอย่างที่เซลล์ริบแล้วแต่ยังไม่ขึ้นรายได้ (entity-scoped)
  async forfeitPending(entity) {
    const db = requireSupabase();
    let q = db.from("vw_deposit_forfeit_pending").select("*").order("sample_disposition_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // การเงินยืนยันรับรู้ (RPC re-check finance.ar.other_income + ผู้รับรู้ ≠ ผู้ริบ)
  async forfeitRecognize(extraWorkId) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("deposit_forfeit_recognize", { p_extra_work: extraWorkId });
    if (error) throw error; return data;
  },
  // การเงินถอนการรับรู้ (ลบแถวรายได้ กลับเข้าคิว)
  async forfeitUnrecognize(extraWorkId) {
    const db = requireSupabase();
    const { error } = await db.rpc("deposit_forfeit_unrecognize", { p_extra_work: extraWorkId });
    if (error) throw error;
  },
};

/* CRM (ฐานลูกค้า) — ชั้นอ่าน+ติดตามต่อยอดจาก Sale OEM (migration 0062).
   read = views (security_invoker → RLS sale_is_member คุมเอง), write = RPC guard
   มี sale role. brand filter ทำฝั่ง client จาก brands[] ของแต่ละลูกค้า. */
const crm = {
  // ทะเบียนลูกค้า + R/F/M score + segment/tier จาก config (crm_customer_rfm, 0063)
  // — exclude internal ที่ view · ซื้อล่าสุด (รวม snapshot) อยู่บน
  async customers() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_customer_rfm").select("*")
      .order("last_all", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  },

  // กฎ 12 segments (priority/name/tier) — Segment Board ต้องเห็นครบแม้กลุ่มว่าง
  async segmentRules() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_segment_rule")
      .select("*").order("priority");
    if (error) throw error;
    return data ?? [];
  },

  // สิทธิ์ต่อ tier (spec 3.4 — launch ว่าง, หัวหน้าเติมภายหลัง)
  async tierBenefits() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_tier_benefit").select("*");
    if (error) throw error;
    return data ?? [];
  },

  /* ── ตั้งค่า (0066) — read config + write ผ่าน RPC (guard sale perm 'config') ── */
  async rfmConfig() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_rfm_config")
      .select("*").order("metric").order("score", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  async careSteps() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_care_step").select("*").order("step");
    if (error) throw error;
    return data ?? [];
  },
  // ── การแก้ config ทุกตัวต้องแนบ PIN (0068 — verify ฝั่ง server) ──────────────
  async pinStatus() {  // ตั้ง PIN แล้วหรือยัง
    const db = requireSupabase();
    const { data, error } = await db.rpc("crm_pin_status");
    if (error) throw error;
    return !!data;
  },
  async setPin(oldPin, newPin) {  // ตั้ง/เปลี่ยน PIN (หัวหน้า)
    const db = requireSupabase();
    const { error } = await db.rpc("crm_pin_set", { p_old: oldPin || null, p_new: newPin });
    if (error) throw error;
  },
  async setTierBenefit(tier, benefits, pin) {
    const db = requireSupabase();
    const { error } = await db.rpc("crm_tier_benefit_set", { p_tier: tier, p_benefits: benefits, p_pin: pin });
    if (error) throw error;
  },
  async setCareStep(step, offsetDays, pin, checklist = null) {
    const db = requireSupabase();
    const { error } = await db.rpc("crm_care_step_set", { p_step: step, p_offset: offsetDays, p_pin: pin, p_checklist: checklist });
    if (error) throw error;
  },
  // แก้ checklist ทั้งชุดของสเตป (รวม step 0 = ทั่วไป) — 0067/0068
  async setChecklist(step, checklist, pin) {
    const db = requireSupabase();
    const { error } = await db.rpc("crm_checklist_set", { p_step: step, p_checklist: checklist, p_pin: pin });
    if (error) throw error;
  },
  // bands = [{score, min, max}] ×5 · max null = ไม่จำกัด — server validate ช่วงต่อเนื่อง
  async setRfmBands(metric, bands, pin) {
    const db = requireSupabase();
    const { error } = await db.rpc("crm_rfm_config_set", { p_metric: metric, p_bands: bands, p_pin: pin });
    if (error) throw error;
  },

  // ลูกค้า 1 คน + ประวัติดีลทุกสเตจ (ใหม่สุดอยู่บน) สำหรับการ์ดรายละเอียด
  async customer(id) {
    const db = requireSupabase();
    const [cust, deals, notes, dir] = await Promise.all([
      db.from("crm_customer_rfm").select("*").eq("id", id).single(),
      db.from("sale_deal")
        .select("id, job_code, lead_no, work_name, brand, main_stage, sub_stage, order_total, recognized_amount, revenue_recognized_date, source_channel, ship_address, sales_rep_id, factory, created_at, updated_at, lines:sale_deal_line(quantity, line_type)")
        .eq("customer_id", id).order("created_at", { ascending: false }),
      // โน้ตประจำลูกค้าจาก OEM (0058) — 📌 pinned ก่อน, ล่าสุดก่อน · read-only ใน CRM
      db.from("sale_note").select("id, deal_id, body, tags, pinned, created_at, created_by")
        .eq("customer_id", id).is("deleted_at", null)
        .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(20),
      db.from("user_directory").select("id, name"),
    ]);
    if (cust.error) throw cust.error;
    if (deals.error) throw deals.error;
    const dirMap = Object.fromEntries((dir.data ?? []).map((u) => [u.id, u.name]));
    return {
      ...cust.data,
      deals: deals.data ?? [],
      notes: notes.error ? [] : (notes.data ?? []),
      dir: dirMap,
    };
  },

  // คู่สงสัยซ้ำ (เบอร์/ชื่อตรงกัน) — ป้ายเท่านั้น ไม่มี merge (STOP #2). graceful []
  // ถ้า 0062 ยังไม่รัน เพื่อให้ทะเบียนหลักยังเปิดได้
  async dupSuspects() {
    const db = requireSupabase();
    try {
      const { data, error } = await db.from("vw_crm_dup_suspect").select("*");
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },

  // lead จาก OEM ที่มีนัดตามค้าง (รวมเข้าคิว CRM — read-only ผ่าน sale_deal, RLS
  // sale_is_member). กด → พาไป OEM จัดการ. brand filter ตามบริบท shell. graceful []
  async leadQueue(brands) {
    const db = requireSupabase();
    try {
      let q = db.from("sale_deal")
        .select("id, lead_no, work_name, brand, next_followup, customer:sale_customer(display_name)")
        .eq("main_stage", "leads").not("next_followup", "is", null)
        .order("next_followup", { ascending: true });
      if (brands && brands.length) q = q.in("brand", brands);
      const { data, error } = await q;
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },

  // คิว care ที่ถึงกำหนดยังไม่ทัก (Step1/2 หลังส่งครบ + Step3 ตามแพลน, 0064).
  // graceful [] ถ้า 0064 ยังไม่รัน (Phase A ใช้ได้ก่อน)
  async careQueue() {
    const db = requireSupabase();
    try {
      const { data, error } = await db.from("crm_care_queue").select("*");
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },

  // ประวัติการทักของลูกค้า 1 คน (ใหม่สุดบน) — แท็บประวัติติดต่อในการ์ด 360
  async contactLog(customerId) {
    const db = requireSupabase();
    try {
      const { data, error } = await db.from("crm_contact_log")
        .select("*").eq("customer_id", customerId).order("contacted_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    } catch { return []; }
  },

  // บันทึกการทัก (log + next_followup + care_state) — RPC เดียว (0064)
  async logContact(customerId, contact) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("crm_log_contact", { p_customer: customerId, p_contact: contact });
    if (error) throw error;
    return data;
  },

  // margin รวมต่อลูกค้า (0065) — RPC gate สิทธิ์ฝั่ง server (finance/sales_manager).
  // คืน { locked:true } เมื่อไม่มีสิทธิ์ (403) เพื่อให้ UI โชว์บล็อกถูกล็อก ไม่ throw
  async customerMargin(customerId) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("crm_customer_margin", { p_customer: customerId });
    if (error) {
      if (error.code === "42501" || /สิทธิ์/.test(error.message || "")) return { locked: true };
      throw error;
    }
    return { locked: false, ...(Array.isArray(data) ? data[0] : data) };
  },

  // นัดติดตามทั้งหมด (open+done) เรียงตามวันนัด — ข้อมูลลูกค้า UI ผูกเองจาก
  // ทะเบียนที่โหลดไว้แล้ว (ไม่ embed join ซ้ำ)
  async followups() {
    const db = requireSupabase();
    const { data, error } = await db.from("crm_followup")
      .select("*").order("due_date", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  // เพิ่ม/แก้นัด (id ว่าง = เพิ่มใหม่) — RPC re-check sale role
  async followupUpsert({ id, customer_id, kind, due_date, note } = {}) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("crm_followup_upsert", {
      p_id: id ?? null, p_customer: customer_id ?? null,
      p_kind: kind, p_due: due_date, p_note: note || null,
    });
    if (error) throw error;
    return data;
  },

  // ปิดนัด (done=false = ดึงกลับมาเปิดใหม่)
  async followupDone(id, done = true) {
    const db = requireSupabase();
    const { error } = await db.rpc("crm_followup_done", { p_id: id, p_done: done });
    if (error) throw error;
  },
};

/* Reconcile (กระทบยอด) surface — book cash (OEM in / AP out) vs the real bank
   balance per entity×month; the reconciled balance seeds cashflow opening/closing. */
const recon = {
  async book(entity) {
    const db = requireSupabase();
    let q = db.from("vw_recon_book").select("entity, ym, book_in, book_out").order("ym");
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async periods(entity) {
    const db = requireSupabase();
    let q = db.from("cash_recon").select("*, adjustments:cash_recon_adjustment(*)").order("ym");
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async upsert(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("recon_upsert", { payload });
    if (error) throw error;
    return data;
  },
  async confirm(id) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("recon_confirm", { p_id: id });
    if (error) throw error;
    return data;
  },
  async addAdjustment(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("recon_adjust_add", { payload });
    if (error) throw error;
    return data;
  },
  async delAdjustment(id) {
    const db = requireSupabase();
    const { error } = await db.rpc("recon_adjust_del", { p_id: id });
    if (error) throw error;
  },

  // ── กระทบยอดเงินเข้า "รายวัน" (0061) — ขารับแบบทีมบัญชี: รวมรายวัน → เทียบ stmt ──
  // ym = 'YYYY-MM' → แถวรายวันของเดือนนั้น (เฉพาะวันที่มีข้อมูลฝั่งใดฝั่งหนึ่ง)
  async dailyIn(entity, ym) {
    const db = requireSupabase();
    const [y, m] = ym.split("-").map(Number);
    const from = `${ym}-01`;
    const to = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    let q = db.from("vw_recon_daily_in").select("*").gte("d", from).lt("d", to).order("d");
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  // รายละเอียดของวัน — 2 ฝั่งวางเทียบ: รายการรับเงินในระบบ vs บรรทัดแบงก์ขาเข้า
  async dailyInDetail(entity, d) {
    const db = requireSupabase();
    const [pay, oth, stmt] = await Promise.all([
      db.from("sale_payment")
        .select("id, amount, method, receipt_type, note, deal:sale_deal!inner(entity, job_code)")
        .eq("paid_date", d).eq("deal.entity", entity),
      db.from("other_income_event")
        .select("id, amount, category, note").eq("event_date", d).eq("entity", entity),
      db.from("bank_statement_line")
        .select("id, txn_time, amount, description, counter_name, counter_bank, match_status")
        .eq("txn_date", d).eq("entity", entity).eq("direction", "in").neq("match_status", "ignored")
        .order("txn_time"),
    ]);
    for (const r of [pay, oth, stmt]) if (r.error) throw r.error;
    return { payments: pay.data ?? [], otherIncome: oth.data ?? [], stmtLines: stmt.data ?? [] };
  },
  // ป้ายอธิบาย diff (v1 = ป้ายอย่างเดียว ไม่ route)
  async inDiffList(entity, ym) {
    const db = requireSupabase();
    const [y, m] = ym.split("-").map(Number);
    const from = `${ym}-01`;
    const to = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    let q = db.from("recon_in_diff").select("*").gte("d", from).lt("d", to).order("d");
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async inDiffAdd(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("recon_in_diff_add", { payload });
    if (error) throw error;
    return data;
  },
  async inDiffDel(id) {
    const db = requireSupabase();
    const { error } = await db.rpc("recon_in_diff_del", { p_id: id });
    if (error) throw error;
  },
};

/* Bank statement (กระทบยอดแบงก์รายบรรทัด) surface — import SCB lines, match cash-out
   lines to paid AP bills (client-computed via scbStatement.matchOutLines), persist +
   guard via RPC. account→entity map lives in bank_account (0038). */
const bank = {
  async accounts() {
    const db = requireSupabase();
    const { data, error } = await db.from("bank_account").select("*").order("account_no");
    if (error) throw error;
    return data ?? [];
  },
  // import parsed rows: { account_no, filename, file_hash, period_label, lines:[...] }
  async import(payload) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("bank_stmt_import", { payload });
    if (error) throw error;
    return data;
  },
  async statements({ entity } = {}) {
    const db = requireSupabase();
    let q = db.from("bank_statement").select("*").order("imported_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  async summary(statementId) {
    const db = requireSupabase();
    const { data, error } = await db.from("vw_bank_stmt_summary").select("*").eq("statement_id", statementId).maybeSingle();
    if (error) throw error;
    return data;
  },
  async lines(statementId) {
    const db = requireSupabase();
    const { data, error } = await db.from("bank_statement_line").select("*").eq("statement_id", statementId)
      .order("txn_date").order("txn_time");
    if (error) throw error;
    return data ?? [];
  },
  // paid AP bills (cash-out already net of advance) for structural matching
  async paidBills({ entity } = {}) {
    const db = requireSupabase();
    let q = db.from("vw_ap_paid_for_match").select("*");
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // matches = [{line_id, ap_id, score, reason}] ; ignores = [line_id]
  async matchApply(matches, ignores = []) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("bank_stmt_match_apply", { p_matches: matches, p_ignores: ignores });
    if (error) throw error;
    return data;
  },
  async unmatch(lineId) {
    const db = requireSupabase();
    const { error } = await db.rpc("bank_stmt_unmatch", { p_line: lineId });
    if (error) throw error;
  },
};

/* Amortization (ตัดจ่ายรายเดือน) surface — prepaid + ค่าเสื่อม. Created from the AP
   review form (asset › prepaid|capex) via amort_create; the register + the computed
   monthly slices (vw_amortization_month) feed P/L only (non-cash, no cash event). */
const amort = {
  async create(spec) {
    const db = requireSupabase();
    const { data, error } = await db.rpc("amort_create", { p: spec });
    if (error) throw error;
    return data;
  },
  async void(id) {
    const db = requireSupabase();
    const { error } = await db.rpc("amort_void", { p_id: id });
    if (error) throw error;
  },
  // register list (active) for the ทะเบียนตัดจ่าย page; optionally by entity/kind
  async list({ entity, kind } = {}) {
    const db = requireSupabase();
    let q = db.from("amortization_register")
      .select("*, source:ap_request!source_ap_id(descr,status)")
      .eq("status", "active").order("created_at", { ascending: false });
    if (entity && entity !== "CONS") q = q.eq("entity", entity);
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // computed monthly slices for the P/L feed (whole rows; apiClient.pl folds by entity/year)
  async monthly() {
    const db = requireSupabase();
    const { data, error } = await db.from("vw_amortization_month").select("entity, ym, kind, pl_line_id, amount");
    if (error) throw error;
    return data ?? [];
  },
};

/* Notifications (แจ้งเตือน) — migration 0069. อ่านของตัวเองผ่าน RLS + Realtime,
   mark อ่านผ่าน RPC definer. เขียน (สร้างแจ้งเตือน) เกิดจาก DB trigger เท่านั้น. */
const notifications = {
  // จำนวนที่ยังไม่อ่าน (สำหรับ badge)
  async unreadCount() {
    if (!supabase) return 0;
    const { count, error } = await supabase
      .from("app_notification")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  },
  // รายการล่าสุด (ใหม่→เก่า) + paging
  async list(limit = 20, offset = 0) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("app_notification")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return data ?? [];
  },
  async markRead(ids) {
    const db = requireSupabase();
    const { error } = await db.rpc("notif_mark_read", { p_ids: ids });
    if (error) throw error;
  },
  async markAll() {
    const db = requireSupabase();
    const { error } = await db.rpc("notif_mark_all");
    if (error) throw error;
  },
  // Realtime: fire cb เมื่อมีแจ้งเตือนใหม่ของ user นี้. คืนฟังก์ชัน unsubscribe.
  subscribe(userId, cb) {
    if (!supabase || !userId) return () => {};
    const ch = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "app_notification", filter: `user_id=eq.${userId}` },
        (payload) => cb?.(payload.new)
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },
};

/* Budget (งบประมาณ) surface — โมดูลที่ 6. เก็บ "แผน" เท่านั้น; actual อ่านจาก
   P/L·AP·OEM ผ่าน gateway view (vw_budget_*) — ไม่มีการคีย์ actual ที่นี่.
   เขียนทั้งหมดผ่าน SECURITY DEFINER RPC (budget_*). */
const budget = {
  // ---- reads ----
  async versions() {
    const db = requireSupabase();
    const { data, error } = await db.from("budget_version").select("*")
      .order("year", { ascending: false }).order("version_no", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  async grid(versionId) {
    const db = requireSupabase();
    const { data, error } = await db.from("budget_line").select("*").eq("version_id", versionId);
    if (error) throw error;
    return data ?? [];
  },
  async settings() {
    const db = requireSupabase();
    const [depts, map, targets, config, subs] = await Promise.all([
      db.from("budget_dept").select("*").order("sort"),
      db.from("budget_dept_map").select("*"),
      db.from("budget_pct_target").select("*").eq("active", true),
      db.from("budget_config").select("*"),
      db.from("budget_sub_line").select("*").eq("active", true),
    ]);
    for (const r of [depts, map, targets, config, subs]) if (r.error) throw r.error;
    const cfg = {};
    (config.data ?? []).forEach((c) => { cfg[c.key] = c.value; });
    return { depts: depts.data ?? [], map: map.data ?? [], targets: targets.data ?? [], config: cfg, subs: subs.data ?? [] };
  },
  async editLog(limit = 100) {
    const db = requireSupabase();
    const { data, error } = await db.from("budget_edit_log").select("*")
      .order("at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  },
  // ค่าใช้จ่าย actual ต่อ category_key ต่อเดือน (ช่วงปีก่อน — ฐานตั้งงบ + Outlook เดือนปิด)
  async expActual(fromYm, toYm) {
    const db = requireSupabase();
    let q = db.from("vw_budget_exp_key").select("entity, category_key, ym, amount");
    if (fromYm) q = q.gte("ym", fromYm);
    if (toYm) q = q.lte("ym", toYm);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // รายได้ + จำนวนงาน ต่อแบรนด์ต่อเดือน (seasonal curve + เสนอ jobs×avg)
  async revBrandHistory(fromYm, toYm) {
    const db = requireSupabase();
    let q = db.from("vw_budget_rev_brand").select("brand, ym, jobs, revenue");
    if (fromYm) q = q.gte("ym", fromYm);
    if (toYm) q = q.lte("ym", toYm);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },
  // actual ครบนิยาม P/L (Phase 2 BvA): AP expense ทุก channel + amort prepaid
  // (map pl_line_id→cashflow_key ผ่าน pl_line_map) + รายได้อื่น — ต่อ key ต่อเดือน.
  // ค่าเสื่อม capex ไม่รวม (งบไม่มีแถวค่าเสื่อม — ⓘ ระบุใน BvA)
  async fullActual(fromYm, toYm) {
    const db = requireSupabase();
    const [exp, amort, oth, lines] = await Promise.all([
      budget.expActual(fromYm, toYm),
      db.from("vw_amortization_month").select("entity, ym, kind, pl_line_id, amount").gte("ym", fromYm).lte("ym", toYm),
      db.from("vw_pl_other_income").select("entity, ym, accrual_amt").gte("ym", fromYm).lte("ym", toYm),
      db.from("pl_line_map").select("id, cashflow_key"),
    ]);
    for (const r of [amort, oth]) if (r.error) throw r.error;
    if (lines.error) throw lines.error;
    const keyOf = new Map((lines.data ?? []).map((l) => [l.id, l.cashflow_key]));
    const acc = {};   // { "key|ym": amount }
    const add = (key, ym, amt) => { if (!key || !ym) return; const k = `${key}|${ym}`; acc[k] = (acc[k] || 0) + (Number(amt) || 0); };
    for (const r of exp) add(r.category_key, r.ym, r.amount);
    for (const r of amort.data ?? []) if (r.kind === "prepaid") add(keyOf.get(r.pl_line_id), r.ym, r.amount);
    for (const r of oth.data ?? []) add("other_income", r.ym, r.accrual_amt);
    return acc;
  },
  // drill: รายการ AP ประกอบ actual หมวดนั้นเดือนนั้น (RLS view_all — แพทเทิร์น pl.transactions)
  async actualDrill(categoryKey, ym) {
    const db = requireSupabase();
    const from = `${ym}-01`;
    const to = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 1).toISOString().slice(0, 10);
    const { data, error } = await db.from("ap_request")
      .select("id, doc_date, created_at, payee_name, descr, net_transfer, req_amount, status, pay_ref, entity, posting_group, category_key")
      .eq("category_key", categoryKey)
      .in("status", ["approved", "in_run", "paid", "flow_posted"]);
    if (error) throw error;
    return (data ?? [])
      .filter((r) => (r.posting_group ?? "expense") === "expense")
      .filter((r) => { const d = r.doc_date || (r.created_at || "").slice(0, 10); return d >= from && d < to; })
      .map((r) => ({ ...r, amount: Number(r.net_transfer ?? r.req_amount) || 0 }))
      .sort((a, b) => (b.doc_date || "").localeCompare(a.doc_date || ""));
  },
  // pace: ยอด recognized เดือนปัจจุบันต่อ key (นิยามเดียวกับ P/L — จาก view)
  async paceActual(ym) {
    const rows = await budget.expActual(ym, ym);
    const acc = {};
    for (const r of rows) acc[r.category_key] = (acc[r.category_key] || 0) + (Number(r.amount) || 0);
    return acc;   // { key: amount }
  },
  // แถบเตือนงบใน AP (ตอนอนุมัติ): งบหมวดนั้นเดือนนั้น (version approved ล่าสุดที่ครอบ,
  // รวมทุกแบรนด์/entity = ระดับกลุ่ม) + ใช้ไปแล้ว — null = ไม่มีงบครอบ (AP ไม่แสดงแถบ)
  async cellForApprove({ categoryKey, ym }) {
    if (!categoryKey || !ym) return null;
    const month = `${ym}-01`;
    const vers = await budget.versions();
    const ver = vers.find((v) => v.status === "approved" && v.period_start <= month && v.period_end >= month);
    if (!ver) return null;
    const db = requireSupabase();
    const { data, error } = await db.from("budget_line").select("amount")
      .eq("version_id", ver.id).eq("category_key", categoryKey).eq("month", month);
    if (error) throw error;
    if (!data?.length) return null;
    const budgetAmt = data.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const used = (await budget.paceActual(ym))[categoryKey] || 0;
    return { budget: budgetAmt, used, versionLabel: ver.label };
  },
  // เสนอ target GP% ต่อแบรนด์ จาก job margins (reuse pl.jobMargins) — bill_actual ถ้ามี, fallback est
  async gpSuggest(entityKey = "cons") {
    const rows = await pl.jobMargins(entityKey);
    const acc = {};
    for (const j of rows ?? []) {
      const b = j.brand; if (!b) continue;
      const rev = Number(j.net_revenue ?? j.recognized_amount) || 0;
      const cost = j.bill_actual != null ? Number(j.bill_actual) : Number(j.est_cost) || 0;
      (acc[b] ??= { rev: 0, cost: 0 });
      acc[b].rev += rev; acc[b].cost += cost;
    }
    const out = {};
    for (const [b, v] of Object.entries(acc)) out[b] = v.rev ? Math.round((1 - v.cost / v.rev) * 1000) / 10 : null;
    return out; // { TD: 38.2, ... } = GP%
  },

  // ---- writes (RPC 1:1) ----
  async versionCreate(payload) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_version_create", { payload }); if (error) throw error; return data; },
  async versionApprove(id) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_version_approve", { p_id: id }); if (error) throw error; return data; },
  async versionDelete(id) { const db = requireSupabase(); const { error } = await db.rpc("budget_version_delete", { p_id: id }); if (error) throw error; },
  async lineUpsert(payload) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_line_upsert", { payload }); if (error) throw error; return data; },
  async bulkFill(rows) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_bulk_fill", { p_rows: rows }); if (error) throw error; return data; },
  async sublineCreate(key, name) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_subline_create", { p_key: key, p_name: name }); if (error) throw error; return data; },
  async sublineRetire(id) { const db = requireSupabase(); const { error } = await db.rpc("budget_subline_retire", { p_id: id }); if (error) throw error; },
  async deptUpsert(payload) { const db = requireSupabase(); const { data, error } = await db.rpc("budget_dept_upsert", { payload }); if (error) throw error; return data; },
  async deptMapSet(key, sub, dept) { const db = requireSupabase(); const { error } = await db.rpc("budget_dept_map_set", { p_key: key, p_sub: sub, p_dept: dept }); if (error) throw error; },
  async pctTargetSet(key, brand, pct) { const db = requireSupabase(); const { error } = await db.rpc("budget_pct_target_set", { p_key: key, p_brand: brand, p_pct: pct }); if (error) throw error; },
  async configSet(key, value) { const db = requireSupabase(); const { error } = await db.rpc("budget_config_set", { p_key: key, p_value: value }); if (error) throw error; },
};


/* ══════════════════════════════════════════════════════════════════════════════
   MARKETING — Content Pipeline
   เดโม: อ่าน/เขียน localStorage · ของจริง: RLS อ่าน + SECURITY DEFINER RPC เขียน
   ผัง RPC ที่ต้องเขียนวันย้ายจริงอยู่ใน INTEGRATION.md
   ══════════════════════════════════════════════════════════════════════════════ */
const marketing = {
  load: () => mktStore.load(),
  save: (data) => mktStore.save(data),
  reset: () => mktStore.reset(),
  import: (json) => mktStore.import(json),

  /** จำนวนงานในคิวรอตรวจ + มีใบเกิน SLA ไหม — shell ใช้ทำ badge บน nav */
  reviewQueue(data) {
    const inReview = data.cards.filter((c) => c.status === "review");
    return {
      count: inReview.length,
      overdue: inReview.some((c) => mktHoursWaiting(c) > data.settings.sla_hours),
    };
  },
};

export const apiClient = {
  marketing,
  /** The cashflow year the data is for (drives in-progress-month detection). */
  cashflowYear: YEAR,

  /** Notifications (แจ้งเตือน) surface — bell + /notifications page (0069). */
  notifications,

  /** P/L (รายงานบริหาร) surface. */
  pl,

  /** Sale OEM Operation surface — revenue source of truth. */
  sale,

  /** AR (เงินเข้า) surface — forecast-first receivables read-model over OEM. */
  ar,

  /** รายได้อื่น (Other Income) surface — AR แท็บ "รายได้อื่น". */
  otherIncome,

  /** CRM (ฐานลูกค้า) surface — ชั้นอ่าน+ติดตามต่อยอดจาก Sale OEM. */
  crm,

  /** Is the AP backend (Supabase) configured? UI uses this to gate AP. */
  hasBackend: Boolean(supabase),

  /** AP (เงินออก) surface — spec §17. */
  ap,

  /** Amortization (ตัดจ่ายรายเดือน) surface — prepaid + ค่าเสื่อม. */
  amort,

  /** Reconcile (กระทบยอด) surface — book vs bank; seeds cashflow balances. */
  recon,

  /** Bank statement (กระทบยอดแบงก์รายบรรทัด) surface — import + match cash-out↔AP. */
  bank,

  /** Budget (งบประมาณ) surface — โมดูลที่ 6; แผนล้วน, actual อ่านผ่าน gateway. */
  budget,

  /**
   * Full cashflow dataset for all companies.
   * @returns {Promise<{CONS,DD,SSB,TMK}>} each { name, monthly, weekly }
   */
  async getCashflow() {
    if (SHEET_ID) return getCashflowLive();        // hand-maintained Google Sheet (opt-in)
    if (supabase) {
      // real data: AP cash events + OEM + recon. Fall back to sample if the DB
      // source isn't ready yet (e.g. 0019 view not run) so the page never breaks.
      try { return await getCashflowFromDb(); }
      catch (e) { console.warn("cashflow: DB source unavailable, using sample —", e?.message); }
    }
    await delay(120); // mimic network latency so loading states are exercised
    return sampleCashflow();
  },
};

export default apiClient;
