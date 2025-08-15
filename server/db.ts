import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

console.log('🔄 Initializing database connection...');
const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client, { schema });
console.log('✅ Database connected successfully');