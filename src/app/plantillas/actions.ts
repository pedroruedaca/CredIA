"use server";

/** Process templates: create, edit, delete, and their case-view layout. Owners and analysts; viewers cannot. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseTemplateForm, type TemplateFieldErrors } from "@/lib/cases/templates";
import { requireLender } from "@/lib/lender";
import { createClient } from "@/lib/supabase/server";

export type TemplateFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: TemplateFieldErrors; values: Record<string, string> }
  | { status: "failed"; message: string; values: Record<string, string> };

const formValues = (fd: FormData) => {
  const v: Record<string, string> = {};
  for (const [k, x] of fd.entries()) if (typeof x === "string" && !k.startsWith("$")) v[k] = x;
  return v;
};
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Create (no id) or update a template from the form; back to the list on success. */
export async function saveTemplate(id: string | null, _prev: TemplateFormState, fd: FormData): Promise<TemplateFormState> {
  const lender = await requireLender();
  const values = formValues(fd);
  if (lender.role === "viewer") return { status: "failed", message: "Tu rol solo permite consultar.", values };
  if (id !== null && !isId(id)) return { status: "failed", message: "Plantilla no encontrada.", values };
  const parsed = parseTemplateForm(values);
  if (!parsed.ok) return { status: "invalid", errors: parsed.errors, values };
  const supabase = await createClient();
  const { panel, costOfSales, ...fields } = parsed.data;
  // The standard panel drops any panel of its own; a custom one is designed in the editor right after saving
  // (unless the template already has one, which is kept).
  const hadOwnPanel = id ? !!(await supabase.from("case_templates").select("layout").eq("id", id).maybeSingle()).data?.layout : false;
  const row = { ...fields, cost_of_sales: costOfSales, ...(panel === "team" ? { layout: null } : {}), updated_by: lender.userId, updated_at: new Date().toISOString() };
  const { data, error } = id
    ? await supabase.from("case_templates").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("case_templates").insert({ ...row, lender_id: lender.lenderId, created_by: lender.userId }).select("id").single();
  if (error || !data) return { status: "failed", message: "No hemos podido guardar la plantilla. Inténtalo de nuevo.", values };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, actor: lender.userId, action: id ? "template.updated" : "template.created", detail: { template_id: data.id, name: parsed.data.name } });
  revalidatePath("/plantillas");
  redirect(panel === "custom" && !hadOwnPanel ? `/plantillas/${data.id}?panel=1` : `/plantillas/${data.id}?guardada=1`);
}

export async function deleteTemplate(id: string): Promise<{ ok: false; message: string } | never> {
  const lender = await requireLender();
  if (lender.role === "viewer") return { ok: false, message: "Tu rol solo permite consultar." };
  if (!isId(id)) return { ok: false, message: "Plantilla no encontrada." };
  const supabase = await createClient();
  const { error } = await supabase.from("case_templates").delete().eq("id", id);
  if (error) return { ok: false, message: "No hemos podido eliminar la plantilla. Inténtalo de nuevo." };
  await supabase.from("audit_log").insert({ lender_id: lender.lenderId, actor: lender.userId, action: "template.deleted", detail: { template_id: id } });
  revalidatePath("/plantillas");
  redirect("/plantillas");
}
