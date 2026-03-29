// ============================================================================
// ROOT LAYOUT
// ============================================================================
//
// This wraps EVERY page in the app. It's where we put:
//   - <html> and <body> tags
//   - Global CSS import
//   - Font loading
//   - The dark mode initialization script
//
// The dark mode script runs BEFORE the page paints (because it's in <head>).
// It reads the user's preference from localStorage and sets the `dark` class
// on <html>. Without this, there would be a flash of light theme before
// JavaScript runs — jarring for dark mode users.
// ============================================================================

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CogExt",
  description: "Your personal cognition extension",
};

// This script runs inline in <head> before the page renders.
// It's a string (not a React component) because we need it to execute
// synchronously before any painting happens.
//
// Logic:
//   1. Check localStorage for a saved preference ("light" or "dark")
//   2. If no preference, check the OS setting (prefers-color-scheme)
//   3. Add or remove the "dark" class on <html>
const themeScript = `
  (function() {
    var theme = localStorage.getItem('theme');
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the server doesn't know if dark mode
    // is active (it can't read localStorage), so the server renders
    // without the "dark" class. The script adds it on the client.
    // React would normally warn about this mismatch — this tells
    // React "it's intentional, don't warn."
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
