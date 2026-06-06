"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { motion, AnimatePresence } from "framer-motion"
import {
  Bell, Check, Sparkles, AlertTriangle, AlertCircle,
  RefreshCw, ShieldAlert, X, Youtube, Facebook, Instagram,
  Calendar, Database, CheckSquare
} from "lucide-react"

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch')
  return data
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHr = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHr / 24)

    if (diffSec < 10) return 'just now'
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch (e) {
    return ''
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  const { data, mutate } = useSWR('/api/notifications', fetcher, {
    refreshInterval: 15000, // Poll every 15s for live notifications
    revalidateOnFocus: true
  })

  const notifications = data?.notifications || []
  const unreadCount = data?.unreadCount || 0

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        mutate() // Re-fetch SWR cache
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST'
      })
      if (res.ok) {
        mutate() // Re-fetch SWR cache
      }
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  // Get corresponding icon for notification type
  const getNotificationIcon = (type: string) => {
    const lowercaseType = type.toLowerCase()
    
    if (lowercaseType === 'publish_success') {
      return (
        <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
          <Sparkles className="w-4 h-4" />
        </div>
      )
    }
    
    if (lowercaseType.startsWith('publish_failed_') || lowercaseType === 'publish_failed') {
      const platform = lowercaseType.replace('publish_failed_', '')
      return (
        <div className="relative w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
          <AlertCircle className="w-4 h-4" />
          {platform === 'facebook' && <Facebook className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-blue-500 bg-black rounded-full" />}
          {platform === 'instagram' && <Instagram className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-pink-500 bg-black rounded-full" />}
          {platform === 'youtube' && <Youtube className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-red-500 bg-black rounded-full" />}
        </div>
      )
    }

    if (lowercaseType === 'scheduled_publish_success') {
      return (
        <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
          <Calendar className="w-4 h-4" />
        </div>
      )
    }

    if (lowercaseType === 'scheduled_publish_failed') {
      return (
        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          <AlertTriangle className="w-4 h-4" />
        </div>
      )
    }

    if (lowercaseType.startsWith('analytics_sync_failed_') || lowercaseType === 'analytics_sync_failed') {
      const platform = lowercaseType.replace('analytics_sync_failed_', '')
      return (
        <div className="relative w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
          <RefreshCw className="w-4 h-4" />
          {platform === 'facebook' && <Facebook className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-blue-500 bg-black rounded-full" />}
          {platform === 'instagram' && <Instagram className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-pink-500 bg-black rounded-full" />}
          {platform === 'youtube' && <Youtube className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-red-500 bg-black rounded-full" />}
        </div>
      )
    }

    if (lowercaseType.startsWith('account_expired_') || lowercaseType === 'account_expired') {
      const platform = lowercaseType.replace('account_expired_', '')
      return (
        <div className="relative w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
          <ShieldAlert className="w-4 h-4" />
          {platform === 'facebook' && <Facebook className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-blue-500 bg-black rounded-full" />}
          {platform === 'instagram' && <Instagram className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-pink-500 bg-black rounded-full" />}
          {platform === 'youtube' && <Youtube className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-red-500 bg-black rounded-full" />}
        </div>
      )
    }

    if (lowercaseType === 'daily_integrity_failed') {
      return (
        <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)]">
          <Database className="w-4 h-4" />
        </div>
      )
    }

    return (
      <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
        <Bell className="w-4 h-4" />
      </div>
    )
  }

  return (
    <div className="relative" ref={bellRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.06] transition-all flex items-center justify-center focus:outline-none group"
      >
        <motion.div
          animate={unreadCount > 0 ? {
            rotate: [0, -10, 10, -10, 10, -5, 5, 0],
            transition: {
              repeat: Infinity,
              repeatDelay: 4,
              duration: 0.6
            }
          } : {}}
        >
          <Bell className="h-5 w-5 text-white/70 group-hover:text-white transition-colors" />
        </motion.div>

        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-cyan/50 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-neon-cyan text-[10px] font-black text-black items-center justify-center shadow-[0_0_10px_#00f0ff]">
              {unreadCount}
            </span>
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-3 w-96 rounded-2xl border border-white/10 bg-[#0A0A0B]/95 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-50 overflow-hidden"
          >
            {/* Dropdown Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-wide">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-neon-cyan/15 text-neon-cyan font-bold px-2 py-0.5 rounded-full border border-neon-cyan/20">
                    {unreadCount} new
                  </span>
                )}
              </div>
              
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] font-bold text-neon-cyan hover:text-white transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-[360px] overflow-y-auto smooth-scroll divide-y divide-white/5">
              {notifications.length > 0 ? (
                notifications.map((notification: any) => {
                  const isRead = notification.is_read
                  return (
                    <div
                      key={notification.id}
                      className={`flex gap-3 p-4 transition-all relative group ${
                        !isRead
                          ? 'bg-neon-cyan/[0.02] hover:bg-neon-cyan/[0.05]'
                          : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      {/* Left Dot Indicator */}
                      {!isRead && (
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-neon-cyan shadow-[0_0_8px_#00f0ff]" />
                      )}

                      {/* Icon */}
                      <div className="flex-shrink-0 pt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Text details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-bold ${!isRead ? 'text-white' : 'text-white/80'}`}>
                            {notification.title}
                          </p>
                          <span className="text-[10px] text-white/25 flex-shrink-0 pt-0.5">
                            {formatRelativeTime(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/50 mt-1 leading-relaxed whitespace-pre-line">
                          {notification.message}
                        </p>
                      </div>

                      {/* Action buttons on hover */}
                      {!isRead && (
                        <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                          <button
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                            title="Mark as Read"
                            className="w-6 h-6 rounded-md bg-white/5 hover:bg-neon-cyan/20 border border-white/10 hover:border-neon-cyan/30 flex items-center justify-center text-white/60 hover:text-neon-cyan transition-all"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/20 mb-3">
                    <Bell className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-white/60">All caught up!</p>
                  <p className="text-[10px] text-white/35 mt-1 max-w-[200px]">
                    You have no new notifications at this time.
                  </p>
                </div>
              )}
            </div>

            {/* View logs / History footer if there are notifications */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-white/5 bg-white/[0.01] text-center">
                <span className="text-[9px] text-white/20 uppercase tracking-widest font-semibold">
                  Showing latest 20 updates
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
