import { NextRequest, NextResponse } from 'next/server'
import { login } from '@/backend/services/auth.service'
import { z } from 'zod'
import { rateLimitWrapper, RATE_LIMITS } from '@/lib/rate-limit'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(request: NextRequest) {
  // Rate limiting: 10 requests per 10 seconds per IP
  const rateLimitResponse = await rateLimitWrapper(request, {
    ...RATE_LIMITS.LOGIN,
    errorMessage: 'Too many login attempts. Please try again later.',
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    const result = await login(email, password)

    return NextResponse.json({
      user: result.user,
      message: 'Login successful',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 401 }
    )
  }
}
