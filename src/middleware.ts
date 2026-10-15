import NextAuth from "next-auth";
import { authConfig } from "@/server/auth/auth.config";
import { guard } from "@/server/auth/route-guard";

/**
 * Middleware edge (P6): verifica solo il JWT di sessione (configurazione senza adapter)
 * e reindirizza; i permessi si controllano sul server con `requireUser`. Il `matcher`
 * elenca le aree interne: sito pubblico, `/api/preventivo/**`, `/api/auth/**` e asset
 * non passano dal middleware.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => guard(req, Boolean(req.auth?.user)));

export const config = {
  matcher: ["/dashboard/:path*", "/configuratore/:path*", "/ai/:path*", "/admin/:path*", "/api/admin/:path*", "/api/ai/:path*"],
};
