import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/backend/middleware/auth'
import {
  getPipelineMetrics,
  getSourceROI,
  getCohortAnalysis,
  getConversionFunnel,
  getRepPerformance,
} from '@/backend/services/advanced-analytics.service'
import { PERMISSIONS } from '@/shared/constants/permissions'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, PERMISSIONS.ANALYTICS_READ)
    
    if ('error' in authResult) {
      return authResult.error
    }

    const searchParams = request.nextUrl.searchParams
    const metric = searchParams.get('metric')
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined
    const period = (searchParams.get('period') as 'month' | 'week') || 'month'

    let result: any

    // Support both frontend tab IDs and backend metric names for backward compatibility
    const metricMap: Record<string, string> = {
      'pipeline': 'pipeline',
      'source': 'source_roi',
      'source_roi': 'source_roi',
      'cohort': 'cohort',
      'reps': 'rep_performance',
      'rep_performance': 'rep_performance',
      'funnel': 'funnel',
    }
    
    const mappedMetric = metricMap[metric || ''] || metric

    switch (mappedMetric) {
      case 'pipeline':
        result = await getPipelineMetrics(startDate, endDate)
        break

      case 'source_roi':
        result = await getSourceROI(startDate, endDate)
        break

      case 'cohort':
        result = await getCohortAnalysis(period)
        break

      case 'funnel':
        result = await getConversionFunnel(startDate, endDate)
        break

      case 'rep_performance':
        result = await getRepPerformance(startDate, endDate)
        break

      case 'all':
        result = {
          pipeline: await getPipelineMetrics(startDate, endDate),
          sourceROI: await getSourceROI(startDate, endDate),
          cohort: await getCohortAnalysis(period),
          funnel: await getConversionFunnel(startDate, endDate),
          repPerformance: await getRepPerformance(startDate, endDate),
        }
        break

      default:
        return NextResponse.json(
          { error: `Invalid metric: ${metric}. Use: pipeline, source/source_roi, cohort, funnel, reps/rep_performance, or all` },
          { status: 400 }
        )
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
}
