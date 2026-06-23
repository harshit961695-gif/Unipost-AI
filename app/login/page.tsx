"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Sparkles, ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { motion } from "framer-motion"

function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Validate environment variables
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setError("Configuration error: Supabase credentials are missing. Please check your environment variables.")
        setLoading(false)
        return
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        setError(signInError.message || "Login failed. Please check your credentials.")
        setLoading(false)
        return
      }

      if (data.user && data.session) {
        // Use router.push instead of window.location for better Next.js integration
        router.push("/dashboard")
        router.refresh()
      } else {
        setError("Login failed. Please try again.")
        setLoading(false)
      }
    } catch (err: any) {
      console.error("Login error:", err)
      
      // Handle specific error types
      if (err?.message?.includes("fetch") || err?.message?.includes("network") || err?.name === "TypeError") {
        setError("Network error: Could not connect to authentication service. Please check your internet connection and try again.")
      } else if (err?.message) {
        setError(err.message)
      } else {
        setError("An unexpected error occurred. Please try again.")
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e2538] via-[#1a2232] to-[#16202e] relative overflow-hidden flex items-center justify-center p-6">
      {/* Animated floating orbs in background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan rounded-full blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-neon-purple rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1.5s" }}></div>
        <div className="absolute top-1/2 left-2/3 w-80 h-80 bg-neon-pink rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "3s" }}></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors text-sm font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <Card className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <CardHeader className="space-y-1 text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                  <Sparkles className="w-8 h-8 text-neon-cyan" />
                </div>
              </div>
              <div className="text-2xl font-bold bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent tracking-wide">
                UniPost AI
              </div>
              <CardTitle className="text-xl font-semibold text-white">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-white/60 text-sm">
                Sign in to your UniPost AI account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-white/80">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-neon-cyan/50 focus-visible:ring-neon-cyan/50 focus-visible:ring-offset-0 focus-visible:ring-1"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-white/80">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-neon-cyan/50 focus-visible:ring-neon-cyan/50 focus-visible:ring-offset-0 focus-visible:ring-1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center space-x-2 text-white/60 cursor-pointer">
                    <input type="checkbox" className="rounded border-white/10 bg-white/5 text-neon-cyan focus:ring-neon-cyan/50" />
                    <span>Remember me</span>
                  </label>
                  <Link href="#" className="text-neon-cyan hover:underline font-medium">
                    Forgot password?
                  </Link>
                </div>
                <Button 
                  type="submit" 
                  className="w-full gap-2 bg-gradient-to-r from-neon-cyan to-neon-purple text-black font-bold hover:opacity-90 transition-all shadow-lg shadow-neon-cyan/10"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pb-6">
              <div className="text-center text-sm text-white/60">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className="text-neon-cyan hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default LoginPage
