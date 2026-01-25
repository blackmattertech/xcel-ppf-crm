import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = forgotPasswordSchema.parse(body)

    const supabase = createServiceClient()

    // Check if user exists in Supabase Auth
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      // Don't reveal that there was an error listing users
      // Return success message for security (don't reveal if email exists)
      return NextResponse.json({
        message: 'If an account with that email exists, you will receive a password reset link.',
      })
    }

    const authUser = authUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

    if (!authUser) {
      // For security, don't reveal if email exists or not
      // Return success message regardless
      return NextResponse.json({
        message: 'If an account with that email exists, you will receive a password reset link.',
      })
    }

    // Check if user exists in our users table (optional, but good to verify)
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', authUser.id)
      .single()

    if (!dbUser) {
      // User exists in auth but not in our database
      // Still return success for security
      return NextResponse.json({
        message: 'If an account with that email exists, you will receive a password reset link.',
      })
    }

    // Use Supabase's resetPasswordForEmail to send the password reset email
    // This will use the configured email template from Supabase dashboard
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') || 'http://localhost:3000'}/reset-password`
    
    // Create a client instance to use resetPasswordForEmail
    // This method automatically sends the email using Supabase's email service
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { error: emailError } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    })

    if (emailError) {
      console.error('Error sending reset email:', emailError)
      // Still return success for security (don't reveal if email exists)
      return NextResponse.json({
        message: 'If an account with that email exists, you will receive a password reset link.',
      })
    }

    // Supabase will automatically send the email using the configured email template
    // The email will contain a link that redirects to your app's reset password page
    // Make sure to configure the redirect URL in Supabase dashboard:
    // Authentication > URL Configuration > Site URL and Redirect URLs

    return NextResponse.json({
      message: 'If an account with that email exists, you will receive a password reset link.',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid email address', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error in forgot password:', error)
    // Return success for security (don't reveal errors)
    return NextResponse.json({
      message: 'If an account with that email exists, you will receive a password reset link.',
    })
  }
}
