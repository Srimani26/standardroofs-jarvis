import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
}

export function MetricCard({ label, value, unit, icon, trend }: MetricCardProps) {
  return (
    <Card className="jarvis-card jarvis-card-hover">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          {icon && <span className="text-primary">{icon}</span>}
        </div>
        <p className="text-2xl font-semibold text-foreground">
          {unit === '$' && '$'}{value}{unit && unit !== '$' && ` ${unit}`}
        </p>
      </CardContent>
    </Card>
  )
}
