import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/kommand";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
