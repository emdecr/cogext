// ============================================================================
// (app) LAYOUT
// ============================================================================
//
// Wraps every authenticated page in the (app) route group. Its main job is to
// host the `@modal` parallel route slot used by the record intercepting route
// (src/app/(app)/@modal/(.)records/[id]/...).
//
// How the intercept works:
//   - A <Link href="/records/[id]"> clicked from within (app) (e.g. the
//     dashboard grid) is intercepted by @modal/(.)records/[id], which renders
//     the record detail in a Dialog OVER the current page — the URL updates
//     but the underlying page stays mounted (Instagram-style).
//   - A direct visit / refresh / shared link is NOT intercepted, so it renders
//     the real standalone page at src/app/(app)/records/[id]/page.tsx.
//   - When no modal is active, @modal/default.tsx renders null.
// ============================================================================

export default function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
