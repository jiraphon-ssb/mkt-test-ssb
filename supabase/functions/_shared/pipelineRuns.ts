/* ประวัติรอบดึงข้อมูลนอก Meta insights (ยอดขาย · creative · สำรวจแหล่ง) → data_pipeline_runs
   ใช้ร่วมกันระหว่าง sales-sync / ads-creatives · หน้า Sync อ่านตารางนี้
   บันทึกประวัติพังต้องไม่ทำให้งานหลักพัง — log แล้วไปต่อ */
import type { adminClient } from "./adsOAuth.ts";

type Db = ReturnType<typeof adminClient>;
type Pipeline = "sales" | "creatives" | "inventory";
type Status = "success" | "partial" | "failed";

const CODE = /^[A-Z0-9_]{1,64}$/;

/** error code ที่เก็บได้ต้องเป็นรหัสตายตัว (ตาราง check ไว้) — ข้อความอื่นแทนด้วย fallback ไม่เก็บข้อความ error ดิบ */
export const runCode = (value: unknown, fallback = "PIPELINE_FAILED") => {
  const text = String(value ?? "");
  return CODE.test(text) ? text : fallback;
};

export async function startRun(db: Db, fields: {
  pipeline: Pipeline; trigger: "cron" | "manual"; userId?: string | null; connectionId?: string | null;
  rangeFrom?: string | null; rangeTo?: string | null;
}): Promise<string | null> {
  const { data, error } = await db.from("data_pipeline_runs").insert({
    pipeline: fields.pipeline, trigger_kind: fields.trigger, triggered_by: fields.userId ?? null,
    connection_id: fields.connectionId ?? null, range_from: fields.rangeFrom ?? null, range_to: fields.rangeTo ?? null,
    status: "running",
  }).select("id").single();
  if (error) {
    console.error("[pipeline-runs] start", fields.pipeline, error.message);
    return null;
  }
  return data.id as string;
}

export async function finishRun(db: Db, id: string | null, fields: {
  status: Status; rowsRead?: number | null; rowsWritten?: number | null; summary?: Record<string, unknown>; errorCode?: string | null;
}) {
  if (!id) return;
  const { error } = await db.from("data_pipeline_runs").update({
    status: fields.status,
    rows_read: fields.rowsRead ?? null,
    rows_written: fields.rowsWritten ?? null,
    summary: fields.summary ?? {},
    error_code: fields.errorCode ? runCode(fields.errorCode) : null,
    finished_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) console.error("[pipeline-runs] finish", id, error.message);
}
