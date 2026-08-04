/** Line icons at 14px. Icons replace glyph characters so buttons stay legible at small sizes. */

const S = ({ children, size = 14 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const Icon = {
  left: () => <S><path d="M10 3 5 8l5 5" /></S>,
  right: () => <S><path d="M6 3l5 5-5 5" /></S>,
  x: () => <S><path d="M4 4l8 8M12 4l-8 8" /></S>,
  pin: () => <S><path d="M6 2.5h4M7 2.8v3L4.5 8.3h7L9 5.8v-3M8 8.5V13" /></S>,
  cycle: () => <S><path d="M13 7a5 5 0 1 0-.6 3.4M13 3.5V7h-3.4" /></S>,
  shown: () => <S><path d="M1.6 8S4 4 8 4s6.4 4 6.4 4-2.4 4-6.4 4-6.4-4-6.4-4Z" /><circle cx="8" cy="8" r="1.7" /></S>,
  hidden: () => <S><path d="M2 2l12 12M6.3 6.4A2 2 0 0 0 8 10a2 2 0 0 0 1.6-.8M4.2 4.7C2.6 5.9 1.6 8 1.6 8s2.4 4 6.4 4c1.2 0 2.2-.3 3.1-.8M9.4 4.2A6.7 6.7 0 0 0 8 4" /></S>,
  open: () => <S><path d="M9 3.5h3.5V7M12.2 3.8 7.5 8.5M11 9.5v3H3.5v-9h3" /></S>,
  down: () => <S><path d="M8 3v8M4.5 7.5 8 11l3.5-3.5M3 13h10" /></S>,
  enter: () => <S><path d="M12.5 3.5v4a2 2 0 0 1-2 2H4M6.5 7 4 9.5 6.5 12" /></S>,
  ship: () => <S><path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M2.5 12.5h11" /></S>,
  help: () => <S><circle cx="8" cy="8" r="6.2" /><path d="M6.3 6.2A1.8 1.8 0 0 1 9.6 7c0 1.2-1.6 1.4-1.6 2.6M8 11.8v.01" /></S>,
  claude: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      {[0, 45, 90, 135].map((a) => (
        <rect key={a} x="7.25" y="1.8" width="1.5" height="12.4" rx="0.75" fill="currentColor" transform={`rotate(${a} 8 8)`} />
      ))}
    </svg>
  ),
  gpt: () => (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden>
      <circle cx="8" cy="8" r="5.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </svg>
  ),
}
