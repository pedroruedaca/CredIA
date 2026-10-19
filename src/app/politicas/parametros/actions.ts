"use server";

/** Policy parameters: create, edit, delete. Owners and analysts; viewers cannot. The unit never changes. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLender } from "@/lib/lender";
import { parseParameterForm, type ParameterFieldErrors } from "@/lib/policies/parameters";
import { getParameter } from "@/lib/policies/parameter-store";
import { listPolicies } from "@/lib/policies/store";
import { createClient } from "@/lib/supabase/server";

export type ParameterFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: ParameterFieldErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> };

const formValues = (fd: FormData) => {
  const v: Record<string, string> = {};
  for (const [k, x] of fd.entries()) if (typeof x === "string" && !k.startsWith("$")) v[k] = x;
  return v;
};
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Create (no id) or update a parameter; back to the list on success. */
export async function saveParameter(id: string | null, _prev: ParameterFormState, fd: FormData): Promise<ParameterFormState> {
  const lender = await requireLender();
  const values = formValues(fd);
  if (lender.role === "viewer") return { status: "failed", message: "Tu rol solo permite consultar.", values };
  if (id !== null && !isId(id)) return { status: "failed", message: "Parámetro no encontrado.", values };
  const supabase = await createClient();
  const existing = id ? await getParameter(supabase, id) : null;
  if (id && !existing) return { status: "failed", message: "Parámetro no encontrado.", values };
  const parsed = parseParameterForm(values, existing);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const now = new Date().toISOString();
  const { data, error } = id
    ? await supabase.from("policy_parameters").update({ name: parsed.data.name, description: parsed.data.description, updated_by: lender.userId, updated_at: now }).eq("id", id).select("id").maybeSingle()
    : await supabase.from("policy_parameters").insert({ ...parsed.data, lender_id: lender.lenderId, created_by: lender.userId, updated_by: lender.userId }).select("id").single();
  if (error?.code === "23505") return { status: "invalid", errors: { name: "Ya hay un parámetro con ese nombre." }, values };
  if (error || !data) return { status: "failed", message: "No hemos podido guardar el parámetro. Inténtalo de nuevo.", values };
  await supabase.from("audit_log").insert({
    lender_id: lender.lenderId,
    actor: lender.userId,
    action: id ? "parameter.updated" : "parameter.created",
    detail: { parameter_id: data.id, ...parsed.data },
  });
  revalidatePath("/politicas", "layout");
  redirect("/politicas/parametros?guardado=1");
}

/** Refused while a policy uses it (its criteria would lose their threshold); the cases' values go with it. */
export async function deleteParameter(id: string): Promise<{ ok: false; message: string } | never> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar." };
  if (!isId(id)) return { ok: false, message: "Parámetro no encontrado." };
  const supabase = await createClient();
  const users = (await listPolicies(supabase)).filter((p) => p.criteria.some((c) => c.parameter?.id === id));
  if (users.length) {
    return { ok: false, message: `Lo usa${users.length === 1 ? " la política" : "n las políticas"} ${users.map((p) => `«${p.name}»`).join(", ")}. Quítalo de sus criterios antes de eliminarlo.` };
  }
  const { error } = await supabase.from("policy_parameters").delete().eq("id", id);
  if (error) return { ok: false, message: "No hemos podido eliminar el parámetro. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, actor: lender.userId, action: "parameter.deleted", detail: { parameter_id: id } });
  revalidatePath("/politicas", "layout");
  redirect("/politicas/parametros");
}
