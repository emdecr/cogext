// ============================================================================
// RECORD SERVER ACTIONS
// ============================================================================
//
// Server Actions are async functions that run on the server but can be called
// directly from client components. They're Next.js's answer to the question:
// "How do I mutate data without writing an API route?"
//
// The "use server" directive at the top marks EVERY exported function in
// this file as a server action. When a client component imports and calls
// one of these functions, Next.js:
//   1. Serializes the arguments
//   2. Sends them to the server via a POST request (automatic)
//   3. Runs the function on the server
//   4. Serializes the return value
//   5. Sends it back to the client
//
// This means these functions can safely access the database, read cookies,
// and do other server-only things — even though they're called from the
// browser.
//
// IMPORTANT: Because these are callable from the client, we MUST validate
// all input. A malicious user could call these functions directly with
// crafted data (bypassing the form). That's why we use Zod here.
// ============================================================================

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, desc, and } from "drizzle-orm";

import { db } from "@/db";
import { records, recordTags, collectionRecords } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { embedRecord } from "@/lib/ai/embed-record";
import { analyzeImage } from "@/lib/ai/analyze-image";
import { getLLMProvider } from "@/lib/ai";
import { addTagToRecord } from "@/lib/actions/tags";
import {
  createRecordSchema,
  updateRecordSchema,
  deleteRecordSchema,
  type CreateRecordInput,
} from "@/lib/validations/records";

// ============================================================================
// HELPER: Get the current user ID or throw
// ============================================================================
// Every action needs the user's ID. This helper centralizes the auth check
// so we don't repeat it in every function. If there's no session, the user
// shouldn't be able to call these actions at all (middleware blocks the page),
// but we check anyway as defense in depth.

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session.userId;
}

// ============================================================================
// ACTION RESULT TYPE
// ============================================================================
// Server actions return this shape so the UI can handle success and error
// states consistently. We include field-level errors so forms can show
// error messages next to the right input.
//
// Why not just throw errors? Because server actions serialize their return
// value back to the client. Thrown errors become generic "server error"
// messages. By returning a structured result, we keep control over what
// the client sees.

type ActionResult = {
  success: boolean;
  error?: string;                           // General error message
  fieldErrors?: Record<string, string[]>;   // Per-field validation errors
  recordId?: string;                        // ID of created/updated record
};

// ============================================================================
// CREATE RECORD
// ============================================================================
// Called when the user submits the "new record" form.
//
// Flow:
//   1. Verify the user is logged in
//   2. Validate the input with Zod
//   3. Insert into database
//   4. Revalidate the dashboard so it shows the new record
//   5. Return success

