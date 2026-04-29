interface Props {
  href: string;
  compact?: boolean;
}

export function SefariaLink({ href, compact = false }: Props) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title="פתח בספריא ללימוד הפסוק"
      className="inline-flex items-center gap-1 rounded-full bg-[var(--bg)] px-2 py-0.5 font-sans text-[var(--deep)] hover:bg-[var(--gold)] hover:text-white"
    >
      <span>ספריא</span>
      {!compact && <ExternalIcon />}
    </a>
  );
}

function ExternalIcon() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2.5h-2v7h7v-2" />
      <path d="M7 2.5h2.5V5" />
      <path d="M9.5 2.5L5.5 6.5" />
    </svg>
  );
}
