"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  TrendingUp, Users, Eye, Heart, MessageCircle, Share2, ArrowUpRight, Plus, Activity, Link as LinkIcon, BarChart3, AlertCircle, Loader2, Facebook, Instagram, Youtube, Sparkles, Flame, Calendar, RefreshCw, CheckCircle2, XCircle, Crown, ExternalLink, X
} from "lucide-react"
import Link from "next/link"
import { motion, useSpring, useTransform, AnimatePresence } from "framer-motion"
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { format } from 'date-fns'

// --- Platform Config ---
const PLATFORM_CONFIG: Record<string, { color: string, gradient: string, icon: any, bg: string, border: string, label: string }> = {
  youtube:   { color: '#FF0000', gradient: 'from-red-500/20 to-red-900/5', icon: Youtube, bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'YouTube' },
  facebook:  { color: '#1877F2', gradient: 'from-blue-500/20 to-blue-900/5', icon: Facebook, bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Facebook' },
  instagram: { color: '#E4405F', gradient: 'from-pink-500/20 to-purple-900/5', icon: Instagram, bg: 'bg-pink-500/10', border: 'border-pink-500/20', label: 'Instagram' },
}

const PlatformIcon = ({ name, size = "w-5 h-5" }: { name: string, size?: string }) => {
  const config = PLATFORM_CONFIG[name?.toLowerCase()] || { icon: Activity, color: '#00f0ff' }
  const Icon = config.icon
  return <Icon className={size} style={{ color: config.color }} />
}

// --- Animated Number Component ---
function AnimatedNumber({ value, isPercent = false, isK = false }: { value: number, isPercent?: boolean, isK?: boolean }) {
  const spring = useSpring(0, { bounce: 0, duration: 1500 })
  const display = useTransform(spring, (current) => {
    if (isPercent) return current.toFixed(1) + "%"
    if (isK && current >= 1000) return (current / 1000).toFixed(1) + "K"
    return Math.round(current).toLocaleString()
  })

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <motion.span>{display}</motion.span>
}

// --- Sparkline Component ---
function SparkLine({ data, dataKey, color }: { data: any[], dataKey: string, color: string }) {
  if (!data || data.length === 0) {
    return <div className="h-8 w-full flex items-center justify-center text-[10px] text-white/10">No data</div>;
  }
  return (
    <div className="w-full h-8 mt-2 opacity-70">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fillOpacity={0.05} fill={color} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  
  // Feature 2 state: Selected platform for post grid
  const [postPlatform, setPostPlatform] = useState<'facebook' | 'instagram' | 'youtube'>('facebook')
  
  // Feature 3 state: Selected post for modal detail view
  const [selectedPostForModal, setSelectedPostForModal] = useState<any>(null)

  const loadData = useCallback(async (isRefresh = false, targetRange = range) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    
    try {
      if (isRefresh) {
        console.log('[ANALYTICS] Refresh: calling /api/fetch-analytics first...')
        try {
          await fetch('/api/fetch-analytics')
        } catch (syncErr: any) {
          console.warn('[ANALYTICS] Sync during refresh failed (continuing to read):', syncErr.message)
        }
      }

      console.log(`[ANALYTICS] Loading analytics data from /api/analytics/advanced?range=${targetRange}...`)
      const res = await fetch(`/api/analytics/advanced?range=${targetRange}`)
      const json = await res.json()
      
      if (!res.ok || json.error) {
        setError(json.error || 'Failed to load analytics')
        return
      }
      
      setData(json)
      setError(null)
    } catch (err: any) {
      console.error('[ANALYTICS CATCH ERROR]:', err)
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [range])

  // Initial load and auto-refresh every 30 seconds
  useEffect(() => {
    loadData(false, range)
    const interval = setInterval(() => {
      loadData(false, range)
    }, 30000)
    return () => clearInterval(interval)
  }, [range, loadData])

  // Background poller to actually TRIGGER fetch-analytics every 60s
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[ANALYTICS] Bypassing background fetch-analytics polling in development mode');
      return;
    }
    const triggerFetch = async () => {
      try { await fetch('/api/fetch-analytics'); } catch (e) { }
    }
    triggerFetch()
    const interval = setInterval(triggerFetch, 60000)
    return () => clearInterval(interval)
  }, [])

  // Format the last updated time safely
  const lastUpdate = useMemo(() => {
    if (data?.latestSnapshot?.snapshot_date) {
      return new Date(data.latestSnapshot.snapshot_date).toLocaleTimeString()
    }
    return new Date().toLocaleTimeString()
  }, [data?.latestSnapshot])

  // --- Compute success posts filtered by platform for Feature 2 ---
  const filteredPostLogs = useMemo(() => {
    if (!data?.allPostLogs) return []
    return data.allPostLogs.filter((log: any) =>
      log.platform?.toLowerCase() === postPlatform &&
      (log.status === 'success' || log.status === 'published')
    )
  }, [data?.allPostLogs, postPlatform])

  // --- Stats summary bar for Feature 2 ---
  const postPlatformStats = useMemo(() => {
    let postsCount = filteredPostLogs.length
    let totalLikes = 0
    let totalViews = 0
    let totalEngagement = 0
    let totalImpressions = 0

    filteredPostLogs.forEach((log: any) => {
      totalLikes += log.likes || 0
      totalViews += log.views || 0
      totalEngagement += log.engagement || 0
      totalImpressions += log.impressions || 0
    })

    let avgER = 0
    if (totalImpressions > 0) {
      avgER = (totalEngagement / totalImpressions) * 100
    } else if (totalViews > 0) {
      avgER = (totalEngagement / totalViews) * 100
    }

    return { postsCount, totalLikes, avgER }
  }, [filteredPostLogs])

  // --- Feature 4: Top 8 posts by engagement data prep ---
  const postPerformanceData = useMemo(() => {
    if (!data?.allPostLogs) return []
    return [...data.allPostLogs]
      .filter((log: any) => log.status === 'success' || log.status === 'published')
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 8)
      .map((log: any) => {
        const platform = (log.platform || '').trim().toLowerCase()
        const fill = platform === 'facebook' ? '#1877F2' : platform === 'instagram' ? '#E4405F' : '#FF0000'
        const rawContent = log.content || 'Media Post'
        const displayName = rawContent.length > 20 ? rawContent.substring(0, 20) + '...' : rawContent
        return {
          name: displayName,
          engagement: log.engagement || 0,
          fill
        }
      })
  }, [data?.allPostLogs])

  // --- Feature 5: Export CSV logic ---
  const handleExportCSV = () => {
    if (!data?.allPostLogs || data.allPostLogs.length === 0) {
      alert("No data available to export.");
      return;
    }
    const headers = ["Platform", "Content", "Views", "Likes", "Comments", "Engagement", "Platform Post ID", "Created At"];
    const rows = data.allPostLogs.map((log: any) => [
      log.platform || "",
      `"${(log.content || "").replace(/"/g, '""')}"`,
      log.views || 0,
      log.likes || 0,
      log.comments || 0,
      log.engagement || 0,
      log.platform_post_id || "",
      new Date(log.created_at).toLocaleString()
    ]);

    const csvContent = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `analytics_export_${dateStr}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Destructure and default data structures ---
  const platforms = useMemo(() => data?.platforms || {
    facebook: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
    instagram: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
    youtube: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 }
  }, [data?.platforms])

  const totalReach = data?.merged_totals?.reach || 0;
  const totalImpressions = data?.merged_totals?.impressions || 0;
  const totalViews = data?.merged_totals?.views || 0;
  const totalLikes = data?.merged_totals?.likes || 0;
  const totalComments = data?.merged_totals?.comments || 0;
  const totalEngagement = data?.merged_totals?.engagement || 0;
  const engagementRate = totalImpressions > 0 ? (totalEngagement / totalImpressions) * 100 : 0;

  const dynamicStats = [
    { name: "Total Reach", value: totalReach, isK: true, icon: Users, color: "text-neon-cyan", graphKey: "reach", graphColor: "#00f0ff" },
    { name: "Total Impressions", value: totalImpressions, isK: true, icon: Eye, color: "text-neon-purple", graphKey: "impressions", graphColor: "#8b5cf6" },
    { name: "Total Views", value: totalViews, isK: true, icon: BarChart3, color: "text-blue-400", graphKey: "views", graphColor: "#3b82f6" },
    { name: "Total Likes", value: totalLikes, isK: true, icon: Heart, color: "text-neon-pink", graphKey: "likes", graphColor: "#ec4899" },
    { name: "Total Comments", value: totalComments, isK: true, icon: MessageCircle, color: "text-amber-400", graphKey: "comments", graphColor: "#f59e0b" },
    { name: "Total Engagement", value: totalEngagement, isK: true, icon: Flame, color: "text-neon-green", graphKey: "engagement", graphColor: "#10b981" },
  ]

  const timeSeriesData = useMemo(() => {
    return (data?.date_wise || []).map((h: any) => ({
      time: h.date || "",
      reach: h.reach || 0,
      impressions: h.impressions || 0,
      views: h.views || 0,
      likes: h.likes || 0,
      comments: h.comments || 0,
      engagement: h.engagement || 0,
    }))
  }, [data?.date_wise])

  const donutData = useMemo(() => {
    return [
      { name: 'Likes', value: totalLikes, fill: '#ec4899' },
      { name: 'Comments', value: totalComments, fill: '#f59e0b' }
    ].filter(d => d.value > 0)
  }, [totalLikes, totalComments])

  const platformCompareData = useMemo(() => {
    return [
      { name: 'Facebook', views: platforms.facebook.views, likes: platforms.facebook.likes, comments: platforms.facebook.comments },
      { name: 'Instagram', views: platforms.instagram.views, likes: platforms.instagram.likes, comments: platforms.instagram.comments },
      { name: 'YouTube', views: platforms.youtube.views, likes: platforms.youtube.likes, comments: platforms.youtube.comments },
    ]
  }, [platforms])

  const platformEngData = useMemo(() => {
    return [
      { name: 'Facebook', value: platforms.facebook.engagement, fill: '#1877F2' },
      { name: 'Instagram', value: platforms.instagram.engagement, fill: '#E4405F' },
      { name: 'YouTube', value: platforms.youtube.engagement, fill: '#FF0000' },
    ].filter(d => d.value > 0)
  }, [platforms])

  // --- SKELETON LOADING STATE ---
  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-12 w-64 bg-white/5 rounded-md glass"></div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="glass border-white/5"><div className="h-28"></div></Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="glass h-[400px] border-white/5"></Card>
          <Card className="glass h-[400px] border-white/5"></Card>
        </div>
      </div>
    )
  }

  // --- ERROR STATE ---
  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-2xl font-bold">Failed to load analytics</h2>
          <p className="text-muted-foreground">Please check your connection and try again. Retrying automatically in 30s...</p>
          <Button variant="outline" onClick={() => loadData(true)} className="gap-2 border-white/10 text-white/60">
            <RefreshCw className="w-3.5 h-3.5" /> Retry Now
          </Button>
        </div>
      </div>
    )
  }

  // --- EMPTY STATES ---
  if (data?.hasAccounts === false) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
        <div className="w-20 h-20 bg-neon-cyan/10 rounded-full flex items-center justify-center border border-neon-cyan/20">
          <LinkIcon className="w-10 h-10 text-neon-cyan" />
        </div>
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent mb-2">Connect Your Accounts</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            You haven&apos;t linked any social profiles. Connect Meta, YouTube, or Twitter to unlock the live analytics engine.
          </p>
        </div>
        <Link href="/dashboard/settings">
          <Button variant="neon" size="lg" className="gap-2 shadow-lg shadow-neon-cyan/20 mt-4">
            <ArrowUpRight className="w-5 h-5" /> Let&apos;s Connect
          </Button>
        </Link>
      </div>
    )
  }

  if (data?.hasAccounts === true && !data?.latestSnapshot) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-[70vh] text-center space-y-6">
        <Loader2 className="w-12 h-12 text-neon-cyan animate-spin" />
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent mb-2">Fetching First Data</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your accounts are connected! We are gathering the initial historical analytics. This normally takes about 30 seconds...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ═══════════ HEADER ═══════════ */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent">
              Real-Time Analytics
            </h1>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-neon-green/10 border border-neon-green/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green"></span>
              </span>
              <span className="text-xs font-semibold text-neon-green uppercase tracking-wide">Live</span>
            </div>
          </div>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-neon-cyan opacity-70" />
            Snapshot auto-refreshing every 30s. Last updated: {lastUpdate} • Showing last {range === '7d' ? '7' : range === '90d' ? '90' : '30'} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}
            className="gap-2 border-white/10 text-white/60 hover:text-white hover:border-white/20 glass"
          >
            <Share2 className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={refreshing}
            className="gap-2 border-white/10 text-white/60 hover:text-white hover:border-white/20 glass"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Syncing...' : 'Sync Now'}
          </Button>
          <Link href="/dashboard/create">
            <Button variant="neon" className="gap-2 shadow-neon-cyan/20 px-6">
              <Plus className="w-4 h-4" /> Create Post
            </Button>
          </Link>
        </div>
      </div>

      {/* ═══════════ FEATURE 1: Date Range Selector ═══════════ */}
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-white/40 uppercase tracking-widest font-semibold mr-2">Time Range:</span>
        {(['7d', '30d', '90d'] as const).map((r: '7d' | '30d' | '90d') => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              range === r
                ? 'bg-neon-cyan text-black border-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                : 'bg-white/[0.02] text-white/60 border-white/5 hover:text-white hover:bg-white/5'
            }`}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ═══════════ 6 KPI CARDS WITH ANIMATED NUMBER + SPARKLINE ═══════════ */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {dynamicStats.map((stat, i) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="glass hover:glow-cyan transition-all h-full relative overflow-hidden group border-white/5 bg-white/[0.02]">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full -translate-y-12 translate-x-8 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
                <CardTitle className="text-[10px] text-white/40 uppercase tracking-wider font-semibold relative z-10">
                  {stat.name}
                </CardTitle>
                <stat.icon className={`h-3.5 w-3.5 ${stat.color} relative z-10`} />
              </CardHeader>
              <CardContent className="relative z-10 p-3 pt-0">
                <div className="text-xl font-bold text-white tracking-tight leading-none">
                  <AnimatedNumber value={stat.value} isK={stat.isK} />
                </div>
                <SparkLine data={timeSeriesData} dataKey={stat.graphKey} color={stat.graphColor} />
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ═══════════ PLATFORM PERFORMANCE BREAKDOWN ═══════════ */}
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(PLATFORM_CONFIG).map(([platformKey, config], idx) => {
          const stats = platforms[platformKey] || { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 };
          const Icon = config.icon;
          const er = stats.impressions > 0 
            ? ((stats.engagement / stats.impressions) * 100).toFixed(1) 
            : stats.views > 0 
              ? ((stats.engagement / stats.views) * 100).toFixed(1)
              : '0.0';

          return (
            <motion.div
              key={platformKey}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className={`border-white/5 bg-gradient-to-br ${config.gradient} hover:border-white/15 transition-all h-full`}>
                <CardHeader className="pb-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center">
                        <Icon className="w-4.5 h-4.5" style={{ color: config.color }} />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold text-white">{config.label}</CardTitle>
                        <p className="text-[10px] text-white/30">{stats.count || 0} successful posts</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black" style={{ color: config.color }}>{er}%</p>
                      <p className="text-[8px] text-white/25 uppercase">Avg ER</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { l: 'Views', v: stats.views },
                      { l: 'Likes', v: stats.likes },
                      { l: 'Comments', v: stats.comments },
                      { l: 'Reach', v: stats.reach },
                      { l: 'Impressions', v: stats.impressions },
                      { l: 'Engagement', v: stats.engagement }
                    ].map(m => (
                      <div key={m.l} className="bg-black/20 rounded-lg p-2 text-center border border-white/5">
                        <p className="text-[8px] text-white/25 uppercase mb-0.5">{m.l}</p>
                        <p className="text-xs font-bold text-white"><AnimatedNumber value={m.v} isK /></p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* ═══════════ FEATURE 2: Published Posts by Platform (Tabs & Cards) ═══════════ */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Crown className="w-5 h-5 text-neon-cyan" />
            <span>Published Posts by Platform</span>
          </CardTitle>
          <CardDescription className="text-white/25">Filter and review details of live posts per platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={postPlatform} onValueChange={(val) => setPostPlatform(val as any)} className="w-full">
            <TabsList className="bg-white/5 border border-white/5 p-1 rounded-xl w-full max-w-md">
              <TabsTrigger value="facebook" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-400 rounded-lg text-white/40 text-sm font-medium px-4 flex-1 py-2 flex items-center justify-center gap-2">
                <Facebook className="w-4 h-4 text-[#1877F2]" /> Facebook
              </TabsTrigger>
              <TabsTrigger value="instagram" className="data-[state=active]:bg-pink-600/20 data-[state=active]:text-pink-400 rounded-lg text-white/40 text-sm font-medium px-4 flex-1 py-2 flex items-center justify-center gap-2">
                <Instagram className="w-4 h-4 text-[#E4405F]" /> Instagram
              </TabsTrigger>
              <TabsTrigger value="youtube" className="data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 rounded-lg text-white/40 text-sm font-medium px-4 flex-1 py-2 flex items-center justify-center gap-2">
                <Youtube className="w-4 h-4 text-[#FF0000]" /> YouTube
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Mini Stat Summary Bar */}
          <div className="flex items-center gap-4 py-2 px-4 rounded-xl bg-white/[0.01] border border-white/5 text-xs text-white/60">
            <span className="font-semibold text-white uppercase tracking-wider text-[10px]">Summary:</span>
            <span><strong className="text-white">{postPlatformStats.postsCount}</strong> posts</span>
            <span className="text-white/20">|</span>
            <span><strong className="text-white">{postPlatformStats.totalLikes.toLocaleString()}</strong> total likes</span>
            <span className="text-white/20">|</span>
            <span>Avg Engagement Rate: <strong className="text-neon-cyan">{postPlatformStats.avgER.toFixed(2)}%</strong></span>
          </div>

          {/* Post Cards Grid */}
          {filteredPostLogs.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {filteredPostLogs.map((post: any, idx: number) => {
                const borderClass = postPlatform === 'facebook' 
                  ? 'border-blue-500/20 hover:border-blue-500/40' 
                  : postPlatform === 'instagram' 
                    ? 'border-pink-500/20 hover:border-pink-500/40' 
                    : 'border-red-500/20 hover:border-red-500/40';

                return (
                  <motion.div
                    key={post.id || idx}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    onClick={() => setSelectedPostForModal(post)}
                    className={`cursor-pointer group border ${borderClass} bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 space-y-3`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Published
                        </span>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-black/30 flex items-center justify-center flex-shrink-0">
                          <PlatformIcon name={postPlatform} size="w-4 h-4" />
                        </div>
                        <p className="text-sm font-bold text-white group-hover:text-neon-cyan transition-colors line-clamp-2 leading-snug">
                          {post.content ? (post.content.length > 80 ? post.content.substring(0, 80) + '...' : post.content) : "Media post"}
                        </p>
                      </div>
                    </div>

                    {/* Metric Chips */}
                    <div className="grid grid-cols-4 gap-1 pt-3 border-t border-white/5 text-center text-[10px] text-white/40">
                      <div>
                        <span className="block text-white font-bold">{post.views?.toLocaleString() || 0}</span>
                        👁 views
                      </div>
                      <div>
                        <span className="block text-white font-bold">{post.likes?.toLocaleString() || 0}</span>
                        ❤️ likes
                      </div>
                      <div>
                        <span className="block text-white font-bold">{post.comments?.toLocaleString() || 0}</span>
                        💬 comments
                      </div>
                      <div>
                        <span className="block text-white font-bold">{post.engagement?.toLocaleString() || 0}</span>
                        ⚡ engage
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[8px] text-white/20 font-mono">
                      <span>ID: {post.platform_post_id ? post.platform_post_id.substring(0, 12) : 'N/A'}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
              <PlatformIcon name={postPlatform} size="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-white/40 text-sm font-medium">No published posts tracked for this platform in this range</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════════ MAIN TAB SECTION: Charts | Compare | Top Posts ═══════════ */}
      <Tabs defaultValue="charts" className="space-y-6">
        <TabsList className="bg-white/5 border border-white/5 p-1 rounded-xl w-full max-w-md">
          <TabsTrigger value="charts" className="rounded-lg text-sm px-4 flex-1 py-2">Charts</TabsTrigger>
          <TabsTrigger value="compare" className="rounded-lg text-sm px-4 flex-1 py-2">Compare</TabsTrigger>
          <TabsTrigger value="top-posts" className="rounded-lg text-sm px-4 flex-1 py-2">Top Posts</TabsTrigger>
        </TabsList>

        {/* ═══ CHARTS TAB ═══ */}
        <TabsContent value="charts" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Performance Trends Area Chart */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle>Performance Trends</CardTitle>
                <CardDescription>Views, Reach &amp; Impressions timelines</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00f0ff" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                      <Legend />
                      <Area type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} fillOpacity={0.05} fill="#3b82f6" name="Views" />
                      <Area type="monotone" dataKey="reach" stroke="#00f0ff" strokeWidth={2} fillOpacity={1} fill="url(#colorReach)" name="Reach" />
                      <Area type="monotone" dataKey="impressions" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorImpressions)" name="Impressions" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">Gathering data...</div>
                )}
              </CardContent>
            </Card>

            {/* Engagement composition PieChart */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Engagement Mix</CardTitle>
                    <CardDescription>Ratio of likes to comments</CardDescription>
                  </div>
                  <Heart className="w-5 h-5 text-neon-pink" />
                </div>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                {donutData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {donutData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => [`${value} Interactions`]}
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-muted-foreground">No engagement data available.</div>
                )}
              </CardContent>
            </Card>

            {/* Likes & Comments LineChart */}
            <Card className="glass border-white/10 bg-white/[0.02] md:col-span-2">
              <CardHeader>
                <CardTitle>Likes &amp; Comments Trends</CardTitle>
                <CardDescription>Interactive view of reaction volume</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {timeSeriesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <XAxis dataKey="time" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="likes" stroke="#ec4899" strokeWidth={2} dot={false} name="Likes" />
                      <Line type="monotone" dataKey="comments" stroke="#f59e0b" strokeWidth={2} dot={false} name="Comments" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No trend data.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ COMPARE TAB ═══ */}
        <TabsContent value="compare" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* BarChart: Platform Comparison */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle>Platform Comparison</CardTitle>
                <CardDescription>Side-by-side metric profile across profiles</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {platformCompareData.some(d => d.views > 0 || d.likes > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={platformCompareData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
                      <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }} />
                      <Legend />
                      <Bar dataKey="views" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Views" />
                      <Bar dataKey="likes" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Likes" />
                      <Bar dataKey="comments" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Comments" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No comparison data.</div>
                )}
              </CardContent>
            </Card>

            {/* PieChart: Engagement by Platform */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle>Engagement by Platform</CardTitle>
                <CardDescription>Share of interaction contribution</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                {platformEngData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={platformEngData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {platformEngData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} formatter={(value) => [`${value} Interactions`]} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-muted-foreground">No comparison share data.</div>
                )}
              </CardContent>
            </Card>

            {/* FEATURE 4 — Content Format Performance */}
            <Card className="glass border-white/10 bg-white/[0.02] md:col-span-2">
              <CardHeader>
                <CardTitle>Content Performance by Post</CardTitle>
                <CardDescription>Top 8 posts ranked by total engagement value</CardDescription>
              </CardHeader>
              <CardContent className="h-[240px]">
                {postPerformanceData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart layout="vertical" data={postPerformanceData} margin={{ top: 5, right: 20, left: 30, bottom: 5 }} barSize={12}>
                      <XAxis type="number" stroke="#666" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" stroke="#666" fontSize={9} tickLine={false} axisLine={false} width={100} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#000', borderColor: '#333', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="engagement" radius={[0, 4, 4, 0]}>
                        {postPerformanceData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">No post log data.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TOP POSTS TAB ═══ */}
        <TabsContent value="top-posts" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Top by Likes */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Heart className="w-4 h-4 text-neon-pink" /> Top Posts by Likes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.topPosts?.byLikes?.length > 0 ? (
                  data.topPosts.byLikes.map((post: any, idx: number) => (
                    <div
                      key={post.id || idx}
                      onClick={() => setSelectedPostForModal(post)}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/5 hover:border-white/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center flex-shrink-0">
                          <PlatformIcon name={post.platform} size="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white group-hover:text-neon-cyan transition-colors truncate">{post.content || 'Media post'}</p>
                          <span className="text-[9px] text-white/30">{new Date(post.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-neon-pink flex items-center gap-1">
                        ❤️ {post.likes}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-white/20 text-xs">No posts tracked.</p>
                )}
              </CardContent>
            </Card>

            {/* Top by Engagement */}
            <Card className="glass border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-neon-green" /> Top Posts by Engagement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.topPosts?.byEngagement?.length > 0 ? (
                  data.topPosts.byEngagement.map((post: any, idx: number) => (
                    <div
                      key={post.id || idx}
                      onClick={() => setSelectedPostForModal(post)}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.01] border border-white/5 hover:border-white/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded bg-black/40 flex items-center justify-center flex-shrink-0">
                          <PlatformIcon name={post.platform} size="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-white group-hover:text-neon-cyan transition-colors truncate">{post.content || 'Media post'}</p>
                          <span className="text-[9px] text-white/30">{new Date(post.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-neon-green flex items-center gap-1">
                        ⚡ {post.engagement}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-6 text-white/20 text-xs">No posts tracked.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ═══════════ FEATURE 3: Detailed Post Performance Modal ═══════════ */}
      <AnimatePresence>
        {selectedPostForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPostForModal(null)}
              className="fixed inset-0 bg-black/85 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-zinc-950/90 border border-white/10 rounded-2xl p-6 shadow-2xl z-10 glass overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <PlatformIcon name={selectedPostForModal.platform} size="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      {selectedPostForModal.platform} Post Analytics
                    </h3>
                    <p className="text-xs text-white/40">Performance Indicators</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPostForModal(null)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Content Preview */}
              <div className="p-3.5 bg-white/[0.02] border border-white/5 rounded-xl text-sm text-white/80 mb-5">
                <p className="font-semibold text-white/40 text-[10px] uppercase tracking-wider mb-1">Content Preview</p>
                <p className="leading-relaxed">{selectedPostForModal.content || 'Media Post'}</p>
              </div>

              {/* 2x3 Grid of Metrics */}
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {[
                  { label: "Views", val: selectedPostForModal.views || 0, color: "text-[#8b5cf6]", icon: Eye },
                  { label: "Reach", val: selectedPostForModal.reach || 0, color: "text-[#00f0ff]", icon: Users },
                  { label: "Impressions", val: selectedPostForModal.impressions || 0, color: "text-[#10b981]", icon: BarChart3 },
                  { label: "Likes", val: selectedPostForModal.likes || 0, color: "text-[#f43f5e]", icon: Heart },
                  { label: "Comments", val: selectedPostForModal.comments || 0, color: "text-[#f59e0b]", icon: MessageCircle },
                  { label: "Shares", val: selectedPostForModal.shares || 0, color: "text-[#3b82f6]", icon: Share2 },
                ].map((m) => (
                  <div key={m.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-white/30 uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1">
                      <m.icon className="w-3 h-3" />
                      {m.label}
                    </p>
                    <p className={`text-base font-extrabold ${m.color}`}>
                      {m.val.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Engagement Rate calculation */}
              <div className="bg-gradient-to-r from-neon-cyan/10 to-neon-purple/10 border border-neon-cyan/20 rounded-xl p-3.5 flex items-center justify-between mb-5">
                <div>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Engagement Rate</p>
                  <p className="text-xl font-black text-neon-cyan mt-0.5">
                    {(() => {
                      const likes = selectedPostForModal.likes || 0
                      const comments = selectedPostForModal.comments || 0
                      const views = selectedPostForModal.views || 0
                      if (views > 0) return `${(((likes + comments) / views) * 100).toFixed(1)}%`
                      return "0.0%"
                    })()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Total Engagement</p>
                  <p className="text-xl font-black text-neon-purple mt-0.5">
                    {(selectedPostForModal.engagement || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* System Metadata */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider">System Metadata</h4>
                <div className="bg-white/[0.02] border border-white/5 rounded-xl divide-y divide-white/5 text-xs overflow-hidden">
                  <div className="flex justify-between p-3">
                    <span className="text-white/40">Platform Post ID</span>
                    <span className="font-mono text-white/80 select-all">
                      {selectedPostForModal.platform_post_id || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-white/40">Publish Status</span>
                    <span className="font-bold text-emerald-400">
                      Published
                    </span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="text-white/40">Created Date</span>
                    <span className="text-white/80">
                      {new Date(selectedPostForModal.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
