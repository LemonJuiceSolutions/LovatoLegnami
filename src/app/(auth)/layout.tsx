import type { Metadata } from "next"

/** Pagine di accesso (P6): fuori dal sito pubblico e dall'area interna, mai indicizzate. */
export const metadata: Metadata = {
  title: "Accesso – LOVATO LEGNAMI",
  robots: { index: false, follow: false },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-sm">
        <p className="mb-1 text-xs font-semibold tracking-widest text-muted-foreground">LOVATO LEGNAMI</p>
        {children}
      </div>
    </main>
  )
}
