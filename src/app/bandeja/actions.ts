"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

/** "Marcar atendida" on a help request. RLS limits it to this lender's requests. */
export async function closeSupportRequest(id: string): Promise<{ ok: boolean; message?: string }> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar." };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Solicitud no válida." };
  const db = await createClient();
  const { data, error } = await db.from("support_requests").update({ status: "closed" }).eq("id", id).eq("status", "open").select("case_id").maybeSingle();
  if (error) return { ok: false, message: "No hemos podido actualizarla. Inténtalo de nuevo." };
  if (data) {
    await db.from("audit_log").insert({ lender_id: lender.lenderId, case_id: data.case_id, actor: lender.userId, action: "support.closed", detail: { support_request_id: id } });
  }
  revalidatePath("/bandeja", "layout");
  return { ok: true };
}
