import { NextRequest, NextResponse } from 'next/server'
import { logout } from '@/backend/services/auth.service'

export async function POST(request: NextRequest) {
  try {
    await logout()
    return NextResponse.json({ message: 'Logout successful' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logout failed' },
      { status: 500 }
    )
  }
}
