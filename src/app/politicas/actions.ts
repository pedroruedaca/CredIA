"use server";

/** Credit policies: create, edit, delete. Owners and analysts; viewers cannot. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criteriaToStored, parsePolicyForm, type PolicyFieldErrors } from "@/lib/policies/policy";
import { listParameters } from "@/lib/policies/parameter-store";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type PolicyFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: PolicyFieldErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> };

const formValues = (fd: FormData) => {
  const v: Record<string, string> = {};
  for (const [k, x] of fd.entries()) if (typeof x === "string" && !k.startsWith("$")) v[k] = x;
  return v;
};
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Create (no id) or update a policy from the form; back to the policy on success. */
export async function savePolicy(id: string | null, _prev: PolicyFormState, fd: FormData): Promise<PolicyFormState> {
  const lender = await requireLender();
  const values = formValues(fd);
  if (lender.role === "viewer") return { status: "failed", message: "Tu rol solo permite consultar.", values };
  if (id !== null && !isId(id)) return { status: "failed", message: "Política no encontrada.", values };
  const supabase = await createClient();
  const parsed = parsePolicyForm(values, await listParameters(supabase));
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const row = { ...parsed.data, criteria: criteriaToStored(parsed.data.criteria), updated_by: lender.userId, updated_at: new Date().toISOString() };
  const { data, error } = id
    ? await supabase.from("credit_policies").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("credit_policies").insert({ ...row, lender_id: lender.lenderId, created_by: lender.userId }).select("id").single();
  if (error || !data) return { status: "failed", message: "No hemos podido guardar la política. Inténtalo de nuevo.", values };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    actor: lender.userId,
    action: id ? "policy.updated" : "policy.created",
    detail: { policy_id: data.id, name: parsed.data.name, criteria: row.criteria },
  });
  revalidatePath("/politicas");
  redirect(`/politicas/${data.id}?guardada=1`);
}

export async function deletePolicy(id: string): Promise<{ ok: false; message: string } | never> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar." };
  if (!isId(id)) return { ok: false, message: "Política no encontrada." };
  const supabase = await createClient();
  const { error } = await supabase.from("credit_policies").delete().eq("id", id);
  if (error) return { ok: false, message: "No hemos podido eliminar la política. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, actor: lender.userId, action: "policy.deleted", detail: { policy_id: id } });
  revalidatePath("/politicas");
  redirect("/politicas");
}
