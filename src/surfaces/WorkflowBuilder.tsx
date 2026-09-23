import { useState } from 'react'
import { Play, Pause, CheckCircle2, AlertCircle, Clock, Zap, Bot, Mail, FileText, Webhook, Database, ArrowRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Automation {
  id: string
  name: string
  description: string
  status: 'running' | 'paused' | 'completed' | 'error' | 'planning'
  trigger: string
  steps: string[]
  lastRun: string
  nextRun: string
  company: string
  icon: string
  runsCount: number
  successRate: number
}

const AUTOMATIONS: Automation[] = [
  {
    id: 'ads-report',
    name: 'AI Google Ads Daily Report',
    description: 'Pulls keyword + search term data from Google Ads, analyzes with Gemini 2.5 Flash, generates STOP/SCALE/FIX decisions, sends HTML email by 7 AM IST.',
    status: 'running',
    trigger: 'Daily at 6:00 AM IST',
    company: 'Standard Roofs',
    icon: '📊',
    steps: [
      'Google Ads Script fetches RAW_DATA + SEARCH_TERMS',
      'Quality Score captured per keyword',
      'getSearchTermsSummary() runs',
      'Gemini Step 1: KW research (2048 tokens)',
      'Gemini Step 2: Main analysis (8192 tokens)',
      'Parse 15 sections + keyword table',
      'Write to DAILY_REPORT sheet',
      'Send HTML email with color-coded cards',
    ],
    lastRun: 'Today, 6:00 AM',
    nextRun: 'Tomorrow, 6:00 AM',
    runsCount: 8,
    successRate: 87.5,
  },
  {
    id: 'zoho-quote',
    name: 'Zoho CRM Quote Automation',
    description: 'Sales staff enters measurements → Deluge calculates roof areas → Rates + add-ons applied → PDF quotation generated via Zoho Writer.',
    status: 'running',
    trigger: 'On Quote record edit',
    company: 'Standard Roofs',
    icon: '🏗️',
    steps: [
      'Staff enters customer details + measurements',
      'Workflow rule triggers on Quote save',
      'Four-case decision tree checks Raw_ fields',
      'calculateRoofAreas computes roof areas',
      'Rates and add-on charges applied',
      'Add_On_Flag set if add-ons present',
      'Whole_Total_Amount written to record',
      'Zoho Writer merges fields → PDF',
    ],
    lastRun: 'Today, 2:30 PM',
    nextRun: 'On next Quote edit',
    runsCount: 150,
    successRate: 99,
  },
  {
    id: 'n8n-ai-intake',
    name: 'SaaS OS — AI Request Intake',
    description: 'Business requests come in → Gemini AI parses intent → resolves to project → assigns to team → risk gates → human approval workflow.',
    status: 'running',
    trigger: 'On webhook receive',
    company: 'Sri AI Business OS',
    icon: '🧠',
    steps: [
      'Webhook receives business request',
      'HMAC signature verified',
      'Gemini AI parses intent + context',
      'Project resolution engine matches to project',
      'Priority + due date extraction',
      'Auto-assignment based on workload',
      'Risk gating — low/medium auto-approve',
      'High risk → Approval Center → human review',
    ],
    lastRun: 'Yesterday, 11:15 PM',
    nextRun: 'On next request',
    runsCount: 45,
    successRate: 95,
  },
  {
    id: 'lead-qual',
    name: 'Lead Qualification Bot (Planned)',
    description: 'AI-powered lead qualifier — incoming website leads processed through Gemini, scored, and pushed to Zoho CRM with priority ranking.',
    status: 'planning',
    trigger: 'On form submission',
    company: 'Standard Roofs',
    icon: '🎯',
    steps: [
      'Customer fills quote form on website',
      'Webhook receives form data',
      'Gemini analyzes lead quality + intent',
      'Score lead (hot/warm/cold)',
      'Create Zoho CRM contact + deal',
      'Hot leads → immediate WhatsApp alert',
      'Follow-up sequence triggered',
    ],
    lastRun: '—',
    nextRun: 'To be built',
    runsCount: 0,
    successRate: 0,
  },
]

function getStatusIcon(status: string) {
  switch (status) {
    case 'running': return <Play className="w-3.5 h-3.5 text-emerald-400" />
    case 'paused': return <Pause className="w-3.5 h-3.5 text-amber-400" />
    case 'completed': return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
    case 'error': return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    case 'planning': return <Clock className="w-3.5 h-3.5 text-cyan-400" />
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground" />
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'running': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'paused': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'completed': return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'error': return 'bg-red-500/15 text-red-400 border-red-500/30'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

export default function WorkflowBuilder() {
  const [automations] = useState(AUTOMATIONS)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const running = automations.filter(a => a.status === 'running').length
  const planned = automations.filter(a => a.status === 'planning').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="text-xl">⚡</span> Automations
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {running} running • {planned} planned • {automations.length} total
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Running', value: running, icon: <Play className="w-4 h-4 text-emerald-400" /> },
          { label: 'Total Runs', value: automations.reduce((a, at) => a + at.runsCount, 0), icon: <RefreshCw className="w-4 h-4 text-blue-400" /> },
          { label: 'Avg Success', value: Math.round(automations.filter(a => a.runsCount > 0).reduce((a, at) => a + at.successRate, 0) / automations.filter(a => a.runsCount > 0).length) + '%', icon: <Zap className="w-4 h-4 text-primary" /> },
          { label: 'Planned', value: planned, icon: <Clock className="w-4 h-4 text-amber-400" /> },
        ].map((stat, i) => (
          <div key={i} className="jarvis-card p-3 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">{stat.icon}</div>
            <div>
              <p className="text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Automations List */}
      <div className="space-y-3">
        {automations.map((auto) => (
          <div key={auto.id} className="jarvis-card overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === auto.id ? null : auto.id)}
              className="w-full p-4 text-left hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{auto.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{auto.name}</h3>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1', getStatusColor(auto.status))}>
                      {getStatusIcon(auto.status)}
                      {auto.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{auto.company}</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {auto.trigger}</span>
                    <span>Runs: {auto.runsCount}</span>
                    {auto.successRate > 0 && <span className="text-emerald-400">Success: {auto.successRate}%</span>}
                  </div>
                </div>
              </div>
            </button>

            {expandedId === auto.id && (
              <div className="border-t border-border p-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{auto.description}</p>

                {/* Flow Steps */}
                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">Workflow Steps</h4>
                  <div className="space-y-1.5">
                    {auto.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] text-primary font-bold">{i + 1}</span>
                        </div>
                        <span className="text-xs text-foreground">{step}</span>
                        {i < auto.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground/40 hidden" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Last run: {auto.lastRun}</span>
                  <span>Next: {auto.nextRun}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
