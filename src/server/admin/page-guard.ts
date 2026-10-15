import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can, requirePageUser, type AuthUser, type Permission } from "@/server/auth";
import { PATH_HEADER } from "@/server/auth/route-guard";

/**
 * Guardia delle pagine admin: anonimo ⇒ `/accesso?next=…`, senza **nessuno** dei permessi
 * ⇒ 404. Ogni pagina la chiama (il layout non basta: nelle navigazioni client tra pagine
 * sorelle Next non lo ripete).
 */
export async function requireAdminPage(permissions: readonly Permission[], fallbackPath: string): Promise<AuthUser> {
  const user = await requirePageUser(undefined, headers().get(PATH_HEADER) ?? fallbackPath);
  if (!permissions.some((p) => can(user, p))) notFound();
  return user;
}
