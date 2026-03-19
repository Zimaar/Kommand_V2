-- Runs once when the Postgres container is first created.
-- Enables the pgvector extension in the kommand database.
CREATE EXTENSION IF NOT EXISTS vector;
