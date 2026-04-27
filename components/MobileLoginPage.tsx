'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'

export default function MobileLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [muted, setMuted] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Load remembered credentials on mount and check session expiration
  useEffect(() => {
    // Check if we have recovery tokens in the URL hash (password reset flow)
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const type = hashParams.get('type')
    
    if (accessToken && type === 'recovery') {
      // Redirect to reset password page with the tokens
      const hash = window.location.hash
      router.push(`/reset-password${hash}`)
      return
    }

    const stored = localStorage.getItem('remembered_credentials')
    if (stored) {
      try {
        const credentials = JSON.parse(stored)
        const expiresAt = new Date(credentials.expiresAt)
        
        // Check if credentials are still valid (not expired)
        if (expiresAt > new Date()) {
          setEmail(credentials.email)
          if (credentials.password) {
            setPassword(credentials.password)
          }
          setRememberMe(true)
          
          // Check if session is still valid
          const checkSession = async () => {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            
            // If session exists but credentials are expired, sign out
            if (session && expiresAt <= new Date()) {
              await supabase.auth.signOut()
              localStorage.removeItem('remembered_credentials')
              setRememberMe(false)
            }
          }
          
          checkSession()
        } else {
          // Remove expired credentials
          localStorage.removeItem('remembered_credentials')
          // Sign out if session exists
          const supabase = createClient()
          supabase.auth.signOut()
        }
      } catch (err) {
        // Invalid stored data, remove it
        localStorage.removeItem('remembered_credentials')
      }
    }
  }, [router])

  // Ensure the background video starts automatically when available
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const play = async () => {
      try {
        await video.play()
      } catch (err) {
        // Autoplay might be blocked; keep silent failure to avoid user-facing error.
        console.warn('Background video autoplay prevented by browser:', err)
      }
    }
    play()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(typeof payload.error === 'string' ? payload.error : 'Login failed')
        setLoading(false)
        return
      }

      if (rememberMe) {
        const credentials = {
          email,
          password,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }
        localStorage.setItem('remembered_credentials', JSON.stringify(credentials))
      } else {
        localStorage.removeItem('remembered_credentials')
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Background Video - Full screen */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src="/loginpage.mp4"
          autoPlay
          loop
          muted={muted}
          playsInline
        />
      </div>

      {/* Minimal overlay - almost transparent */}
      <div className="absolute inset-0 z-10 bg-black/10" />

      {/* Content Container - Mobile optimized */}
      <div className="relative z-20 flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[360px]">
          {/* Login Card - Fully transparent, video visible through */}
          <div className="relative w-full bg-transparent rounded-[32px]">
            <div className="flex flex-col px-6 pt-8 pb-8">
              {/* Logo - Centered */}
              <div className="mb-2 self-center flex justify-center">
                <Image
                  src="/image.png"
                  alt="XCEL Logo"
                  width={280}
                  height={172}
                  className="w-48 h-auto sm:w-56"
                  style={{ width: 'auto', height: 'auto' }}
                  priority
                />
              </div>

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {/* Title */}
                <h2 className="text-white text-[20px] font-semibold leading-[28px] font-poppins mb-0 text-center">
                  Nice to see you again
                </h2>

                {/* Form Fields */}
                <div className="flex flex-col gap-5">
                  {/* Email/Phone Input */}
                  <div className="flex flex-col gap-2">
                    <label 
                      htmlFor="email" 
                      className="text-white text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-4"
                    >
                      Login
                    </label>
                    <div className="relative h-12">
                      <input
                        id="email"
                        type="text"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email or phone number"
                        required
                        className="w-full h-full px-4 pr-10 bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-[6px] text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="flex flex-col gap-2">
                    <label 
                      htmlFor="password" 
                      className="text-[#f8e5e5] text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-4"
                    >
                      Password
                    </label>
                    <div className="relative h-12">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        required
                        className="w-full h-full px-4 pr-12 bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-[6px] text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#4d4d4d] hover:opacity-80 transition-opacity"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between gap-4 mt-1">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setRememberMe(!rememberMe)}
                      className="relative w-10 h-5 rounded-[36.5px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] transition-all cursor-pointer flex-shrink-0"
                      aria-label="Remember me"
                    >
                      <div
                        className={`absolute top-[2px] w-4 h-4 rounded-full shadow-[1px_1px_2px_-1px_rgba(51,51,51,0.3)] transition-all duration-300 ${
                          rememberMe 
                            ? 'left-[22px] bg-[#ed1b24]' 
                            : 'left-[2px] bg-white'
                        }`}
                      />
                    </button>
                    <span className="text-white text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] whitespace-nowrap">
                      Remember me
                    </span>
                  </div>
                  <a
                    href="/forgot-password"
                    className="text-white text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] text-right hover:underline flex-shrink-0"
                  >
                    Forgot password?
                  </a>
                </div>

                {/* Divider */}
                <div className="h-[0.5px] bg-[#e5e5e5] w-full my-2" />

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-[#ed1b24] rounded-[6px] flex items-center justify-center text-white text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>

              {/* Error Message */}
              {error && (
                <div className="mt-4 p-3 bg-red-500/90 text-white text-sm rounded-lg text-center">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Video Controls (mute / fullscreen) - Mobile optimized */}
      <div className="absolute bottom-4 left-4 z-30 flex gap-2">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium hover:bg-black/80 backdrop-blur-sm"
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          onClick={() => {
            const video = document.querySelector('video')
            if (!video) return
            if (document.fullscreenElement) {
              document.exitFullscreen().catch(() => {})
            } else {
              video.requestFullscreen().catch(() => {})
            }
          }}
          className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-medium hover:bg-black/80 backdrop-blur-sm"
        >
          Fullscreen
        </button>
      </div>
    </div>
  )
}
