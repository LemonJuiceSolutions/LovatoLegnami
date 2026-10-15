import { getDb } from "@/db/client";
import { users, type RoleValue } from "@/db/schema";
import { truncateAll } from "@/db/testing";

/** Database del test svuotato (PGlite in memoria del processo, già migrato). */
export async function freshDb() {
  const db = await getDb();
  await truncateAll(db);
  return db;
}

export async function makeUser(email: string, role: RoleValue = "admin", name: string | null = null, active = true) {
  const db = await getDb();
  const [u] = await db.insert(users).values({ email, role, name, active }).returning();
  return u!;
}
