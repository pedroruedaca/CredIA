import { Logo } from "@/components/Logo";
import { LOGIN_COPY } from "@/content/login.es";
import { authProviders, parseLinkError } from "@/lib/auth/login";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Acceder · credIA" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Logo />
          <h1 className="heading-page mt-4">{LOGIN_COPY.title}</h1>
          <p className="text-[17px] text-ink-2">{LOGIN_COPY.intro}</p>
        </div>
        <LoginForm next={safeNextPath(next)} providers={authProviders(process.env.CREDIA_AUTH_PROVIDERS)} problem={parseLinkError(error)} />
      </div>
    </main>
  );
}
