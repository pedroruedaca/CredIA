/** Privacy notice for the companies that receive a link (public; linked from the portal). Copy: src/content/data-protection.es.ts. */
import { Logo } from "@/components/Logo";
import { PRIVACY_NOTICE as N } from "@/content/data-protection.es";

export const metadata = { title: "Privacidad · credIA" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-8">
      <Logo />
      <h1 className="heading-page mt-10">{N.title}</h1>
      <p className="mt-2 font-mono text-xs text-muted">{N.updated}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-ink-2">{N.intro}</p>
      <div className="mt-10 flex flex-col gap-8">
        {N.sections.map((s) => (
          <section key={s.heading} className="flex flex-col gap-2">
            <h2 className="heading-section">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="text-[15px] leading-relaxed text-ink-2">{p}</p>
            ))}
            {"list" in s && (
              <ul className="list-disc pl-5 text-[15px] leading-relaxed text-ink-2">
                {s.list.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
