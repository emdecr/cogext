// ============================================================================
// AUTH LAYOUT
// ============================================================================
//
// This layout wraps all pages inside the (auth) route group — login
// and register. Route groups (folders with parentheses) let us apply
// different layouts to different sections of the app without affecting
// the URL structure.
//
// This layout centers the form on the page. The (app) route group
// will have a different layout with navigation, sidebar, etc.
//
// Layout hierarchy in Next.js:
//   app/layout.tsx          ← root layout (wraps EVERYTHING)
//     app/(auth)/layout.tsx ← this file (wraps login + register only)
//     app/(app)/layout.tsx  ← future app layout (wraps dashboard, etc.)
// ============================================================================

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Full viewport height, centered both horizontally and vertically.
    // This gives us the classic "form floating in the middle of the page" look.
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8">{children}</div>
    </div>
  );
}
