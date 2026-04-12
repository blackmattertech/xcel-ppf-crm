'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    
    // Check if we have the necessary tokens in the URL
    // Supabase typically uses hash fragments for OAuth/password reset redirects
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const type = hashParams.get('type')

    // Also check query params (some configurations might use query params)
    const queryToken = searchParams.get('token')
    const queryType = searchParams.get('type')
    const queryAccessToken = searchParams.get('access_token')

    // Check for recovery token in hash or query params
    const hasRecoveryToken = 
      (accessToken && type === 'recovery') ||
      (queryToken && queryType === 'recovery') ||
      (queryAccessToken && queryType === 'recovery')

    if (hasRecoveryToken) {
      setIsValidToken(true)
      // If we have tokens in the hash, set the session immediately
      if (accessToken && type === 'recovery') {
        const refreshToken = hashParams.get('refresh_token')
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        }).then(({ error }) => {
          if (error) {
            console.error('Error setting session:', error)
            setIsValidToken(false)
            setError('Invalid or expired reset link. Please request a new password reset.')
          }
          // Clear the hash from URL after processing
          window.history.replaceState(null, '', window.location.pathname)
        }).catch((err) => {
          console.error('Error setting session:', err)
          setIsValidToken(false)
          setError('Invalid or expired reset link. Please request a new password reset.')
        })
      }
    } else if (window.location.hash || queryToken || queryAccessToken) {
      // If we have some tokens but not recovery type, still try to process
      setIsValidToken(true)
    } else {
      // Check if we already have a valid session (Supabase might have processed the hash already)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setIsValidToken(true)
        } else {
          setIsValidToken(false)
        }
      })
    }

    // Listen for auth state changes to handle automatic token processing
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setIsValidToken(true)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Get tokens from URL hash or query params
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token') || searchParams.get('access_token') || searchParams.get('token')
      const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token')

      // If no token in hash or query, check if Supabase has already set the session
      if (!accessToken) {
        // Try to get the current session
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          // Session already exists, we can proceed to update password
        } else {
          throw new Error('Invalid or expired reset link. Please request a new password reset.')
        }
      } else {
        // Set the session with the recovery token
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        })

        if (sessionError) {
          throw new Error(sessionError.message || 'Invalid or expired reset link')
        }
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update password')
      }

      setSuccess(true)
      setLoading(false)

      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
      setLoading(false)
    }
  }

  if (isValidToken === null) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/login-bg.png"
            alt="Background"
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="absolute right-4 md:right-8 lg:right-[80px] top-1/2 -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-[500px] lg:w-[546px]">
          <div className="relative w-full min-h-[600px] lg:h-full bg-[rgba(255,255,255,0.1)] backdrop-blur-sm rounded-2xl md:rounded-[34px] shadow-[0px_4px_200px_0px_rgba(46,99,234,0.1)]">
            <div className="flex flex-col px-4 md:px-8 lg:px-[60px] pt-8 md:pt-12 lg:pt-[90px] pb-8 md:pb-12 lg:pb-[80px] h-full items-center justify-center">
              <div className="text-white text-center">Loading...</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isValidToken === false) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/login-bg.png"
            alt="Background"
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="absolute right-4 md:right-8 lg:right-[80px] top-1/2 -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-[500px] lg:w-[546px]">
          <div className="relative w-full min-h-[600px] lg:h-full bg-[rgba(255,255,255,0.1)] backdrop-blur-sm rounded-2xl md:rounded-[34px] shadow-[0px_4px_200px_0px_rgba(46,99,234,0.1)]">
            <div className="flex flex-col px-4 md:px-8 lg:px-[60px] pt-8 md:pt-12 lg:pt-[90px] pb-8 md:pb-12 lg:pb-[80px] h-full">
              <div className="mb-6 md:mb-8 lg:mb-[40px] self-start">
                <Image
                  src="/ultrakool-logo.png"
                  alt="Ultrakool"
                  width={136}
                  height={65}
                  className="scale-y-[-1] w-24 h-auto md:w-32 lg:w-[136px]"
                />
              </div>
              <div className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
                <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                  Invalid Reset Link
                </h2>
                <div className="bg-red-500/20 border border-red-400/30 text-white px-4 py-3 rounded-md md:rounded-[6px] text-sm">
                  <p>This password reset link is invalid or has expired. Please request a new password reset link.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link
                    href="/forgot-password"
                    className="w-full h-10 md:h-[40px] bg-[#ed1b24] rounded-md md:rounded-[6px] flex items-center justify-center text-white text-sm md:text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors"
                  >
                    Request New Reset Link
                  </Link>
                  <Link
                    href="/login"
                    className="text-center text-white text-[11px] md:text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] hover:underline"
                  >
                    Back to Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/login-bg.png"
          alt="Background"
          fill
          className="object-cover"
          priority
        />
      </div>

      {/* Reset Password Card - Vertically centered and responsive */}
      <div className="absolute right-4 md:right-8 lg:right-[80px] top-1/2 -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-[500px] lg:w-[546px] max-h-[90vh] lg:h-[740px] overflow-y-auto">
        <div className="relative w-full min-h-[600px] lg:h-full bg-[rgba(255,255,255,0.1)] backdrop-blur-sm rounded-2xl md:rounded-[34px] shadow-[0px_4px_200px_0px_rgba(46,99,234,0.1)]">
          <div className="flex flex-col px-4 md:px-8 lg:px-[60px] pt-8 md:pt-12 lg:pt-[90px] pb-8 md:pb-12 lg:pb-[80px] h-full">
            {/* Logo - Positioned on the left inside the dialog */}
            <div className="mb-6 md:mb-8 lg:mb-[40px] self-start">
              <Image
                src="/ultrakool-logo.png"
                alt="Ultrakool"
                width={136}
                height={65}
                className="scale-y-[-1] w-24 h-auto md:w-32 lg:w-[136px]"
              />
            </div>

            {success ? (
              <div className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
                <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                  Password Reset Successful!
                </h2>
                <div className="bg-green-500/20 border border-green-400/30 text-white px-4 py-3 rounded-md md:rounded-[6px] text-sm">
                  <p className="font-medium">Your password has been reset successfully!</p>
                  <p className="text-xs mt-1 text-white/90">Redirecting to login page...</p>
                </div>
                <Link
                  href="/login"
                  className="w-full h-10 md:h-[40px] bg-[#ed1b24] rounded-md md:rounded-[6px] flex items-center justify-center text-white text-sm md:text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors"
                >
                  Go to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
                {/* Title */}
                <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                  Reset Password
                </h2>

                {/* Form Fields */}
                <div className="flex flex-col gap-4 md:gap-5 lg:gap-[20px]">
                  {/* Password Input */}
                  <div className="flex flex-col gap-2 md:gap-[8px]">
                    <label htmlFor="password" className="text-white text-[10px] md:text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-2 md:px-4 lg:px-[16px]">
                      New Password
                    </label>
                    <div className="relative h-12 md:h-[48px]">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter new password"
                        required
                        minLength={6}
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

                  {/* Confirm Password Input */}
                  <div className="flex flex-col gap-2 md:gap-[8px]">
                    <label htmlFor="confirmPassword" className="text-white text-[10px] md:text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-2 md:px-4 lg:px-[16px]">
                      Confirm Password
                    </label>
                    <div className="relative h-12 md:h-[48px]">
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        required
                        minLength={6}
                        className="w-full h-full px-3 md:px-4 lg:px-[16px] pr-8 md:pr-10 lg:pr-[40px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-md md:rounded-[6px] text-sm md:text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                </div>

                {/* Divider */}
                <div className="h-[0.5px] bg-[#e5e5e5] w-full my-2 md:my-[8px]" />

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 md:h-[40px] bg-[#ed1b24] rounded-md md:rounded-[6px] flex items-center justify-center text-white text-sm md:text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>

                {/* Back to Login Link */}
                <div className="text-center">
                  <Link
                    href="/login"
                    className="text-white text-[11px] md:text-[12px] leading-[20px] font-sf-pro tracking-[0.3px] hover:underline"
                  >
                    ← Back to Login
                  </Link>
                </div>
              </form>
            )}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
            <div className="text-center">Loading...</div>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
