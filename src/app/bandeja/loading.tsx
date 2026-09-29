import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="w-full max-w-[880px] px-4 py-10 sm:px-14 sm:py-12" aria-busy="true" aria-label="Cargando bandeja">
      <Skeleton className="h-12 w-48" />
      <Skeleton className="mt-4 h-5 w-80" />
      <div className="mt-10 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
    </main>
  );
}
