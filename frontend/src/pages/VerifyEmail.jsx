import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API } from '@/lib/config'
import { MailCheck, AlertCircle, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState(token ? 'loading' : 'no-token') // loading | success | error | no-token
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) return
    let mounted = true
    axios
      .post(`${API}/auth/verify-email`, { token })
      .then((res) => {
        if (!mounted) return
        setStatus('success')
        setMessage(res.data?.message || 'Email verificata con successo')
      })
      .catch((err) => {
        if (!mounted) return
        setStatus('error')
        const detail = err.response?.data?.detail
        setMessage(typeof detail === 'string' ? detail : 'Link di verifica non valido o scaduto')
      })
    return () => { mounted = false }
  }, [token])

  const icon = {
    loading: <Loader2 className="h-8 w-8 text-primary animate-spin" />,
    success: <CheckCircle2 className="h-8 w-8 text-emerald-600" />,
    error: <AlertCircle className="h-8 w-8 text-amber-600" />,
    'no-token': <MailCheck className="h-8 w-8 text-primary" />,
  }[status]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 gradient-mesh">
      <Card className="w-full max-w-lg shadow-xl border-primary/15" data-testid="verify-email-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            {icon}
          </div>
          <CardTitle>Verifica email</CardTitle>
          <CardDescription>
            {status === 'loading' && 'Sto verificando il tuo indirizzo email…'}
            {status === 'success' && 'Il tuo indirizzo email è stato confermato.'}
            {status === 'error' && 'Non è stato possibile verificare l’email.'}
            {status === 'no-token' && 'Link di verifica email di PharmaTrack.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'success' && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-100" data-testid="verify-success">
              {message}
            </div>
          )}
          {status === 'error' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100" data-testid="verify-error">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <p>{message}</p>
              </div>
            </div>
          )}
          {status === 'no-token' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <p>Il link di verifica non contiene un token valido. Accedi e richiedi una nuova email dalla dashboard.</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild className="btn-primary flex-1" data-testid="verify-goto-login">
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
