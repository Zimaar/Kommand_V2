-- Enable pgvector extension (must run before any table with vector columns)
CREATE EXTENSION IF NOT EXISTS vector;

-- IVFFlat index on memories.embedding for fast cosine similarity search.
-- This runs AFTER the memories table is created by the main migration.
-- If the table doesn't exist yet, drizzle-kit migrate will run migrations in order.
-- Run this file manually or via db:migrate after 0001_schema.sql.
CREATE INDEX IF NOT EXISTS memories_embedding_idx
  ON memories
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
