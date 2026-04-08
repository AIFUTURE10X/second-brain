import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's `neon()` is a no-op until you actually execute a query, so it's safe
// to construct with a placeholder when DATABASE_URL is missing during build.
// At runtime DATABASE_URL is required and any query will fail loudly if unset.
const url =
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@placeholder.neon.tech/neondb?sslmode=require";

export const db = drizzle(neon(url), { schema });
