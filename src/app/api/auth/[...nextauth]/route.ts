import { handlers } from "@/server/auth/auth";

// Auth.js (P6): adapter Drizzle e invio email ⇒ runtime Node. CSRF, cookie e
// redirect sono quelli predefiniti di Auth.js.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = handlers;
