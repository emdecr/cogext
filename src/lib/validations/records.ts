// ============================================================================
// RECORD VALIDATION SCHEMAS
// ============================================================================
//
// Zod schemas for validating record data at the boundary — when user input
// arrives before it touches the database. Each schema defines:
//   1. The shape of valid data (which fields, what types)
//   2. Constraints (min length, required vs optional, allowed values)
//   3. Error messages (what to show the user when validation fails)
//
// We also export TypeScript types inferred from these schemas using
// z.infer<>. This means we define the shape ONCE and get both runtime
// validation AND compile-time type safety.
// ============================================================================

import { z } from "zod";

// The allowed record types — must match our Postgres ENUM in schema.ts.
// We define it here as a const array so we can use it in both the Zod
// schema and anywhere else we need the list (e.g., a dropdown in the UI).
export const RECORD_TYPES = [
  "image",
  "quote",
  "article",
  "link",
  "note",
] as const;

// ============================================================================
// CREATE RECORD
// ============================================================================
// Used when a user saves a new record. Different record types have
// different required fields:
//   - A "note" needs content but not a sourceUrl
//   - A "link" needs a sourceUrl
//   - An "image" needs imagePath (handled separately via file upload)
//   - A "quote" needs content (the quote text)
//
// For now we keep validation simple — we'll add conditional logic
// (e.g., "sourceUrl is required when type is 'link'") in a later pass
// using Zod's .refine() or .superRefine() methods.

export const createRecordSchema = z.object({
  // z.enum() restricts the value to the exact strings in the array.
  // Anything else (like "banana") will fail validation.
  type: z.enum(RECORD_TYPES, {
    // Custom error message when an invalid type is provided.
    errorMap: () => ({ message: "Please select a valid record type" }),
  }),

  // .trim() removes leading/trailing whitespace before validation.
  // .optional() means the field can be undefined (not provided at all).
  // This is different from .nullable() which allows null.
  // We use optional because the form might not include a title field,
  // and the AI can auto-generate titles later.
  title: z.string().trim().optional(),

  // Content is required and must be at least 1 character after trimming.
  // .min(1) after .trim() effectively means "not empty or only whitespace."
  content: z
    .string()
    .trim()
    .min(1, "Content is required"),

  // URL validation: .url() checks that it's a valid URL format.
  // .optional() because not all record types have a source URL.
  // The empty string check with .or() handles the case where the form
  // sends an empty string for an unfilled URL field — we transform
  // that to undefined so it becomes null in the database.
  sourceUrl: z
    .url("Please enter a valid URL")
    .optional()
    .or(z.literal("")),

  // User's personal note/annotation on the record.
  note: z.string().trim().optional(),

  // Path to uploaded image in storage (e.g., "/uploads/abc-123.jpg").
  // Set by the upload API route, not by the user directly.
  // Optional because only image-type records have this.
  imagePath: z.string().optional(),
});

// Infer the TypeScript type from the schema.
// This is equivalent to writing the type manually, but stays in sync
// automatically if we change the schema.
export type CreateRecordInput = z.infer<typeof createRecordSchema>;

// ============================================================================
// UPDATE RECORD
// ============================================================================
// .partial() makes ALL fields optional — you only need to send the
// fields you want to change. This is how PATCH-style updates work:
// send { title: "New Title" } and only the title changes.
//
// We extend it with a required `id` field since you need to know
// WHICH record to update.

export const updateRecordSchema = createRecordSchema.partial().extend({
  id: z.uuid("Invalid record ID"),
});

export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;

// ============================================================================
// DELETE RECORD
// ============================================================================
// Simple — just need the ID.

export const deleteRecordSchema = z.object({
  id: z.uuid("Invalid record ID"),
});

export type DeleteRecordInput = z.infer<typeof deleteRecordSchema>;
