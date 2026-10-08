"use client";

/** Ajustes forms: lender identity (with a live co-brand preview), team list with role/remove, invite. */
import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { RETENTION_COPY as R } from "@/content/case-closing.es";
import { AUTO_CLOSE_OPTIONS, RETENTION_OPTIONS } from "@/lib/cases/closing";
import { initials } from "@/lib/initials";
import { changeRole, inviteMember, removeMember, updateLender, updateRetention, type Result } from "./actions";

type Role = "owner" | "analyst" | "viewer";
const ROLE_LABEL: Record<Role, string> = { owner: "Administrador", analyst: "Analista", viewer: "Consulta" };
const ROLE_HINT: Record<Role, string> = {
  owner: "Todo, incluidos ajustes y equipo",
  analyst: "Crea y gestiona casos",
  viewer: "Solo consulta casos",
};

function Feedback({ result }: { result: Result | null }) {
  if (!result) return null;
  return result.ok ? (
    result.message ? <p role="status" className="flex items-center gap-2 text-[13px] text-ink-2"><Pill tone="ok">Hecho</Pill>{result.message}</p> : null
  ) : (
    <p role="alert" className="flex items-center gap-2 text-[13px] text-ink-2"><Pill tone="high">Error</Pill>{result.message}</p>
  );
}

export function LenderForm({ name, brandColor, canEdit }: { name: string; brandColor: string; canEdit: boolean }) {
  const [n, setN] = useState(name);
  const [color, setColor] = useState(brandColor);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await updateLender({ name: n, brandColor: color })));
      }}
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_200px]">
        <Field id="lender-name" label="Nombre de la entidad" hint="Lo ven las empresas en su página y en los correos.">
          <Input id="lender-name" value={n} onChange={(e) => setN(e.target.value)} disabled={!canEdit} maxLength={120} required />
        </Field>
        <Field id="lender-color" label="Color">
          <div className="flex items-center gap-2">
            <input
              id="lender-color"
              type="color"
              value={color}
              disabled={!canEdit}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              aria-label="Color de la entidad"
              className="size-11 shrink-0 cursor-pointer rounded-input bg-soft p-1 disabled:cursor-not-allowed"
            />
            <Input value={color} disabled={!canEdit} onChange={(e) => setColor(e.target.value)} aria-label="Color en hexadecimal" className="font-mono uppercase" maxLength={7} />
          </div>
        </Field>
      </div>
      <div className="flex items-center gap-3 rounded-row bg-soft px-4 py-3" aria-label="Vista previa">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold text-white" style={{ background: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#2B2E6B" }}>
          {initials(n || "?")}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{n || "—"}</span>
          <span className="text-xs text-muted">con credIA · así aparece en la página de la empresa</span>
        </span>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || (n === name && color === brandColor)}>{pending ? "Guardando…" : "Guardar"}</Button>
          <Feedback result={result} />
        </div>
      )}
    </form>
  );
}

/** «Conservación de datos»: retention after closing and auto-close of idle cases (owners edit). */
export function RetentionForm({ retentionMonths, autoCloseMonths, canEdit }: { retentionMonths: number; autoCloseMonths: number | null; canEdit: boolean }) {
  const initialAuto = autoCloseMonths === null ? "never" : String(autoCloseMonths);
  const [retention, setRetention] = useState(String(retentionMonths));
  const [auto, setAuto] = useState(initialAuto);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  // A value set outside the offered choices (database accepts more) is still shown.
  const retentionChoices = [...new Set<number>([...RETENTION_OPTIONS, retentionMonths])].sort((a, b) => a - b);
  const autoChoices = [...new Set<number>([...AUTO_CLOSE_OPTIONS, ...(autoCloseMonths === null ? [] : [autoCloseMonths])])].sort((a, b) => a - b);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await updateRetention({ retentionMonths: retention, autoCloseMonths: auto })));
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="retention-months" label={R.retentionLabel} hint={R.retentionHint}>
          <Select id="retention-months" value={retention} disabled={!canEdit} onChange={(e) => setRetention(e.target.value)}>
            {retentionChoices.map((m) => <option key={m} value={m}>{R.keep(m)}</option>)}
          </Select>
        </Field>
        <Field id="auto-close-months" label={R.autoCloseLabel} hint={R.autoCloseHint}>
          <Select id="auto-close-months" value={auto} disabled={!canEdit} onChange={(e) => setAuto(e.target.value)}>
            {autoChoices.map((m) => <option key={m} value={m}>{R.after(m)}</option>)}
            <option value="never">{R.never}</option>
          </Select>
        </Field>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending || (retention === String(retentionMonths) && auto === initialAuto)}>{pending ? "Guardando…" : "Guardar"}</Button>
          <Feedback result={result} />
        </div>
      )}
    </form>
  );
}

export interface MemberRow {
  userId: string;
  email: string;
  role: Role;
  lastSignInAt: string | null;
  lastSignInLabel: string;
}

function MemberItem({ m, me, canEdit, onResult }: { m: MemberRow; me: boolean; canEdit: boolean; onResult: (r: Result) => void }) {
  const [pending, start] = useTransition();
  return (
    <li className="-mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-row px-4 py-3 hover:bg-soft">
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{initials(m.email)}</span>
      <span className="flex min-w-0 grow basis-48 flex-col">
        <span className="truncate text-[15px]">{m.email}{me && <span className="text-muted"> · tú</span>}</span>
        <span className="text-[13px] text-muted">{m.lastSignInAt ? `Último acceso ${m.lastSignInLabel}` : "Aún no ha entrado"}</span>
      </span>
      {canEdit && !me ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-[160px]">
            <Select
              aria-label={`Rol de ${m.email}`}
              value={m.role}
              disabled={pending}
              onChange={(e) => start(async () => onResult(await changeRole({ userId: m.userId, role: e.target.value as Role })))}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </div>
          <Button
            variant="link"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`¿Quitar a ${m.email} del equipo? Dejará de ver los casos.`)) start(async () => onResult(await removeMember({ userId: m.userId })));
            }}
          >
            Quitar
          </Button>
        </div>
      ) : (
        <Pill tone={m.role === "owner" ? "accent" : "neutral"} dot={false}>{ROLE_LABEL[m.role]}</Pill>
      )}
    </li>
  );
}

export function TeamSection({ members, meId, canEdit }: { members: MemberRow[]; meId: string; canEdit: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("analyst");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-1">
        {members.map((m) => <MemberItem key={m.userId} m={m} me={m.userId === meId} canEdit={canEdit} onResult={setResult} />)}
      </ul>
      {canEdit && (
        <form
          className="flex flex-col gap-3 rounded-row bg-soft p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await inviteMember({ email, role });
              setResult(r);
              if (r.ok) setEmail("");
            });
          }}
        >
          <p className="text-[15px] font-medium">Invitar a alguien</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input type="email" required placeholder="correo@entidad.es" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo de la persona" className="grow bg-surface" />
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Rol" className="bg-surface sm:w-[170px]">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Button type="submit" disabled={pending || !email}>
              <UserPlus size={16} strokeWidth={1.8} aria-hidden /> {pending ? "Invitando…" : "Invitar"}
            </Button>
          </div>
          <p className="text-[13px] text-muted">{ROLE_HINT[role]}. Entrará con su correo, sin contraseña.</p>
        </form>
      )}
      <Feedback result={result} />
    </div>
  );
}
