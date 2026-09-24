import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Brain, Search, Plus, BookOpen, Lightbulb, Star, Tag, ExternalLink,
  GraduationCap, Atom, Cpu, Globe, Bookmark, ChevronRight, Trash2
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface KnowledgeItem {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  starred: boolean
  type: 'note' | 'resource' | 'concept' | 'tutorial'
  url?: string
  date: Date
}

const typeIcons: Record<string, React.ReactNode> = {
  note: <BookOpen className="w-4 h-4" />,
  resource: <ExternalLink className="w-4 h-4" />,
  concept: <Lightbulb className="w-4 h-4" />,
  tutorial: <GraduationCap className="w-4 h-4" />,
}

const typeColors: Record<string, string> = {
  note: 'text-blue-400',
  resource: 'text-emerald-400',
  concept: 'text-purple-400',
  tutorial: 'text-amber-400',
}

const categories = [
  { name: 'All', icon: <Brain className="w-4 h-4" />, count: 0 },
  { name: 'AI / ML', icon: <Cpu className="w-4 h-4" />, count: 3 },
  { name: 'Web Dev', icon: <Globe className="w-4 h-4" />, count: 2 },
  { name: 'Automation', icon: <Atom className="w-4 h-4" />, count: 1 },
  { name: 'DevOps', icon: <Bookmark className="w-4 h-4" />, count: 1 },
]

const sampleKnowledge: KnowledgeItem[] = [
  { id: '1', title: 'Transformer Architecture Explained', content: 'Transformers use self-attention mechanisms to process input sequences in parallel. Key components: Multi-Head Attention, Position Encoding, Feed-Forward Networks. The attention formula is Attention(Q,K,V) = softmax(QK^T/√d_k)V.', category: 'AI / ML', tags: ['transformers', 'deep-learning'], starred: true, type: 'concept', date: new Date() },
  { id: '2', title: 'LangChain vs LlamaIndex', content: 'LangChain: Great for building chains and agents. LlamaIndex: Better for RAG and document Q&A. Use LangChain for complex workflows, LlamaIndex for knowledge-intensive tasks. Both support OpenAI, Anthropic, and local models.', category: 'AI / ML', tags: ['langchain', 'llamaindex', 'rag'], starred: false, type: 'note', date: new Date() },
  { id: '3', title: 'Building RAG Pipelines', content: 'RAG (Retrieval-Augmented Generation) steps:\n1. Document ingestion & chunking\n2. Embedding generation (OpenAI, Cohere, local)\n3. Vector store indexing (Pinecone, Weaviate, Chroma)\n4. Query → Embed → Retrieve → Generate\n\nKey params: chunk_size, overlap, top_k, temperature', category: 'AI / ML', tags: ['rag', 'embeddings', 'vector-db'], starred: true, type: 'tutorial', date: new Date() },
  { id: '4', title: 'Next.js 14 App Router Patterns', content: 'Server Components by default. Use "use client" for interactivity. Server Actions for mutations. Parallel routes for complex layouts. Route groups for organization. Loading.tsx and error.tsx for UX.', category: 'Web Dev', tags: ['nextjs', 'react', 'server-components'], starred: false, type: 'note', date: new Date() },
  { id: '5', title: 'n8n Automation Recipes', content: 'Great workflows to build:\n- RSS → AI Summarize → Slack notification\n- Form submission → Process with AI → Store in DB\n- Email trigger → Extract data → Update spreadsheet\n- GitHub webhook → AI code review → Post comment', category: 'Automation', tags: ['n8n', 'automation', 'workflows'], starred: true, type: 'resource', date: new Date() },
  { id: '6', title: 'Docker for AI Projects', content: 'Multi-stage builds for smaller images. GPU support via nvidia-docker. Environment variables for API keys. Volume mounts for model caches. Compose for multi-service stacks (app + vector DB + Redis + worker).', category: 'DevOps', tags: ['docker', 'gpu', 'deployment'], starred: false, type: 'note', date: new Date() },
  { id: '7', title: 'Prompt Engineering Best Practices', content: '1. Be specific and detailed\n2. Use examples (few-shot)\n3. Define output format\n4. Set role/persona\n5. Chain complex tasks\n6. Use delimiters for clarity\n7. Iterate and test systematically\n8. Temperature for creativity control', category: 'AI / ML', tags: ['prompts', 'engineering'], starred: true, type: 'concept', date: new Date() },
]

