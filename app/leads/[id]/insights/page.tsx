'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Layout from '@/components/Layout'
import { ArrowLeft, TrendingUp, AlertTriangle, Clock, Target, BarChart3 } from 'lucide-react'

interface PredictiveInsights {
  winProbability: {
    probability: number
    factors: Array<{ name: string; impact: number; reason: string }>
    confidence: number
  }
  churnRisk: {
    riskScore: number
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    factors: Array<{ name: string; impact: number; reason: string }>
    daysSinceLastActivity: number
  }
  bestTimeToContact: {
    recommendedTime: string
    confidence: number
    reason: string
  }
}

interface ScoreBreakdown {
  total: number
  demographic: number
  engagement: number
  fit: number
  source: number
  factors: Array<{
    type: string
    name: string
    value: string
    score: number
    weight: number
  }>
}

export default function LeadInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const leadId = params.id as string
  const [insights, setInsights] = useState<PredictiveInsights | null>(null)
  const [score, setScore] = useState<ScoreBreakdown | null>(null)
  const [loading, setLoading] = useState(true)

  const userRole = user?.role || null
  const userPermissions = user?.permissions || []
  const hasReadPermission = userPermissions.includes('leads.read')
  const hasManagePermission = userPermissions.includes('leads.manage')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }

    // Check permissions - users need leads.read or leads.manage to view insights
    if (!authLoading && user && !hasReadPermission && !hasManagePermission) {
      router.push('/leads')
    }
  }, [authLoading, isAuthenticated, user, userPermissions, hasReadPermission, hasManagePermission, router])

  useEffect(() => {
    if (isAuthenticated && (hasReadPermission || hasManagePermission)) {
      fetchInsights()
      fetchScore()
    }
  }, [leadId, isAuthenticated, hasReadPermission, hasManagePermission])

  if (!authLoading && !isAuthenticated) {
    return null
  }

  if (!authLoading && user && !hasReadPermission && !hasManagePermission) {
    return null
  }

  async function fetchInsights() {
    try {
      const response = await fetch(`/api/leads/${leadId}/predictive`)
      if (response.ok) {
        const data = await response.json()
        setInsights(data.insights)
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchScore() {
    try {
      const response = await fetch(`/api/leads/${leadId}/score`)
      if (response.ok) {
        const data = await response.json()
        setScore(data.score)
      }
    } catch (error) {
      console.error('Failed to fetch score:', error)
    }
  }

  function getRiskColor(level: string) {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-green-100 text-green-800 border-green-300'
    }
  }

  function getProbabilityColor(probability: number) {
    if (probability >= 70) return 'text-green-600'
    if (probability >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (loading) {
    return (
      <Layout>
        <div className="p-6">
          <div className="text-center text-gray-600">Loading insights...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center gap-4">
          <button
            onClick={() => router.push(`/leads/${leadId}`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Lead Insights & Analytics</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Win Probability */}
          {insights && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold text-gray-900">Win Probability</h2>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className={`text-4xl font-bold ${getProbabilityColor(insights.winProbability.probability)}`}>
                    {insights.winProbability.probability.toFixed(1)}%
                  </span>
                  <span className="text-sm text-gray-500">
                    Confidence: {insights.winProbability.confidence.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${
                      insights.winProbability.probability >= 70
                        ? 'bg-green-500'
                        : insights.winProbability.probability >= 50
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${insights.winProbability.probability}%` }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">Key Factors:</h3>
                {insights.winProbability.factors.map((factor, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-700">{factor.name}</span>
                      <span className={factor.impact > 0 ? 'text-green-600' : 'text-red-600'}>
                        {factor.impact > 0 ? '+' : ''}
                        {factor.impact.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs">{factor.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Churn Risk */}
          {insights && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
                <h2 className="text-xl font-semibold text-gray-900">Churn Risk</h2>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-4xl font-bold text-orange-600">
                    {insights.churnRisk.riskScore.toFixed(1)}%
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRiskColor(insights.churnRisk.riskLevel)}`}>
                    {insights.churnRisk.riskLevel.toUpperCase()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-3 rounded-full bg-orange-500"
                    style={{ width: `${insights.churnRisk.riskScore}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {insights.churnRisk.daysSinceLastActivity.toFixed(0)} days since last activity
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-medium text-gray-700">Risk Factors:</h3>
                {insights.churnRisk.factors.map((factor, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-gray-700">{factor.name}</span>
                      <span className="text-orange-600">+{factor.impact.toFixed(1)}%</span>
                    </div>
                    <p className="text-gray-500 text-xs">{factor.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best Time to Contact */}
          {insights && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-purple-600" />
                <h2 className="text-xl font-semibold text-gray-900">Best Time to Contact</h2>
              </div>
              <div className="mb-4">
                <div className="text-2xl font-bold text-gray-900 mb-2">
                  {new Date(insights.bestTimeToContact.recommendedTime).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-purple-500"
                      style={{ width: `${insights.bestTimeToContact.confidence}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-500">
                    {insights.bestTimeToContact.confidence.toFixed(0)}% confidence
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{insights.bestTimeToContact.reason}</p>
            </div>
          )}

          {/* Lead Score Breakdown */}
          {score && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-900">Lead Score Breakdown</h2>
              </div>
              <div className="mb-4">
                <div className="text-4xl font-bold text-indigo-600 mb-2">
                  {score.total.toFixed(1)}/100
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500">Demographic</div>
                    <div className="font-semibold">{score.demographic.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Engagement</div>
                    <div className="font-semibold">{score.engagement.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Fit</div>
                    <div className="font-semibold">{score.fit.toFixed(0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Source</div>
                    <div className="font-semibold">{score.source.toFixed(0)}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h3 className="font-medium text-gray-700">Score Factors:</h3>
                {score.factors.slice(0, 10).map((factor, idx) => (
                  <div key={idx} className="text-sm flex justify-between items-center">
                    <div className="flex-1">
                      <span className="text-gray-700">{factor.name}</span>
                      <span className="text-gray-500 text-xs ml-2">({factor.value})</span>
                    </div>
                    <span className="text-indigo-600 font-medium">+{factor.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
