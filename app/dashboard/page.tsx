"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  TrendingUp, Users, Eye, Heart, MessageCircle, ArrowUpRight, Plus, Activity,
  Link as LinkIcon, BarChart3, AlertCircle, Youtube, Facebook, Instagram,
  Zap, CheckCircle2, XCircle, Clock, LayoutDashboard, Sparkles, ArrowDownRight,
  Flame, Crown, ExternalLink
} from "lucide-react"
import Link from "next/link"
import useSWR from "swr"
import { motion, useSpring, useTransform } from "framer-motion"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch')
  return data
}

function AnimatedNumber({ value, isPercent = false, isK = false }: { value: number, isPercent?: boolean, isK?: boolean }) {
  const spring = useSpring(0, { bounce: 0, duration: 1500 })
  const display = useTransform(spring, (current) => {
    if (isPercent) return current.toFixed(1) + "%"
    if (isK && current >= 1000000) return (current / 1000000).toFixed(1) + "M"
    if (isK && current >= 1000) return (current / 1000).toFixed(1) + "K"
    return Math.round(current).toLocaleString()
  })
  useEffect(() => { spring.set(value || 0) }, [spring, value])
  return <motion.span>{display}</motion.span>
}

const PLATFORM_CONFIG: Record<string, { color: string, gradient: string, icon: any, label: string }> = {
  youtube:   { color: '#FF0000', gradient: 'from-red-500/20 to-red-900/5', icon: Youtube, label: 'YouTube' },
  facebook:  { color: '#1877F2', gradient: 'from-blue-500/20 to-blue-900/5', icon: Facebook, label: 'Facebook' },
  instagram: { color: '#E4405F', gradient: 'from-pink-500/20 to-purple-900/5', icon: Instagram, label: 'Instagram' },
}

