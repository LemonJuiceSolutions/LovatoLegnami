import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Benvenuto in Base</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Configura l&apos;AI
          </CardTitle>
          <CardDescription>
            Scegli provider e modello, poi usa l&apos;assistente dal pulsante in basso a destra.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/ai">Impostazioni AI</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
