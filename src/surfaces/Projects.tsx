import { useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, Code2, Bot, Globe, ShoppingCart, ChevronDown, ChevronRight, Calendar, Tag, Star } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Task {
  id: string
  text: string
  done: boolean
}

interface Project {
  id: string
  name: string
  company: string
  description: string
  status: 'active' | 'completed' | 'planning' | 'paused'
  progress: number
  icon: string
  tags: string[]
  techStack: string[]
  tasks: Task[]
  github?: string
  priority: 'high' | 'medium' | 'low'
}

const INITIAL_PROJECTS: Project[] = [
  {
    id: 'zoho-crm',
    name: 'Zoho CRM Quotation Automation',
    company: 'Standard Roofs',
    description: 'Automated roof area calculation, rate & add-on charges, PDF quotation generation via Zoho Writer. Built for sales staff in Erode to eliminate manual errors.',
    status: 'active',
    progress: 85,
    icon: '🏗️',
    tags: ['CRM', 'Automation', 'Deluge'],
    techStack: ['Zoho CRM', 'Deluge', 'Zoho Writer', 'Cloudinary'],
    priority: 'high',
    tasks: [
      { id: '1', text: 'calculateRoofAreas Deluge function — four-case decision tree', done: true },
      { id: '2', text: 'RoofingSystem_Autofill_All lookup engine', done: true },
      { id: '3', text: 'Raw_ field race condition fix', done: true },
      { id: '4', text: 'Zoho Writer PDF merge template', done: true },
      { id: '5', text: 'Fresher training manual (v0.4, Day 7)', done: false },
      { id: '6', text: 'Cloudinary image integration', done: true },
    ],
  },
  {
    id: 'ai-ads',
    name: 'AI Google Ads Automation v5.0',
    company: 'Standard Roofs',
    description: 'Fully automated Google Ads daily report pipeline. Pulls keyword + search term data, analyzes with Gemini 2.5 Flash AI, generates STOP/SCALE/FIX decisions, sends HTML email reports.',
    status: 'active',
    progress: 95,
    icon: '📊',
    tags: ['Google Ads', 'Gemini AI', 'Apps Script'],
    techStack: ['Google Apps Script', 'Gemini 2.5 Flash', 'Google Sheets API', 'Gmail API'],
    priority: 'high',
    tasks: [
      { id: '1', text: 'Data Fetch Script v3.0 — keyword + search terms + QS', done: true },
      { id: '2', text: 'Two-step Gemini architecture (KW research + analysis)', done: true },
      { id: '3', text: 'stSummary undefined variable fix', done: true },
      { id: '4', text: '503 retry backoff (10s → 20s → 30s)', done: true },
      { id: '5', text: '15-section HTML email with ACTUAL SEARCH QUERIES', done: true },
      { id: '6', text: 'Quality Score tracking + email section', done: true },
    ],
  },
  {
    id: 'saas-os',
    name: 'Sri AI Business OS',
    company: 'Personal Project',
    description: 'AI-powered Business Execution Platform. Multi-tenant Business OS with JWT auth, RBAC, webhooks, n8n orchestration, Gemini-based intake, project resolution, approval workflows. ~90-95% prototype complete.',
    status: 'active',
    progress: 92,
    icon: '🧠',
    tags: ['SaaS', 'AI', 'Full-Stack'],
    techStack: ['Next.js', 'FastAPI', 'SQLite', 'n8n', 'Gemini', 'JWT', 'HMAC'],
    github: 'github.com/Srimani26/Sri-AI-Business-OS',
    priority: 'high',
    tasks: [
      { id: '1', text: 'JWT auth + RBAC + tenant isolation', done: true },
      { id: '2', text: 'Organization → Workspace → Project → Task hierarchy', done: true },
      { id: '3', text: 'Webhook/Event layer with HMAC verification', done: true },
      { id: '4', text: 'n8n Docker orchestration + AI workflows', done: true },
      { id: '5', text: 'Gemini intake → project resolution → auto-assignment', done: true },
      { id: '6', text: 'Approval Center with NEEDS_REVIEW/APPROVED/REJECTED', done: true },
      { id: '7', text: 'Move to PostgreSQL + production infra', done: false },
      { id: '8', text: 'Billing + monitoring + backups', done: false },
    ],
  },
  {
    id: 'shopify-web',
    name: 'Shopify Website Redesign',
    company: 'Standard Roofs',
    description: 'Redesigning Standard Roofs website using AI tools in VS Code. Custom Shopify theme, product pages, quote request forms, before/after galleries.',
    status: 'active',
    progress: 35,
    icon: '🌐',
    tags: ['Shopify', 'Web Design', 'AI'],
    techStack: ['Shopify', 'Liquid', 'HTML/CSS', 'AI Tools', 'VS Code'],
    priority: 'medium',
    tasks: [
      { id: '1', text: 'Audit current site structure and design', done: true },
      { id: '2', text: 'Design new layout with AI — mobile-first', done: false },
      { id: '3', text: 'Build custom Shopify sections', done: false },
      { id: '4', text: 'Add quote request form with Zoho integration', done: false },
      { id: '5', text: 'Before/After project gallery', done: false },
      { id: '6', text: 'SEO optimization + meta tags', done: false },
      { id: '7', text: 'Deploy and test', done: false },
    ],
  },
]

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    case 'completed': return 'bg-blue-500/15 text-blue-400 border-blue-500/30'
    case 'planning': return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
    case 'paused': return 'bg-muted text-muted-foreground border-border'
    default: return 'bg-muted text-muted-foreground border-border'
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high': return 'text-red-400'
    case 'medium': return 'text-amber-400'
    case 'low': return 'text-emerald-400'
    default: return 'text-muted-foreground'
  }
}