export async function createRecord(
  input: CreateRecordInput,
): Promise<ActionResult> {
  // Step 1: Auth check
  const userId = await requireUserId();

  // Step 2: Validate input
  // safeParse returns { success: true, data } or { success: false, error }
  // instead of throwing. This lets us return structured errors to the form.
  const parsed = createRecordSchema.safeParse(input);

  if (!parsed.success) {
    // .flatten() converts Zod's nested error format into a simpler
    // { fieldErrors: { title: ["Too short"], content: ["Required"] } }
    // shape that's easy to display in a form.
    return {
      success: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // Step 3: Insert into database
  // parsed.data is the validated, typed input — safe to use.
  try {
    // .returning() gives us the inserted row back, including the
    // auto-generated ID. We need the ID to link tags to the record.
    const [created] = await db
      .insert(records)
      .values({
        userId,
        type: parsed.data.type,
        title: parsed.data.title || null,
        content: parsed.data.content,
        sourceUrl: parsed.data.sourceUrl || null,
        sourceAuthor: parsed.data.sourceAuthor || null,
        note: parsed.data.note || null,
        imagePath: parsed.data.imagePath || null,
      })
      .returning();

    // Step 4: AI processing (async, non-blocking)
    // We kick off AI enhancement in the background. These run AFTER we
    // return success — the record is already saved and visible to the
    // user immediately. AI features layer on asynchronously.
    //
    // For non-image records: embed + tag run in parallel (independent).
    // For image records: we sequence them — analyze first, THEN embed + tag.
    //
    // WHY the different sequencing for images?
    //   embedRecord() re-fetches the record from the database before embedding.
    //   If we fired analysis and embedding at the same time, the embedding
    //   would grab "Image" (the placeholder) before the description lands.
    //   By awaiting analysis first and writing the description to the DB,
    //   the embedding step will always see the rich description.
    //
    //   Timeline for image records (all background, user sees none of this):
    //     0ms:      Record saved with content = "Image" (or user description)
    //     0ms:      Return success to user ← user sees "Record saved" here
    //     ~1-3s:    Claude Vision analyzes the image → description generated
    //     ~1-3s:    DB updated with rich description
    //     ~1-4s:    Embedding generated from description → stored in DB
    //     ~2-8s:    AI tags generated from description → linked to record
    //
    //   Timeline for other record types (parallel, faster):
    //     0ms:      Return success to user
    //     ~100ms:   Embedding generated
    //     ~1-5s:    AI tags generated

    const isImageRecord =
      parsed.data.type === "image" && !!parsed.data.imagePath;

    if (isImageRecord) {
      // Image path: analyze → update content → embed + tag in sequence
      (async () => {
        try {
          // ---- 1. Analyze the image with Claude Vision ----
          const description = await analyzeImage(parsed.data.imagePath!, userId);

          // ---- 2. Update the record's content with the description ----
          // Only update if we actually got a description back. If analysis
          // failed or was skipped (no API key), keep whatever the user typed.
          if (description) {
            await db
              .update(records)
              .set({ content: description, updatedAt: new Date() })
              .where(eq(records.id, created.id));
          }

          // ---- 3. Embed the record ----
          // embedRecord() re-fetches the record from DB, so it picks up
          // the description we just wrote. This is intentional — the
          // embedding should represent the AI-generated description.
          await embedRecord(created.id);

          // ---- 4. Generate AI tags ----
          // Use the description (if we got one) or fall back to whatever
          // content was saved. Tags based on a real description are much
          // better than tags based on "Image".
          const contentForTagging = description || parsed.data.content;
          const llm = await getLLMProvider();
          const aiTags = await llm.generateTags(
            contentForTagging,
            parsed.data.type,
          );

          await Promise.all(
            aiTags.map((tagName) =>
              addTagToRecord(created.id, tagName, true, true),
            ),
          );
        } catch (err) {
          console.error("Background image AI processing failed:", err);
        }
      })();
    } else {
      // Non-image path: embedding and tagging are independent, run in parallel.
      // Neither depends on the other's result, so no sequencing needed.

      // Generate embedding for semantic search
      embedRecord(created.id).catch((err) =>
        console.error("Background embed failed:", err),
      );

      // Generate AI tags
      (async () => {
        try {
          const llm = await getLLMProvider();
          const aiTags = await llm.generateTags(
            parsed.data.content,
            parsed.data.type,
          );

          await Promise.all(
            aiTags.map((tagName) =>
              addTagToRecord(created.id, tagName, true, true),
            ),
          );
        } catch (err) {
          console.error("Background AI tagging failed:", err);
        }
      })();
    }

    // Step 5: Revalidate the dashboard
    // Next.js caches rendered pages. When we add a new record, the cached
    // dashboard is stale. revalidatePath() tells Next.js to re-render
    // the page on the next request so it includes the new record.
    revalidatePath("/dashboard");

    return { success: true, recordId: created.id };
  } catch (error) {
    console.error("Failed to create record:", error);
    return {
      success: false,
      error: "Failed to create record. Please try again.",
    };
  }
}

// ============================================================================
// GET RECORDS
// ============================================================================
// Fetches all records for the current user, newest first.
// This is a server action but it's more of a "read" operation.
// We could also do this directly in a server component, but having it
// here keeps all record operations in one place.
//
// Note: This returns the actual data (not an ActionResult) because
// reads don't have the same error UX needs as writes.

export async function getRecords() {
  const userId = await requireUserId();

  // Using the relational query API here instead of .select().from()
  // because we need to include tags through the join table.
  //
  // This generates a query like:
  //   SELECT records.*, record_tags.*, tags.*
  //   FROM records
  //   LEFT JOIN record_tags ON records.id = record_tags.record_id
  //   LEFT JOIN tags ON record_tags.tag_id = tags.id
  //   WHERE records.user_id = ?
  //   ORDER BY records.created_at DESC
  //
  // The `with` option follows the relations we defined in schema.ts,
  // nesting the results automatically.
  const userRecords = await db.query.records.findMany({
    where: eq(records.userId, userId),
    orderBy: desc(records.createdAt),
    with: {
      recordTags: {
        with: {
          tag: true, // follow through join table to the actual tag
        },
      },
    },
  });

  return userRecords;
}

// ============================================================================
// GET SINGLE RECORD
// ============================================================================
// Fetches one record by ID. Used for the detail modal/page.
// We check that the record belongs to the current user — without this,
// a user could guess another user's record ID and see their data.

export async function getRecord(id: string) {
  const userId = await requireUserId();

  const record = await db.query.records.findFirst({
    where: and(eq(records.id, id), eq(records.userId, userId)),
  });

  return record || null;
}

// ============================================================================
// UPDATE RECORD
// ============================================================================
// Partial update — only changes the fields that are provided.
//
// Flow:
//   1. Auth check
//   2. Validate input (Zod's partial schema — all fields optional except id)
//   3. Verify the record exists AND belongs to this user
//   4. Update only the provided fields
//   5. Revalidate the dashboard

export async function updateRecord(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = updateRecordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // Extract the id separately from the fields to update.
  // We don't want to accidentally set id as a column value.
  const { id, ...updates } = parsed.data;

  try {
    // Verify ownership: the WHERE clause includes BOTH the record ID
    // and the user ID. If the record doesn't belong to this user,
    // the update affects 0 rows (silently does nothing).
    // This is the same pattern as getRecord — always scope by userId.
    const result = await db
      .update(records)
      .set({
        ...updates,
        // Convert empty strings to null for optional fields
        sourceUrl: updates.sourceUrl || null,
        sourceAuthor: updates.sourceAuthor || null,
        note: updates.note || null,
        title: updates.title || null,
        // Manually set updatedAt since Postgres doesn't auto-update it
        updatedAt: new Date(),
      })
      .where(and(eq(records.id, id), eq(records.userId, userId)))
      .returning();

    if (result.length === 0) {
      return {
        success: false,
        error: "Record not found",
      };
    }
  } catch (error) {
    console.error("Failed to update record:", error);
    return {
      success: false,
      error: "Failed to update record. Please try again.",
    };
  }

  revalidatePath("/dashboard");

  return { success: true };
}

// ============================================================================
// DELETE RECORD
// ============================================================================
// Permanently deletes a record. Like update, we scope by userId so
// users can only delete their own records.

export async function deleteRecord(id: string): Promise<ActionResult> {
  const userId = await requireUserId();

  const parsed = deleteRecordSchema.safeParse({ id });

  if (!parsed.success) {
    return { success: false, error: "Invalid record ID" };
  }

  try {
    // Delete join table rows first — Postgres enforces foreign keys,
    // so we can't delete the record while record_tags or
    // collection_records still reference it.
    await db
      .delete(recordTags)
      .where(eq(recordTags.recordId, parsed.data.id));
    await db
      .delete(collectionRecords)
      .where(eq(collectionRecords.recordId, parsed.data.id));

    const result = await db
      .delete(records)
      .where(and(eq(records.id, parsed.data.id), eq(records.userId, userId)))
      .returning();

    if (result.length === 0) {
      return { success: false, error: "Record not found" };
    }
  } catch (error) {
    console.error("Failed to delete record:", error);
    return {
      success: false,
      error: "Failed to delete record. Please try again.",
    };
  }

  revalidatePath("/dashboard");

  return { success: true };
}
