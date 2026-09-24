import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Flame, Check, X, Target, Zap, Trophy, Calendar,
  Code2, Brain, BookOpen, Dumbbell, Coffee, Moon
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface Habit {
  id: string
  name: string
  icon: string
  color: string
  streak: number
  completedToday: boolean
  category: string
}

const engineerHabits: Habit[] = [
  { id: '1', name: 'Code Review', icon: '🔍', color: 'text-cyan-400', streak: 0, completedToday: false, category: 'Work' },
  { id: '2', name: 'Learn AI/ML', icon: '🧠', color: 'text-purple-400', streak: 0, completedToday: false, category: 'Learning' },
  { id: '3', name: 'Write Docs', icon: '📝', color: 'text-blue-400', streak: 0, completedToday: false, category: 'Work' },
  { id: '4', name: 'Exercise', icon: '💪', color: 'text-emerald-400', streak: 0, completedToday: false, category: 'Health' },
  { id: '5', name: 'Read Tech Blog', icon: '📰', color: 'text-amber-400', streak: 0, completedToday: false, category: 'Learning' },
  { id: '6', name: 'No Distraction', icon: '📵', color: 'text-rose-400', streak: 0, completedToday: false, category: 'Focus' },
]

const moods = ['😫', '😕', '😐', '😊', '🤩']
const moodLabels = ['Burnt', 'Tired', 'Okay', 'Focused', 'Flow State']

export default function HabitsTracker() {
  const [habits, setHabits] = useState<Habit[]>(engineerHabits)
  const [newHabitName, setNewHabitName] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedMood, setSelectedMood] = useState<number | null>(null)

  const toggleHabit = useCallback((id: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== id) return h
      const newCompleted = !h.completedToday
      return {
        ...h,
        completedToday: newCompleted,
        streak: newCompleted ? h.streak + 1 : Math.max(0, h.streak - 1),
      }
    }))
  }, [])

  const addHabit = useCallback(() => {
    if (!newHabitName.trim()) return
    setHabits(prev => [...prev, {
      id: Date.now().toString(),
      name: newHabitName.trim(),
      icon: '✨',
      color: 'text-cyan-400',
      streak: 0,
      completedToday: false,
      category: 'Custom',
    }])
    setNewHabitName('')
    setShowAddForm(false)
  }, [newHabitName])

  const removeHabit = useCallback((id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id))
  }, [])

  const completedCount = habits.filter(h => h.completedToday).length
  const totalStreak = habits.reduce((acc, h) => acc + h.streak, 0)
  const completionRate = habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0

  const workHabits = habits.filter(h => h.category === 'Work')
  const learningHabits = habits.filter(h => h.category === 'Learning')
  const healthHabits = habits.filter(h => h.category === 'Health')
  const otherHabits = habits.filter(h => !['Work', 'Learning', 'Health'].includes(h.category))

  const renderHabitGroup = (title: string, items: Habit[], icon: React.ReactNode) => {
    if (items.length === 0) return null
    return (
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
          {icon} {title}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map(habit => (
            <Card
              key={habit.id}
              className={cn(
                'jarvis-card jarvis-card-hover cursor-pointer group transition-all',
                habit.completedToday && 'jarvis-border border-primary/40'
              )}
              onClick={() => toggleHabit(habit.id)}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{habit.icon}</span>
                    <div>
                      <p className={cn(
                        'text-sm font-medium transition-all',
                        habit.completedToday && 'text-primary jarvis-text-glow'
                      )}>
                        {habit.name}
                      </p>
                      {habit.streak > 0 && (
                        <Badge variant="outline" className="text-[9px] py-0 mt-0.5 border-amber-500/30 text-amber-400">
                          <Flame className="w-2.5 h-2.5 mr-0.5" /> {habit.streak} day streak
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center transition-all',
                      habit.completedToday
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border border-border group-hover:border-primary/30'
                    )}>
                      {habit.completedToday && <Check className="w-3.5 h-3.5" />}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeHabit(habit.id) }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-0.5"
                    >
                      <X className="w-3 h-3" />
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

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Engineer Habits</h2>
          <p className="text-sm text-muted-foreground">Build consistency, level up daily</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Target className="w-4 h-4 text-primary" /></div>
            <div>
              <p className="text-lg font-semibold">{completedCount}/{habits.length}</p>
              <p className="text-xs text-muted-foreground">Today</p>
            </div>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10"><Flame className="w-4 h-4 text-amber-400" /></div>
            <div>
              <p className="text-lg font-semibold">{totalStreak}</p>
              <p className="text-xs text-muted-foreground">Total Streak</p>
            </div>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><Trophy className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-lg font-semibold">{completionRate}%</p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
          </CardContent>
        </Card>
        <Card className="jarvis-card">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10"><Zap className="w-4 h-4 text-purple-400" /></div>
            <div>
              <p className="text-lg font-semibold">{habits.length}</p>
              <p className="text-xs text-muted-foreground">Habits</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="jarvis-card jarvis-border">
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <Input
                value={newHabitName}
                onChange={(e) => setNewHabitName(e.target.value)}
                placeholder="New habit name..."
                className="flex-1 bg-background/50 border-primary/20"
                onKeyDown={(e) => e.key === 'Enter' && addHabit()}
              />
              <Button onClick={addHabit} size="sm" className="bg-primary text-primary-foreground">
                <Check className="w-4 h-4 mr-1" /> Add
              </Button>
              <Button onClick={() => setShowAddForm(false)} size="sm" variant="ghost" className="text-muted-foreground">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Habit Groups */}
      <div className="flex flex-col gap-5">
        {renderHabitGroup('Work', workHabits, <Code2 className="w-3 h-3" />)}
        {renderHabitGroup('Learning', learningHabits, <Brain className="w-3 h-3" />)}
        {renderHabitGroup('Health', healthHabits, <Dumbbell className="w-3 h-3" />)}
        {renderHabitGroup('Other', otherHabits, <Zap className="w-3 h-3" />)}
      </div>

      {/* Mood Check-in */}
      <Card className="jarvis-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
            🧠 Current Focus Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            {moods.map((mood, i) => (
              <button
                key={i}
                onClick={() => setSelectedMood(i)}
                className={cn(
                  'flex flex-col items-center gap-1 p-2.5 sm:p-3 rounded-xl transition-all hover:scale-110',
                  selectedMood === i ? 'bg-primary/15 scale-110' : 'bg-background/50 hover:bg-primary/5'
                )}
              >
                <span className="text-2xl sm:text-3xl">{mood}</span>
                <span className={cn('text-[10px]', selectedMood === i ? 'text-primary' : 'text-muted-foreground')}>
                  {moodLabels[i]}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