export default function Projects() {
  const [projects, setProjects] = useState(INITIAL_PROJECTS)
  const [expandedId, setExpandedId] = useState<string | null>('zoho-crm')

  const toggleTask = (projectId: string, taskId: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id !== projectId) return p
      const newTasks = p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t)
      const doneCount = newTasks.filter(t => t.done).length
      return { ...p, tasks: newTasks, progress: Math.round((doneCount / newTasks.length) * 100) }
    }))
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <span className="text-xl">⚡</span> Sri's Projects
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {projects.length} projects • {projects.filter(p => p.status === 'active').length} active
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: projects.filter(p => p.status === 'active').length, color: 'text-emerald-400' },
          { label: 'Tasks Done', value: projects.reduce((acc, p) => acc + p.tasks.filter(t => t.done).length, 0), color: 'text-blue-400' },
          { label: 'Tasks Pending', value: projects.reduce((acc, p) => acc + p.tasks.filter(t => !t.done).length, 0), color: 'text-amber-400' },
          { label: 'Avg Progress', value: Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / projects.length) + '%', color: 'text-primary' },
        ].map((stat, i) => (
          <div key={i} className="jarvis-card p-3 text-center">
            <p className={cn('text-lg font-bold', stat.color)}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Projects List */}
      <div className="space-y-3">
        {projects.map((project) => (
          <div key={project.id} className="jarvis-card overflow-hidden">
            {/* Project Header */}
            <button
              onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
              className="w-full p-4 text-left hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">{project.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', getStatusColor(project.status))}>
                      {project.status}
                    </span>
                    <span className={cn('text-[10px] font-bold', getPriorityColor(project.priority))}>
                      {project.priority.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{project.company} • {project.description.slice(0, 100)}...</p>
                  {/* Progress Bar */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-primary font-mono font-bold">{project.progress}%</span>
                  </div>
                </div>
                <div className="flex-shrink-0 mt-1">
                  {expandedId === project.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </button>

            {/* Expanded Content */}
            {expandedId === project.id && (
              <div className="border-t border-border p-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">{project.description}</p>

                {/* Tech Stack */}
                <div className="flex flex-wrap gap-1.5">
                  {project.techStack.map((tech, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {tech}
                    </span>
                  ))}
                </div>

                {/* GitHub Link */}
                {project.github && (
                  <a
                    href={`https://${project.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Code2 className="w-3 h-3" /> {project.github}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {/* Tasks */}
                <div>
                  <h4 className="text-xs font-semibold text-foreground mb-2">Tasks ({project.tasks.filter(t => t.done).length}/{project.tasks.length})</h4>
                  <div className="space-y-1.5">
                    {project.tasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => toggleTask(project.id, task.id)}
                        className="flex items-center gap-2 w-full text-left group p-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        {task.done
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          : <Circle className="w-4 h-4 text-muted-foreground group-hover:text-primary flex-shrink-0" />
                        }
                        <span className={cn('text-xs', task.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                          {task.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
