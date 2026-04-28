import React from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('PharmaTrack runtime error', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl border border-destructive/20 bg-card p-8 shadow-xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-3 text-center">
              <h1 className="text-2xl font-black tracking-tight">Si è verificato un problema</h1>
              <p className="text-sm text-muted-foreground">La schermata bianca è stata intercettata da un boundary di sicurezza. Puoi ricaricare l'app o tornare alla home.</p>
              {this.state.error?.message ? (
                <div className="rounded-2xl bg-secondary/60 px-4 py-3 text-left text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Dettaglio tecnico</p>
                  <p className="break-words">{this.state.error.message}</p>
                </div>
              ) : null}
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="btn-primary">
                <RefreshCw className="mr-2 h-4 w-4" />
                Ricarica
              </Button>
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="mr-2 h-4 w-4" />
                Vai alla home
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
