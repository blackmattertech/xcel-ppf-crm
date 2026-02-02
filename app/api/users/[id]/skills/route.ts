import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { PERMISSIONS } from '@/shared/constants/permissions'
import { z } from 'zod'

const upsertSkillSchema = z.object({
  skill_type: z.enum(['product', 'industry', 'language', 'territory', 'expertise']),
  skill_name: z.string().min(1),
  skill_level: z.number().int().min(1).max(10).optional(),
  is_primary: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const supabase = createServiceClient()

    const { data: skills, error } = await supabase
      .from('user_skills')
      .select('*')
      .eq('user_id', id)
      .order('is_primary', { ascending: false })
      .order('skill_level', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch user skills: ${error.message}`)
    }

    return NextResponse.json({ skills: skills || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch user skills' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const body = await request.json()
    const skillData = upsertSkillSchema.parse(body)

    const supabase = createServiceClient()

    const { data: skill, error } = await supabase
      .from('user_skills')
      .upsert(
        {
          user_id: id,
          skill_type: skillData.skill_type,
          skill_name: skillData.skill_name,
          skill_level: skillData.skill_level || 5,
          is_primary: skillData.is_primary || false,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,skill_type,skill_name',
        }
      )
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to upsert user skill: ${error.message}`)
    }

    return NextResponse.json({ skill }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upsert user skill' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requirePermission(request, PERMISSIONS.LEADS_UPDATE)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const skillType = searchParams.get('skill_type')
    const skillName = searchParams.get('skill_name')

    if (!skillType || !skillName) {
      return NextResponse.json(
        { error: 'skill_type and skill_name are required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { error } = await supabase
      .from('user_skills')
      .delete()
      .eq('user_id', id)
      .eq('skill_type', skillType)
      .eq('skill_name', skillName)

    if (error) {
      throw new Error(`Failed to delete user skill: ${error.message}`)
    }

    return NextResponse.json({ message: 'Skill deleted successfully' })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete user skill' },
      { status: 500 }
    )
  }
}
