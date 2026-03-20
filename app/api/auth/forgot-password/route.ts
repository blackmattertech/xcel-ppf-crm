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

    // Use Supabase client with anon key to send password reset email
    // resetPasswordForEmail requires the anon key, not the service key
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                   process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') || 
                   'https://xcel-ppf-crm-delta.vercel.app'
    const redirectTo = `${siteUrl}/reset-password`
    
    // Create a client with anon key to use resetPasswordForEmail
    // This method actually sends the email (unlike generateLink which just creates the link)
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
    
    // Send password reset email
    const { error: emailError } = await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo,
    })

    if (emailError) {
      console.error('Error sending reset email:', emailError)
      
      // Handle rate limiting specifically
      if (emailError.status === 429 || emailError.code === 'over_email_send_rate_limit') {
        // Return a user-friendly message for rate limiting
        return NextResponse.json({
          message: 'Too many password reset requests. Please wait a few minutes before trying again.',
        }, { status: 429 })
      }
      
      // For other errors, log but don't reveal to user for security
      // Still return success message
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
        { error: 'Invalid email address', details: error.issues || [] },
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
