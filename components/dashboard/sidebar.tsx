"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  PenSquare,
  BarChart2,
  Settings,
  Sparkles,
  LogOut,
  Menu,
  CalendarClock
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Create Post", href: "/dashboard/create", icon: PenSquare },
  { name: "Schedule", href: "/dashboard/schedule", icon: CalendarClock },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<{email:string, name:string, avatar:string} | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user: sbUser } } = await supabase.auth.getUser()
      if (sbUser) {
        setUser({
          email: sbUser.email || '',
          name: sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email?.split('@')[0] || 'User',
          avatar: sbUser.user_metadata?.avatar_url || ''
        })
      } else {
        setUser(null)
      }
    }
    fetchUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
          avatar: session.user.user_metadata?.avatar_url || ''
        })
      } else {
        setUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const getInitials = (email: string, name: string) => {
    const text = name || email || 'US'
    return text.substring(0, 2).toUpperCase()
  }

  const avatarGradient = (email: string) => {
    const gradients = [
      "from-pink-500 to-rose-500",
      "from-purple-500 to-indigo-500",
      "from-blue-500 to-cyan-500",
      "from-teal-500 to-emerald-500",
      "from-amber-500 to-orange-500",
      "from-violet-500 to-fuchsia-500",
    ]
    let hash = 0
    if (email) {
      for (let i = 0; i < email.length; i++) {
        hash = email.charCodeAt(i) + ((hash << 5) - hash)
      }
    }
    const index = Math.abs(hash) % gradients.length
    return gradients[index]
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex h-screen w-64 flex-col glass-strong border-r border-border/50">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border/50">
        <Sparkles className="w-6 h-6 text-neon-cyan" />
        <span className="text-xl font-bold bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent">
          UniPost AI
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-neon-cyan/20 text-neon-cyan glow-cyan"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* User Card UI */}
      {user && (
        <>
          <div className="border-t border-border/50" />
          <div className="flex items-center gap-3 px-3 py-2.5">
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full overflow-hidden">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <div className={cn("flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br text-white text-xs font-bold", avatarGradient(user.email))}>
                  {getInitials(user.email, user.name)}
                </div>
              )}
            </div>
            {/* Middle info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate text-white">{user.name}</p>
              <p className="text-xs text-white/40 truncate">{user.email}</p>
            </div>
            {/* Badge */}
            <span className="text-[10px] font-bold text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 px-2 py-0.5 rounded-full shrink-0">
              Free
            </span>
          </div>
        </>
      )}

      <div className="border-t border-border/50 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  )
}
