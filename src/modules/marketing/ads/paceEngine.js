/* Pace Engine กลาง — ทุกหน้าคำนวณจากกติกาชุดเดียวกัน
   null = ยังตัดสินไม่ได้เสมอ ห้ามแปลงข้อมูลที่ขาดเป็นศูนย์ */
const finite = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function monthClock(today) {
  const text = String(today ?? "");
  const year = Number(text.slice(0, 4)), month = Number(text.slice(5, 7)), rawDay = Number(text.slice(8, 10));
  if (!year || !month || !rawDay) return { elapsed: null, daysElapsed: null, daysTotal: null, daysLeft: null };
  const daysTotal = new Date(year, month, 0).getDate();
  const daysElapsed = clamp(rawDay, 1, daysTotal);
  return { elapsed: daysElapsed / daysTotal, daysElapsed, daysTotal, daysLeft: daysTotal - daysElapsed };
}

export function cumulativePace({ actual, target, elapsed, daysLeft = null, direction = "higher", tolerance = 0.1 } = {}) {
  const a = finite(actual), t = finite(target), e = finite(elapsed);
  const validElapsed = e != null && e > 0 ? clamp(e) : null;
  const expectedToDate = t != null && t > 0 && validElapsed != null ? t * validElapsed : null;
  const progress = a != null && t != null && t > 0 ? a / t : null;
  const vsPace = a != null && expectedToDate != null ? a - expectedToDate : null;
  const forecast = a != null && validElapsed != null ? a / validElapsed : null;
  const remaining = a != null && t != null ? t - a : null;
  const ratioToPace = a != null && expectedToDate > 0 ? a / expectedToDate : null;
  const requiredDaily = remaining != null && daysLeft > 0 ? Math.max(0, remaining) / daysLeft : null;
  let state = "unknown";
  if (a != null && t != null && t > 0 && validElapsed != null) {
    if (direction === "lower") state = a > t ? "bad" : progress > validElapsed + tolerance ? "warn" : progress < validElapsed - tolerance ? "slow" : "ontrack";
    else state = ratioToPace >= 1 ? "ontrack" : ratioToPace >= 0.85 ? "warn" : "bad";
  }
  return { actual: a, target: t, elapsed: validElapsed, expectedToDate, progress, ratioToPace, vsPace, remaining, forecast,
    forecastVsTarget: forecast == null || t == null ? null : forecast - t, requiredDaily, daysLeft, state };
}

export function thresholdPace(actual, target, { direction = "higher" } = {}) {
  const a = finite(actual), t = finite(target);
  if (a == null || t == null || t <= 0) return { actual: a, target: t, progress: null, state: "unknown", remaining: null };
  const progress = direction === "lower" ? t / Math.max(a, Number.EPSILON) : a / t;
  const pass = direction === "lower" ? a <= t : a >= t;
  return { actual: a, target: t, progress, state: pass ? "ontrack" : progress >= 0.7 ? "warn" : "bad", remaining: direction === "lower" ? a - t : Math.max(0, t - a) };
}

export function freshnessPace(updatedAt, expectedEveryHours, now = Date.now()) {
  const at = Date.parse(updatedAt ?? ""), hours = finite(expectedEveryHours);
  if (!Number.isFinite(at) || hours == null || hours <= 0) return { ageHours: null, expectedEveryHours: hours, progress: null, state: "unknown" };
  const ageHours = Math.max(0, (now - at) / 3_600_000), ratio = ageHours / hours;
  return { ageHours, expectedEveryHours: hours, progress: clamp(1 - ratio, 0, 1), state: ratio <= 1 ? "ontrack" : ratio <= 1.5 ? "warn" : "bad" };
}

export function coveragePace(complete, total) {
  const done = finite(complete), all = finite(total);
  if (done == null || all == null || all <= 0) return { complete: done, total: all, progress: null, state: "unknown", missing: null };
  const progress = clamp(done / all);
  return { complete: done, total: all, progress, missing: Math.max(0, all - done), state: progress >= 1 ? "ontrack" : progress >= 0.8 ? "warn" : "bad" };
}

export const paceTone = (state) => ({ ontrack: "emerald", warn: "amber", bad: "rose", slow: "zinc", unknown: "zinc" }[state] ?? "zinc");
