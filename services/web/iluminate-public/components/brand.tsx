import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <span className="brand-ray brand-ray-left" />
      <span className="brand-ray brand-ray-center" />
      <span className="brand-ray brand-ray-right" />
      <span className="brand-dot" />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Iluminate — Inicio">
      <BrandMark />
      {!compact && <span className="brand-name">iluminate</span>}
    </Link>
  );
}
