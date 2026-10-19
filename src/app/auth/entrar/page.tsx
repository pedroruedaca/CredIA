import { Logo } from "@/components/Logo";
import { ENTER_COPY } from "@/content/login.es";
import { EnterButton } from "./EnterButton";

export const metadata = { title: "Entrar · credIA", robots: { index: false, follow: false } };

/** Landing page of the sign-in button in welcome and invitation emails. The token stays in the fragment (EnterButton). */
export default function EnterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Logo />
          <h1 className="heading-page mt-4">{ENTER_COPY.title}</h1>
          <p className="text-[17px] text-ink-2">{ENTER_COPY.intro}</p>
        </div>
        <EnterButton />
      </div>
    </main>
  );
}
