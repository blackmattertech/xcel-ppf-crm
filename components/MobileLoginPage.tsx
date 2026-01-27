'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'

export default function MobileLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true) // Default: true (active)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Load remembered credentials on mount
  useEffect(() => {
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
        } else {
          // Remove expired credentials
          localStorage.removeItem('remembered_credentials')
          setRememberMe(false)
        }
      } catch (err) {
        // Invalid stored data, remove it
        localStorage.removeItem('remembered_credentials')
        setRememberMe(false)
      }
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const play = async () => {
      try {
        await video.play()
      } catch (err) {
        console.warn('Background video autoplay prevented by browser:', err)
      }
    }
    play()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Console log as per requirements
    console.log({ email, rememberMe })

    try {
      const supabase = createClient()
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }

      if (data.user && data.session) {
        // Store credentials with expiration if "Remember me" is checked
        if (rememberMe) {
          const credentials = {
            email,
            password,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
          }
          localStorage.setItem('remembered_credentials', JSON.stringify(credentials))
        } else {
          localStorage.removeItem('remembered_credentials')
        }

        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black">
      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src="/loginpage.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      {/* Login Card */}
      <div className="relative z-10 flex min-h-screen items-start justify-center px-4 py-8 sm:items-center sm:py-10">
        <div className="w-full max-w-[380px] rounded-2xl bg-white/5 backdrop-blur-[2px] border border-white/10 shadow-[0px_12px_60px_rgba(0,0,0,0.35)]">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 px-6 py-8">
            <div className="flex flex-col gap-6">
              {/* Logo - Comes first */}
              <div className="flex justify-center">
                <div className="text-white text-3xl font-bold" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  <span className="text-[#ed1b24]">X</span>
                  <span>СЕГ</span>
                </div>
              </div>

              {/* Heading - Comes after logo */}
              <h1
                className="text-white text-[20px] font-semibold leading-[28px] text-center"
                style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 600 }}
              >
                Nice to see you again
              </h1>

              {/* Input Fields */}
              <div className="flex flex-col gap-5">
                {/* Email Input */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="email"
                    className="text-white text-[11px] leading-[12px] px-4"
                    style={{
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                      letterSpacing: '0.3px'
                    }}
                  >
                    Login
                  </label>
                  <div className="relative h-12">
                    <div className="absolute inset-0 bg-white/90 border-[0.5px] border-white/70 rounded-[6px]" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      required
                      className="absolute inset-0 px-4 bg-transparent rounded-[6px] text-[15px] text-[#333] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                      style={{ fontFamily: 'Roboto, sans-serif', lineHeight: '20px' }}
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="password"
                    className="text-white text-[11px] leading-[12px] px-4"
                    style={{
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                      letterSpacing: '0.3px'
                    }}
                  >
                    Password
                  </label>
                  <div className="relative h-12">
                    <div className="absolute inset-0 bg-white/90 border-[0.5px] border-white/70 rounded-[6px]" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                      className="absolute inset-0 px-4 pr-12 bg-transparent rounded-[6px] text-[15px] text-[#333] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-[#ed1b24]"
                      style={{ fontFamily: 'Roboto, sans-serif', lineHeight: '20px' }}
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

              {/* Divider - Above Remember Me section */}
              <div className="h-[0.5px] bg-white/20 w-full" />

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    className="relative w-10 h-5 rounded-[36.5px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] transition-all duration-300 overflow-hidden"
                    aria-label="Remember me"
                  >
                    <div
                      className={`absolute top-0 left-0 w-5 h-5 rounded-full shadow-[1px_1px_2px_-1px_rgba(51,51,51,0.3)] transition-all duration-300 ${
                        rememberMe
                          ? 'translate-x-5 bg-[#ed1b24]'
                          : 'translate-x-0 bg-white'
                      }`}
                    />
                  </button>
                  <label
                    htmlFor="remember-me"
                    className="text-white text-[12px] cursor-pointer flex-1"
                    style={{
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                      letterSpacing: '0.3px',
                      lineHeight: '20px'
                    }}
                    onClick={() => setRememberMe(!rememberMe)}
                  >
                    Remember me
                  </label>
                </div>
                <a
                  href="/forgot-password"
                  className="text-white text-[12px] text-right hover:underline flex-1"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
                    letterSpacing: '0.3px',
                    lineHeight: '20px'
                  }}
                >
                  Forgot password?
                </a>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#ed1b24] rounded-[6px] text-white text-[15px] font-bold tracking-[0.3px] hover:bg-[#d11820] active:bg-[#b81519] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 700, lineHeight: '20px' }}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {/* Error Message */}
          {error && (
            <div className="px-6 pb-6">
              <div className="p-3 bg-red-500/90 text-white text-sm rounded-lg">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
