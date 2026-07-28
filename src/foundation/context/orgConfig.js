/* Organisation structure — the SSB Group's legal entities and brands.
   This is structural master data (who exists), NOT financial figures.
   Financial numbers always come through apiClient. The ContextSwitcher and
   any module that needs entity/brand labels read from here.

   Legal entities: DD FINIX, SSB, TMK  (3 นิติบุคคล)
   Brands: TEAMDEE, JK Design, t around */

export const ENTITIES = {
  group: { key: "group", label: "ทั้งกลุ่ม", sub: "3 นิติบุคคล", isAggregate: true },
  ddfinix: { key: "ddfinix", label: "DD FINIX", sub: "2 บัญชีธนาคาร" },
  ssb: { key: "ssb", label: "SSB", sub: "2 บัญชีธนาคาร" },
  tmk: { key: "tmk", label: "TMK", sub: "1 บัญชีธนาคาร" },
};

export const BRANDS = {
  teamdee: { key: "teamdee", label: "TEAMDEE" },
  jk: { key: "jk", label: "JK Design" },
  taround: { key: "taround", label: "t around" },
  /* เพิ่มสำหรับโมดูล marketing — JUNTAKARN มีงานคอนเทนต์แต่ยังไม่มีในผัง OEM/AR
     ยังไม่ผูกนิติบุคคล (ENTITY_BRAND_CODES) เพราะยังไม่ได้ยืนยันว่าอยู่บริษัทไหน */
  juntakarn: { key: "juntakarn", label: "JUNTAKARN" },
};

/** Default context when the app loads — the whole group. */
export const DEFAULT_CONTEXT = { kind: "entity", key: "group" };

/** Resolve a {kind, key} context to its display metadata. */
export function resolveContext(ctx) {
  if (ctx.kind === "brand") {
    const b = BRANDS[ctx.key];
    return { label: b?.label ?? ctx.key, sub: "แบรนด์", isEntity: false };
  }
  const e = ENTITIES[ctx.key];
  return { label: e?.label ?? ctx.key, sub: e?.sub ?? "", isEntity: true };
}

/* Shell context → OEM/AR brand DB codes (TD/JD/TA). The sale/AR tables key on
   these codes, so a module maps the current {kind,key} → codes to filter its own
   data (กฎเหล็ก #3: modules read context + filter; never render a switcher).
   null = all brands · [] = none (e.g. TMK has no OEM brand). Shared by OEM + AR
   so the brand↔entity mapping has a single source of truth. */
const BRAND_CODE = { teamdee: "TD", jk: "JD", taround: "TA", saifah: "SF", juntakarn: "JT" };
const ENTITY_BRAND_CODES = { group: null, ddfinix: ["TD"], ssb: ["JD", "TA"], tmk: ["SF"] };
export function brandCodesFromContext(ctx) {
  if (!ctx) return null;
  if (ctx.kind === "brand") { const b = BRAND_CODE[ctx.key]; return b ? [b] : []; }
  return ENTITY_BRAND_CODES[ctx.key] ?? null;
}
