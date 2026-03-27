'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { cachedFetch } from '@/lib/api-client'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      const response = await cachedFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send reset email')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoading(false)
    }
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

      {/* Forgot Password Card - Vertically centered and responsive */}
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

            {success ? (
              <div className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
                {/* Title */}
                <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                  Check Your Email
                </h2>

                {/* Success Message */}
                <div className="bg-green-500/20 border border-green-400/30 text-white px-4 py-3 rounded-md md:rounded-[6px] text-sm">
                  <p className="font-medium">Email sent successfully!</p>
                  <p className="text-xs mt-1 text-white/90">
                    If an account with that email exists, you will receive a password reset link shortly.
                    Please check your inbox and follow the instructions to reset your password.
                  </p>
                </div>

                {/* Back to Login Button */}
                <Link
                  href="/login"
                  className="w-full h-10 md:h-[40px] bg-[#ed1b24] rounded-md md:rounded-[6px] flex items-center justify-center text-white text-sm md:text-[15px] font-bold leading-[20px] font-roboto tracking-[0.3px] hover:bg-[#d0171f] transition-colors"
                >
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6 md:gap-[24px] w-full max-w-[360px] self-center">
                {/* Title */}
                <h2 className="text-white text-lg md:text-xl lg:text-[20px] font-semibold leading-tight md:leading-[28px] font-poppins mb-0 text-center">
                  Forgot Password?
                </h2>

                {/* Form Fields */}
                <div className="flex flex-col gap-4 md:gap-5 lg:gap-[20px]">
                  {/* Email Input */}
                  <div className="flex flex-col gap-2 md:gap-[8px]">
                    <label htmlFor="email" className="text-white text-[10px] md:text-[11px] leading-[12px] font-sf-pro tracking-[0.3px] px-2 md:px-4 lg:px-[16px]">
                      Email
                    </label>
                    <div className="relative h-12 md:h-[48px]">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="w-full h-full px-3 md:px-4 lg:px-[16px] bg-[#f2f2f2] border-[0.5px] border-[#e5e5e5] rounded-md md:rounded-[6px] text-base md:text-[15px] leading-[20px] font-roboto text-[#808080] placeholder:text-[#808080] focus:outline-none focus:ring-2 focus:ring-white/20"
                      />
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
                  {loading ? 'Sending...' : 'Send Reset Link'}
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
