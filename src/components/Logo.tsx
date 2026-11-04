export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink-900 ${className}`}>
      <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#2a4ee0" />
        <ellipse cx="16" cy="16" rx="11" ry="5" fill="none" stroke="#fff" strokeWidth="2" transform="rotate(-25 16 16)" />
        <circle cx="16" cy="16" r="4" fill="#fff" />
      </svg>
      Orbita
    </span>
  );
}
