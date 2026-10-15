"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { ROLES, requireUser } from "@/server/auth";
import { resetPasswordById } from "@/server/auth/password-store";
import * as repo from "@/server/repositories/users";
import { runAction, type ActionResult } from "./result";

/** Gestione utenti (7.5): ogni azione richiede `utenti:gestisci` (solo admin), verificato sul server. */

const Id = z.string().min(1).max(100);
const RoleSchema = z.enum(ROLES);
const CreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("email non valida").max(254),
  name: z.string().trim().max(120).nullable().optional(),
  role: RoleSchema,
});

export async function listUsersAction(): Promise<ActionResult<repo.UserSummary[]>> {
  return runAction(async () => {
    await requireUser("utenti:gestisci");
    return repo.list();
  });
}

export async function createUserAction(input: { email: string; name?: string | null; role: string }): Promise<ActionResult<repo.UserSummary>> {
  return runAction(async () => {
    const actor = await requireUser("utenti:gestisci");
    const v = CreateSchema.parse(input);
    return repo.create(v.email, v.name ?? null, v.role, actor.id);
  });
}

export async function setUserActiveAction(id: string, active: boolean): Promise<ActionResult<repo.UserSummary>> {
  return runAction(async () => {
    const actor = await requireUser("utenti:gestisci");
    return repo.setActive(Id.parse(id), z.boolean().parse(active), actor.id);
  });
}

export async function setUserRoleAction(id: string, role: string): Promise<ActionResult<repo.UserSummary>> {
  return runAction(async () => {
    const actor = await requireUser("utenti:gestisci");
    return repo.setRole(Id.parse(id), RoleSchema.parse(role), actor.id);
  });
}

/**
 * Reimposta la password di un altro utente: ne genera una casuale, restituita **una sola
 * volta** all'amministratore (non è salvata in chiaro da nessuna parte). Registrata nel registro.
 */
export async function resetUserPasswordAction(id: string): Promise<ActionResult<{ email: string; password: string }>> {
  return runAction(async () => {
    const actor = await requireUser("utenti:gestisci");
    const r = await resetPasswordById(await getDb(), Id.parse(id), actor.id);
    return { email: r.email, password: r.generated };
  });
}
