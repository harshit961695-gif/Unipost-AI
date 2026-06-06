"use client"

import { Search, User } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "./notification-bell"

export function Header() {
  return (
    <header className="sticky top-0 z-40 glass-strong border-b border-border/50">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search posts, analytics..."
              className="pl-10 w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}

