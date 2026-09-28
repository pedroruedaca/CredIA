export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-serif text-2xl font-semibold tracking-tight ${className}`}>
      cred<span className="text-brand-ia">IA</span>
    </span>
  );
}
