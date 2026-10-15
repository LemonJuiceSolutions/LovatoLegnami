"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth";
import { changeOwnPassword } from "@/server/auth/password-store";
import { runAction, type ActionResult } from "./result";

/** Cambio della propria password (menu utente dell'area interna): qualsiasi utente attivo. */

const Schema = z.object({ current: z.string().max(1024), next: z.string().max(1024) });

export async function changeOwnPasswordAction(input: { current: string; next: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireUser();
    const v = Schema.parse(input);
    await changeOwnPassword(await getDb(), user.id, v.current, v.next);
    return null;
  });
}
