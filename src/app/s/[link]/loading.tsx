import { Skeleton } from "@/components/ui/Skeleton";

/** Borrower page while loading: co-brand, step heading, drop zone. Works at 390px. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-10" aria-busy="true" aria-label="Cargando tu solicitud">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-[12px]" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-10 w-4/5" />
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="h-44 rounded-[24px]" />
    </main>
  );
}
