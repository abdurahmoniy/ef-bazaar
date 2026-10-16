/** Blue disc, gold tick: the platform proved the Konami account is on this address. */
export function VerifiedEmailMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Tasdiqlangan email"
      viewBox="0 0 24 24"
      className={className ?? 'h-4 w-4 shrink-0'}
      fill="none"
    >
      <title>Tasdiqlangan email</title>
      <circle cx="12" cy="12" r="10" className="fill-primary" />
      <path d="M7.5 12.5l3 3 6-6.5" stroke="#FFD633" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
