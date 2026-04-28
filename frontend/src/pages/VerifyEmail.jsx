import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck, AlertCircle, ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 gradient-mesh">
      <Card className="w-full max-w-lg shadow-xl border-primary/15">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MailCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Verifica email</CardTitle>
          <CardDescription>Pagina pronta per il flusso di conferma email di PharmaTrack.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {token ? (
            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm">
              <p className="font-semibold mb-1">Token rilevato</p>
              <p className="break-all text-muted-foreground">{token}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <p>Il link di verifica non contiene un token valido. Richiedi una nuova email di conferma oppure torna al login.</p>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">Questa route evita schermate bianche sui link di verifica e fornisce un punto di ingresso stabile per completare l'integrazione end-to-end.</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild className="btn-primary flex-1">
              <Link to="/login">Vai al login</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
