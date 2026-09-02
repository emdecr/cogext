// ============================================================================
// NOTHING TO SEE HERE ( /nothing-to-see-here )
// ============================================================================
// Where unauthenticated visitors land for any non-public path (see the redirect
// in src/middleware.ts). Deliberately gives nothing away — just a pair of eyes
// glancing off to the side and a shrug. It's a public route (allowlisted in the
// middleware) so it stays reachable while logged out without causing a loop.

export const metadata = {
  title: "Nothing to see here",
};

export default function NothingToSeeHere() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background text-foreground">
      <svg
        viewBox="0 0 160 70"
        role="img"
        aria-label="A pair of eyes glancing away"
        className="w-28 text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        {/* left eye */}
        <ellipse cx="46" cy="35" rx="28" ry="19" />
        <circle cx="54" cy="38" r="8" fill="currentColor" stroke="none" />
        {/* right eye */}
        <ellipse cx="114" cy="35" rx="28" ry="19" />
        <circle cx="122" cy="38" r="8" fill="currentColor" stroke="none" />
      </svg>

      <p className="font-mono text-xs text-gray-500">nothing to see here.</p>
    </main>
  );
}
