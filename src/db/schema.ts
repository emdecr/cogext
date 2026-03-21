// ============================================================================
// DATABASE SCHEMA
// ============================================================================
//
// This file defines every table in our database using Drizzle's schema API.
// It serves double duty:
//   1. It's the source of truth for our database structure (used by Drizzle Kit
//      to generate SQL migrations).
//   2. It generates TypeScript types automatically — so when we query a table,
//      TypeScript knows exactly what fields we get back.
//
// When you change this file (add a column, rename a table, etc.), you run
// `npx drizzle-kit generate` and Drizzle creates a SQL migration file
// describing the change. Then `npx drizzle-kit migrate` applies it to
// your actual database.
// ============================================================================

import { relations } from "drizzle-orm";
import {
  pgTable,    // creates a Postgres table definition
  uuid,       // UUID column type (e.g., '550e8400-e29b-41d4-a716-446655440000')
  text,       // variable-length text (no length limit in Postgres)
  boolean,    // true/false
  timestamp,  // date + time
  date,       // date only (no time)
  integer,    // whole number
  pgEnum,     // Postgres ENUM type (a column restricted to specific values)
  jsonb,      // JSON stored in binary format (queryable, indexable)
  primaryKey, // composite primary key (for join tables)
  vector,     // pgvector column — stores embeddings as arrays of floats
} from "drizzle-orm/pg-core";

// ============================================================================
// ENUMS
// ============================================================================
// Postgres ENUMs are custom types that restrict a column to a set of values.
// Think of them like TypeScript union types, but enforced at the database level.
// If you try to insert "banana" into a recordType column, Postgres will reject it.

// The types of content a user can save.
export const recordTypeEnum = pgEnum("record_type", [
  "image",
  "quote",
  "article",
  "link",
  "note",
]);

// Conversation scope — what subset of records the AI should search.
export const scopeTypeEnum = pgEnum("scope_type", [
  "all",
  "collection",
  "tag",
  "date_range",
]);

// Who sent a message in a conversation.
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

// ============================================================================
// USERS
// ============================================================================
// The users table. Every other table references back to this via user_id.

export const users = pgTable("users", {
  // uuid() creates a UUID column. .primaryKey() makes it the table's PK.
  // .defaultRandom() tells Postgres to auto-generate a UUID if we don't
  // provide one on insert — using gen_random_uuid() under the hood.
  id: uuid("id").primaryKey().defaultRandom(),

  // .notNull() means this column MUST have a value — inserts without it
  // will fail. .unique() adds a unique constraint — no two users can have
  // the same email.
  email: text("email").notNull().unique(),

  // The bcrypt hash of the user's password. We NEVER store raw passwords.
  passwordHash: text("password_hash").notNull(),

  // .defaultNow() sets the value to the current timestamp on insert.
  // We use "with time zone" (timestamptz) so Postgres stores the UTC offset.
  // Without it, Postgres assumes the server's timezone, which is fragile.
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// RECORDS
// ============================================================================
// The core table — everything a user saves (images, quotes, articles, etc.).

export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Foreign key: links this record to a user.
  // .notNull() means every record MUST belong to a user.
  // .references() creates a FK constraint — Postgres will reject inserts
  // if the user_id doesn't exist in the users table.
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // Uses our enum. Drizzle maps this to the Postgres ENUM type we defined above.
  type: recordTypeEnum("type").notNull(),

  // Nullable by default (no .notNull()) — title can be AI-generated later.
  title: text("title"),

  // The main body: quote text, article excerpt, note body, etc.
  content: text("content").notNull(),

  // Where the content came from (e.g., a URL). Nullable because not
  // everything has a source (like a note you type yourself).
  sourceUrl: text("source_url"),

  // Path to the image in object storage (local filesystem or S3/MinIO).
  // Nullable because only image-type records have this.
  imagePath: text("image_path"),

  // User's personal annotation on the record (separate from content).
  note: text("note"),

  // The embedding vector — 768 floats representing the "meaning" of this
  // record's content. Generated by the embedding model (nomic-embed-text
  // via Ollama). Used by pgvector for semantic search (cosine similarity).
  //
  // Nullable because:
  //   1. Embedding happens async after record creation
  //   2. Ollama might be down — we don't want to block saving
  //   3. Old records created before embeddings existed won't have one yet
  embedding: vector("embedding", { dimensions: 768 }),

  // Which model generated the embedding above. Stored so we know:
  //   1. Whether a record needs re-embedding after a model switch
  //   2. Which records are comparable (same model = same vector space)
  //
  // Example values: "nomic-embed-text", "text-embedding-3-small"
  // When switching models, a migration script can query:
  //   SELECT id FROM records WHERE embedding_model != 'new-model-name'
  //   → those are the records that need re-embedding
  embeddingModel: text("embedding_model"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),

  // updatedAt doesn't auto-update in Postgres (unlike MySQL).
  // We'll need to set this manually in our app code on updates,
  // or add a database trigger later.
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// TAGS
// ============================================================================
// Tags can be user-created ("recipes") or AI-generated ("contains-code").
// They're shared across all users — the connection to records happens
// through the record_tags join table below.

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: text("name").notNull().unique(),

  // Distinguishes AI-suggested tags from user-created ones.
  // Useful for UI (show AI tags differently) and for letting users
  // delete AI tags without affecting their manually created ones.
  isAi: boolean("is_ai").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// RECORD_TAGS (Join Table)
// ============================================================================
// A "join table" (also called a "junction table" or "bridge table") connects
// two tables in a many-to-many relationship:
//   - One record can have many tags
//   - One tag can belong to many records
//
// Without this table, you'd have to either:
//   - Put a tag_id on records (but then a record can only have ONE tag)
//   - Put a record_id on tags (but then a tag can only belong to ONE record)
//
// The join table solves this by storing pairs of (record_id, tag_id).

export const recordTags = pgTable(
  "record_tags",
  {
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  // This table has a COMPOSITE primary key — the combination of both columns
  // is the PK. This means the same tag can't be applied to the same record
  // twice, but the same tag CAN appear in multiple rows (for different records).
  (table) => [primaryKey({ columns: [table.recordId, table.tagId] })],
);

// ============================================================================
// COLLECTIONS
// ============================================================================
// User-created groups of records (like folders or albums).
// e.g., "Design Inspiration", "Recipes to Try", "Work Research"

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  name: text("name").notNull(),

  description: text("description"),

  // Path to a cover image in object storage.
  coverImage: text("cover_image"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// COLLECTION_RECORDS (Join Table)
// ============================================================================
// Another many-to-many: a collection has many records, a record can be in
// many collections. The `position` column lets users manually order records
// within a collection (drag-and-drop reordering).

export const collectionRecords = pgTable(
  "collection_records",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id),

    // For manual ordering within a collection. Lower = first.
    // We use integers with gaps (10, 20, 30...) so inserting between
    // two items doesn't require renumbering everything.
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.recordId] })],
);

