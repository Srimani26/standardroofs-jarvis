import { useState, useEffect } from 'react'
import { Zap, TrendingUp, Clock, Bot, Code2, Globe, Mail, BarChart3, Target, ArrowUpRight, Calendar, Cpu, Workflow } from 'lucide-react'
import { cn } from '@/lib/cn'

function getTimeGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning'
  if (h < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function formatClock() {
  const now = new Date()
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const PROJECTS = [
  { name: 'Zoho CRM Quotation', company: 'Standard Roofs', progress: 85, status: 'active', icon: '🏗️' },
  { name: 'AI Google Ads v5.0', company: 'Standard Roofs', progress: 95, status: 'active', icon: '📊' },
  { name: 'Sri AI Business OS', company: 'Personal', progress: 92, status: 'active', icon: '🧠' },
  { name: 'Shopify Redesign', company: 'Standard Roofs', progress: 35, status: 'active', icon: '🌐' },
]

const AI_MODELS = [
  { name: 'Gemini 2.5 Flash', use: 'Ads Analysis', status: 'active', color: 'text-blue-400' },
  { name: 'GPT-4o', use: 'General AI', status: 'active', color: 'text-emerald-400' },
  { name: 'Claude', use: 'Code & Docs', status: 'active', color: 'text-violet-400' },
]

const QUICK_ACTIONS = [
  { icon: <Bot className="w-4 h-4" />, label: 'AI Chat', tab: 'chat', color: 'bg-primary/15 text-primary' },
  { icon: <Code2 className="w-4 h-4" />, label: 'Code Lab', tab: 'codlab', color: 'bg-emerald-500/15 text-emerald-400' },
  { icon: <Workflow className="w-4 h-4" />, label: 'Automations', tab: 'automations', color: 'bg-amber-500/15 text-amber-400' },
  { icon: <Calendar className="w-4 h-4" />, label: 'Planner', tab: 'planner', color: 'bg-blue-500/15 text-blue-400' },
  { icon: <Target className="w-4 h-4" />, label: 'Habits', tab: 'habits', color: 'bg-rose-500/15 text-rose-400' },
  { icon: <BarChart3 className="w-4 h-4" />, label: 'Analytics', tab: 'analytics', color: 'bg-violet-500/15 text-violet-400' },
]

const TODAY_TASKS = [
  { text: 'Review Gemini Ads report — check STOP/SCALE/FIX decisions', done: false },
  { text: 'Continue Shopify section coding in VS Code', done: false },
  { text: 'Update Zoho CRM fresher training manual', done: false },
  { text: 'Test lead qualification bot webhook', done: false },
  { text: 'Deploy Business OS to production', done: false },
]

interface CommandCenterProps {
  onNavigate?: (tab: string) => void
}

export default function CommandCenter({ onNavigate }: CommandCenterProps) {
  const [clock, setClock] = useState(formatClock())
  const [tasks, setTasks] = useState(TODAY_TASKS)

  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock()), 1000)
    return () => clearInterval(timer)
  }, [])

  const toggleTask = (index: number) => {
    setTasks(prev => prev.map((t, i) => i === index ? { ...t, done: !t.done } : t))
  }

  const doneCount = tasks.filter(t => t.done).length

  return (
    <div className="space-y-4">
      {/* Hero Section */}
      <div className="jarvis-card p-4 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{getTimeGreeting()}, Sri</p>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mt-0.5">Mission Control</h1>
              <p className="text-xs text-muted-foreground mt-1">{formatDate()}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl sm:text-3xl font-mono font-bold text-primary jarvis-text-glow">{clock}</p>
              <div className="flex items-center gap-1.5 justify-end mt-1">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-jarvis-pulse" />
                <span className="text-[10px] text-emerald-400 font-mono">All Systems Online</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {QUICK_ACTIONS.map((action, i) => (
          <button
            key={i}
            onClick={() => onNavigate?.(action.tab)}
            className="jarvis-card p-3 flex flex-col items-center gap-1.5 hover:border-primary/30 transition-all group"
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', action.color)}>
              {action.icon}
            </div>
            <span className="text-[10px] text-foreground font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Projects + Tasks Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Projects */}
        <div className="jarvis-card p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" /> Active Projects
          </h3>
          <div className="space-y-3">
            {PROJECTS.map((project, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <span className="text-base">{project.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{project.name}</p>
                  <p className="text-[10px] text-muted-foreground">{project.company}</p>
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${project.progress}%` }} />
                  </div>
                </div>
                <span className="text-[10px] font-mono text-primary font-bold">{project.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Tasks */}
        <div className="jarvis-card p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" /> Today's Tasks
            <span className="ml-auto text-[10px] text-primary font-mono">{doneCount}/{tasks.length}</span>
          </h3>
          <div className="space-y-2">
            {tasks.map((task, i) => (
              <button
                key={i}
                onClick={() => toggleTask(i)}
                className="flex items-start gap-2 w-full text-left p-1.5 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all',
                  task.done ? 'bg-primary/20 border-primary/40' : 'border-border'
                )}>
                  {task.done && <span className="text-[8px] text-primary">✓</span>}
                </div>
                <span className={cn('text-xs leading-relaxed', task.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {task.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* AI Models + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* AI Models */}
        <div className="jarvis-card p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" /> AI Models Active
          </h3>
          <div className="space-y-2">
            {AI_MODELS.map((model, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-jarvis-pulse" />
                  <span className="text-xs font-medium text-foreground">{model.name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{model.use}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly Stats */}
        <div className="jarvis-card p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" /> This Week
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Tasks Done', value: '12', change: '+3', color: 'text-emerald-400' },
              { label: 'Ads Reports', value: '5', change: '100%', color: 'text-blue-400' },
              { label: 'Code Commits', value: '8', change: '+2', color: 'text-violet-400' },
              { label: 'Automations', value: '3', change: 'stable', color: 'text-primary' },
            ].map((stat, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-muted/30">
                <p className="text-lg font-bold text-foreground">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                <p className={cn('text-[10px] mt-0.5', stat.color)}>{stat.change}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Layers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>
    </svg>
  )
}
