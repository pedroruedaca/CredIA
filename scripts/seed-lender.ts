/**
 * Creates a lender and makes the user with this email its owner, creating the user if needed (confirmed, no
 * password: they sign in with a magic link). This is how a new lender is approved: the login form never creates
 * accounts, so nobody can sign in until credIA or a lender owner (Ajustes → Equipo) adds them.
 *
 *   npm run seed:lender -- --email ana@fondo.es --lender "Fondo Ejemplo Capital"
 */
import { createClient } from "@supabase/supabase-js";

/** Value after `--name`, joining words until the next flag (Windows shells may drop the quotes). */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const words: string[] = [];
  for (const w of process.argv.slice(i + 1)) {
    if (w.startsWith("--")) break;
    words.push(w);
  }
  return words.length ? words.join(" ") : undefined;
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
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url.trim())) {
  console.error(
    `NEXT_PUBLIC_SUPABASE_URL debe ser solo la URL base del proyecto, p. ej. https://<ref>.supabase.co (sin /rest/v1, sin barra final). Valor actual: ${url}`,
  );
  process.exit(1);
}
const db = createClient(url.trim(), key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(target: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

let userId = await findUserId(email);
if (!userId) {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("No se pudo crear el usuario");
  userId = data.user.id;
  console.log(`Usuario ${email} creado.`);
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
