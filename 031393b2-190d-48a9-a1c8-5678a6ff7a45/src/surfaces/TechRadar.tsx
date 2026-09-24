import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Globe, TrendingUp, ExternalLink, Star, Bookmark, RefreshCw,
  Sparkles, Cpu, Rocket, Newspaper, Search, Filter, ArrowUpRight
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface TechItem {
  id: string
  title: string
  description: string
  category: 'model' | 'tool' | 'framework' | 'paper' | 'news'
  source: string
  url: string
  date: string
  hot: boolean
  bookmarked: boolean
}

const categories = [
  { id: 'all', label: 'All', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'model', label: 'AI Models', icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: 'tool', label: 'Tools', icon: <Rocket className="w-3.5 h-3.5" /> },
  { id: 'framework', label: 'Frameworks', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'paper', label: 'Papers', icon: <Newspaper className="w-3.5 h-3.5" /> },
  { id: 'news', label: 'News', icon: <TrendingUp className="w-3.5 h-3.5" /> },
]

const sampleTechRadar: TechItem[] = [
  { id: '1', title: 'GPT-4o Omni', description: 'OpenAI multimodal model — text, vision, audio in one model. 2x faster, 50% cheaper.', category: 'model', source: 'OpenAI', url: '#', date: 'Today', hot: true, bookmarked: true },
  { id: '2', title: 'Claude 3.5 Sonnet', description: 'Anthropic latest — superior coding, analysis. Matches Opus quality at Sonnet speed.', category: 'model', source: 'Anthropic', url: '#', date: 'Today', hot: true, bookmarked: false },
  { id: '3', title: 'Gemini 1.5 Pro', description: 'Google 1M context window. Video understanding, multimodal reasoning breakthrough.', category: 'model', source: 'Google', url: '#', date: 'Yesterday', hot: true, bookmarked: false },
  { id: '4', title: 'Llama 3.1 405B', description: 'Meta open-source 405B parameter model. Competitive with GPT-4 on benchmarks.', category: 'model', source: 'Meta', url: '#', date: '2 days ago', hot: false, bookmarked: true },
  { id: '5', title: 'Cursor IDE', description: 'AI-first code editor. Tab completion, chat, codebase understanding built-in.', category: 'tool', source: 'Cursor', url: '#', date: 'Today', hot: true, bookmarked: true },
  { id: '6', title: 'n8n AI Agents', description: 'Visual workflow builder with native AI agent nodes. Self-hostable.', category: 'tool', source: 'n8n', url: '#', date: 'Yesterday', hot: false, bookmarked: false },
  { id: '7', title: 'Vercel AI SDK 3.0', description: 'Build AI-powered apps with streaming. Supports OpenAI, Anthropic, Google.', category: 'framework', source: 'Vercel', url: '#', date: '3 days ago', hot: false, bookmarked: false },
  { id: '8', title: 'LangGraph', description: 'Stateful, multi-actor AI agent framework. Cycles, persistence, human-in-the-loop.', category: 'framework', source: 'LangChain', url: '#', date: 'Yesterday', hot: true, bookmarked: true },
  { id: '9', title: 'Mixture of Agents', description: 'Research paper: combining multiple LLMs outperforms single best model. Novel ensemble approach.', category: 'paper', source: 'arXiv', url: '#', date: '2 days ago', hot: false, bookmarked: false },
  { id: '10', title: 'Sora Video Generation', description: 'OpenAI text-to-video model. 60s realistic videos from text prompts.', category: 'news', source: 'OpenAI', url: '#', date: 'Today', hot: true, bookmarked: false },
  { id: '11', title: 'DeepSeek Coder V2', description: 'Open-source code model rivaling GPT-4 Turbo on coding benchmarks.', category: 'model', source: 'DeepSeek', url: '#', date: 'Yesterday', hot: false, bookmarked: false },
  { id: '12', title: 'Dify.ai Platform', description: 'Open-source LLM app development platform. RAG, agents, workflows in one place.', category: 'tool', source: 'Dify', url: '#', date: '3 days ago', hot: false, bookmarked: true },
]

const trendingTopics = [
  { label: 'AI Agents', count: 42 },
  { label: 'RAG', count: 38 },
  { label: 'Multimodal', count: 35 },
  { label: 'Fine-tuning', count: 28 },
  { label: 'AI Coding', count: 52 },
  { label: 'MCP Protocol', count: 22 },
  { label: 'Vision Models', count: 31 },
  { label: 'Open Source LLMs', count: 45 },
]

export default function TechRadar() {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState(sampleTechRadar)

  const filtered = items.filter(item => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory
    const matchSearch = search === '' || item.title.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const toggleBookmark = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, bookmarked: !i.bookmarked } : i))
  }

  const hotCount = items.filter(i => i.hot).length
  const bookmarkCount = items.filter(i => i.bookmarked).length

  const categoryColors: Record<string, string> = {
    model: 'text-purple-400 bg-purple-500/10',
    tool: 'text-cyan-400 bg-cyan-500/10',
    framework: 'text-blue-400 bg-blue-500/10',
    paper: 'text-amber-400 bg-amber-500/10',
    news: 'text-emerald-400 bg-emerald-500/10',
  }

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Tech Radar</h2>
          <p className="text-sm text-muted-foreground">AI news, tools, and emerging technologies</p>
        </div>
        <Button size="sm" variant="outline" className="text-xs border-primary/20 text-primary">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground">Tracked Items</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold text-rose-400">{hotCount}</p>
            <p className="text-xs text-muted-foreground">🔥 Hot Right Now</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold text-amber-400">{bookmarkCount}</p>
            <p className="text-xs text-muted-foreground">Bookmarked</p>
          </CardContent>
        </Card>
      </div>

      {/* Trending */}
      <Card className="jarvis-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Trending in AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {trendingTopics.map(topic => (
              <Badge key={topic.label} variant="outline" className="text-xs border-primary/15 text-primary/70 hover:bg-primary/10 cursor-pointer transition-colors">
                {topic.label}
                <span className="ml-1.5 text-[9px] text-muted-foreground">{topic.count}</span>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Search + Filter */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search AI models, tools, frameworks..."
            className="pl-9 bg-background/50 border-primary/20"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all',
                activeCategory === cat.id
                  ? 'bg-primary/15 text-primary border border-primary/20'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-3">
        {filtered.map(item => (
          <Card key={item.id} className="jarvis-card jarvis-card-hover group">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium text-foreground text-sm">{item.title}</h3>
                    <Badge variant="outline" className={cn('text-[9px]', categoryColors[item.category])}>
                      {item.category}
                    </Badge>
                    {item.hot && (
                      <Badge variant="outline" className="text-[9px] border-rose-500/20 text-rose-400">
                        🔥 Hot
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                      {item.source}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                  <span className="text-[10px] text-muted-foreground/50 mt-1 block">{item.date}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => toggleBookmark(item.id)} className={cn('p-1 rounded transition-colors', item.bookmarked ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400')}>
                    <Bookmark className="w-3.5 h-3.5" fill={item.bookmarked ? 'currentColor' : 'none'} />
                  </button>
                  <button className="p-1 rounded text-muted-foreground hover:text-primary transition-colors">
                    <ArrowUpRight className="w-3.5 h-3.5" />
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