// ============================================================================
// AI_PROFILE
// ============================================================================
// Stores the AI's learned understanding of the user — interests, patterns,
// recurring themes. This is built up over time as the user saves records
// and has conversations. Used to personalize AI responses and reflections.

export const aiProfile = pgTable("ai_profile", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // JSONB stores arbitrary JSON. Unlike a regular JSON column, JSONB is
  // stored in a binary format that Postgres can index and query into.
  // We use it here because the profile structure will evolve over time —
  // we don't want to add a new column every time we track a new pattern.
  profileData: jsonb("profile_data").notNull().default({}),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// CONVERSATIONS
// ============================================================================
// A conversation is a chat session between the user and the AI.
// Each conversation can be scoped to a subset of records (e.g., "only
// search within my 'Design' collection" or "only look at records
// tagged 'architecture'").

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  title: text("title").notNull(),

  // What subset of records the AI should search for context.
  scope: scopeTypeEnum("scope_type").notNull().default("all"),

  // The value that goes with the scope. For "collection" scope, this is
  // the collection ID. For "tag", it's the tag name. For "all", it's null.
  scopeValue: text("scope_value"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// MESSAGES
// ============================================================================
// Individual messages within a conversation. Stored in order so we can
// reconstruct the conversation history for the AI context window.

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),

  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),

  // "user" or "assistant" — maps to the standard LLM message format.
  role: messageRoleEnum("role").notNull(),

  content: text("content").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// REFLECTIONS
// ============================================================================
// AI-generated weekly reflections — summaries of what the user saved,
// patterns noticed, connections between records, etc.

export const reflections = pgTable("reflections", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  // The reflection content (markdown).
  content: text("content").notNull(),

  // The time period this reflection covers.
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),

  // Has the user seen this reflection?
  isRead: boolean("is_read").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// RELATIONS
// ============================================================================
// Drizzle relations don't change the database — they're a TypeScript-only
// concept that tells Drizzle how tables connect. This enables the
// "relational query" API where you can do things like:
//
//   db.query.users.findFirst({
//     with: { records: true }  // auto-joins and returns nested records
//   })
//
// Without relations defined, you'd have to write manual joins every time.

export const usersRelations = relations(users, ({ many }) => ({
  // A user has many records, collections, conversations, and reflections.
  records: many(records),
  collections: many(collections),
  conversations: many(conversations),
  reflections: many(reflections),
}));

export const recordsRelations = relations(records, ({ one, many }) => ({
  // Each record belongs to one user. We specify the field/reference pair
  // so Drizzle knows which columns to join on.
  user: one(users, {
    fields: [records.userId],
    references: [users.id],
  }),
  // A record can have many tags (through the join table).
  recordTags: many(recordTags),
  // A record can be in many collections (through the join table).
  collectionRecords: many(collectionRecords),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  recordTags: many(recordTags),
}));

export const recordTagsRelations = relations(recordTags, ({ one }) => ({
  // Each row in the join table points to exactly one record and one tag.
  record: one(records, {
    fields: [recordTags.recordId],
    references: [records.id],
  }),
  tag: one(tags, {
    fields: [recordTags.tagId],
    references: [tags.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, {
    fields: [collections.userId],
    references: [users.id],
  }),
  collectionRecords: many(collectionRecords),
}));

export const collectionRecordsRelations = relations(
  collectionRecords,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionRecords.collectionId],
      references: [collections.id],
    }),
    record: one(records, {
      fields: [collectionRecords.recordId],
      references: [records.id],
    }),
  }),
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const reflectionsRelations = relations(reflections, ({ one }) => ({
  user: one(users, {
    fields: [reflections.userId],
    references: [users.id],
  }),
}));
