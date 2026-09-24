import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CheckSquare, Clock, Plus, Zap, Trash2
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface Task {
  id: string
  title: string
  done: boolean
  priority: 'low' | 'medium' | 'high'
  time?: string
}

const priorityColors = {
  low: 'text-blue-400 bg-blue-500/10',
  medium: 'text-amber-400 bg-amber-500/10',
  high: 'text-rose-400 bg-rose-500/10',
}

const initialTasks: Task[] = [
  { id: '1', title: 'Review morning briefing', done: false, priority: 'high', time: '9:00 AM' },
  { id: '2', title: 'Check emails & messages', done: false, priority: 'medium', time: '9:30 AM' },
  { id: '3', title: 'Deep work session', done: false, priority: 'high', time: '10:00 AM' },
  { id: '4', title: 'Team standup', done: false, priority: 'low', time: '11:00 AM' },
  { id: '5', title: 'Lunch break', done: false, priority: 'low', time: '12:30 PM' },
]

export default function DailyPlanner() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [newTask, setNewTask] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  const addTask = () => {
    if (!newTask.trim()) return
    setTasks(prev => [...prev, {
      id: Date.now().toString(),
      title: newTask.trim(),
      done: false,
      priority: 'medium',
    }])
    setNewTask('')
  }

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const completedCount = tasks.filter(t => t.done).length
  const nextTask = tasks.find(t => !t.done && t.time)

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Planner</h2>
          <p className="text-sm text-muted-foreground">
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Badge variant="outline" className="text-xs font-mono text-primary/60 border-primary/20">
          <Clock className="w-3 h-3 mr-1" />
          {completedCount}/{tasks.length} done
        </Badge>
      </div>

      {/* Progress Bar */}
      <Card className="jarvis-card">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Today's Progress</span>
            <span className="text-xs text-primary font-mono">{tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-500"
              style={{ width: `${tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Next Up */}
      {nextTask && (
        <Card className="jarvis-card jarvis-border">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Zap className="w-4 h-4 text-primary animate-jarvis-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-primary uppercase tracking-wider">Up Next</p>
                <p className="font-medium text-foreground">{nextTask.title}</p>
              </div>
              {nextTask.time && (
                <Badge variant="outline" className="text-xs border-primary/20 text-primary">
                  {nextTask.time}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Task */}
      <div className="flex gap-2">
        <Input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 bg-background/50 border-primary/20 focus:border-primary/40"
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <Button
          onClick={addTask}
          size="sm"
          className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Task List */}
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <Card
            key={task.id}
            className={cn(
              'jarvis-card jarvis-card-hover cursor-pointer group transition-all',
              task.done && 'opacity-60'
            )}
            onClick={() => toggleTask(task.id)}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                  task.done
                    ? 'bg-primary border-primary'
                    : 'border-border group-hover:border-primary/50'
                )}>
                  {task.done && (
                    <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium transition-all',
                    task.done ? 'line-through text-muted-foreground' : 'text-foreground'
                  )}>
                    {task.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', priorityColors[task.priority])}>
                    {task.priority}
                  </span>
                  {task.time && (
                    <span className="text-xs text-muted-foreground font-mono">{task.time}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeTask(task.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tasks.length === 0 && (
        <Card className="jarvis-card">
          <CardContent className="py-12 text-center">
            <CheckSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tasks yet. Add one above!</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
