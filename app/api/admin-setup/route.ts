import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/auth/callback`,
        data: {
          full_name: fullName || 'Admin User'
        }
      }
    })

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('User already registered')) {
        // Try to sign in to get the user data
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (signInError) {
          return NextResponse.json(
            { error: 'User exists but password is incorrect' },
            { status: 400 }
          )
        }

        if (signInData.user) {
          // Update profile to admin role
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', signInData.user.id)

          if (profileError) {
            return NextResponse.json(
              { error: 'Failed to update user role: ' + profileError.message },
              { status: 500 }
            )
          }

          return NextResponse.json({
            success: true,
            message: 'User already existed, updated to admin role',
            user: {
              email: signInData.user.email,
              id: signInData.user.id
            }
          })
        }
      }

      return NextResponse.json(
        { error: 'Failed to create user: ' + authError.message },
        { status: 500 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    // Step 2: Create or update profile with admin role
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email: email,
        role: 'admin',
        full_name: fullName || 'Admin User',
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      return NextResponse.json(
        { error: 'Failed to create profile: ' + profileError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Admin user created successfully',
      user: {
        email: authData.user.email,
        id: authData.user.id,
        role: 'admin'
      }
    })

  } catch (error) {
    console.error('Admin setup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
