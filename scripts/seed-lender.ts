/**
 * Creates a lender and links an existing Supabase Auth user as its owner.
 * The user must have signed in once (magic link) so the auth user exists.
 *
 *   npm run seed:lender -- --email ana@fondo.es --lender "Fondo Ejemplo Capital"
 */
import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg("email")?.trim().toLowerCase();
const lenderName = arg("lender")?.trim();
if (!email || !lenderName) {
  console.error('Uso: npm run seed:lender -- --email <correo> --lender "<nombre de la entidad>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(target: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

const userId = await findUserId(email);
if (!userId) {
  console.error(`No existe ningún usuario con el correo ${email}. Accede una vez en /login y vuelve a ejecutar el script.`);
  process.exit(1);
}

const { data: existing } = await db.from("lender_members").select("lender_id, lenders(name)").eq("user_id", userId);
if (existing && existing.length > 0) {
  console.log(`${email} ya pertenece a una entidad; no se ha creado nada.`);
  process.exit(0);
}

const { data: lender, error: lenderErr } = await db.from("lenders").insert({ name: lenderName }).select("id").single();
if (lenderErr || !lender) throw lenderErr ?? new Error("No se pudo crear la entidad");
const { error: memberErr } = await db.from("lender_members").insert({ lender_id: lender.id, user_id: userId, role: "owner" });
if (memberErr) throw memberErr;
console.log(`Entidad «${lenderName}» creada (${lender.id}); ${email} es owner.`);
