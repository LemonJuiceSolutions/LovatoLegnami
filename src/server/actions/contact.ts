"use server";

import { headers } from "next/headers";
import type { ContactResult } from "@/components/site/contact-validation";
import { contactFromFormData, submitContact } from "@/server/site/contact";

/** Server action del form Contatti del sito (11.4): logica in `server/site/contact.ts`. */
export async function sendContactMessage(formData: FormData): Promise<ContactResult> {
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "sconosciuto";
  return submitContact(contactFromFormData(formData), { ip });
}
