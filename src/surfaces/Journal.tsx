import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  BookOpen, Plus, Pin, Trash2, Calendar, Smile, Meh, Frown, Heart
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface JournalEntry {
  id: string
  title: string
  content: string
  mood: string
  date: Date
  pinned: boolean
}

const moodOptions = [
  { emoji: '😫', label: 'Terrible', icon: <Frown className="w-4 h-4" /> },
  { emoji: '😕', label: 'Bad', icon: <Meh className="w-4 h-4" /> },
  { emoji: '😐', label: 'Okay', icon: <Meh className="w-4 h-4" /> },
  { emoji: '😊', label: 'Good', icon: <Smile className="w-4 h-4" /> },
  { emoji: '🤩', label: 'Great', icon: <Heart className="w-4 h-4" /> },
]

const sampleEntries: JournalEntry[] = [
  {
    id: '1',
    title: 'First day with JARVIS',
    content: 'Just set up my personal assistant. The dark theme looks incredible. Looking forward to building better habits and tracking my progress.',
    mood: '🤩',
    date: new Date(),
    pinned: true,
  },
]

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>(sampleEntries)
  const [isWriting, setIsWriting] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newMood, setNewMood] = useState('😊')

  const addEntry = () => {
    if (!newContent.trim()) return
    setEntries(prev => [{
      id: Date.now().toString(),
      title: newTitle.trim() || 'Untitled Entry',
      content: newContent.trim(),
      mood: newMood,
      date: new Date(),
      pinned: false,
    }, ...prev])
    setNewTitle('')
    setNewContent('')
    setNewMood('😊')
    setIsWriting(false)
  }

  const togglePin = (id: string) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, pinned: !e.pinned } : e))
  }

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const pinnedEntries = entries.filter(e => e.pinned)
  const recentEntries = entries.filter(e => !e.pinned)

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Journal</h2>
          <p className="text-sm text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} total
          </p>
        </div>
        <Button
          onClick={() => setIsWriting(!isWriting)}
          size="sm"
          className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
        >
          <Plus className="w-4 h-4 mr-1" />
          New Entry
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold">{entries.length}</p>
            <p className="text-xs text-muted-foreground">Entries</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold">{pinnedEntries.length}</p>
            <p className="text-xs text-muted-foreground">Pinned</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-2xl font-semibold">
              {entries.length > 0 ? entries[0].mood : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Latest Mood</p>
          </CardContent>
        </Card>
      </div>

      {/* New Entry Form */}
      {isWriting && (
        <Card className="jarvis-card jarvis-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              New Journal Entry
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Entry title (optional)"
              className="bg-background/50 border-primary/20 focus:border-primary/40"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your thoughts..."
              className="min-h-[120px] bg-background/50 border-primary/20 focus:border-primary/40 resize-none"
            />

            {/* Mood Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Mood:</span>
              <div className="flex gap-1">
                {moodOptions.map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setNewMood(m.emoji)}
                    className={cn(
                      'text-lg p-1.5 rounded-lg transition-all',
                      newMood === m.emoji
                        ? 'bg-primary/15 scale-110'
                        : 'hover:bg-primary/5'
                    )}
                    title={m.label}
                  >
                    {m.emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                onClick={() => setIsWriting(false)}
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={addEntry}
                size="sm"
                className="bg-primary text-primary-foreground"
                disabled={!newContent.trim()}
              >
                Save Entry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pinned Entries */}
      {pinnedEntries.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Pin className="w-3 h-3" /> Pinned
          </p>
          <div className="flex flex-col gap-3">
            {pinnedEntries.map((entry) => (
              <Card key={entry.id} className="jarvis-card jarvis-border">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{entry.mood}</span>
                        <h3 className="font-medium text-foreground">{entry.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{entry.content}</p>
                      <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {entry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => togglePin(entry.id)}
                        className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeEntry(entry.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Entries */}
      <div>
        {pinnedEntries.length > 0 && recentEntries.length > 0 && (
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Recent</p>
        )}
        <div className="flex flex-col gap-3">
          {recentEntries.map((entry) => (
            <Card key={entry.id} className="jarvis-card jarvis-card-hover">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{entry.mood}</span>
                      <h3 className="font-medium text-foreground">{entry.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{entry.content}</p>
                    <p className="text-xs text-muted-foreground/60 mt-2 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {entry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => togglePin(entry.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {entries.length === 0 && !isWriting && (
        <Card className="jarvis-card">
          <CardContent className="py-12 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No journal entries yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Click "New Entry" to start writing!</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
