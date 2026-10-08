/**
 * Borrower portal, one step at a time (design/borrower-flow2.html): left column with co-brand, request,
 * timeline and privacy note; the main column shows only the current step (`?paso=<doc_kind>`), or the final
 * "Revisar y enviar". Also used read-only for the lender's "Ver como la empresa".
 */
import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cx } from "@/components/ui/cx";
import { DEFAULT_LENDER_COLOR, REVIEW_STEP, STEP_COPY } from "@/content/borrower-portal.es";
import type { Checklist, ChecklistHolded } from "@/lib/borrower/checklist";
import { nextStep, REVIEW, stepNumber, type StepId } from "@/lib/borrower/steps";
import { initials } from "@/lib/initials";
import { DelegateDialog } from "../DelegateDialog";
import { WithdrawConsent } from "../Consent";
import { PRIVACY_LINK } from "@/content/data-protection.es";
import { holdedText } from "@/lib/borrower/holded-text";
import { SubmitBar } from "../SubmitBar";
import { MobileSteps } from "./MobileSteps";
import { FilePills, StepContent } from "./StepContent";
import { StepTimeline } from "./StepTimeline";

export interface BorrowerFlowProps {
  /** The link's handle (`/s/<handle>`, `/api/borrower/<handle>/…`); the token itself stays in an HttpOnly cookie. */
  link: string;
  readOnly?: boolean;
  actor: "borrower" | "delegate";
  lenderName: string;
  brandColor: string | null;
  companyName: string;
  requestLine: string;
  checklist: Checklist;
  current: StepId;
  today: string;
  holded: ChecklistHolded[];
  submittedAt: string | null;
  submittedLabel: string | null;
  /** Floating layer at the bottom of the main column (the assistant). */
  floating?: React.ReactNode;
}

function CoBrand({ lenderName, brandColor }: { lenderName: string; brandColor: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold text-white" style={{ background: brandColor ?? DEFAULT_LENDER_COLOR }}>
        {initials(lenderName)}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-semibold">{lenderName}</span>
        <span className="text-xs text-muted">con credIA</span>
      </div>
    </div>
  );
}

function PrivacyNote({ lenderName, holded, link, canWithdraw }: { lenderName: string; holded: ChecklistHolded[]; link: string; canWithdraw: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-normal text-ink-2">
      <div className="flex items-center gap-2 font-medium text-ink">
        <Lock size={16} strokeWidth={1.8} aria-hidden /> Solo lo ve {lenderName}
      </div>
      <p>Para analizar esta solicitud. Holded: {holdedText(holded).toLowerCase()}</p>
      <a href="/privacidad" target="_blank" rel="noopener" className="self-start text-[13px]">{PRIVACY_LINK}</a>
      {canWithdraw && <WithdrawConsent link={link} lenderName={lenderName} />}
    </div>
  );
}

function Progress({ current, checklist }: { current: StepId; checklist: Checklist }) {
  const { n, of } = stepNumber(current, checklist.items);
  const pct = checklist.total === 0 ? 100 : Math.round((checklist.done / checklist.total) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-accent">Paso {n} de {of}</span>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-hairline" role="progressbar" aria-valuenow={checklist.done} aria-valuemin={0} aria-valuemax={checklist.total} aria-label="Documentos obligatorios listos">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[13px] text-muted">{checklist.done} {checklist.done === 1 ? "listo" : "listos"}</span>
    </div>
  );
}

function ReviewStep({ p }: { p: BorrowerFlowProps }) {
  const { checklist } = p;
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="heading-page">{REVIEW_STEP.heading}</h1>
        <p className="max-w-[600px] text-base leading-relaxed text-ink-2">
          {checklist.allRequiredDone
            ? `Tienes todo lo que ${p.lenderName} ha pedido. Revisa la lista y envía cuando quieras.`
            : "Aún faltan documentos obligatorios. Puedes volver a cualquier paso desde aquí."}
        </p>
      </div>
      <ul className="flex flex-col">
        {checklist.items.map((i) => (
          <li key={i.kind}>
            <a href={`?paso=${i.kind}`} className="-mx-4 flex min-h-11 items-center gap-4 rounded-row px-4 py-3.5 text-ink transition-colors hover:bg-soft hover:text-ink hover:no-underline">
              <span className="min-w-0 grow">
                <span className="block text-[15px] font-medium">{STEP_COPY[i.kind].short}{!i.required && <span className="ml-2 text-[13px] font-normal text-muted">(opcional)</span>}</span>
                <span className={cx("block truncate text-[13px]", i.state === "attention" ? "text-warn" : "text-muted")}>{i.state === "attention" ? i.fix : (i.summary ?? STEP_COPY[i.kind].estimate)}</span>
              </span>
              <Pill tone={i.state === "done" ? "ok" : i.state === "attention" ? "warn" : i.state === "in_progress" ? "info" : "neutral"}>
                {i.state === "done" ? "Listo" : i.state === "attention" ? "Revisar" : i.state === "in_progress" ? "En curso" : "Pendiente"}
              </Pill>
            </a>
          </li>
        ))}
      </ul>
      {!p.readOnly && (
        <SubmitBar
          link={p.link}
          allRequiredDone={checklist.allRequiredDone}
          missingCount={checklist.missing.length}
          submittedAt={p.submittedAt}
          submittedLabel={p.submittedLabel}
          lenderName={p.lenderName}
        />
      )}
    </>
  );
}

