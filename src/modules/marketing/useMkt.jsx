/* ============================================================
 useApp — React context ครอบ AppData + actions
 จัดการ persist, current user, และ mutation ทุกอย่างผ่าน DataStore
 ============================================================ */
import React, { createContext, useContext, useMemo, useRef, useState, useCallback } from "react";
import { ConfirmDialog } from "./detail/Sheet.jsx";
import { applyApprove, applyReject, briefRefCounts, genId, nowISO, validateTransition, } from "./mktRules.js";
import { store } from "./data/DataStore.js";
import { useEntityContext } from "../../foundation/context/EntityContext.jsx";
import { BRANDS, brandCodesFromContext } from "../../foundation/context/orgConfig.js";
const Ctx = createContext(null);
export function AppProvider({ children }) {
  const [data, setData] = useState(() => store.load());
  /* อ่านข้อมูลล่าสุดเสมอ — ทุก mutation ต้องอ่านผ่าน latest() ไม่ใช่ตัวแปร data ที่ปิดทับไว้
   ไม่งั้น "บันทึกแล้วเดินการ์ดทันที" จะ validate กับค่าก่อนบันทึก (stale closure) */
  const dataRef = useRef(data);
  const latest = () => dataRef.current;
  const [currentUserId, setCurrentUserId] = useState(() => {
    const lead = store.load().profiles.find((p) => p.role === "team_lead");
    return lead?.id ?? store.load().profiles[0].id;
  });
  /* บริบท (นิติบุคคล/แบรนด์) เป็นของ shell — โมดูลอ่านค่าแล้ว map เป็นตัวกรองของตัวเอง
     ห้ามมีตัวสลับบริบทเอง (กติกาเหล็ก #3 · ตัวสลับอยู่ที่ shell/ContextSwitcher)
       · ทั้งกลุ่ม       → null = ทุกแบรนด์
       · เลือกแบรนด์ตรงๆ → แบรนด์นั้น
       · เลือกนิติบุคคล  → แบรนด์ที่สังกัดบริษัทนั้น (ผัง brandCodesFromContext ของ orgConfig)
     จับคู่ด้วย "ชื่อแบรนด์" เพราะ id ในฐานข้อมูลโมดูล (b_td) กับ key ของผังองค์กร
     (teamdee) เป็นคนละชุด — ชื่อคือจุดร่วมเดียวที่ทั้งสองฝั่งยืนยันตรงกัน */
  const { ctx } = useEntityContext();
  const CODE_TO_NAME = { TD: "TEAMDEE", JD: "JK Design", TA: "t around", JT: "JUNTAKARN" };
  const brandIds = useMemo(() => {
    const brands = dataRef.current?.brands ?? [];
    if (ctx.kind === "brand") {
      const label = BRANDS[ctx.key]?.label;
      const hit = brands.find((b) => b.name === label);
      return hit ? [hit.id] : [];
    }
    const codes = brandCodesFromContext(ctx);
    if (codes == null) return null;                       // ทั้งกลุ่ม
    const names = codes.map((c) => CODE_TO_NAME[c]).filter(Boolean);
    return brands.filter((b) => names.includes(b.name)).map((b) => b.id);
  }, [ctx]);

  /** การ์ดใบนี้อยู่ในบริบทที่เลือกอยู่ไหม — ที่เรียกใช้ควรใช้ตัวนี้ */
  const inBrandScope = useCallback(
    (card) => brandIds == null || brandIds.includes(card.brand_id),
    [brandIds]
  );
  /** เผื่อโค้ดที่ยังคิดเป็น "all" | brand_id เดียว */
  const brandFilter = brandIds == null ? "all" : brandIds.length === 1 ? brandIds[0] : "multi";
  const [toastState, setToastState] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolve = useRef(null);
  const confirm = useCallback((options) => {
    setConfirmState(options);
    return new Promise((resolve) => {
      confirmResolve.current = resolve;
    });
  }, []);
  const resolveConfirm = useCallback((ok) => {
    setConfirmState(null);
    confirmResolve.current?.(ok);
    confirmResolve.current = null;
  }, []);
  const persist = useCallback((next) => {
    dataRef.current = next;
    store.save(next);
    setData(next);
  }, []);
  const currentUser = useMemo(() => data.profiles.find((p) => p.id === currentUserId) ?? data.profiles[0], [data.profiles, currentUserId]);
  const toast = useCallback((msg, kind = "") => {
    setToastState({ msg, kind, id: Date.now() });
    window.setTimeout(() => setToastState((t) => (t && t.msg === msg ? null : t)), 2800);
  }, []);
  const appendHistory = (d, cardId, from, to) => [
    ...(Array.isArray(d.status_history) ? d.status_history : []),
    {
      id: genId("h"),
      card_id: cardId,
      from_status: from,
      to_status: to,
      moved_by: currentUser.id,
      moved_at: nowISO(),
    },
  ];
  const moveCard = useCallback(async (cardId, to) => {
    const data = latest();
    const card = data.cards.find((c) => c.id === cardId);
    if (!card)
      return { ok: false, message: "ไม่พบการ์ด" };
    // ส่งหลักฐานไฟล์แนบเข้าไปด้วย ไม่งั้นการ์ดที่ผ่าน gate ด้วยรูป/ลิงก์จะลากไม่ได้
    const check = validateTransition(card, to, currentUser, undefined, briefRefCounts(card.id, data.attachments, data.reference_links, data.channels));
    if (!check.ok) {
      const msg = check.buttonOnly
        ? check.missing[0]
        : `ยังขยับไม่ได้ — ขาด: ${check.missing.join(", ")}`;
      toast(msg, "bad");
      return { ok: false, message: msg };
    }
    // published → measured ก่อน 7 วัน: เตือนแต่ให้ผ่าน
    if (check.warnConfirm) {
      const ok = await confirm({
        title: "ยังไม่ครบ 7 วัน",
        message: check.warnConfirm,
        confirmLabel: "ย้ายเลย",
      });
      if (!ok)
        return { ok: false };
    }
    const now = nowISO();
    const updated = {
      ...card,
      status: to,
      updated_at: now,
      // เข้า review = stamp entered_review_at
      entered_review_at: to === "review" ? now : card.entered_review_at,
    };
    const next = {
      ...data,
      cards: data.cards.map((c) => (c.id === cardId ? updated : c)),
      status_history: appendHistory(data, cardId, card.status, to),
    };
    persist(next);
    toast(`เดินการ์ดไป ${to} แล้ว`, "ok");
    return { ok: true };
  }, [data, currentUser, persist, toast, confirm]);
  const approveCard = useCallback((cardId) => {
    const data = latest();
    const card = data.cards.find((c) => c.id === cardId);
    if (!card)
      return;
    try {
      const { card: updated, action } = applyApprove(card, currentUser);
      const first = card.first_pass === null;
      const next = {
        ...data,
        cards: data.cards.map((c) => (c.id === cardId ? updated : c)),
        review_actions: [...data.review_actions, { ...action, id: genId("a") }],
        /* ผ่านตรวจแล้ว = เรื่องที่ตีกลับถือว่าแก้จบ — ถอดหมุดโน้ตตีกลับ (จุดแดงบนการ์ดหาย) */
        card_notes: (data.card_notes ?? []).map((n) => (n.card_id === cardId && n.kind === "reject" ? { ...n, pinned: false } : n)),
        status_history: appendHistory(data, cardId, "review", updated.status),
      };
      persist(next);
      const owner = data.profiles.find((p) => p.id === card.owner_id);
      toast(first ? `Approve — นับ "ผ่านรอบแรก" ให้ ${owner?.display_name ?? ""}` : "Approve แล้ว", "ok");
    }
    catch (e) {
      toast(e.message, "bad");
    }
  }, [data, currentUser, persist, toast]);
  const rejectCard = useCallback((cardId, input) => {
    const data = latest();
    const card = data.cards.find((c) => c.id === cardId);
    if (!card)
      return;
    try {
      const { card: updated, action } = applyReject(card, currentUser, input);
      /* เชื่อมตีกลับเข้าระบบโน้ต — เหตุผลกลายเป็นโน้ตปักหมุดบนการ์ดทันที
         เจ้าของงานเปิดการ์ดแล้วเห็นเลยว่าต้องแก้อะไร ไม่ต้องไปคุ้ยประวัติ */
      const round = data.review_actions.filter((a) => a.card_id === cardId && a.action === "reject").length + 1;
      const packRef = input.direction_pack_ref === "new"
        ? "ยังไม่มีข้อใน Direction Pack — เข้าวาระเติมกติกา"
        : `อ้างอิง Direction Pack: ${input.direction_pack_ref}`;
      const fixNote = {
        id: genId("note"), card_id: cardId, stage: "review", kind: "reject",
        text: `ตีกลับรอบที่ ${round} — ต้องแก้:\n${action.reason}\n${packRef}`,
        author_id: currentUser.id, pinned: true, created_at: action.acted_at,
      };
      const next = {
        ...data,
        cards: data.cards.map((c) => (c.id === cardId ? updated : c)),
        review_actions: [...data.review_actions, { ...action, id: genId("a") }],
        card_notes: [...(data.card_notes ?? []), fixNote],
        status_history: appendHistory(data, cardId, "review", "draft"),
      };
      persist(next);
      const isNew = input.direction_pack_ref === "new";
      toast(isNew
        ? "ตีกลับแล้ว — เข้าวาระเติม Direction Pack (ดูหน้าสถิติ)"
        : "ตีกลับ → Draft พร้อมเหตุผลในการ์ด", "");
    }
    catch (e) {
      toast(e.message, "bad");
    }
  }, [data, currentUser, persist, toast]);
  const upsertCard = useCallback((card) => {
    const data = latest();
    const exists = data.cards.some((c) => c.id === card.id);
    const now = nowISO();
    const withStamp = { ...card, updated_at: now };
    const next = exists
      ? { ...data, cards: data.cards.map((c) => (c.id === card.id ? withStamp : c)) }
      : {
        ...data,
        cards: [{ ...withStamp, created_at: now }, ...data.cards],
        status_history: appendHistory(data, card.id, null, card.status),
      };
    persist(next);
  }, [data, persist]);
  const deleteCard = useCallback((cardId) => {
    const data = latest();
    persist({ ...data, cards: data.cards.filter((c) => c.id !== cardId) });
    toast("ลบการ์ดแล้ว", "");
  }, [data, persist, toast]);
  /** ปิดงาน — archived + เขียนประวัติ (from===to = ปิดงาน ไม่ใช่ย้ายขั้น) */
  const archiveCard = useCallback((card) => {
    const data = latest();
    const now = nowISO();
    const next = {
      ...data,
      cards: data.cards.map((c) => c.id === card.id ? { ...card, archived: true, updated_at: now } : c),
      status_history: [
        ...(Array.isArray(data.status_history) ? data.status_history : []),
        { id: genId("h"), card_id: card.id, from_status: card.status, to_status: card.status, moved_by: currentUser.id, moved_at: now },
      ],
    };
    persist(next);
  }, [data, currentUser, persist]);
  /* ---------- Admin: users / brands ---------- */
  const upsertProfile = useCallback((profile) => {
    const data = latest();
    const exists = data.profiles.some((p) => p.id === profile.id);
    persist({
      ...data,
      profiles: exists
        ? data.profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...data.profiles, profile],
    });
  }, [data, persist]);
  const upsertBrand = useCallback((brand) => {
    const data = latest();
    const exists = data.brands.some((b) => b.id === brand.id);
    persist({
      ...data,
      brands: exists
        ? data.brands.map((b) => (b.id === brand.id ? brand : b))
        : [...data.brands, brand],
    });
  }, [data, persist]);
  /** ช่องทาง — เปลี่ยนชื่อแล้วต้องตามไปแก้ในการ์ดทุกใบ
      เพราะ brief.channels เก็บเป็น "ชื่อ" ไม่ใช่ id (สถิติรายช่องทางจะได้ไม่ขาดตอน) */
  const upsertChannel = useCallback((channel, prevName) => {
    const data = latest();
    const exists = data.channels.some((c) => c.id === channel.id);
    const renamed = prevName && prevName !== channel.name;
    persist({
      ...data,
      channels: exists
        ? data.channels.map((c) => (c.id === channel.id ? channel : c))
        : [...data.channels, channel],
      cards: renamed
        ? data.cards.map((c) => (c.brief.channels.includes(prevName)
          ? { ...c, brief: { ...c.brief, channels: c.brief.channels.map((n) => (n === prevName ? channel.name : n)) } }
          : c))
        : data.cards,
    });
  }, [persist]);

  /* ตัวเลือกในฟอร์มบรีฟที่ตั้งค่าเพิ่มได้ไม่จำกัด — ขนาดภาพ · มุมกล้อง · ความยาวคลิป
     ทั้งสามเป็นรายการอิสระ ไม่ผูกกับการ์ด (การ์ดเก็บค่าเป็นข้อความ) จึงลบได้เลย */
  const upsertPreset = useCallback((key, preset) => {
    const data = latest();
    const list = data[key] ?? [];
    persist({
      ...data,
      [key]: list.some((p) => p.id === preset.id)
        ? list.map((p) => (p.id === preset.id ? preset : p))
        : [...list, preset],
    });
  }, [persist]);
  const removePreset = useCallback((key, id) => {
    const data = latest();
    persist({ ...data, [key]: (data[key] ?? []).filter((p) => p.id !== id) });
  }, [persist]);
  const upsertSizePreset = useCallback((p) => upsertPreset("size_presets", p), [upsertPreset]);
  const removeSizePreset = useCallback((id) => removePreset("size_presets", id), [removePreset]);
  const upsertShotType = useCallback((p) => upsertPreset("shot_types", p), [upsertPreset]);
  const removeShotType = useCallback((id) => removePreset("shot_types", id), [removePreset]);
  const upsertVideoLength = useCallback((p) => upsertPreset("video_lengths", p), [upsertPreset]);
  const removeVideoLength = useCallback((id) => removePreset("video_lengths", id), [removePreset]);

  /* ---------- ไฟล์แนบ + ลิงก์ ---------- */
  const addAttachments = useCallback((items) => persist({ ...latest(), attachments: [...latest().attachments, ...items] }), [persist]);
  const updateAttachment = useCallback((id, patch) => persist({
    ...latest(),
    attachments: latest().attachments.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  }), [persist]);
  const removeAttachment = useCallback((id) => persist({ ...latest(), attachments: latest().attachments.filter((a) => a.id !== id) }), [persist]);
  const upsertLink = useCallback((link) => {
    const data = latest();
    const exists = data.reference_links.some((l) => l.id === link.id);
    persist({
      ...data,
      reference_links: exists
        ? data.reference_links.map((l) => (l.id === link.id ? link : l))
        : [...data.reference_links, link],
    });
  }, [data, persist]);
  const removeLink = useCallback((id) => persist({ ...latest(), reference_links: latest().reference_links.filter((l) => l.id !== id) }), [persist]);

  /* ปักดาว "ต้นแบบ" ในคลัง — จงใจไม่ประทับ updated_at จะได้ไม่สลับลำดับ "ปิดล่าสุด" */
  const toggleStar = useCallback((cardId) => persist({
    ...latest(),
    cards: latest().cards.map((c) => (c.id === cardId ? { ...c, starred: !c.starred } : c)),
  }), [persist]);

  /* ---------- โน้ตประจำการ์ด — บันทึกทันที ไม่ผูกกับปุ่มบันทึกของฟอร์ม ---------- */
  /* id ส่งมาเองได้ — NotesPanel ใช้ผูกไฟล์รูป (note_image) กับโน้ตก่อนบันทึก
     kind: "note" ปกติ · "lesson" บทเรียนตอนปิดงาน · ("reject" สร้างใน rejectCard เท่านั้น) */
  const addNote = useCallback((cardId, text, stage, id = genId("note"), kind = "note") => {
    persist({
      ...latest(),
      card_notes: [...(latest().card_notes ?? []), {
        id, card_id: cardId, stage, kind, text: text.trim(),
        author_id: currentUser.id, pinned: false, created_at: nowISO(),
      }],
    });
  }, [persist, currentUser]);
  const updateNote = useCallback((id, patch) => persist({
    ...latest(),
    /* แก้ข้อความค่อยประทับ updated_at — ปักหมุดเฉยๆ ไม่นับเป็นการแก้ */
    card_notes: (latest().card_notes ?? []).map((n) => (n.id === id ? { ...n, ...patch, ...(patch.text != null ? { updated_at: nowISO() } : null) } : n)),
  }), [persist]);
  /* ลบโน้ตแล้วรูปที่แนบกับโน้ตนั้นไปด้วย — ไม่ทิ้งไฟล์ค้างในการ์ด */
  const removeNote = useCallback((id) => persist({
    ...latest(),
    card_notes: (latest().card_notes ?? []).filter((n) => n.id !== id),
    attachments: latest().attachments.filter((a) => a.note_id !== id),
  }), [persist]);
  const resetData = useCallback(() => {
    const seed = store.reset();
    dataRef.current = seed;
    setData(seed);
    toast("รีเซ็ตข้อมูล demo แล้ว", "ok");
  }, [toast]);
  const importData = useCallback((json) => {
    try {
      const d = store.import(json);
      dataRef.current = d;
      setData(d);
      toast("นำเข้าข้อมูลแล้ว", "ok");
    }
    catch {
      toast("ไฟล์ไม่ถูกต้อง", "bad");
    }
  }, [toast]);
  const updateSettings = useCallback((patch) => {
    persist({ ...latest(), settings: { ...latest().settings, ...patch } });
  }, [persist]);
  const value = {
    data,
    settings: data.settings,
    currentUser,
    setCurrentUser: setCurrentUserId,
    brandFilter,
    brandIds,
    inBrandScope,
    moveCard,
    confirm,
    approveCard,
    rejectCard,
    upsertCard,
    deleteCard,
    archiveCard,
    upsertProfile,
    upsertBrand,
    upsertChannel,
    upsertSizePreset,
    removeSizePreset,
    upsertShotType,
    removeShotType,
    upsertVideoLength,
    removeVideoLength,
    addAttachments,
    updateAttachment,
    removeAttachment,
    upsertLink,
    removeLink,
    addNote,
    updateNote,
    removeNote,
    toggleStar,
    resetData,
    importData,
    updateSettings,
    toast,
    toastState,
  };
  return (<Ctx.Provider value={value}>
   {children}
   {/* popup ยืนยันกลาง — ตัวเดียวใช้ทั้งแอพ */}
   {/* ต้องครอบ .mkt-root — provider อยู่นอกโมดูล ถ้าไม่ครอบ CSS ของ sheet จะไม่จับ (เคยเป็นบั๊ก dialog เปล่า) */}
   {confirmState && <div className="mkt-root"><ConfirmDialog options={confirmState} onResolve={resolveConfirm}/></div>}
  </Ctx.Provider>);
}
export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useApp ต้องอยู่ใน AppProvider");
  return ctx;
}
