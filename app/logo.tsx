// The M is cut out with a mask so the page shows through, and the id is fixed
// because a page carries one header: a duplicate would make the second copy
// reuse the first cut.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      fill="currentColor"
      className={`text-[var(--logo-ink)] ${className ?? ''}`}
    >
      <mask id="mimir-logo-cut">
        <rect width="512" height="512" fill="black" />
        <circle cx="256" cy="256" r="181" fill="none" stroke="white" strokeWidth="34" />
        <circle cx="256" cy="256" r="114" fill="white" />
        <path
          d="M192 310 V202 L256 266 L320 202 V310"
          fill="none"
          stroke="black"
          strokeWidth="30"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <rect width="512" height="512" fill="currentColor" mask="url(#mimir-logo-cut)" />
    </svg>
  )
}
