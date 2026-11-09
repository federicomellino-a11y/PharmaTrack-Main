import { Card, CardContent } from '../ui/card';

/* Un numero della scheda cliente, con etichetta e spiegazione sotto. */
export default function CustomerMetricCard({ icon: Icon, label, value, hint, accent = 'text-primary' }) {
  return (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-2xl bg-primary/10 p-2.5">
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </CardContent>
  </Card>
  );
}
