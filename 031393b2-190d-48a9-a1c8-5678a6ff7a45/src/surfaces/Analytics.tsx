import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts'
import { TrendingUp, BarChart3, PieChart as PieChartIcon, Activity, Flame } from 'lucide-react'

const weeklyData = [
  { day: 'Mon', tasks: 4, habits: 3, mood: 4 },
  { day: 'Tue', tasks: 6, habits: 4, mood: 5 },
  { day: 'Wed', tasks: 3, habits: 2, mood: 3 },
  { day: 'Thu', tasks: 5, habits: 4, mood: 4 },
  { day: 'Fri', tasks: 7, habits: 5, mood: 5 },
  { day: 'Sat', tasks: 2, habits: 3, mood: 4 },
  { day: 'Sun', tasks: 1, habits: 2, mood: 3 },
]

const habitBreakdown = [
  { name: 'Exercise', value: 85, color: '#34d399' },
  { name: 'Reading', value: 70, color: '#60a5fa' },
  { name: 'Meditation', value: 60, color: '#a78bfa' },
  { name: 'No Social', value: 45, color: '#fbbf24' },
]

const customTooltipStyle = {
  backgroundColor: 'oklch(0.12 0.015 250)',
  border: '1px solid oklch(0.75 0.15 195 / 0.2)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '12px',
}

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('week')

  return (
    <div className="flex flex-col gap-6 animate-jarvis-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Analytics</h2>
          <p className="text-sm text-muted-foreground">Insights into your productivity</p>
        </div>
        <Badge variant="outline" className="text-xs font-mono text-primary/60 border-primary/20">
          <Activity className="w-3 h-3 mr-1" />
          Live Data
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="jarvis-card jarvis-card-hover">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Tasks Done</span>
            </div>
            <p className="text-2xl font-semibold">28</p>
            <p className="text-xs text-emerald-400 mt-1">↑ 12% from last week</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card jarvis-card-hover">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Best Streak</span>
            </div>
            <p className="text-2xl font-semibold">5 days</p>
            <p className="text-xs text-amber-400 mt-1">Exercise habit</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card jarvis-card-hover">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Avg Mood</span>
            </div>
            <p className="text-2xl font-semibold">4.0</p>
            <p className="text-xs text-blue-400 mt-1">Good average</p>
          </CardContent>
        </Card>
        <Card className="jarvis-card jarvis-card-hover">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <PieChartIcon className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Completion</span>
            </div>
            <p className="text-2xl font-semibold">72%</p>
            <p className="text-xs text-purple-400 mt-1">Overall rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-background/50 border border-border w-full sm:w-auto">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="habits" className="text-xs">Habits</TabsTrigger>
          <TabsTrigger value="mood" className="text-xs">Mood</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="jarvis-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Weekly Productivity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] sm:h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient id="tasksGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="oklch(0.75 0.15 195)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="oklch(0.75 0.15 195)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="habitsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.2 0.02 250)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Area type="monotone" dataKey="tasks" stroke="oklch(0.75 0.15 195)" fill="url(#tasksGrad)" strokeWidth={2} />
                    <Area type="monotone" dataKey="habits" stroke="#34d399" fill="url(#habitsGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="habits" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="jarvis-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                  Habit Consistency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={habitBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.2 0.02 250)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip contentStyle={customTooltipStyle} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                        {habitBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="jarvis-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                  Habit Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={habitBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {habitBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={customTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 justify-center mt-2">
                  {habitBreakdown.map((item) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-xs text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="mood" className="mt-4">
          <Card className="jarvis-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">
                Mood Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.2 0.02 250)" />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: 'oklch(0.6 0.02 250)' }} axisLine={false} tickLine={false} domain={[0, 6]} />
                    <Tooltip contentStyle={customTooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="mood"
                      stroke="#a78bfa"
                      strokeWidth={3}
                      dot={{ fill: '#a78bfa', strokeWidth: 2, r: 5 }}
                      activeDot={{ r: 7, fill: '#a78bfa' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
