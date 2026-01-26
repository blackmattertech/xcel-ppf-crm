'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import TypingAnimation from '@/components/TypingAnimation'

export default function LoginPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

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
          // Remove stored credentials if "Remember me" is not checked
          localStorage.removeItem('remembered_credentials')
        }

        // Clear all React Query cache to ensure fresh data for new user
        queryClient.clear()
        // Invalidate auth query to fetch new user data
        queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
        // Invalidate all other queries
        queryClient.invalidateQueries()
        
        // Redirect to dashboard
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image - Mobile uses mobileloginimage.jpg, Desktop uses login-bg.png */}
      <div className="absolute inset-0 z-0">
        {/* Mobile Image */}
        <Image
          src="/mobileloginimage.jpg"
          alt="Background"
          fill
          className="object-cover md:hidden"
          priority
          sizes="(max-width: 768px) 100vw, 100vw"
        />
        {/* Desktop Image */}
        <Image
          src="/login-bg.png"
          alt="Background"
          fill
          className="object-cover hidden md:block"
          priority
          sizes="(min-width: 768px) 100vw, 100vw"
        />
      </div>

      {/* Typing Animation - Responsive positioning */}
      {/* <div className="hidden sm:block absolute left-4 md:left-8 lg:left-[700px] top-1/3 md:top-[200px] lg:top-[200px] z-30 max-w-[90%] md:max-w-none">
        <h1 className="text-white text-1xl md:text-4xl lg:text-2xl xl:text-2xl font-bold leading-tight md:leading-tight lg:leading-tight font-poppins">
          <TypingAnimation
            texts={[
              'Protecting Performance.\nPreserving Perfection.',
              'Engineered Paint Protection\nFor Elite Cars.',
              'Where Luxury Meets\nUltimate Protection.',
            ]}
          />
        </h1>
      </div> */}

      {/* Login Card - Vertically centered and responsive */}
      <div className="absolute right-4 md:right-8 lg:right-[80px] top-1/2 -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-[500px] lg:w-[546px] max-h-[90vh] lg:h-[740px] overflow-y-auto">
        <div className="relative w-full min-h-[600px] lg:h-full bg-[rgba(255,255,255,0.1)] backdrop-blur-sm rounded-2xl md:rounded-[34px] shadow-[0px_4px_200px_0px_rgba(46,99,234,0.1)]">
          <div className="flex flex-col px-4 md:px-8 lg:px-[60px] pt-8 md:pt-12 lg:pt-[90px] pb-8 md:pb-12 lg:pb-[80px] h-full">
            {/* Logo - Positioned on the left inside the dialog */}
            <div className="mb-6 md:mb-8 lg:mb-[40px] self-start">
              <Image
                src="/xcel-logo.png"
                alt="XCEL Logo"
                width={136}
                height={65}
                className="scale-y-[-1] w-24 h-auto md:w-32 lg:w-[136px]"
              />
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
              {/* Title */}
              <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                Nice to see you again
              </h2>

              {/* Form Fields */}
              <div className="flex flex-col gap-4 md:gap-5 lg:gap-[20px]">
                {/* Email/Phone Input */}
                <div className="flex flex-col gap-2 md:gap-[8px]">
                  <label htmlFor="email" className="text-white text-[10px] md:text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-2 md:px-4 lg:px-[16px]">
                    Login
                  </label>
                  <div className="relative h-12 md:h-[48px]">
                    <input
                      id="email"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email or phone number"
                      required
                      className="w-full h-full px-3 md:px-4 lg:px-[16px] pr-8 md:pr-10 lg:pr-[40px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-md md:rounded-[6px] text-sm md:text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="flex flex-col gap-2 md:gap-[8px]">
                  <label htmlFor="password" className="text-[#f8e5e5] text-[10px] md:text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-2 md:px-4 lg:px-[16px]">
                    Password
                  </label>
                  <div className="relative h-12 md:h-[48px]">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                      className="w-full h-full px-3 md:px-4 lg:px-[16px] pr-8 md:pr-10 lg:pr-[40px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-md md:rounded-[6px] text-sm md:text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 md:right-[8px] top-1/2 -translate-y-1/2 p-1 md:p-[8px] cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <Image
                        src="/eye-icon.svg"
                        alt="Toggle password visibility"
                        width={16}
                        height={16}
                        className="w-4 h-4 md:w-4 md:h-4"
                      />
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between gap-3 md:gap-4 lg:gap-[16px] mt-1 md:mt-[4px]">
                  <div className="flex items-center gap-2 md:gap-[8px] flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => setRememberMe(!rememberMe)}
                      className="relative w-10 md:w-[40px] h-5 md:h-[20px] rounded-[36.5px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] transition-all cursor-pointer flex-shrink-0"
                    >
                      <div
                        className={`absolute top-[2px] w-4 md:w-[16px] h-4 md:h-[16px] rounded-full shadow-[1px_1px_2px_-1px_rgba(51,51,51,0.3)] transition-all duration-300 ${
                          rememberMe 
                            ? 'left-[22px] md:left-[22px] bg-[#ed1b24]' 
                            : 'left-[2px] bg-white'
                        }`}
                      />
                    </button>
                    <span className="text-white text-[11px] md:text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] whitespace-nowrap">
                      Remember me
                    </span>
                  </div>
                  <a
                    href="/forgot-password"
                    className="text-white text-[11px] md:text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] text-right hover:underline flex-shrink-0"
                  >
                    Forgot password?
                  </a>
                </div>
              </div>

              {/* Divider */}
              <div className="h-[0.5px] bg-[#e5e5e5] w-full my-2 md:my-[8px]" />

              {/* Login Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 md:h-[40px] bg-[#ed1b24] rounded-md md:rounded-[6px] flex items-center justify-center text-white text-sm md:text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Logging in...' : 'Login in'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-30 bg-red-500/90 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg shadow-lg text-sm md:text-base max-w-[90%] md:max-w-none">
          {error}
        </div>
      )}
    </div>
  )
}