function CurrentStep({ p }: { p: BorrowerFlowProps }) {
  const item = p.checklist.items.find((i) => i.kind === p.current)!;
  const copy = STEP_COPY[item.kind];
  const next = nextStep(item.kind, p.checklist.items);
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="heading-page">{copy.heading}</h1>
        <p className="max-w-[600px] text-base leading-relaxed text-ink-2">
          {copy.why(p.lenderName)}
          {!item.required && " Es opcional."}
        </p>
        {item.state === "attention" && item.fix && (
          <p role="status" className="flex max-w-[640px] items-start gap-2 text-[15px] text-ink-2">
            <Pill tone="warn">Revisar</Pill>
            <span>{item.fix}</span>
          </p>
        )}
        {item.state === "done" && item.summary && item.files.length === 0 && (
          <p className="flex items-center gap-2 text-[15px] text-ink-2">
            <Pill tone="ok">Listo</Pill>
            <span>{item.summary}</span>
          </p>
        )}
      </div>
      <StepContent item={item} link={p.link} lenderName={p.lenderName} today={p.today} readOnly={!!p.readOnly} />
      <FilePills files={item.files} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ButtonLink href={`?paso=${next}`}>
          {next === REVIEW ? "Continuar a revisar y enviar" : "Continuar"}
        </ButtonLink>
        {p.actor === "borrower" && !p.readOnly && <DelegateDialog link={p.link} lenderName={p.lenderName} inline />}
      </div>
    </>
  );
}

export function BorrowerFlow(p: BorrowerFlowProps) {
  const canWithdraw = p.actor === "borrower" && !p.readOnly;
  const privacy = <PrivacyNote lenderName={p.lenderName} holded={p.holded} link={p.link} canWithdraw={canWithdraw} />;
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop: left column */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-7 bg-soft px-6 py-7 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
        <CoBrand lenderName={p.lenderName} brandColor={p.brandColor} />
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] text-muted">Tu solicitud</div>
          <div className="text-lg font-semibold leading-tight tracking-[-0.02em]">{p.companyName}</div>
          <div className="text-sm text-ink-2">{p.requestLine}</div>
          {p.actor === "delegate" && <div className="mt-1 text-[13px] text-accent">Aportas la documentación en nombre de la empresa.</div>}
        </div>
        <StepTimeline items={p.checklist.items} current={p.current} allDone={p.checklist.allRequiredDone} />
        <div className="grow" />
        {privacy}
      </aside>

      {/* Phones: co-brand + "Pasos" sheet */}
      <header className="flex items-center gap-3 bg-soft px-4 py-3 lg:hidden">
        <div className="min-w-0 grow"><CoBrand lenderName={p.lenderName} brandColor={p.brandColor} /></div>
        <MobileSteps items={p.checklist.items} current={p.current} allDone={p.checklist.allRequiredDone} footer={privacy} />
      </header>

      <main className={cx("flex min-w-0 grow flex-col px-4 pt-6 sm:px-10 lg:px-14 lg:pt-10", p.floating ? "pb-36" : "pb-16")}>
        <div className="flex w-full max-w-[640px] flex-col gap-6">
          <Progress current={p.current} checklist={p.checklist} />
          {p.checklist.items.length === 0 ? (
            <p className="text-base text-ink-2">{p.lenderName} no ha pedido ningún documento en esta solicitud. No tienes que hacer nada más.</p>
          ) : p.current === REVIEW ? (
            <ReviewStep p={p} />
          ) : (
            <CurrentStep p={p} />
          )}
        </div>
      </main>
      {p.floating}
    </div>
  );
}
