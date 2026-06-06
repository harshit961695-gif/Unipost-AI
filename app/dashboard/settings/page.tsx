"use client"

import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import {
  Settings as SettingsIcon, User, Bell, Shield, Link as LinkIcon, Loader2, RefreshCw,
  Youtube, Facebook, Instagram, CheckCircle2, XCircle, ExternalLink, Zap,
  AlertCircle, Unlink, LogOut, Mail, UserCircle, ChevronRight, Sparkles, Copy, Check, Camera
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

type Connection = {
  platform: string
  metadata: any
  created_at: string
}

type PlatformStats = {
  followers: number
  postsCount: number
  loading: boolean
  health: 'healthy' | 'expired' | 'error' | 'disconnected'
  accountName: string
  lastSync: string
}

const PLATFORM_CONFIG: Record<string, { color: string, gradient: string, icon: any, label: string, description: string, connectRoute?: string }> = {
  youtube:   { color: '#FF0000', gradient: 'from-red-500/20 to-red-900/5', icon: Youtube, label: 'YouTube', description: 'Upload videos & shorts' },
  instagram: { color: '#E4405F', gradient: 'from-pink-500/20 to-purple-900/5', icon: Instagram, label: 'Instagram', description: 'Share reels & stories', connectRoute: 'meta' },
  facebook:  { color: '#1877F2', gradient: 'from-blue-500/20 to-blue-900/5', icon: Facebook, label: 'Facebook', description: 'Post to pages & groups', connectRoute: 'meta' },
}

export default function SettingsPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Auth & Profile states
  const [userId, setUserId] = useState("")
  const [userEmail, setUserEmail] = useState("")
  const [userName, setUserName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [memberSince, setMemberSince] = useState("")
  const [lastLogin, setLastLogin] = useState("")
  const [copiedId, setCopiedId] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)

  // Platforms states
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Live Stats states
  const [stats, setStats] = useState<Record<string, PlatformStats>>({
    facebook: { followers: 0, postsCount: 0, loading: true, health: 'disconnected', accountName: '', lastSync: '' },
    instagram: { followers: 0, postsCount: 0, loading: true, health: 'disconnected', accountName: '', lastSync: '' },
    youtube: { followers: 0, postsCount: 0, loading: true, health: 'disconnected', accountName: '', lastSync: '' },
  })

  // Global Health timings
  const [lastAnalyticsSync, setLastAnalyticsSync] = useState<string>('N/A')
  const [lastPublishCheck, setLastPublishCheck] = useState<string>('N/A')

  // AI & Notifications Config States
  const [aiProvider, setAiProvider] = useState("gemini")
  const [contentStyle, setContentStyle] = useState("engaging")
  const [languagePref, setLanguagePref] = useState("en")
  
  const [notifSuccess, setNotifSuccess] = useState(true)
  const [notifFailure, setNotifFailure] = useState(true)
  const [notifSchedule, setNotifSchedule] = useState(true)
  const [notifAnalytics, setNotifAnalytics] = useState(false)

  // Modals & confirmation dialogs
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null)
  const [dangerAction, setDangerAction] = useState<'disconnect-all' | 'delete-analytics' | 'delete-account' | null>(null)
  const [dangerConfirmText, setDangerConfirmText] = useState("")
  const [dangerLoading, setDangerLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email || "")
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || "")
        setAvatarUrl(user.user_metadata?.avatar_url || "")
        
        if (user.created_at) {
          setMemberSince(new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))
        }
        if (user.last_sign_in_at) {
          setLastLogin(new Date(user.last_sign_in_at).toLocaleString())
        }

        // AI preferences fallback to user_metadata
        if (user.user_metadata?.aiSettings) {
          setAiProvider(user.user_metadata.aiSettings.provider || "gemini")
          setContentStyle(user.user_metadata.aiSettings.style || "engaging")
          setLanguagePref(user.user_metadata.aiSettings.language || "en")
        }
        
        // Notifications fallback to user_metadata
        if (user.user_metadata?.notificationPreferences) {
          setNotifSuccess(user.user_metadata.notificationPreferences.success !== false)
          setNotifFailure(user.user_metadata.notificationPreferences.failure !== false)
          setNotifSchedule(user.user_metadata.notificationPreferences.schedule !== false)
          setNotifAnalytics(!!user.user_metadata.notificationPreferences.analytics)
        }

        // Fetch connections once user is fetched
        await fetchConnections(user.id)
      }
    } catch (err) {
      console.error("Error fetching user info:", err)
    }
  }

  const fetchConnections = async (uid: string) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('platform, metadata, created_at, page_id, instagram_business_id')
        .eq('user_id', uid)
        .neq('access_token', '')

      if (error) throw error
      const userConnections = data || []
      setConnections(userConnections)
      
      // Load live stats & post counts
      await loadPlatformStats(uid, userConnections)
      await loadGlobalTimings(uid)
    } catch (error) {
      console.error('Error fetching connections:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPlatformStats = async (uid: string, userConns: Connection[]) => {
    // Reset initial stats loader
    const initialStats = { ...stats }
    Object.keys(initialStats).forEach(platform => {
      const conn = userConns.find(c => c.platform === platform)
      if (conn) {
        initialStats[platform] = {
          ...initialStats[platform],
          loading: true,
          health: 'healthy',
          accountName: platform === 'youtube' 
            ? (conn.metadata?.channel_name || 'YouTube Channel')
            : (conn.metadata?.page_name || 'Social Page'),
          lastSync: conn.created_at ? new Date(conn.created_at).toLocaleDateString() : 'N/A'
        }
      } else {
        initialStats[platform] = {
          followers: 0,
          postsCount: 0,
          loading: false,
          health: 'disconnected',
          accountName: '',
          lastSync: ''
        }
      }
    })
    setStats({ ...initialStats })

    // Query successful posts count per platform from Neon via API
    const fetchPostCounts = async (platform: string) => {
      try {
        const res = await fetch('/api/analytics')
        if (!res.ok) return 0
        const data = await res.json()
        // analytics route returns post_logs from Neon, filter by platform
        const platformLogs = (data.postLogs || []).filter(
          (log: any) => log.platform === platform && ['success', 'published'].includes(log.status)
        )
        return platformLogs.length
      } catch {
        return 0
      }
    }

    // Call stats endpoints in parallel
    await Promise.allSettled(Object.keys(PLATFORM_CONFIG).map(async (platform) => {
      const isLinked = userConns.some(c => c.platform === platform)
      if (!isLinked) return;

      let followers = 0
      let health: 'healthy' | 'expired' | 'error' = 'healthy'
      let accountName = stats[platform]?.accountName || ''

      try {
        const res = await fetch(`/api/analytics/${platform}`)
        if (res.ok) {
          const data = await res.json()
          if (data.connected === false) {
            health = 'expired'
          } else {
            followers = platform === 'youtube' 
              ? (data.subscribers || 0) 
              : (data.followers || 0)
            if (platform === 'youtube' && data.channelName) accountName = data.channelName
            if (platform === 'facebook' && data.pageName) accountName = data.pageName
          }
        } else {
          health = 'error'
        }
      } catch {
        health = 'error'
      }

      const postsCount = await fetchPostCounts(platform)

      setStats(prev => ({
        ...prev,
        [platform]: {
          ...prev[platform],
          followers,
          postsCount,
          health,
          accountName,
          loading: false
        }
      }))
    }))
  }

  const loadGlobalTimings = async (uid: string) => {
    try {
      // Fetch latest analytics data from Neon via API
      const res = await fetch('/api/analytics/latest')
      if (!res.ok) return
      const data = await res.json()

      // 1. Last Analytics Sync
      if (data.lastUpdated) {
        setLastAnalyticsSync(new Date(data.lastUpdated).toLocaleString())
      }

      // 2. Last Publish Check — use dashboard stats which reads post_logs from Neon
      const statsRes = await fetch('/api/dashboard/stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        if (statsData.lastPublishedAt) {
          setLastPublishCheck(new Date(statsData.lastPublishedAt).toLocaleString())
        }
      }
    } catch (e) {
      console.warn("Global timings load failed", e)
    }
  }

  const handleConnect = (platform: string, connectRoute?: string) => {
    setConnecting(platform)
    setTimeout(() => {
      if (typeof window !== 'undefined') window.stop()
      setConnecting(null)
      alert(`Connection to ${platform} timed out. Please try again.`)
    }, 12000)
    window.location.href = `/api/connect/${connectRoute || platform}`
  }

  const handleDisconnect = async () => {
    if (!disconnectTarget) return
    const platform = disconnectTarget
    setDisconnectTarget(null)

    try {
      setStats(prev => ({
        ...prev,
        [platform]: { ...prev[platform], loading: true }
      }))
      
      const res = await fetch(`/api/disconnect/${platform}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect')
      
      await fetchConnections(userId)
    } catch (error: any) {
      alert(error.message || 'Error disconnecting account.')
      setStats(prev => ({
        ...prev,
        [platform]: { ...prev[platform], loading: false }
      }))
    }
  }

  // Save Name + AI Settings + Notifications to Supabase user_metadata
  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: userName,
          aiSettings: {
            provider: aiProvider,
            style: contentStyle,
            language: languagePref
          },
          notificationPreferences: {
            success: notifSuccess,
            failure: notifFailure,
            schedule: notifSchedule,
            analytics: notifAnalytics
          }
        }
      })

      if (error) throw error
      alert("Settings saved successfully!")
    } catch (err: any) {
      alert(err.message || "Failed to update profile settings.")
    } finally {
      setSavingProfile(false)
    }
  }

  // Avatar Image Selector & Base64 upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate size (max 1.5MB to stay within metadata sizes cleanly)
    if (file.size > 1.5 * 1024 * 1024) {
      alert("Avatar image must be smaller than 1.5MB")
      return
    }

    setAvatarLoading(true)
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = async () => {
      const base64String = reader.result as string
      try {
        const { error } = await supabase.auth.updateUser({
          data: {
            avatar_url: base64String
          }
        })
        if (error) throw error
        setAvatarUrl(base64String)
      } catch (err: any) {
        alert("Failed to upload avatar: " + err.message)
      } finally {
        setAvatarLoading(false)
      }
    }
    reader.onerror = () => {
      setAvatarLoading(false)
      alert("Failed to read image file.")
    }
  }

  const copyUserId = () => {
    navigator.clipboard.writeText(userId)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  // Executing Danger zone backend actions
  const handleDangerAction = async () => {
    if (!dangerAction) return

    // Require exact phrase confirmation for Delete Account
    if (dangerAction === 'delete-account' && dangerConfirmText.toLowerCase() !== 'delete my account') {
      alert("Please type 'delete my account' to confirm.")
      return
    }

    setDangerLoading(true)
    try {
      const res = await fetch('/api/user/danger-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: dangerAction })
      })
      const data = await res.json()
      
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Action execution failed')
      }

      alert(data.message || 'Action executed successfully.')

      if (dangerAction === 'delete-account') {
        await supabase.auth.signOut()
        router.push('/')
      } else if (dangerAction === 'disconnect-all') {
        setDangerAction(null)
        await fetchConnections(userId)
      } else {
        setDangerAction(null)
        await loadGlobalTimings(userId)
      }
    } catch (err: any) {
      alert(err.message || 'Danger action execution failed.')
    } finally {
      setDangerLoading(false)
      setDangerConfirmText("")
    }
  }

  const isConnected = (platform: string) => connections.some(c => c.platform === platform)
  const connectedCount = Object.keys(PLATFORM_CONFIG).filter(p => isConnected(p)).length
  const totalPlatforms = Object.keys(PLATFORM_CONFIG).length

  const searchParams = (typeof window !== 'undefined' && mounted) ? new URLSearchParams(window.location.search) : null
  const successParam = searchParams?.get('success')
  const errorParam = searchParams?.get('error')

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px] mx-auto pb-16">
      {/* ═══ HEADER ═══ */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center shadow-lg shadow-neon-cyan/20">
            <SettingsIcon className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Settings</h1>
            <p className="text-xs text-white/30">Configure your profiles, workflows, and account safety</p>
          </div>
        </div>
      </motion.div>

      {/* ═══ ALERTS ═══ */}
      {successParam && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-400 font-medium">
            {successParam === 'meta_connected' ? 'Meta account connected successfully! Facebook & Instagram are linked.' : 
             successParam === 'youtube_connected' ? 'YouTube channel linked successfully!' : 'Connection successful!'}
          </p>
        </motion.div>
      )}

      {errorParam && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400 font-medium">
            {errorParam === 'no_pages_found' 
              ? 'No Facebook pages found. Please link a Facebook page to your Instagram Business account.' 
              : `Connection failed: ${searchParams?.get('details') || 'Please try again.'}`}
          </p>
        </motion.div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* ═══ PROFILE CARD (LEFT COLUMN) ═══ */}
        <div className="md:col-span-1 space-y-6">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <div className="h-[3px] bg-gradient-to-r from-neon-cyan via-neon-blue to-neon-purple animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
              <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
                {/* Interactive Avatar */}
                <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
                  <div className="w-24 h-24 rounded-full border-2 border-white/10 overflow-hidden bg-black/40 flex items-center justify-center relative">
                    {avatarLoading ? (
                      <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
                    ) : avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle className="w-16 h-16 text-white/20" />
                    )}
                    {/* Upload overlay hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-full duration-200">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleAvatarChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-white flex items-center justify-center gap-1.5">
                    {userName || "UniPost User"}
                  </h3>
                  <p className="text-xs text-white/30">{userEmail}</p>
                </div>

                {/* Plan Badge */}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 uppercase shadow-[0_0_8px_rgba(0,240,255,0.1)]">
                  <Sparkles className="w-3 h-3 animate-pulse" /> Beta Tester
                </span>

                <div className="w-full border-t border-white/5 pt-4 text-left space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/30">Member Since:</span>
                    <span className="text-white/70 font-medium">{memberSince || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/30">Last Active:</span>
                    <span className="text-white/70 font-medium text-right leading-tight max-w-[140px] truncate">{lastLogin ? lastLogin.split(',')[0] : 'N/A'}</span>
                  </div>
                </div>

                {/* Copy User ID */}
                <div className="w-full">
                  <label className="text-[10px] text-white/30 uppercase tracking-wider font-semibold block text-left mb-1.5">User ID</label>
                  <div className="flex items-center bg-black/40 border border-white/5 rounded-lg overflow-hidden h-9 px-2.5">
                    <code className="text-xs text-white/60 font-mono select-all truncate flex-1 text-left">{userId}</code>
                    <button 
                      onClick={copyUserId} 
                      className="text-white/30 hover:text-white transition-colors p-1"
                      title="Copy ID"
                    >
                      {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ═══ PLATFORM HEALTH CARD ═══ */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-neon-purple" /> Platform Health Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2.5">
                  {Object.entries(PLATFORM_CONFIG).map(([id, platform]) => {
                    const linked = isConnected(id)
                    const statusVal = stats[id]?.health
                    
                    let indicatorColor = 'bg-white/10'
                    let label = 'Disconnected'
                    
                    if (linked) {
                      if (statusVal === 'healthy') {
                        indicatorColor = 'bg-neon-green shadow-neon-green/40'
                        label = 'Healthy & Active'
                      } else if (statusVal === 'expired') {
                        indicatorColor = 'bg-neon-yellow shadow-neon-yellow/40'
                        label = 'Token Expired'
                      } else if (statusVal === 'error') {
                        indicatorColor = 'bg-red-500 shadow-red-500/40'
                        label = 'API Limit/Error'
                      } else {
                        indicatorColor = 'bg-neon-green shadow-neon-green/40'
                        label = 'Healthy'
                      }
                    }

                    return (
                      <div key={id} className="flex items-center justify-between text-xs bg-black/20 p-2.5 rounded-lg border border-white/[0.02]">
                        <span className="text-white/60 font-medium flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${indicatorColor} shadow-[0_0_6px]`} />
                          {platform.label}
                        </span>
                        <span className="text-white/40 text-[11px] font-semibold">{label}</span>
                      </div>
                    )
                  })}
                </div>

                <div className="border-t border-white/5 pt-3 space-y-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-white/30">Last Analytics Sync:</span>
                    <span className="text-white/60 font-medium">{lastAnalyticsSync}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/30">Last Publish Action:</span>
                    <span className="text-white/60 font-medium">{lastPublishCheck}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ═══ MAIN SETTINGS WORKPLACE (RIGHT COLUMNS) ═══ */}
        <div className="md:col-span-2 space-y-6">
          {/* PROFILE DATA CONFIG */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <User className="w-5 h-5 text-neon-cyan" /> Profile Information
                </CardTitle>
                <CardDescription className="text-white/30 text-xs">Update your public display identity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-white/50">Full Name</Label>
                    <Input 
                      value={userName} 
                      onChange={(e) => setUserName(e.target.value)}
                      placeholder="Your Display Name"
                      className="bg-black/40 border-white/10 focus:border-neon-cyan/50 text-white placeholder:text-white/20 h-10 rounded-lg" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-white/30">Email Address (Read-only)</Label>
                    <Input 
                      type="email" 
                      value={userEmail}
                      disabled
                      className="bg-black/10 border-white/5 text-white/40 h-10 rounded-lg cursor-not-allowed" 
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* CONNECTED ACCOUNTS */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <div className="h-[2px] bg-gradient-to-r from-neon-purple to-neon-pink" />
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                      <LinkIcon className="w-5 h-5 text-neon-purple" /> Connected Social Accounts
                    </CardTitle>
                    <CardDescription className="text-white/30 text-xs">
                      {connectedCount} of {totalPlatforms} active connections
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => fetchConnections(userId)} disabled={loading}
                    className="text-white/30 hover:text-white hover:bg-white/5 rounded-lg"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {/* progress track */}
                <div className="mt-3">
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-neon-purple to-neon-pink transition-all duration-500" 
                      style={{ width: `${(connectedCount / totalPlatforms) * 100}%` }}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(PLATFORM_CONFIG).map(([id, config], i) => {
                  const linked = isConnected(id)
                  const statsObj = stats[id]
                  const Icon = config.icon
                  const isCurrentlyConnecting = connecting === id

                  return (
                    <div
                      key={id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        linked 
                          ? `bg-gradient-to-r ${config.gradient} border-white/10 hover:border-white/15` 
                          : 'bg-black/20 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                          linked ? 'bg-black/40 border-white/15' : 'bg-white/5 border-white/5'
                        }`}>
                          <Icon className="w-5 h-5" style={{ color: linked ? config.color : '#555' }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-white">{config.label}</p>
                            {linked && statsObj?.health === 'expired' && (
                              <span className="text-[9px] font-bold text-neon-yellow border border-neon-yellow/20 bg-neon-yellow/10 px-1.5 py-0.5 rounded-full">Re-auth needed</span>
                            )}
                          </div>
                          {linked ? (
                            <>
                              <p className="text-xs text-white/50 truncate font-medium">@{statsObj?.accountName || 'Connected Page'}</p>
                              {statsObj?.loading ? (
                                <div className="flex gap-2 mt-1.5">
                                  <Skeleton className="h-3 w-16 bg-white/5" />
                                  <Skeleton className="h-3 w-12 bg-white/5" />
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30 font-semibold uppercase">
                                  <span>{statsObj?.followers.toLocaleString()} {id === 'youtube' ? 'Subscribers' : 'Followers'}</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-white/10" />
                                  <span>{statsObj?.postsCount} Posts</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-[11px] text-white/30">{config.description}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        {linked ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDisconnectTarget(id)}
                            className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg h-8 px-3 text-xs gap-1.5"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleConnect(id, config.connectRoute)}
                            disabled={loading || isCurrentlyConnecting}
                            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 rounded-lg h-9 px-4 text-xs font-semibold gap-1.5 transition-all"
                          >
                            {isCurrentlyConnecting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-neon-yellow" />
                            )}
                            Connect
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </motion.div>

          {/* AI SETTINGS */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-neon-cyan" /> AI Generation Settings
                </CardTitle>
                <CardDescription className="text-white/30 text-xs">Customize the default parameters for automated content suggestions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-white/50">AI Engine Provider</Label>
                    <Select value={aiProvider} onValueChange={setAiProvider}>
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-10">
                        <SelectValue placeholder="Select Engine" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10 text-white">
                        <SelectItem value="gemini">Gemini (Recommended)</SelectItem>
                        <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                        <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                        <SelectItem value="groq">Groq LLaMA 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-white/50">Caption Output Style</Label>
                    <Select value={contentStyle} onValueChange={setContentStyle}>
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-10">
                        <SelectValue placeholder="Select Style" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10 text-white">
                        <SelectItem value="engaging">Engaging (Default)</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual / Short</SelectItem>
                        <SelectItem value="humorous">Humorous</SelectItem>
                        <SelectItem value="educational">Educational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-white/50">Default Language</Label>
                    <Select value={languagePref} onValueChange={setLanguagePref}>
                      <SelectTrigger className="bg-black/40 border-white/10 text-white h-10">
                        <SelectValue placeholder="Select Language" />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-white/10 text-white">
                        <SelectItem value="en">English (US)</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* NOTIFICATION PREFERENCES */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-white/5 bg-white/[0.02] backdrop-blur-md overflow-hidden relative shadow-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-neon-pink" /> Notification Preferences
                </CardTitle>
                <CardDescription className="text-white/30 text-xs">Configure which events trigger automated activity messages</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/[0.02]">
                  <div>
                    <Label className="text-sm font-semibold text-white">Post Success Alerts</Label>
                    <p className="text-[10px] text-white/30">Trigger notification on successful platform uploads</p>
                  </div>
                  <Switch checked={notifSuccess} onCheckedChange={setNotifSuccess} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/[0.02]">
                  <div>
                    <Label className="text-sm font-semibold text-white">Post Failure Alerts</Label>
                    <p className="text-[10px] text-white/30">Get critical alerts if publishing fails</p>
                  </div>
                  <Switch checked={notifFailure} onCheckedChange={setNotifFailure} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/[0.02]">
                  <div>
                    <Label className="text-sm font-semibold text-white">Schedule Event Reminders</Label>
                    <p className="text-[10px] text-white/30">Notifications when scheduled queue actions fire</p>
                  </div>
                  <Switch checked={notifSchedule} onCheckedChange={setNotifSchedule} />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/[0.02]">
                  <div>
                    <Label className="text-sm font-semibold text-white">Analytics digest summaries</Label>
                    <p className="text-[10px] text-white/30">Weekly email summaries of platform engagement</p>
                  </div>
                  <Switch checked={notifAnalytics} onCheckedChange={setNotifAnalytics} />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* SAVE ALL CHANGES FLOATER */}
          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleSaveProfile} 
              disabled={savingProfile}
              className="bg-gradient-to-r from-neon-cyan via-neon-blue to-neon-purple text-black font-extrabold px-8 py-6 rounded-xl hover:opacity-90 shadow-lg shadow-neon-cyan/10"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                'Save All Settings'
              )}
            </Button>
          </div>

          {/* DANGER ZONE */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <Card className="border-red-500/20 bg-red-500/[0.01] backdrop-blur-md overflow-hidden relative shadow-xl">
              <div className="h-[2px] bg-gradient-to-r from-red-500 to-red-800" />
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-red-500 animate-pulse" /> Danger Zone
                </CardTitle>
                <CardDescription className="text-white/30 text-xs">These actions can cause loss of account connection tokens and analytics data</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Action 1: Disconnect All */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-black/40">
                  <div>
                    <p className="text-sm font-bold text-white">Disconnect All Platforms</p>
                    <p className="text-xs text-white/30">Unlinks Facebook, Instagram, and YouTube immediately</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerAction('disconnect-all')}
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg h-9 px-4 text-xs font-semibold"
                  >
                    Disconnect All
                  </Button>
                </div>

                {/* Action 2: Delete Analytics */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-black/40">
                  <div>
                    <p className="text-sm font-bold text-white">Delete Analytics History</p>
                    <p className="text-xs text-white/30">Clears all historical snapshots from the metrics system</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDangerAction('delete-analytics')}
                    className="border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg h-9 px-4 text-xs font-semibold"
                  >
                    Delete Analytics
                  </Button>
                </div>

                {/* Action 3: Delete Account */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-black/40">
                  <div>
                    <p className="text-sm font-bold text-white">Permanently Delete Account</p>
                    <p className="text-xs text-white/30">Purge connections, scheduled queues, posts logs and auth records</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDangerAction('delete-account')}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-lg h-9 px-4 text-xs font-semibold"
                  >
                    Delete Account
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-black/40">
                  <div>
                    <p className="text-sm font-medium text-white">Sign Out</p>
                    <p className="text-[11px] text-white/30">Log out of your UniPost AI session</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await supabase.auth.signOut()
                      router.push('/')
                    }}
                    className="border-white/10 text-white/70 hover:bg-white/5 hover:text-white rounded-lg h-9 px-4 text-xs font-semibold gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* ═══ DISCONNECT ACCOUNT MODAL ═══ */}
      <Dialog open={disconnectTarget !== null} onOpenChange={(open) => !open && setDisconnectTarget(null)}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" /> Disconnect Account?
            </DialogTitle>
            <DialogDescription className="text-white/40 text-xs pt-1.5 leading-relaxed">
              Are you sure you want to disconnect your <span className="font-semibold text-white capitalize">{disconnectTarget}</span> connection (<strong>@{disconnectTarget ? stats[disconnectTarget]?.accountName : ''}</strong>)? 
              <br/><br/>
              This will pause all scheduled postings and stop analytics synchronization for this channel until reconnected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDisconnectTarget(null)} className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={handleDisconnect} className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex-1">
              Yes, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DANGER ACTION MODAL ═══ */}
      <Dialog open={dangerAction !== null} onOpenChange={(open) => !open && !dangerLoading && setDangerAction(null)}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500 animate-pulse" /> Confirm Irreversible Action
            </DialogTitle>
            <DialogDescription className="text-white/40 text-xs pt-2 leading-relaxed">
              {dangerAction === 'disconnect-all' && (
                "This will immediately invalidate access keys for Facebook, Instagram, and YouTube. Automated processes and queue postings will fail."
              )}
              {dangerAction === 'delete-analytics' && (
                "All aggregated snapshots and historically archived platform analytics records will be deleted. This cannot be recovered."
              )}
              {dangerAction === 'delete-account' && (
                "This will permanently delete all your posts, schedule queue, publishing logs, and your UniPost user account from auth registries. ALL database states relating to your account will be purged."
              )}
            </DialogDescription>
          </DialogHeader>
          
          {dangerAction === 'delete-account' && (
            <div className="space-y-2 mt-2">
              <Label className="text-xs text-red-400 font-semibold">Type &apos;delete my account&apos; to confirm:</Label>
              <Input 
                value={dangerConfirmText}
                onChange={(e) => setDangerConfirmText(e.target.value)}
                placeholder="delete my account"
                className="bg-black border-red-500/30 text-white h-9 rounded-lg"
              />
            </div>
          )}

          <DialogFooter className="mt-4 flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => { if (!dangerLoading) setDangerAction(null); setDangerConfirmText("") }} 
              className="text-white/60 hover:text-white hover:bg-white/5 rounded-lg flex-1"
              disabled={dangerLoading}
            >
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleDangerAction} 
              disabled={dangerLoading || (dangerAction === 'delete-account' && dangerConfirmText.toLowerCase() !== 'delete my account')}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex-1"
            >
              {dangerLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Processing...
                </>
              ) : (
                'Confirm Action'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
