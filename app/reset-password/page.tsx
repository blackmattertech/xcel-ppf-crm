'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null)

  useEffect(() => {
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
    if (
      (accessToken && type === 'recovery') ||
      (queryToken && queryType === 'recovery') ||
      (queryAccessToken && queryType === 'recovery')
    ) {
      setIsValidToken(true)
    } else if (window.location.hash || queryToken || queryAccessToken) {
      // If we have some tokens but not recovery type, still try to process
      setIsValidToken(true)
    } else {
      setIsValidToken(false)
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
      let accessToken = hashParams.get('access_token') || searchParams.get('access_token') || searchParams.get('token')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    )
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Invalid Reset Link
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              This password reset link is invalid or has expired.
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            <p>Please request a new password reset link.</p>
          </div>
          <div className="text-center">
            <Link
              href="/forgot-password"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Request New Reset Link
            </Link>
          </div>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your new password below.
          </p>
        </div>
        {success ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p className="font-medium">Password reset successfully!</p>
              <p className="text-sm mt-1">Redirecting to login page...</p>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="password" className="sr-only">
                  New Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="sr-only">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
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
