"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Instagram, Youtube, Facebook, CheckCircle2, XCircle, Loader2, Image as ImageIcon,
  Video, Wand2, AlertCircle, Send, Clock, CalendarClock, Trash2, Sparkles, Zap,
  ChevronDown, ChevronUp, Upload
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

type PlatformConfig = {
  enabled: boolean;
  type: string;
  media: File[];
  mediaPreviews: string[];
  analysis: any;
  caption: string;
  title?: string;
  tags?: string[];
  privacy?: string;
  thumbnailFile?: File | null;
  thumbnailPreview?: string | null;
  description?: string;
}

type ScheduledPost = {
  id: string; platforms: any; scheduled_at: string; status: string;
  results: any; created_at: string;
}

interface MediaAnalysis {
  objects: string[]
  people: string[]
  environment: string
  activity: string
  mood: string
  colors: string[]
  context: string
}

const renderDefensive = (value: any): React.ReactNode => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-wrap gap-1.5 mt-1">
        {value.map((item, idx) => (
          <span key={idx} className="px-2 py-0.5 text-xs rounded bg-white/5 border border-white/10 text-white/80">
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </span>
    );
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
};

const PLATFORM_CONFIG: Record<string, { color: string, gradient: string, hoverBorder: string, icon: any, label: string }> = {
  facebook:  { color: '#1877F2', gradient: 'from-blue-500/20 to-blue-900/5', hoverBorder: 'hover:border-blue-500/40', icon: Facebook, label: 'Facebook' },
  instagram: { color: '#E4405F', gradient: 'from-pink-500/20 to-purple-900/5', hoverBorder: 'hover:border-pink-500/40', icon: Instagram, label: 'Instagram' },
  youtube:   { color: '#FF0000', gradient: 'from-red-500/20 to-red-900/5', hoverBorder: 'hover:border-red-500/40', icon: Youtube, label: 'YouTube' },
}

const defaultPlatformState: Record<string, PlatformConfig> = {
  facebook: {
    enabled: false,
    type: 'post',
    media: [],
    mediaPreviews: [],
    analysis: {},
    caption: ''
  },
  instagram: {
    enabled: false,
    type: 'post',
    media: [],
    mediaPreviews: [],
    analysis: {},
    caption: ''
  },
  youtube: {
    enabled: false,
    type: 'video',
    media: [],
    mediaPreviews: [],
    analysis: {},
    caption: '',
    title: '',
    tags: [],
    privacy: 'private',
    thumbnailFile: null,
    thumbnailPreview: null,
    description: ''
  }
}

function normalizeHashtags(input: any): string[] {
  if (!input) return []

  if (Array.isArray(input)) {
    return input.map(tag => String(tag).trim()).filter(Boolean)
  }

  if (typeof input === 'string') {
    const separator = input.includes(',') ? ',' : /[\s]+/
    return input.split(separator).map(tag => String(tag).trim()).filter(Boolean)
  }

  if (typeof input === 'object') {
    try {
      const values = Object.values(input).flat()
      return normalizeHashtags(values)
    } catch (e) {
      return []
    }
  }

  return []
}

function formatDetectedContext(ctx: any): string {
  if (!ctx) return ''
  if (typeof ctx === 'string') {
    try {
      const parsed = JSON.parse(ctx)
      return formatDetectedContext(parsed)
    } catch (e) {
      return ctx
    }
  }
  if (typeof ctx === 'object' && ctx !== null) {
    const parts: string[] = []
    if (ctx.media_summary) parts.push(`Summary: ${ctx.media_summary}`)
    if (ctx.environment) parts.push(`Environment: ${ctx.environment}`)
    if (ctx.activity) parts.push(`Activity: ${ctx.activity}`)
    if (ctx.mood) parts.push(`Mood: ${ctx.mood}`)
    if (ctx.context) parts.push(`Context: ${ctx.context}`)
    if (ctx.objects) {
      const objs = Array.isArray(ctx.objects) ? ctx.objects.join(', ') : String(ctx.objects)
      parts.push(`Objects: ${objs}`)
    }
    if (ctx.people) {
      const ppl = Array.isArray(ctx.people) ? ctx.people.join(', ') : String(ctx.people)
      parts.push(`People: ${ppl}`)
    }
    if (ctx.colors) {
      const cls = Array.isArray(ctx.colors) ? ctx.colors.join(', ') : String(ctx.colors)
      parts.push(`Colors: ${cls}`)
    }
    if (parts.length > 0) return parts.join('\n')
    return JSON.stringify(ctx, null, 2)
  }
  return String(ctx)
}

export default function CreatePostPage() {
  const [platforms, setPlatforms] = useState(defaultPlatformState)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isScheduling, setIsScheduling] = useState(false)
  const [results, setResults] = useState<{ platform: string, status: 'success' | 'failure', error?: string }[] | null>(null)
  const [generatingAI, setGeneratingAI] = useState<Record<string, boolean>>({})

  // Schedule state
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([])
  const [showScheduled, setShowScheduled] = useState(false)
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)

  // Media Analysis state
  const [mediaAnalysis, setMediaAnalysis] = useState<any>(null)
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState<Record<string, boolean>>({})
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const analyzeMediaFile = async (platform: string) => {
    const file = platforms[platform].media?.[0]
    if (!file) return

    setIsAnalyzingMedia(prev => ({ ...prev, [platform]: true }))

    try {
      const formData = new FormData()
      formData.append('media', file)

      const response = await fetch('/api/ai/analyze-media', {
        method: 'POST',
        body: formData
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Media analysis failed')

      // Save analysis results locally to the platform's state
      updatePlatform(platform, 'analysis', data)

      // Auto-populate captions locally based on platform type
      if (platform === 'facebook' && data.facebook_caption) {
        updatePlatform('facebook', 'caption', data.facebook_caption)
      } else if (platform === 'instagram' && data.instagram_caption) {
        updatePlatform('instagram', 'caption', data.instagram_caption)
      } else if (platform === 'youtube') {
        if (data.media_summary) {
          updatePlatform('youtube', 'title', data.media_summary.substring(0, 70))
        }
        const formattedContext = formatDetectedContext(data.detected_context)
        const normalizedTags = normalizeHashtags(data.hashtags)
        const formattedHashtags = normalizedTags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')
        const ytDesc = `${formattedContext}\n\n${data.cta || ''}\n\n${formattedHashtags}`.trim()

        updatePlatform('youtube', 'caption', ytDesc)
        updatePlatform('youtube', 'description', ytDesc)
        updatePlatform('youtube', 'tags', normalizedTags)
      }
    } catch (err: any) {
      console.error('Media Analysis error:', err)
      alert(`Media Analysis failed: ${err.message || 'Unknown error'}`)
    } finally {
      setIsAnalyzingMedia(prev => ({ ...prev, [platform]: false }))
    }
  }

  // AI Content Generation using Gemini
  const generateAIContent = async (platform: string, type: 'caption' | 'title' | 'description') => {
    const key = `${platform}_${type}`
    setGeneratingAI(prev => ({ ...prev, [key]: true }))
    try {
      let context = platforms[platform].caption || platforms[platform].title || platforms[platform].description || ''
      // Rule: AI caption generation must use only that platform's analysis result
      if (platforms[platform].analysis?.detected_context) {
        context = `Media analysis details: ${platforms[platform].analysis.detected_context}. ${context ? `User context/topic: ${context}` : ''}`
      }
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, type, context })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI generation failed')
      if (data.text) {
        updatePlatform(platform, type as keyof PlatformConfig, data.text)
        if (platform === 'youtube' && (type === 'caption' || type === 'description')) {
          updatePlatform('youtube', 'caption', data.text)
          updatePlatform('youtube', 'description', data.text)
        }
      }
    } catch (err: any) {
      console.error('AI Generate error:', err)
      const msg = err.message || ''
      if (msg.includes('quota') || msg.includes('exceeded') || msg.includes('rate')) {
        alert('⚠️ Gemini AI quota limit reached! Please wait a few minutes and try again, or enable billing at ai.google.dev')
      } else {
        alert(`AI Generate failed: ${msg}`)
      }
    } finally {
      setGeneratingAI(prev => ({ ...prev, [key]: false }))
    }
  }

  useEffect(() => {
    fetchScheduledPosts()
    // Poll for schedule check every 60 seconds
    const interval = setInterval(() => {
      fetch('/api/schedule/check').catch(() => {})
      fetchScheduledPosts()
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  // Validation and auto-switching warning for Instagram type vs media
  useEffect(() => {
    if (platforms.instagram.enabled && platforms.instagram.type === 'post' && platforms.instagram.media?.[0]?.type.startsWith('video/')) {
      updatePlatform('instagram', 'type', 'reel');
      alert("Video detected. Switching Instagram post type to Reel.");
    }
  }, [platforms.instagram.type, platforms.instagram.media, platforms.instagram.enabled]);

  const fetchScheduledPosts = async () => {
    try {
      const res = await fetch('/api/schedule')
      const data = await res.json()
      if (data.scheduled_posts) setScheduledPosts(data.scheduled_posts)
    } catch (e) {}
  }

  const updatePlatform = (platform: string, key: keyof PlatformConfig, value: any) => {
    setPlatforms(prev => ({ ...prev, [platform]: { ...prev[platform], [key]: value } }))
    setResults(null)
  }

  const handleMediaChange = (platform: string, isThumbnail: boolean, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0]
      const previewUrl = URL.createObjectURL(file)
      if (isThumbnail) {
        updatePlatform(platform, 'thumbnailFile', file)
        updatePlatform(platform, 'thumbnailPreview', previewUrl)
      } else {
        updatePlatform(platform, 'media', [file])
        updatePlatform(platform, 'mediaPreviews', [previewUrl])
        
        // Auto-detect media type for Instagram and Facebook
        if (platform === 'instagram' || platform === 'facebook') {
          if (file.type.startsWith('video/')) {
            updatePlatform(platform, 'type', 'reel')
          } else if (file.type.startsWith('image/')) {
            updatePlatform(platform, 'type', 'post')
          }
        }
      }
    }
  }

  const enabledPlatforms = Object.keys(platforms).filter(p => platforms[p].enabled)
  const validationErrors: Record<string, string> = {}

  if (platforms.youtube.enabled && (!platforms.youtube.media?.[0] || !platforms.youtube.media[0].type.startsWith('video'))) {
    validationErrors.youtube = "Video required for YouTube"
  }
  if (platforms.instagram.enabled && !platforms.instagram.media?.[0]) {
    validationErrors.instagram = "Media required for Instagram"
  }
  if (platforms.facebook.enabled && platforms.facebook.type !== 'post' && !platforms.facebook.media?.[0]) {
    validationErrors.facebook = "Media required for Facebook Reels/Stories"
  }

  const hasValidationErrors = Object.keys(validationErrors).length > 0
  const canPublish = enabledPlatforms.length > 0 && !hasValidationErrors && !isPublishing && !isScheduling

  const handlePublish = async () => {
    if (!canPublish) return
    setIsPublishing(true)
    setResults(null)

    try {
      const formData = new FormData()
      const metadataPayload: any = {}

      enabledPlatforms.forEach(p => {
        const conf = platforms[p]
        const desc = p === 'youtube' ? (conf.description || conf.caption) : undefined
        metadataPayload[p] = { 
          enabled: conf.enabled, 
          type: conf.type, 
          caption: conf.caption, 
          title: conf.title, 
          description: desc, 
          privacy: conf.privacy 
        }
        if (conf.media?.[0]) formData.append(`media_${p}`, conf.media[0])
        if (conf.thumbnailFile) formData.append(`thumbnail_${p}`, conf.thumbnailFile)
      })
      formData.append('metadata', JSON.stringify(metadataPayload))

      const response = await fetch('/api/publish', { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to publish')

      setResults(enabledPlatforms.map(p => ({ platform: p, status: data.results[p] || 'failure', error: data.errors?.[p] })))
    } catch (error: any) {
      alert(`Publish Failed: ${error.message}`)
    } finally {
      setIsPublishing(false)
    }
  }

  const handleSchedule = async () => {
    if (!canPublish || !scheduleDate || !scheduleTime) {
      alert('Please set date and time for scheduling')
      return
    }
    setIsScheduling(true)
    try {
      const scheduledAtIST = `${scheduleDate}T${scheduleTime}:00`
      const platformConfigs: any = {}
      const formData = new FormData()

      enabledPlatforms.forEach(p => {
        const conf = platforms[p]
        const desc = p === 'youtube' ? (conf.description || conf.caption) : undefined
        platformConfigs[p] = { 
          enabled: true, 
          type: conf.type, 
          caption: conf.caption, 
          title: conf.title, 
          description: desc, 
          privacy: conf.privacy 
        }
        
        if (conf.media?.[0]) {
          formData.append(`media_${p}`, conf.media[0])
        }
        if (conf.thumbnailFile) {
          formData.append(`thumbnail_${p}`, conf.thumbnailFile)
        }
      })

      formData.append('metadata', JSON.stringify(platformConfigs))
      formData.append('scheduled_at_ist', scheduledAtIST)

      console.log("[SCHEDULE MEDIA UPLOAD] Preparing scheduling upload for:", enabledPlatforms.filter(p => platforms[p].media?.[0]).map(p => `${p} (${platforms[p].media?.[0]?.name})`).join(', '))
      console.log("[SCHEDULE PAYLOAD]", { platforms: platformConfigs, scheduled_at_ist: scheduledAtIST })

      const res = await fetch('/api/schedule', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to schedule')

      alert(`✅ Post scheduled for ${scheduleDate} at ${scheduleTime} IST!`)
      setScheduleDate('')
      setScheduleTime('')
      fetchScheduledPosts()
    } catch (error: any) {
      alert(`Schedule Failed: ${error.message}`)
    } finally {
      setIsScheduling(false)
    }
  }

  const cancelScheduled = async (id: string) => {
    try {
      await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' })
      fetchScheduledPosts()
    } catch (e) {}
  }

  // Get today's date for min attribute
  const today = new Date().toISOString().split('T')[0]

  const renderPlatformAIInsights = (platform: string) => {
    const analysis = platforms[platform].analysis
    if (!analysis || Object.keys(analysis).length === 0) return null

    return (
      <div className="mt-4 border-t border-white/5 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-neon-cyan" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">AI Insights ({PLATFORM_CONFIG[platform]?.label})</h4>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-white/30 uppercase tracking-wider font-bold mr-1">Confidence:</span>
            <span className="text-xs font-bold text-emerald-400">{(analysis.confidence_score * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-white/80 space-y-1">
            <span className="font-bold text-white/30 block uppercase tracking-wider text-[9px]">Summary</span>
            <p>{analysis.media_summary}</p>
          </div>
          
          {(() => {
            const ctx = analysis.detected_context
            if (!ctx) return null
            let parsedCtx: any = null
            if (typeof ctx === 'object' && ctx !== null) {
              parsedCtx = ctx
            } else {
              try {
                parsedCtx = JSON.parse(ctx)
              } catch (e) {}
            }

            if (parsedCtx) {
              return (
                <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-white/80 space-y-2">
                  <span className="font-bold text-white/30 block uppercase tracking-wider text-[9px]">Scene details</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div><span className="text-white/40">Mood:</span> <span className="text-white/80 font-medium">{parsedCtx.mood}</span></div>
                    <div><span className="text-white/40">Vibe:</span> <span className="text-white/80 font-medium">{parsedCtx.activity}</span></div>
                    <div><span className="text-white/40">Objects:</span> <span className="text-white/80 font-medium">{Array.isArray(parsedCtx.objects) ? parsedCtx.objects.slice(0, 3).join(', ') : parsedCtx.objects}</span></div>
                    <div><span className="text-white/40">Colors:</span> <span className="text-white/80 font-medium">{Array.isArray(parsedCtx.colors) ? parsedCtx.colors.slice(0, 3).join(', ') : parsedCtx.colors}</span></div>
                  </div>
                </div>
              )
            }
            return (
              <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-xs text-white/70 space-y-1">
                <span className="font-bold text-white/30 block uppercase tracking-wider text-[9px]">Detected Context</span>
                <p className="line-clamp-3">{ctx}</p>
              </div>
            )
          })()}
        </div>
        <div className="grid gap-2 grid-cols-2">
          {analysis.linkedin_post && (
            <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between text-[11px]">
              <span className="text-blue-400 font-semibold">LinkedIn Draft</span>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(analysis.linkedin_post, `${platform}_linkedin`)} className="h-6 px-2 text-[10px] text-white/50 hover:text-white hover:bg-white/5">
                {copiedField === `${platform}_linkedin` ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          )}
          {analysis.twitter_post && (
            <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between text-[11px]">
              <span className="text-white/60 font-semibold">X / Twitter Draft</span>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(analysis.twitter_post, `${platform}_twitter`)} className="h-6 px-2 text-[10px] text-white/50 hover:text-white hover:bg-white/5">
                {copiedField === `${platform}_twitter` ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1100px] mx-auto">
      {/* ═══ HEADER ═══ */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-purple flex items-center justify-center">
            <Send className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">Create Post</h1>
            <p className="text-xs text-white/30">Publish or schedule to multiple platforms</p>
          </div>
        </div>
        {scheduledPosts.filter(s => s.status === 'pending').length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowScheduled(!showScheduled)}
            className="gap-2 border-amber-500/20 text-amber-400 hover:bg-amber-500/10 rounded-lg"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            {scheduledPosts.filter(s => s.status === 'pending').length} Scheduled
          </Button>
        )}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ═══ MAIN CONTENT ═══ */}
        <div className="lg:col-span-2 space-y-4">

          {/* Platform Selection */}
          <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="h-[2px] bg-gradient-to-r from-neon-cyan via-neon-purple to-neon-pink" />
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-neon-cyan" /> Select Platforms
              </CardTitle>
              <CardDescription className="text-white/25 text-xs">Toggle the platforms you want to publish to</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {Object.entries(PLATFORM_CONFIG).map(([id, config]) => {
                  const enabled = platforms[id]?.enabled
                  const Icon = config.icon
                  return (
                    <motion.div key={id} whileTap={{ scale: 0.97 }}
                      onClick={() => updatePlatform(id, 'enabled', !enabled)}
                      className={`cursor-pointer p-4 rounded-xl border transition-all ${
                        enabled
                          ? `bg-gradient-to-br ${config.gradient} border-white/15 shadow-lg`
                          : `bg-white/[0.01] border-white/5 ${config.hoverBorder} opacity-50 hover:opacity-80`
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${enabled ? 'bg-black/30 border-white/10' : 'bg-white/5 border-white/5'}`}>
                            <Icon className="w-5 h-5" style={{ color: enabled ? config.color : '#555' }} />
                          </div>
                          <span className="text-sm font-bold text-white">{config.label}</span>
                        </div>
                        <Switch checked={enabled} onCheckedChange={(c) => updatePlatform(id, 'enabled', c)} onClick={(e) => e.stopPropagation()} />
                      </div>
                      {enabled && validationErrors[id] && (
                        <p className="text-[10px] text-red-400 mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {validationErrors[id]}
                        </p>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Platform Config Sections */}
          <AnimatePresence>
            {/* FACEBOOK */}
            {platforms.facebook.enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Card className="border-blue-500/10 bg-gradient-to-br from-blue-500/[0.03] to-transparent overflow-hidden">
                  <div className="h-[2px] bg-gradient-to-r from-blue-500 to-blue-700" />
                  <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPlatform(expandedPlatform === 'facebook' ? null : 'facebook')}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Facebook className="w-4 h-4" style={{ color: '#1877F2' }} />
                        <CardTitle className="text-sm font-bold text-white">Facebook Settings</CardTitle>
                      </div>
                      {expandedPlatform === 'facebook' ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                    </div>
                  </CardHeader>
                  <AnimatePresence>
                    {expandedPlatform !== 'facebook' ? null : (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column: Form Settings & Upload */}
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Post Type</label>
                                  <Select value={platforms.facebook.type} onValueChange={(v) => updatePlatform('facebook', 'type', v)}>
                                    <SelectTrigger className="bg-black/20 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="post">Standard Post</SelectItem>
                                      <SelectItem value="reel">Reel (Video)</SelectItem>
                                      <SelectItem value="story">Story</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Caption</label>
                                  <Button variant="ghost" size="sm" onClick={() => generateAIContent('facebook', 'caption')}
                                    disabled={generatingAI['facebook_caption']}
                                    className="h-7 px-2.5 text-[10px] font-bold gap-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg"
                                  >
                                    {generatingAI['facebook_caption'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    AI Generate
                                  </Button>
                                </div>
                                <Textarea placeholder="What's on your mind? (Type a topic and click AI Generate)" value={typeof platforms.facebook.caption === 'object' ? JSON.stringify(platforms.facebook.caption, null, 2) : platforms.facebook.caption}
                                  onChange={(e) => updatePlatform('facebook', 'caption', e.target.value)}
                                  className="min-h-[100px] resize-none bg-black/20 border-white/10 text-white placeholder:text-white/20"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] text-white/40 uppercase tracking-wider">Media {platforms.facebook.type === 'post' ? '(Optional)' : '(Required)'}</label>
                                <div className={`relative border-2 border-dashed rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[120px] transition-all ${validationErrors.facebook ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 hover:border-blue-500/30 bg-black/10'}`}>
                                  <input type="file" accept="image/*,video/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleMediaChange('facebook', false, e)} />
                                  {platforms.facebook.mediaPreviews?.[0] ? (
                                    platforms.facebook.media?.[0]?.type.startsWith('video')
                                      ? <video src={platforms.facebook.mediaPreviews[0]} className="max-h-[150px] rounded-lg" controls />
                                      : <img src={platforms.facebook.mediaPreviews[0]} className="max-h-[150px] rounded-lg" alt="Preview" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-2 text-white/20">
                                      <Upload className="w-6 h-6" /><span className="text-xs">Upload Media</span>
                                    </div>
                                  )}
                                </div>
                                {platforms.facebook.media?.[0] && (
                                  <Button
                                    type="button"
                                    onClick={() => analyzeMediaFile('facebook')}
                                    disabled={isAnalyzingMedia['facebook']}
                                    className="w-full mt-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-bold h-9 text-xs rounded-lg gap-2"
                                  >
                                    {isAnalyzingMedia['facebook'] ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing media...</>
                                    ) : (
                                      <><Sparkles className="w-3.5 h-3.5" /> Analyze Media with AI</>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Right Column: Facebook Preview Mockup */}
                            <div className="space-y-3 flex flex-col justify-start">
                              <label className="text-[10px] text-white/40 uppercase tracking-wider">Facebook Preview</label>
                              <div className="p-4 rounded-xl border border-white/10 bg-black/40 text-white space-y-3 font-sans shadow-inner max-w-sm mx-auto w-full">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white">
                                      F
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold">Your Page</p>
                                      <p className="text-[10px] text-white/40">Just now · 🌐</p>
                                    </div>
                                  </div>
                                </div>
                                <p className="text-xs text-white/90 whitespace-pre-wrap line-clamp-6">
                                  {typeof platforms.facebook.caption === 'object' ? JSON.stringify(platforms.facebook.caption, null, 2) : (platforms.facebook.caption || "What's on your mind? (Your caption will appear here)")}
                                </p>
                                {platforms.facebook.mediaPreviews?.[0] ? (
                                  platforms.facebook.media?.[0]?.type.startsWith('video') ? (
                                    <video src={platforms.facebook.mediaPreviews[0]} className="w-full rounded-lg max-h-[180px] object-cover bg-black" controls />
                                  ) : (
                                    <img src={platforms.facebook.mediaPreviews[0]} className="w-full rounded-lg max-h-[180px] object-cover bg-black" alt="Facebook preview" />
                                  )
                                ) : (
                                  <div className="w-full h-[140px] rounded-lg border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center text-white/20 text-xs gap-1.5">
                                    <ImageIcon className="w-6 h-6" />
                                    <span>No media uploaded yet</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[10px] text-white/40 pt-1.5 border-t border-white/5">
                                  <span>👍 0 Likes</span>
                                  <span>0 Comments · 0 Shares</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {renderPlatformAIInsights('facebook')}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )}

            {/* INSTAGRAM */}
            {platforms.instagram.enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Card className="border-pink-500/10 bg-gradient-to-br from-pink-500/[0.03] to-transparent overflow-hidden">
                  <div className="h-[2px] bg-gradient-to-r from-pink-500 to-purple-600" />
                  <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPlatform(expandedPlatform === 'instagram' ? null : 'instagram')}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Instagram className="w-4 h-4" style={{ color: '#E4405F' }} />
                        <CardTitle className="text-sm font-bold text-white">Instagram Settings</CardTitle>
                      </div>
                      {expandedPlatform === 'instagram' ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                    </div>
                  </CardHeader>
                  <AnimatePresence>
                    {expandedPlatform !== 'instagram' ? null : (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column: Form Settings & Upload */}
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Post Type</label>
                                  <Select value={platforms.instagram.type} onValueChange={(v) => updatePlatform('instagram', 'type', v)}>
                                    <SelectTrigger className="bg-black/20 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="post">Image Post</SelectItem>
                                      <SelectItem value="reel">Reel (Video)</SelectItem>
                                      <SelectItem value="story">Story</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Caption</label>
                                  <Button variant="ghost" size="sm" onClick={() => generateAIContent('instagram', 'caption')}
                                    disabled={generatingAI['instagram_caption']}
                                    className="h-7 px-2.5 text-[10px] font-bold gap-1.5 text-pink-400 hover:text-pink-300 hover:bg-pink-500/10 rounded-lg"
                                  >
                                    {generatingAI['instagram_caption'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    AI Generate
                                  </Button>
                                </div>
                                <Textarea placeholder="Write a topic and click AI Generate..." value={typeof platforms.instagram.caption === 'object' ? JSON.stringify(platforms.instagram.caption, null, 2) : platforms.instagram.caption}
                                  onChange={(e) => updatePlatform('instagram', 'caption', e.target.value)}
                                  className="min-h-[100px] resize-none bg-black/20 border-white/10 text-white placeholder:text-white/20"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] text-white/40 uppercase tracking-wider text-pink-400">Media (Required)</label>
                                <div className={`relative border-2 border-dashed rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[120px] transition-all ${validationErrors.instagram ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 hover:border-pink-500/30 bg-black/10'}`}>
                                  <input type="file" accept="image/*,video/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleMediaChange('instagram', false, e)} />
                                  {platforms.instagram.mediaPreviews?.[0] ? (
                                    platforms.instagram.media?.[0]?.type.startsWith('video')
                                      ? <video src={platforms.instagram.mediaPreviews[0]} className="max-h-[150px] rounded-lg" controls />
                                      : <img src={platforms.instagram.mediaPreviews[0]} className="max-h-[150px] rounded-lg" alt="Preview" />
                                  ) : (
                                    <div className="flex flex-col items-center gap-2 text-white/20">
                                      <Upload className="w-6 h-6" /><span className="text-xs">Upload Image or Video</span>
                                    </div>
                                  )}
                                </div>
                                {platforms.instagram.media?.[0] && (
                                  <Button
                                    type="button"
                                    onClick={() => analyzeMediaFile('instagram')}
                                    disabled={isAnalyzingMedia['instagram']}
                                    className="w-full mt-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-bold h-9 text-xs rounded-lg gap-2"
                                  >
                                    {isAnalyzingMedia['instagram'] ? (
                                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing media...</>
                                    ) : (
                                      <><Sparkles className="w-3.5 h-3.5" /> Analyze Media with AI</>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Right Column: Instagram Preview Mockup */}
                            <div className="space-y-3 flex flex-col justify-start">
                              <label className="text-[10px] text-white/40 uppercase tracking-wider">Instagram Preview</label>
                              <div className="p-0 rounded-xl border border-white/10 bg-black text-white font-sans overflow-hidden max-w-sm mx-auto w-full shadow-lg">
                                <div className="flex items-center gap-2.5 p-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 p-[1.5px]">
                                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center font-bold text-[10px] text-white">
                                      IG
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold">your_account</p>
                                    <p className="text-[9px] text-white/40">Sponsored</p>
                                  </div>
                                </div>
                                {platforms.instagram.mediaPreviews?.[0] ? (
                                  platforms.instagram.media?.[0]?.type.startsWith('video') ? (
                                    <div className="relative w-full aspect-square bg-black flex items-center justify-center">
                                      <video src={platforms.instagram.mediaPreviews[0]} className="w-full h-full object-cover" controls />
                                    </div>
                                  ) : (
                                    <div className="relative w-full aspect-square bg-black">
                                      <img src={platforms.instagram.mediaPreviews[0]} className="w-full h-full object-cover" alt="Instagram preview" />
                                    </div>
                                  )
                                ) : (
                                  <div className="w-full aspect-square bg-white/[0.02] border-y border-white/5 flex flex-col items-center justify-center text-white/20 text-xs gap-1.5">
                                    <ImageIcon className="w-6 h-6" />
                                    <span>Upload an image or video</span>
                                  </div>
                                )}
                                <div className="p-3 space-y-2">
                                  <div className="flex items-center justify-between text-white/90">
                                    <div className="flex items-center gap-3">
                                      <svg className="w-4 h-4 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                                      <svg className="w-4 h-4 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                    </div>
                                  </div>
                                  <div className="text-[11px] space-y-1">
                                    <p className="font-semibold text-white">0 likes</p>
                                    <p className="text-white/90 whitespace-pre-wrap line-clamp-4">
                                      <span className="font-semibold mr-1">your_account</span>
                                      {typeof platforms.instagram.caption === 'object' ? JSON.stringify(platforms.instagram.caption, null, 2) : (platforms.instagram.caption || "Your caption will appear here...")}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          {renderPlatformAIInsights('instagram')}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )}

            {/* YOUTUBE */}
            {platforms.youtube.enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <Card className="border-red-500/10 bg-gradient-to-br from-red-500/[0.03] to-transparent overflow-hidden">
                  <div className="h-[2px] bg-gradient-to-r from-red-500 to-red-700" />
                  <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedPlatform(expandedPlatform === 'youtube' ? null : 'youtube')}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Youtube className="w-4 h-4" style={{ color: '#FF0000' }} />
                        <CardTitle className="text-sm font-bold text-white">YouTube Settings</CardTitle>
                      </div>
                      {expandedPlatform === 'youtube' ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
                    </div>
                  </CardHeader>
                  <AnimatePresence>
                    {expandedPlatform !== 'youtube' ? null : (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column: Form Settings & Upload */}
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Video Type</label>
                                  <Select value={platforms.youtube.type} onValueChange={(v) => updatePlatform('youtube', 'type', v)}>
                                    <SelectTrigger className="bg-black/20 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="video">Standard Video</SelectItem>
                                      <SelectItem value="short">YouTube Short</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Privacy</label>
                                  <Select value={platforms.youtube.privacy} onValueChange={(v) => updatePlatform('youtube', 'privacy', v)}>
                                    <SelectTrigger className="bg-black/20 border-white/10 h-9 text-sm"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="private">Private</SelectItem>
                                      <SelectItem value="unlisted">Unlisted</SelectItem>
                                      <SelectItem value="public">Public</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Video Title</label>
                                  <Button variant="ghost" size="sm" onClick={() => generateAIContent('youtube', 'title')}
                                    disabled={generatingAI['youtube_title']}
                                    className="h-7 px-2.5 text-[10px] font-bold gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                  >
                                    {generatingAI['youtube_title'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    AI Title
                                  </Button>
                                </div>
                                <Input placeholder="Type a topic and click AI Title..." value={typeof platforms.youtube.title === 'object' ? JSON.stringify(platforms.youtube.title, null, 2) : platforms.youtube.title}
                                  onChange={(e) => updatePlatform('youtube', 'title', e.target.value)}
                                  className="bg-black/20 border-white/10 h-10 text-white placeholder:text-white/20"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Description</label>
                                  <Button variant="ghost" size="sm" onClick={() => generateAIContent('youtube', 'description')}
                                    disabled={generatingAI['youtube_description']}
                                    className="h-7 px-2.5 text-[10px] font-bold gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                  >
                                    {generatingAI['youtube_description'] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                                    AI Description
                                  </Button>
                                </div>
                                <Textarea placeholder="Type a topic and click AI Description..." value={typeof platforms.youtube.caption === 'object' ? JSON.stringify(platforms.youtube.caption, null, 2) : platforms.youtube.caption}
                                  onChange={(e) => {
                                    updatePlatform('youtube', 'caption', e.target.value)
                                    updatePlatform('youtube', 'description', e.target.value)
                                  }}
                                  className="min-h-[100px] resize-none bg-black/20 border-white/10 text-white placeholder:text-white/20"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider text-red-400">Video File (Required)</label>
                                  <div className={`relative border-2 border-dashed rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[120px] transition-all ${validationErrors.youtube ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 hover:border-red-500/30 bg-black/10'}`}>
                                    <input type="file" accept="video/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleMediaChange('youtube', false, e)} />
                                    {platforms.youtube.mediaPreviews?.[0] ? (
                                      <video src={platforms.youtube.mediaPreviews[0]} className="max-h-[100px] rounded-lg" controls />
                                    ) : (
                                      <div className="flex flex-col items-center gap-2 text-white/20"><Video className="w-6 h-6" /><span className="text-xs">Upload MP4</span></div>
                                    )}
                                  </div>
                                  {platforms.youtube.media?.[0] && (
                                    <Button
                                      type="button"
                                      onClick={() => analyzeMediaFile('youtube')}
                                      disabled={isAnalyzingMedia['youtube']}
                                      className="w-full mt-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-bold h-9 text-xs rounded-lg gap-2"
                                    >
                                      {isAnalyzingMedia['youtube'] ? (
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing video...</>
                                      ) : (
                                        <><Sparkles className="w-3.5 h-3.5" /> Analyze Video with AI</>
                                      )}
                                    </Button>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-white/40 uppercase tracking-wider">Thumbnail (Optional)</label>
                                  <div className="relative border-2 border-dashed rounded-xl p-4 text-center flex flex-col items-center justify-center min-h-[120px] transition-all border-white/10 hover:border-red-500/30 bg-black/10">
                                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleMediaChange('youtube', true, e)} />
                                    {platforms.youtube.thumbnailPreview ? (
                                      <img src={platforms.youtube.thumbnailPreview} className="max-h-[100px] rounded-lg object-cover" alt="Thumbnail" />
                                    ) : (
                                      <div className="flex flex-col items-center gap-2 text-white/20"><ImageIcon className="w-6 h-6" /><span className="text-xs">Upload Image</span></div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Right Column: YouTube Preview Mockup */}
                            <div className="space-y-3 flex flex-col justify-start">
                              <label className="text-[10px] text-white/40 uppercase tracking-wider">YouTube Preview</label>
                              <div className="p-3 rounded-xl border border-white/10 bg-black/40 text-white font-sans space-y-3 max-w-sm mx-auto w-full shadow-lg">
                                {platforms.youtube.mediaPreviews?.[0] ? (
                                  <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
                                    <video src={platforms.youtube.mediaPreviews[0]} className="w-full h-full object-cover" controls />
                                  </div>
                                ) : (
                                  <div className="w-full aspect-video rounded-lg border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center text-white/20 text-xs gap-2">
                                    <Video className="w-6 h-6" />
                                    <span>Upload Video (Required)</span>
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <h4 className="text-xs font-bold text-white leading-snug line-clamp-2">
                                    {typeof platforms.youtube.title === 'object' ? JSON.stringify(platforms.youtube.title, null, 2) : (platforms.youtube.title || "Your click-worthy video title will appear here")}
                                  </h4>
                                  <p className="text-[10px] text-white/40">0 views · Just now</p>
                                </div>
                                <div className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center font-bold text-[10px]">
                                      YT
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold">Your Channel</p>
                                      <p className="text-[9px] text-white/40">0 subscribers</p>
                                    </div>
                                  </div>
                                  <Button variant="destructive" size="sm" className="h-7 text-[9px] font-bold rounded-full px-3.5 bg-red-600 hover:bg-red-700 text-white border-0">
                                    Subscribe
                                  </Button>
                                </div>
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Description Drawer</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/60">Privacy: {platforms.youtube.privacy}</span>
                                  </div>
                                  <p className="text-[10px] text-white/80 whitespace-pre-wrap line-clamp-3">
                                    {typeof platforms.youtube.caption === 'object' ? JSON.stringify(platforms.youtube.caption, null, 2) : (platforms.youtube.caption || "Video description text...")}
                                  </p>
                                  {platforms.youtube.tags && platforms.youtube.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {platforms.youtube.tags.map((tag, idx) => (
                                        <span key={idx} className="text-[9px] text-blue-400">
                                          #{tag.replace(/^#/, '')}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          {renderPlatformAIInsights('youtube')}
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

        </div>

        {/* ═══ SIDEBAR ═══ */}
        <div className="space-y-4">
          <Card className="border-white/5 bg-white/[0.02] overflow-hidden sticky top-6">
            <div className="h-[2px] bg-gradient-to-r from-neon-cyan to-neon-purple" />
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" /> Publish Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Platform status */}
              <div className="space-y-2">
                {Object.entries(PLATFORM_CONFIG).map(([id, config]) => {
                  const enabled = platforms[id]?.enabled
                  const Icon = config.icon
                  return (
                    <div key={id} className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${enabled ? 'bg-white/[0.03] border-white/10' : 'bg-transparent border-white/5 opacity-30'}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" style={{ color: enabled ? config.color : '#444' }} />
                        <span className="text-xs font-medium text-white">{config.label}</span>
                      </div>
                      {enabled ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <div className="w-3.5 h-3.5 rounded-full border border-white/20" />}
                    </div>
                  )
                })}
              </div>

              {/* Mode Toggle */}
              <div className="flex gap-1 p-1 bg-black/30 rounded-lg border border-white/5">
                <button onClick={() => setMode('now')}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mode === 'now' ? 'bg-gradient-to-r from-neon-cyan to-neon-purple text-black' : 'text-white/40 hover:text-white/60'}`}
                >
                  <Send className="w-3 h-3" /> Publish Now
                </button>
                <button onClick={() => setMode('schedule')}
                  className={`flex-1 py-2 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${mode === 'schedule' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black' : 'text-white/40 hover:text-white/60'}`}
                >
                  <Clock className="w-3 h-3" /> Schedule
                </button>
              </div>

              {/* Schedule Options */}
              <AnimatePresence>
                {mode === 'schedule' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarClock className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">Schedule (IST)</span>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-white/30 uppercase tracking-wider">Date</label>
                        <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                          min={today}
                          className="bg-black/30 border-white/10 h-9 text-sm text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-white/30 uppercase tracking-wider">Time (IST)</label>
                        <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
                          className="bg-black/30 border-white/10 h-9 text-sm text-white"
                        />
                      </div>
                      {scheduleDate && scheduleTime && (
                        <p className="text-[10px] text-amber-400/60 text-center">
                          Will publish at {scheduleTime} IST on {new Date(scheduleDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Button */}
              {mode === 'now' ? (
                <Button onClick={handlePublish} disabled={!canPublish}
                  className={`w-full h-11 font-bold text-sm rounded-xl transition-all ${!canPublish ? 'bg-white/5 text-white/20' : 'bg-gradient-to-r from-neon-cyan to-neon-purple text-black shadow-lg shadow-neon-cyan/20 hover:shadow-neon-cyan/40'}`}
                >
                  {isPublishing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing...</> : <><Send className="w-4 h-4 mr-2" /> Publish Now</>}
                </Button>
              ) : (
                <Button onClick={handleSchedule} disabled={!canPublish || !scheduleDate || !scheduleTime}
                  className={`w-full h-11 font-bold text-sm rounded-xl transition-all ${(!canPublish || !scheduleDate || !scheduleTime) ? 'bg-white/5 text-white/20' : 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40'}`}
                >
                  {isScheduling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scheduling...</> : <><CalendarClock className="w-4 h-4 mr-2" /> Schedule Post</>}
                </Button>
              )}

              {/* Results */}
              {results && (
                <div className="space-y-2 pt-3 border-t border-white/5">
                  <h4 className="text-[10px] text-white/30 uppercase tracking-wider font-bold">Results</h4>
                  {results.map((res, i) => {
                    const config = PLATFORM_CONFIG[res.platform]
                    const Icon = config?.icon || Send
                    return (
                      <div key={i} className="p-2.5 rounded-lg bg-black/20 border border-white/5 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5" style={{ color: config?.color }} />
                            <span className="text-xs font-medium text-white capitalize">{res.platform}</span>
                          </div>
                          {res.status === 'success'
                            ? <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Success</span>
                            : <span className="text-[10px] text-red-400 font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</span>
                          }
                        </div>
                        {res.status === 'failure' && res.error && (
                          <p className="text-[10px] text-red-400/70 mt-1.5 bg-red-500/10 p-1.5 rounded">
                            {typeof res.error === 'object' ? JSON.stringify(res.error, null, 2) : String(res.error)}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ SCHEDULED POSTS ═══ */}
      <AnimatePresence>
        {(showScheduled || scheduledPosts.filter(s => s.status === 'pending').length > 0) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-amber-500/10 bg-amber-500/[0.02] overflow-hidden">
              <div className="h-[2px] bg-gradient-to-r from-amber-500 to-orange-500" />
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-amber-400" /> Scheduled Posts
                </CardTitle>
                <CardDescription className="text-white/25 text-xs">Posts waiting to be auto-published at the scheduled IST time</CardDescription>
              </CardHeader>
              <CardContent>
                {scheduledPosts.length === 0 ? (
                  <p className="text-center text-white/20 text-sm py-6">No scheduled posts</p>
                ) : (
                  <div className="space-y-2">
                    {scheduledPosts.map((sp) => {
                      const platKeys = Object.keys(sp.platforms || {}).filter(k => sp.platforms[k]?.enabled)
                      // Convert UTC back to IST for display
                      const scheduledDateObj = new Date(sp.scheduled_at)
                      return (
                        <div key={sp.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                          <div className="flex items-center gap-3">
                            <div className="flex -space-x-1">
                              {platKeys.map(pk => {
                                const Icon = PLATFORM_CONFIG[pk]?.icon || Send
                                return <Icon key={pk} className="w-4 h-4" style={{ color: PLATFORM_CONFIG[pk]?.color || '#666' }} />
                              })}
                            </div>
                            <div>
                              <p className="text-xs font-medium text-white">{platKeys.map(k => PLATFORM_CONFIG[k]?.label || k).join(' + ')}</p>
                              <p className="text-[10px] text-white/30">
                                {scheduledDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} at {scheduledDateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wider border ${
                              sp.status === 'pending' ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' :
                              sp.status === 'completed' ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' :
                              sp.status === 'publishing' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' :
                              'bg-red-400/10 text-red-400 border-red-400/20'
                            }`}>
                              {sp.status}
                            </span>
                            {sp.status === 'pending' && (
                              <Button variant="ghost" size="icon" onClick={() => cancelScheduled(sp.id)}
                                className="text-red-400/50 hover:text-red-400 hover:bg-red-500/10 h-7 w-7"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
