"use client";

import { ErrorLine } from "@/components/states/ErrorLine";

export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-10">
      <ErrorLine message="Algo ha fallado al cargar la página." reset={reset} />
    </main>
  );
}
