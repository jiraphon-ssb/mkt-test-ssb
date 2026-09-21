/* โมเดลหน้า "บิล & กระทบยอด" (spec docs/superpowers/specs/2026-09-22-billing-recon.md)
   pure function — กิน cards (จาก useAdsData ซึ่งมี account_id ติดมาแล้ว) + connections + snapshots + reviews
   ตัวเลขคืนดิบทั้งหมด UI เป็นคนจัดรูป 2 ตำแหน่งไม่ปัด · สถานะ exception-based: ปกติ = เงียบ
   เงินใน snapshot เป็นสตางค์ (minor units จาก Graph) — แปลงเป็นบาทที่นี่ที่เดียว */

export const VAT_RATE = 0.07;
export const MATCH_PCT = 0.005;   // |ส่วนต่าง| ≤ 0.5% = ตรงกัน (เกณฑ์เดียวกับเขตปลอดภัย Pace Engine ฝั่งแคบ)
export const MINOR_PCT = 0.02;    // ≤ 2% = ต่างเล็กน้อย (มักเป็นเรื่องวันคาบเกี่ยว/ปัดเศษบัตร)

const baht = (cents) => (cents == null ? null : cents / 100);

export function buildBillingModel({ month, cards = [], connections = [], snapshots = [], snapshotsBefore = [], reviews = [], brands = [] }) {
  const monthPrefix = String(month).slice(0, 7);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const snapByAccount = new Map(snapshots.map((s) => [s.external_account_id, s]));
  const beforeByAccount = new Map(snapshotsBefore.map((s) => [s.external_account_id, s]));

  /* review ล่าสุดต่อบัญชี — append-only จึงตัดสินด้วย created_at ใหม่สุด */
  const reviewByAccount = new Map();
  for (const r of reviews) {
    const current = reviewByAccount.get(r.external_account_id);
    if (!current || String(r.created_at) > String(current.created_at)) reviewByAccount.set(r.external_account_id, r);
  }

  /* รวม spend เดือนต่อบัญชี + ต่อแคมเปญ จาก cards (fact_date ยึด prefix เดือน) */
  const spendByAccount = new Map();
  for (const cardRow of cards) {
    if (!cardRow?.account_id || !String(cardRow.fact_date ?? "").startsWith(monthPrefix)) continue;
    const spend = Number(cardRow.metrics?.spend);
    if (!Number.isFinite(spend)) continue;
    const acc = spendByAccount.get(cardRow.account_id) ?? { spend: 0, campaigns: new Map() };
    acc.spend += spend;
    const name = cardRow.campaign ?? "ไม่ระบุแคมเปญ";
    acc.campaigns.set(name, (acc.campaigns.get(name) ?? 0) + spend);
    spendByAccount.set(cardRow.account_id, acc);
  }

  const rows = [];

  for (const connection of connections) {
    const account = connection.external_account_id;
    const acc = spendByAccount.get(account) ?? { spend: 0, campaigns: new Map() };
    const snap = snapByAccount.get(account) ?? null;
    const review = reviewByAccount.get(account) ?? null;
    const statement = review?.statement_amount != null ? Number(review.statement_amount) : null;
    const spend = acc.spend;
    const diff = statement == null ? null : statement - spend;
    const diffPct = statement == null || spend <= 0 ? null : Math.abs(diff) / spend;
    const status = statement == null ? "nostatement"
      : diffPct <= MATCH_PCT ? "match"
      : diffPct <= MINOR_PCT ? "minor"
      : "review";
    const accountStatus = snap?.account_status ?? null;
    const flag = status === "review" ? { text: "ต้องตรวจ", tone: "rose" }
      : accountStatus != null && accountStatus !== 1 ? { text: "บัญชีมีปัญหา", tone: "amber" }
      : null;
    rows.push({
      external_account_id: account,
      accountName: connection.account_name || snap?.account_name || account,
      brandName: brandName.get(connection.brand_id) ?? connection.brand_id ?? "",
      connected: true,
      spend,
      vat: spend * VAT_RATE,
      gross: spend * (1 + VAT_RATE),
      campaigns: [...acc.campaigns.entries()].map(([name, campaignSpend]) => ({
        name, spend: campaignSpend, share: spend > 0 ? campaignSpend / spend : 0,
      })).sort((a, b) => b.spend - a.spend),
      balance: baht(snap?.balance_cents),
      accountStatus,
      spentDelta: null,                                   // มีความหมายเฉพาะบัญชีนอกระบบ
      statement, diff, diffPct, status, flag, review,
    });
  }

  /* บัญชีใน snapshot ที่ไม่ได้เชื่อมเข้าระบบ = เงินอาจออกโดย dashboard มองไม่เห็น */
  const connected = new Set(connections.map((c) => c.external_account_id));
  for (const snap of snapshots) {
    if (connected.has(snap.external_account_id)) continue;
    const before = beforeByAccount.get(snap.external_account_id);
    const spentDelta = before?.amount_spent_cents != null && snap.amount_spent_cents != null
      ? baht(snap.amount_spent_cents - before.amount_spent_cents)
      : null;
    rows.push({
      external_account_id: snap.external_account_id,
      accountName: snap.account_name || snap.external_account_id,
      brandName: "",
      connected: false,
      spend: null, vat: null, gross: null, campaigns: [],
      balance: baht(snap.balance_cents),
      accountStatus: snap.account_status ?? null,
      spentDelta,
      statement: null, diff: null, diffPct: null,
      status: "offsystem",
      // ยังไม่มีรอบก่อนเทียบ = ยังสรุปไม่ได้ว่าใช้เงินเพิ่ม — แถวโผล่แบบเงียบ ไม่ตะโกน
      flag: spentDelta != null && spentDelta > 0 ? { text: "เงินออกนอกระบบ", tone: "rose" } : null,
      review: reviewByAccount.get(snap.external_account_id) ?? null,
    });
  }

  /* เรียง: มีป้ายก่อน (แดงก่อนเหลือง) แล้วตามยอดมาก→น้อย */
  const severity = (r) => (r.flag?.tone === "rose" ? 0 : r.flag?.tone === "amber" ? 1 : 2);
  rows.sort((a, b) => severity(a) - severity(b) || (b.spend ?? b.spentDelta ?? 0) - (a.spend ?? a.spentDelta ?? 0));

  const connectedRows = rows.filter((r) => r.connected);
  const offSystemSpendDelta = rows.filter((r) => !r.connected && r.spentDelta != null && r.spentDelta > 0)
    .reduce((sum, r) => sum + r.spentDelta, 0);
  const totals = {
    spend: connectedRows.reduce((sum, r) => sum + r.spend, 0),
    vat: connectedRows.reduce((sum, r) => sum + r.vat, 0),
    gross: connectedRows.reduce((sum, r) => sum + r.gross, 0),
    statement: connectedRows.reduce((sum, r) => sum + (r.statement ?? 0), 0),
    balance: connectedRows.reduce((sum, r) => sum + (r.balance ?? 0), 0),
    offSystemSpendDelta,
  };

  /* alerts — exception-based: เดือนเรียบร้อย = [] */
  const alerts = [];
  const offAccounts = rows.filter((r) => !r.connected && r.flag);
  if (offAccounts.length) alerts.push({ key: "offsystem", tone: "rose",
    text: `เงินออกนอกระบบ ≈ ฿${offSystemSpendDelta.toFixed(2)} — ${offAccounts.map((r) => r.accountName).join(" · ")} ยังไม่ได้เชื่อม` });
  const reviewCount = rows.filter((r) => r.status === "review").length;
  if (reviewCount) alerts.push({ key: "review", tone: "rose", text: `ส่วนต่างเกินเกณฑ์ ${reviewCount} บัญชี` });
  const badStatus = rows.filter((r) => r.accountStatus != null && r.accountStatus !== 1);
  if (badStatus.length) alerts.push({ key: "accountStatus", tone: "amber",
    text: `บัญชีมีปัญหา ${badStatus.length} บัญชี (${badStatus.map((r) => r.accountName).join(" · ")}) — เสี่ยงแอดหยุดวิ่ง` });

  const [y, m] = String(month).split("-").map(Number);
  const rangeLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" });

  return { month, rangeLabel, rows, totals, alerts };
}

/** รายการบัญชีที่เชื่อม สกัดจาก cards (มี account_id + brand_id ติดมาแล้ว) — ไม่ต้องดึง ad_connections แยก */
export function connectionsFromCards(cards = []) {
  const seen = new Map();
  for (const cardRow of cards) {
    if (!cardRow?.account_id || seen.has(cardRow.account_id)) continue;
    seen.set(cardRow.account_id, { external_account_id: cardRow.account_id, brand_id: cardRow.brand_id ?? "", account_name: "" });
  }
  return [...seen.values()];
}