export default function KnowledgeHub() {
  const [items, setItems] = useState<KnowledgeItem[]>(sampleKnowledge)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newType, setNewType] = useState<KnowledgeItem['type']>('note')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = items.filter(item => {
    const matchSearch = search === '' || item.title.toLowerCase().includes(search.toLowerCase()) || item.tags.some(t => t.includes(search.toLowerCase())) || item.content.toLowerCase().includes(search.toLowerCase())
    const matchCat = activeCategory === 'All' || item.category === activeCategory
    return matchSearch && matchCat
  })

  const totalNotes = items.filter(i => i.type === 'note').length
  const totalConcepts = items.filter(i => i.type === 'concept').length
  const totalTutorials = items.filter(i => i.type === 'tutorial').length
  const totalResources = items.filter(i => i.type === 'resource').length

  const addEntry = () => {
    if (!newContent.trim()) return
    setItems(prev => [{
      id: Date.now().toString(),
      title: newTitle.trim() || 'Untitled',
      content: newContent.trim(),
      category: activeCategory === 'All' ? 'AI / ML' : activeCategory,
      tags: [],
      starred: false,
      type: newType,
      date: new Date(),
    }, ...prev])
    setNewTitle('')
    setNewContent('')
    setShowNewForm(false)
  }

  const deleteEntry = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const toggleStar = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, starred: !i.starred } : i))
  }

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Knowledge Hub</h2>
          <p className="text-sm text-muted-foreground">AI concepts, tutorials, and resources</p>
        </div>
        <Button onClick={() => setShowNewForm(!showNewForm)} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
          <Plus className="w-4 h-4 mr-1" /> Add Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Notes', value: totalNotes, icon: <BookOpen className="w-4 h-4" />, color: 'text-blue-400' },
          { label: 'Concepts', value: totalConcepts, icon: <Lightbulb className="w-4 h-4" />, color: 'text-purple-400' },
          { label: 'Tutorials', value: totalTutorials, icon: <GraduationCap className="w-4 h-4" />, color: 'text-amber-400' },
          { label: 'Resources', value: totalResources, icon: <ExternalLink className="w-4 h-4" />, color: 'text-emerald-400' },
        ].map(stat => (
          <Card key={stat.label} className="jarvis-card">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg bg-background/50', stat.color)}>{stat.icon}</div>
              <div>
                <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Categories */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search knowledge base..."
            className="pl-9 bg-background/50 border-primary/20"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(cat.name)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
                activeCategory === cat.name
                  ? 'bg-primary/15 text-primary border border-primary/20'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* New Form */}
      {showNewForm && (
        <Card className="jarvis-card jarvis-border">
          <CardContent className="pt-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Title" className="bg-background/50 border-primary/20" />
              <select value={newType} onChange={(e) => setNewType(e.target.value as KnowledgeItem['type'])} className="bg-background/50 border border-primary/20 rounded-lg px-3 text-sm text-foreground">
                <option value="note">Note</option>
                <option value="concept">Concept</option>
                <option value="tutorial">Tutorial</option>
                <option value="resource">Resource</option>
              </select>
            </div>
            <Textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="Write your knowledge entry..." className="min-h-[100px] bg-background/50 border-primary/20 resize-none" />
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setShowNewForm(false)} size="sm" variant="ghost" className="text-muted-foreground">Cancel</Button>
              <Button onClick={addEntry} size="sm" className="bg-primary text-primary-foreground" disabled={!newContent.trim()}>Save</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Knowledge Items */}
      <div className="flex flex-col gap-3">
        {filtered.map(item => (
          <Card key={item.id} className="jarvis-card jarvis-card-hover">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={typeColors[item.type]}>{typeIcons[item.type]}</span>
                    <h3 className="font-medium text-foreground text-sm">{item.title}</h3>
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">{item.type}</Badge>
                  </div>
                  <p className={cn(
                    'text-xs text-muted-foreground transition-all',
                    expandedId === item.id ? 'whitespace-pre-wrap' : 'line-clamp-2'
                  )}>
                    {item.content}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    {item.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[9px] border-border text-muted-foreground">
                        <Tag className="w-2.5 h-2.5 mr-0.5" />{tag}
                      </Badge>
                    ))}
                    <span className="text-[9px] text-muted-foreground/50 ml-1">
                      {item.date.toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => toggleStar(item.id)} className={cn('p-1 rounded transition-colors', item.starred ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400')}>
                    <Star className="w-3.5 h-3.5" fill={item.starred ? 'currentColor' : 'none'} />
                  </button>
                  <button onClick={() => deleteEntry(item.id)} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
