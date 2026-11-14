import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordAudit(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  targetTable: string,
  targetId: string,
  changes: Record<string, unknown> = {},
) {
  if (!UUID_RE.test(userId) || !UUID_RE.test(targetId)) {
    throw new Error("AUDIT_INVALID_UUID: userId and targetId must be valid UUIDs.");
  }

  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId,
    action,
    target_table: targetTable,
    target_id: targetId,
    changes,
  });

  if (error) {
    console.error("Audit log insert failed:", {
      code: error.code,
      message: error.message,
      targetTable,
      action,
    });
    throw new Error("AUDIT_WRITE_FAILED");
  }
}
