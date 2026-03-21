// ============================================================================
// REGISTER PAGE
// ============================================================================
//
// This is a CLIENT component ("use client" at the top). In Next.js App
// Router, components are Server Components by default — they render on
// the server and send HTML to the browser. But forms with interactive
// state (loading spinners, error messages, input values) need to run
// in the browser, so we mark them as Client Components.
//
// Server Components: great for static content, data fetching, SEO.
// Client Components: needed for interactivity (useState, onClick, forms).
//
// The "use client" directive at the top tells Next.js: "ship this
// component's JavaScript to the browser so it can handle interactions."
// ============================================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  // ---- State ----
  // useState is React's way of managing data that can change over time.
  // Each call returns [currentValue, setterFunction].
  // When you call the setter, React re-renders the component with the
  // new value.

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Next.js router — lets us navigate programmatically (redirect after
  // successful registration without a full page reload).
  const router = useRouter();

  // ---- Form submission handler ----
  async function handleSubmit(e: React.FormEvent) {
    // preventDefault() stops the browser's default form behavior
    // (which would do a full page reload with a traditional form POST).
    // We handle the request ourselves with fetch() instead.
    e.preventDefault();

    // Clear any previous error and show loading state.
    setError("");
    setLoading(true);

    try {
      // Send the registration data to our API route.
      // fetch() is the browser's built-in HTTP client.
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      // If the API returned an error (4xx or 5xx status), show it.
      if (!response.ok) {
        setError(data.error || "Registration failed");
        return;
      }

      // Success — the API set the session cookie automatically
      // (cookies set in the response are saved by the browser).
      // Redirect to the dashboard.
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      // Always stop the loading state, whether success or failure.
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="mb-8 text-2xl font-bold text-gray-900 dark:text-gray-100">
        Create an account
      </h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            placeholder="At least 8 characters"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Register"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{" "}
        <Link href="/login" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
          Log in
        </Link>
      </p>
    </div>
  );
}