const PlatformIcon = ({ name, size = "w-5 h-5" }: { name: string, size?: string }) => {
  const config = PLATFORM_CONFIG[name?.toLowerCase()] || { icon: Activity, color: '#00f0ff' }
  const Icon = config.icon
  return <Icon className={size} style={{ color: config.color }} />
}

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR('/api/dashboard/stats', fetcher, { refreshInterval: 15000 })

  // --- LOADING ---
  if (isLoading || (!data && !error)) {
    return (
      <div className="p-6 space-y-6 animate-pulse">
        <div className="h-14 w-72 bg-white/5 rounded-xl" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-[400px] bg-white/5 rounded-xl" />
          <div className="h-[400px] bg-white/5 rounded-xl" />
        </div>
      </div>
    )
  }

  // --- ERROR ---
  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Dashboard Error</h2>
          <p className="text-white/40">{error.message}</p>
        </div>
      </div>
    )
  }

  const {
    hasAccounts, connectedPlatforms, totalPosts, successPosts, failedPosts,
    platformStats, recentPosts, latestSnapshot, snapshotCount, lastUpdated,
    totalViews, totalLikes, totalComments, totalReach, totalImpressions, totalEngagement,
    totalAttempts
  } = data || {}

  // --- NO ACCOUNTS ---
  if (!hasAccounts) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-[80vh] text-center space-y-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}
          className="w-24 h-24 rounded-3xl bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/20 flex items-center justify-center"
        >
          <Sparkles className="w-12 h-12 text-neon-cyan" />
        </motion.div>
        <div>
          <h2 className="text-4xl font-black bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink bg-clip-text text-transparent mb-3">Welcome to UniPost AI</h2>
          <p className="text-white/40 max-w-lg mx-auto text-lg">Connect your social media accounts to start publishing and tracking analytics across all platforms.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/settings">
            <Button size="lg" className="bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-bold px-8 py-6 text-lg rounded-xl gap-2">
              <Zap className="w-5 h-5" /> Connect Accounts
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // --- STATS ---
  const snap = latestSnapshot
  const engRate = (totalImpressions || 0) > 0 ? ((totalEngagement || 0) / (totalImpressions || 0) * 100) : 0

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Dashboard</h1>
          </div>
          <div className="flex items-center gap-3 ml-[52px]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
            </div>
            <span className="text-xs text-white/30">Updated {new Date(lastUpdated || Date.now()).toLocaleTimeString()}</span>
          </div>
        </motion.div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/analytics">
            <Button variant="outline" size="sm" className="gap-2 border-white/10 text-white/60 hover:text-white">
              <BarChart3 className="w-3.5 h-3.5" /> Full Analytics
            </Button>
          </Link>
          <Link href="/dashboard/create">
            <Button size="sm" className="bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-semibold gap-2">
              <Plus className="w-3.5 h-3.5" /> Create Post
            </Button>
          </Link>
        </div>
      </div>

      {/* ═══ QUICK STATS ═══ */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { name: "Total Posts", value: totalPosts || 0, icon: BarChart3, color: "#00f0ff", sub: `${successPosts || 0} published` },
          { name: "Total Views", value: totalViews, isK: true, icon: Eye, color: "#8b5cf6", sub: `${snapshotCount || 0} snapshots` },
          { name: "Engagement", value: totalEngagement, isK: true, icon: Flame, color: "#ec4899", sub: `${totalLikes || 0} likes + ${totalComments || 0} comments` },
          { name: "Eng. Rate", value: engRate, isPercent: true, icon: TrendingUp, color: "#10b981", sub: `${totalImpressions || 0} impressions` },
        ].map((stat, i) => (
          <motion.div key={stat.name} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="border-white/5 bg-white/[0.02] hover:border-white/10 transition-all h-full group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">{stat.name}</span>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                </div>
                <div className="text-2xl font-black text-white leading-none">
                  <AnimatedNumber value={stat.value} isK={stat.isK} isPercent={stat.isPercent} />
                </div>
                <p className="text-[10px] text-white/25 mt-2">{stat.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ═══ CONNECTED PLATFORMS + POST STATUS ═══ */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Connected Platforms */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-neon-cyan" /> Connected Platforms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {['youtube', 'facebook', 'instagram'].map(p => {
              const isConnected = connectedPlatforms?.includes(p)
              const config = PLATFORM_CONFIG[p]
              return (
                <div key={p} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isConnected ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.01] border-white/5 opacity-40'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${isConnected ? config.gradient.replace('from-', 'bg-').split(' ')[0] + ' ' + 'border-white/10' : 'bg-white/5 border-white/5'}`}>
                      <PlatformIcon name={p} size="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-white">{config.label}</span>
                  </div>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  ) : (
                    <Link href="/dashboard/settings">
                      <span className="flex items-center gap-1 text-[10px] font-medium text-white/40 hover:text-white cursor-pointer">
                        Connect <ArrowUpRight className="w-3 h-3" />
                      </span>
                    </Link>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Post Status Breakdown */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-neon-purple" /> Post Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Published', count: successPosts || 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
              { label: 'Failed', count: failedPosts || 0, icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
              { label: 'Total Attempts', count: totalAttempts || 0, icon: BarChart3, color: 'text-white/60', bg: 'bg-white/5' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center`}>
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <span className="text-sm text-white/70">{item.label}</span>
                </div>
                <span className="text-lg font-bold text-white">{item.count}</span>
              </div>
            ))}
            {/* Post success rate bar */}
            <div className="pt-2">
              <div className="flex justify-between text-[10px] text-white/30 mb-1.5">
                <span>Success Rate</span>
                <span>{totalAttempts > 0 ? ((successPosts / totalAttempts) * 100).toFixed(1) : '0.0'}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: totalAttempts > 0 ? `${(successPosts / totalAttempts) * 100}%` : '0%' }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analytics Snapshot */}
        <Card className="border-white/5 bg-white/[0.02]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Latest Snapshot
            </CardTitle>
            <CardDescription className="text-white/25 text-[11px]">
              {snap ? `Captured ${new Date(snap.snapshot_date || snap.created_at).toLocaleDateString()}` : 'No snapshots yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snap ? (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Reach', value: totalReach, color: '#00f0ff' },
                  { label: 'Views', value: totalViews, color: '#8b5cf6' },
                  { label: 'Likes', value: totalLikes, color: '#f43f5e' },
                  { label: 'Comments', value: totalComments, color: '#f59e0b' },
                  { label: 'Impressions', value: totalImpressions, color: '#10b981' },
                  { label: 'Engagement', value: totalEngagement, color: '#ec4899' },
                ].map(m => (
                  <div key={m.label} className="bg-black/20 rounded-lg p-2.5 border border-white/5">
                    <p className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">{m.label}</p>
                    <p className="text-base font-bold" style={{ color: m.color }}>
                      <AnimatedNumber value={m.value} isK />
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-white/20 text-sm">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Awaiting first analytics fetch
              </div>
            )}
            <Link href="/dashboard/analytics" className="block mt-3">
              <Button variant="outline" size="sm" className="w-full gap-2 text-xs border-white/10 text-white/50 hover:text-white">
                View Full Analytics <ExternalLink className="w-3 h-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* ═══ PER-PLATFORM BREAKDOWN ═══ */}
      {connectedPlatforms?.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-yellow-500" /> Platform Performance
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {connectedPlatforms.map((platform: string, i: number) => {
              const p = platformStats?.[platform]
              if (!p) return null
              const config = PLATFORM_CONFIG[platform] || { label: platform, color: '#666', gradient: 'from-white/5 to-white/[0.02]', icon: Activity }
              const Icon = config.icon
              const er = p.impressions > 0 ? ((p.engagement / p.impressions) * 100).toFixed(1) : '0'
              return (
                <motion.div key={platform} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                  <Card className={`border-white/5 bg-gradient-to-br ${config.gradient} hover:border-white/15 transition-all h-full`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center">
                            <Icon className="w-4.5 h-4.5" style={{ color: config.color }} />
                          </div>
                          <div>
                            <CardTitle className="text-base font-bold text-white">{config.label}</CardTitle>
                            <p className="text-[10px] text-white/30">{p.posts} posts • {p.success} published</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black" style={{ color: config.color }}>{er}%</p>
                          <p className="text-[8px] text-white/25 uppercase">ER</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { l: 'Views', v: p.views },
                          { l: 'Likes', v: p.likes },
                          { l: 'Comments', v: p.comments },
                        ].map(m => (
                          <div key={m.l} className="bg-black/20 rounded-md p-2 text-center border border-white/5">
                            <p className="text-[9px] text-white/25 uppercase">{m.l}</p>
                            <p className="text-sm font-bold text-white"><AnimatedNumber value={m.v} isK /></p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ RECENT POSTS ═══ */}
      <Card className="border-white/5 bg-white/[0.02]">
        <div className="h-[2px] bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink" />
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-neon-cyan" /> Recent Activity
            </CardTitle>
            <Link href="/dashboard/create">
              <Button variant="outline" size="sm" className="gap-2 text-xs border-white/10 text-white/50 hover:text-white">
                <Plus className="w-3 h-3" /> New Post
              </Button>
            </Link>
          </div>
          <CardDescription className="text-white/25">Your latest published content across all platforms</CardDescription>
        </CardHeader>
        <CardContent>
          {recentPosts?.length > 0 ? (
            <div className="space-y-2">
              {recentPosts.map((post: any, idx: number) => (
                <motion.div
                  key={post.id || idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-black/30 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <PlatformIcon name={post.platform} size="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{post.content || 'Media Post'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-white/30 capitalize">{PLATFORM_CONFIG[post.platform?.toLowerCase()]?.label || post.platform}</span>
                        <span className="text-[10px] text-white/20">•</span>
                        <span className="text-[10px] text-white/20">{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Quick metrics if available */}
                    {(post.views > 0 || post.likes > 0) && (
                      <div className="hidden md:flex items-center gap-3 text-[11px] text-white/30">
                        {post.views > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {post.views}</span>}
                        {post.likes > 0 && <span className="flex items-center gap-1"><Heart className="w-3 h-3" /> {post.likes}</span>}
                      </div>
                    )}
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border ${
                      post.status === 'success' ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' :
                      post.status === 'failed' ? 'bg-red-400/10 text-red-400 border-red-400/20' :
                      'bg-yellow-400/10 text-yellow-400 border-yellow-400/20'
                    }`}>
                      {post.status || 'pending'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <Activity className="w-8 h-8 mx-auto mb-2 text-white/15" />
              <p className="text-white/30 text-sm">No posts yet</p>
              <Link href="/dashboard/create">
                <Button variant="outline" size="sm" className="mt-3 gap-2 text-xs"><Plus className="w-3 h-3" /> Create your first post</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
