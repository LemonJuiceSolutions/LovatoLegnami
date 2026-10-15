import type { NextRequest } from "next/server";
import { handlers } from "@/server/auth/auth";
import { withForwardedOrigin } from "@/server/auth/forwarded-origin";

// Auth.js (P6): adapter Drizzle e invio email ⇒ runtime Node. CSRF, cookie e
// redirect sono quelli predefiniti di Auth.js. Dietro un proxy (container Docker) l'URL
// della richiesta si ricostruisce dall'host pubblico: vedi `forwarded-origin.ts`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (req: NextRequest) => handlers.GET(withForwardedOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(withForwardedOrigin(req));
