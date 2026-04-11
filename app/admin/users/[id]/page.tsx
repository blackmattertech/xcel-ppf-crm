'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
import Image from 'next/image'
import { ArrowLeft, Phone, Mail, Calendar, Star, DollarSign, Users, Award, Clock, Play, Download } from 'lucide-react'
import { cachedFetch } from '@/lib/api-client'

interface Role {
  id: string
  name: string
  description: string | null
}

interface User {
  id: string
  name: string
  email: string
  phone: string | null
  profile_image_url: string | null
  address: string | null
  dob: string | null
  doj: string | null
  languages_known: string[] | null
  role: Role
  created_at: string
}

interface UserStats {
  firstDealDate: string | null
  totalConvertedCustomers: number
  rating: number
  totalSales: number
  assignedLeads: number
  convertedLeads: number
}

interface UserDataWithRole {
  role_id: string | null
  roles: {
    name: string
  } | {
    name: string
  }[] | null
}

interface LeadIdRow {
  id: string
}

interface OrderWithProduct {
  id: string
  lead_id: string
  product: {
    price: number | string
  } | null
}

interface LeadCreatedAtRow {
  created_at: string
}

interface Call {
  id: string
  lead_id: string
  called_by: string
  outcome: string
  disposition: string | null
  notes: string | null
  call_duration: number | null
  created_at: string
  lead: {
    id: string
    name: string
    phone: string
  }
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  
  const [user, setUser] = useState<User | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [calls, setCalls] = useState<Call[]>([])
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    newPassword: '',
    phone: '',
    roleId: '',
    address: '',
    dob: '',
    doj: '',
    languagesKnown: [] as string[],
  })
  const [profileImage, setProfileImage] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checkAuth()
    fetchUser()
    fetchRoles()
    fetchStats()
    fetchCalls()
  }, [userId])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    setCurrentUserId(user.id)

    const { data } = await supabase
      .from('users')
      .select('role_id, roles!users_role_id_fkey(name)')
      .eq('id', user.id)
      .single()

    const userData = data as UserDataWithRole | null

    if (userData) {
      const roleName = Array.isArray(userData.roles) 
        ? userData.roles[0]?.name 
        : userData.roles?.name || null
      setUserRole(roleName)
      
      if (roleName !== 'super_admin' && roleName !== 'admin' && user.id !== userId) {
        router.push('/dashboard')
      }
    }
  }

  async function fetchUser() {
    try {
      const response = await cachedFetch(`/api/users/${userId}`)
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        const languages = data.user.languages_known || []
        setFormData({
          name: data.user.name,
          email: data.user.email || '',
          newPassword: '',
          phone: data.user.phone || '',
          roleId: data.user.role_id,
          address: data.user.address || '',
          dob: data.user.dob || '',
          doj: data.user.doj || '',
          languagesKnown: languages,
        })
        // Hide picker if languages are already selected
        setShowLanguagePicker(languages.length === 0)
        if (data.user.profile_image_url) {
          setProfileImagePreview(data.user.profile_image_url)
        }
      } else {
        alert('User not found')
        router.push('/teams')
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      alert('Failed to load user details')
    } finally {
      setLoading(false)
    }
  }

  async function fetchRoles() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) {
        console.error('Failed to fetch roles:', error)
      } else {
        setRoles(data || [])
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }

  async function fetchStats() {
    try {
      const supabase = createClient()
      
      // Get first deal date (first converted lead)
      const { data } = await supabase
        .from('leads')
        .select('created_at')
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      
      const firstDeal = data as LeadCreatedAtRow | null
      
      // Get total converted customers (leads converted to customers)
      const { data: convertedLeadsData } = await supabase
        .from('leads')
        .select('id')
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
      
      const convertedLeads = convertedLeadsData as LeadIdRow[] | null
      
      // Get total sales (sum of order values from converted leads)
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          id,
          lead_id,
          product:products (
            price
          )
        `)
        .in('lead_id', convertedLeads?.map(l => l.id) || [])
      
      const orders = ordersData as OrderWithProduct[] | null
      
      // Calculate total sales
      const totalSales = orders?.reduce((sum, order) => {
        const price = order.product?.price || 0
        return sum + parseFloat(String(price))
      }, 0) || 0
      
      // Get assigned and converted leads count
      const { count: assignedCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', userId)
      
      const { count: convertedCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
      
      const assigned = assignedCount || 0
      const converted = convertedCount || 0
      
      // Calculate rating
      const conversionRate = assigned > 0 ? (converted / assigned) : 0
      const rating = assigned > 0 && converted > 0
        ? Math.min(5, Math.max(0, conversionRate * 5))
        : 0
      
      setStats({
        firstDealDate: firstDeal?.created_at || null,
        totalConvertedCustomers: convertedLeads?.length || 0,
        rating: Math.round(rating * 10) / 10,
        totalSales: totalSales,
        assignedLeads: assigned,
        convertedLeads: converted,
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  async function fetchCalls() {
    try {
      const response = await cachedFetch(`/api/calls?user_id=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setCalls(data.calls || [])
      }
    } catch (error) {
      console.error('Failed to fetch calls:', error)
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        return
      }
      setProfileImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Language options organized by priority with native names
  const languageMap: Record<string, { native: string; english: string }> = {
    'English': { native: 'English', english: 'English' },
    'Hindi': { native: 'हिन्दी', english: 'Hindi' },
    'Kannada': { native: 'ಕನ್ನಡ', english: 'Kannada' },
    'Tamil': { native: 'தமிழ்', english: 'Tamil' },
    'Urdu': { native: 'اردو', english: 'Urdu' },
    'Bengali': { native: 'বাংলা', english: 'Bengali' },
    'Telugu': { native: 'తెలుగు', english: 'Telugu' },
    'Marathi': { native: 'मराठी', english: 'Marathi' },
    'Gujarati': { native: 'ગુજરાતી', english: 'Gujarati' },
    'Malayalam': { native: 'മലയാളം', english: 'Malayalam' },
    'Punjabi': { native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
    'Odia': { native: 'ଓଡ଼ିଆ', english: 'Odia' },
    'Assamese': { native: 'অসমীয়া', english: 'Assamese' },
    'Maithili': { native: 'मैथिली', english: 'Maithili' },
    'Sanskrit': { native: 'संस्कृतम्', english: 'Sanskrit' },
    'Kashmiri': { native: 'कॉशुर', english: 'Kashmiri' },
    'Konkani': { native: 'कोंकणी', english: 'Konkani' },
    'Arabic': { native: 'العربية', english: 'Arabic' },
    'Chinese': { native: '中文', english: 'Chinese' },
    'Spanish': { native: 'Español', english: 'Spanish' },
    'French': { native: 'Français', english: 'French' },
    'German': { native: 'Deutsch', english: 'German' },
    'Japanese': { native: '日本語', english: 'Japanese' },
    'Korean': { native: '한국어', english: 'Korean' },
    'Portuguese': { native: 'Português', english: 'Portuguese' },
    'Russian': { native: 'Русский', english: 'Russian' },
    'Italian': { native: 'Italiano', english: 'Italian' },
    'Turkish': { native: 'Türkçe', english: 'Turkish' },
    'Persian': { native: 'فارسی', english: 'Persian' },
    'Vietnamese': { native: 'Tiếng Việt', english: 'Vietnamese' },
    'Thai': { native: 'ไทย', english: 'Thai' },
    'Indonesian': { native: 'Bahasa Indonesia', english: 'Indonesian' },
    'Dutch': { native: 'Nederlands', english: 'Dutch' },
    'Polish': { native: 'Polski', english: 'Polish' },
    'Romanian': { native: 'Română', english: 'Romanian' },
    'Greek': { native: 'Ελληνικά', english: 'Greek' },
    'Hebrew': { native: 'עברית', english: 'Hebrew' },
    'Swedish': { native: 'Svenska', english: 'Swedish' },
    'Norwegian': { native: 'Norsk', english: 'Norwegian' },
    'Danish': { native: 'Dansk', english: 'Danish' },
    'Finnish': { native: 'Suomi', english: 'Finnish' },
    'Swahili': { native: 'Kiswahili', english: 'Swahili' },
    'Ukrainian': { native: 'Українська', english: 'Ukrainian' },
  }

  const popularLanguages = ['English', 'Hindi', 'Kannada', 'Tamil', 'Urdu']
  
  const indianLanguages = [
    'Bengali', 'Telugu', 'Marathi', 'Gujarati', 'Malayalam', 'Punjabi',
    'Odia', 'Assamese', 'Maithili', 'Sanskrit', 'Kashmiri', 'Konkani'
  ]
  
  const otherLanguages = [
    'Arabic', 'Chinese', 'Spanish', 'French', 'German', 'Japanese',
    'Korean', 'Portuguese', 'Russian', 'Italian', 'Turkish', 'Persian',
    'Vietnamese', 'Thai', 'Indonesian', 'Dutch', 'Polish', 'Romanian',
    'Greek', 'Hebrew', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
    'Swahili', 'Ukrainian'
  ]

  const [showLanguagePicker, setShowLanguagePicker] = useState(false)

  function toggleLanguage(lang: string) {
    if (formData.languagesKnown.includes(lang)) {
      // Remove language
      setFormData({
        ...formData,
        languagesKnown: formData.languagesKnown.filter(l => l !== lang),
      })
    } else {
      // Add language
      setFormData({
        ...formData,
        languagesKnown: [...formData.languagesKnown, lang],
      })
    }
  }

  function getLanguageDisplay(lang: string): { native: string; english: string } {
    const langInfo = languageMap[lang]
    if (!langInfo) {
      return {
        native: lang,
        english: lang,
      }
    }
    
    return {
      native: langInfo.native,
      english: langInfo.english,
    }
  }

  function formatLanguage(lang: string, showNative: boolean = true) {
    if (!lang) return ''
    const display = getLanguageDisplay(lang)
    
    if (showNative && display.native !== display.english) {
      // Show native name with English in smaller text below
      return (
        <div className="text-center">
          <div className="font-medium">{display.native}</div>
          <div className="text-xs opacity-70 mt-0.5">{display.english}</div>
        </div>
      )
    } else {
      // For languages where native = english, show with bold first letter
      const firstLetter = display.english.charAt(0).toUpperCase()
      const rest = display.english.slice(1)
      return (
        <span>
          <span className="font-bold">{firstLetter}</span>
          {rest}
        </span>
      )
    }
  }

  function getLanguageCardColor(lang: string, index: number): string {
    const colors = [
      'bg-green-50 border-green-200 text-green-700',
      'bg-pink-50 border-pink-200 text-pink-700',
      'bg-blue-50 border-blue-200 text-blue-700',
      'bg-yellow-50 border-yellow-200 text-yellow-700',
      'bg-purple-50 border-purple-200 text-purple-700',
      'bg-gray-50 border-gray-200 text-gray-700',
    ]
    return colors[index % colors.length]
  }

  async function handleSave() {
    setSaving(true)
    try {
      let profileImageUrl = user?.profile_image_url || null

      if (profileImage) {
        setUploadingImage(true)
        const imageFormData = new FormData()
        imageFormData.append('file', profileImage)
        imageFormData.append('userId', userId)

        const imageResponse = await cachedFetch('/api/users/upload-profile-image', {
          method: 'POST',
          body: imageFormData,
        })

        if (imageResponse.ok) {
          const imageData = await imageResponse.json()
          profileImageUrl = imageData.url
        } else {
          const error = await imageResponse.json()
          throw new Error(error.error || 'Failed to upload profile image')
        }
        setUploadingImage(false)
      }

      const updatePayload: any = {
        name: formData.name,
        phone: formData.phone || null,
        profileImageUrl: profileImageUrl,
        address: formData.address || null,
        dob: formData.dob || null,
        doj: formData.doj || null,
        languagesKnown: formData.languagesKnown,
      }
      
      if (canEditRole) {
        updatePayload.roleId = formData.roleId
        const trimmedEmail = formData.email.trim()
        if (trimmedEmail !== user?.email) {
          updatePayload.email = trimmedEmail
        }
        const pw = formData.newPassword.trim()
        if (pw.length > 0) {
          if (pw.length < 6) {
            throw new Error('New password must be at least 6 characters')
          }
          updatePayload.password = pw
        }
      } else {
        updatePayload.roleId = user?.role?.id || formData.roleId
      }

      const response = await cachedFetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })

      if (response.ok) {
        await fetchUser()
        setFormData((prev) => ({ ...prev, newPassword: '' }))
        setProfileImage(null)
        setShowLanguagePicker(false) // Hide picker after saving
        alert('User updated successfully')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      alert(error instanceof Error ? error.message : 'Failed to update user')
    } finally {
      setSaving(false)
      setUploadingImage(false)
    }
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  if (!user) {
    return null
  }

  const isOwnProfile = currentUserId === userId
  const canEdit = userRole === 'super_admin' || userRole === 'admin' || isOwnProfile
  const canEditRole = userRole === 'super_admin' || userRole === 'admin'

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen w-full" style={{ fontFamily: 'Poppins, sans-serif' }}>
        <div className="w-full">
          <button
            onClick={() => router.push('/teams')}
            className="mb-4 text-[#de0510] hover:text-[#c0040e] font-medium flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            Back to Teams
          </button>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-6">
            {isOwnProfile ? 'My Profile' : 'User Profile'}
          </h1>

          {/* Performance Stats Section */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Award size={24} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">First Deal</p>
                    <p className="text-xl font-bold text-gray-900">{formatDate(stats.firstDealDate)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                    <Users size={24} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Converted Customers</p>
                    <p className="text-xl font-bold text-gray-900">{stats.totalConvertedCustomers}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-yellow-50 rounded-lg flex items-center justify-center">
                    <Star size={24} className="text-yellow-600 fill-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Rating</p>
                    <p className="text-xl font-bold text-gray-900">{stats.rating}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
                    <DollarSign size={24} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Sales</p>
                    <p className="text-xl font-bold text-gray-900">₹{stats.totalSales.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                    <Clock size={24} className="text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Tenure</p>
                    <p className="text-xl font-bold text-gray-900">
                      {user.doj ? Math.floor((new Date().getTime() - new Date(user.doj).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0} months
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - User Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Profile Image */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile Image</h2>
              <div className="flex items-center gap-6">
                {profileImagePreview ? (
                    <Image
                    src={profileImagePreview}
                    alt={user.name}
                      width={120}
                      height={120}
                      className="rounded-full object-cover"
                  />
                ) : (
                    <div className="w-30 h-30 rounded-full bg-[#de0510] flex items-center justify-center text-white text-4xl font-bold">
                      {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {canEdit && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload New Image
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">Max size: 5MB. Formats: JPEG, PNG, WebP</p>
                  </div>
                )}
            </div>
          </div>

          {/* User Information */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">User Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                  {canEdit ? (
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    />
                  ) : (
                      <p className="text-sm text-gray-900">{user.name}</p>
                  )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    {canEditRole ? (
                      <>
                        <input
                          type="email"
                          autoComplete="off"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Administrators can change sign-in email (Supabase Auth)
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-900">{user.email}</p>
                        <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                      </>
                    )}
                </div>
                {canEditRole && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={formData.newPassword}
                      onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      placeholder="Leave blank to keep current password"
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum 6 characters when set</p>
                  </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                  {canEdit ? (
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    />
                  ) : (
                      <p className="text-sm text-gray-900">{user.phone || '-'}</p>
                  )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role {canEditRole && '*'}</label>
                    {canEditRole ? (
                    <select
                      required
                      value={formData.roleId}
                      onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                            {role.name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  ) : (
                      <p className="text-sm text-gray-900 capitalize">
                      {user.role?.name?.replace('_', ' ') || '-'}
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                  {canEdit ? (
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      placeholder="Enter address..."
                    />
                  ) : (
                      <p className="text-sm text-gray-900">{user.address || '-'}</p>
                  )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                  {canEdit ? (
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    />
                  ) : (
                      <p className="text-sm text-gray-900">
                      {user.dob ? new Date(user.dob).toLocaleDateString() : '-'}
                    </p>
                  )}
                </div>
                  {(!isOwnProfile || canEditRole) && (
                <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date of Joining</label>
                  {canEdit ? (
                    <input
                      type="date"
                      value={formData.doj}
                      onChange={(e) => setFormData({ ...formData, doj: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    />
                  ) : (
                        <p className="text-sm text-gray-900">
                      {user.doj ? new Date(user.doj).toLocaleDateString() : '-'}
                    </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Languages Known */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Languages Known</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {formData.languagesKnown.length > 0 
                        ? `${formData.languagesKnown.length} language${formData.languagesKnown.length > 1 ? 's' : ''} selected`
                        : 'No languages selected'}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                      className="px-4 py-2 text-sm font-medium text-[#de0510] border border-[#de0510] rounded-lg hover:bg-[#de0510] hover:text-white transition-colors"
                    >
                      {showLanguagePicker ? 'Hide Picker' : formData.languagesKnown.length > 0 ? 'Add More' : 'Select Languages'}
                    </button>
                  )}
                </div>
                
                {canEdit ? (
                  <div>
                    {/* Show Selected Languages */}
                    {formData.languagesKnown.length > 0 && (
                      <div className="mb-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {formData.languagesKnown.map((lang, index) => (
                            <div
                              key={lang}
                              className={`px-4 py-3 rounded-xl border-2 text-sm font-medium relative overflow-hidden ${getLanguageCardColor(lang, index)}`}
                            >
                              {formatLanguage(lang)}
                              <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-tl-full ${
                                index % 6 === 0 ? 'bg-green-600' :
                                index % 6 === 1 ? 'bg-pink-600' :
                                index % 6 === 2 ? 'bg-blue-600' :
                                index % 6 === 3 ? 'bg-yellow-600' :
                                index % 6 === 4 ? 'bg-purple-600' :
                                'bg-gray-600'
                              }`} />
                              <button
                                type="button"
                                onClick={() => toggleLanguage(lang)}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                                title="Remove language"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Language Picker - Show when toggled or when no languages selected */}
                    {(showLanguagePicker || formData.languagesKnown.length === 0) && (
                      <div className="border-t border-gray-200 pt-6">
                        {/* Popular Languages - Top Row */}
                        <div className="mb-6">
                          <h3 className="text-sm font-medium text-gray-700 mb-3">Popular Languages</h3>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {popularLanguages.map((lang, index) => {
                              const isSelected = formData.languagesKnown.includes(lang)
                              return (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() => toggleLanguage(lang)}
                                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                    isSelected
                                      ? `${getLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                  }`}
                                >
                                  {formatLanguage(lang)}
                                  {isSelected && (
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-tl-full ${
                                      index % 6 === 0 ? 'bg-green-600' :
                                      index % 6 === 1 ? 'bg-pink-600' :
                                      index % 6 === 2 ? 'bg-blue-600' :
                                      index % 6 === 3 ? 'bg-yellow-600' :
                                      index % 6 === 4 ? 'bg-purple-600' :
                                      'bg-gray-600'
                                    }`} />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Indian Languages */}
                        <div className="mb-6">
                          <h3 className="text-sm font-medium text-gray-700 mb-3">Indian Languages</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {indianLanguages.map((lang, index) => {
                              const isSelected = formData.languagesKnown.includes(lang)
                              return (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() => toggleLanguage(lang)}
                                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                    isSelected
                                      ? `${getLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                  }`}
                                >
                                  {formatLanguage(lang)}
                                  {isSelected && (
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-tl-full ${
                                      index % 6 === 0 ? 'bg-green-600' :
                                      index % 6 === 1 ? 'bg-pink-600' :
                                      index % 6 === 2 ? 'bg-blue-600' :
                                      index % 6 === 3 ? 'bg-yellow-600' :
                                      index % 6 === 4 ? 'bg-purple-600' :
                                      'bg-gray-600'
                                    }`} />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Other Languages */}
                        <div>
                          <h3 className="text-sm font-medium text-gray-700 mb-3">Other Languages</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {otherLanguages.map((lang, index) => {
                              const isSelected = formData.languagesKnown.includes(lang)
                              return (
                                <button
                                  key={lang}
                                  type="button"
                                  onClick={() => toggleLanguage(lang)}
                                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                    isSelected
                                      ? `${getLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                  }`}
                                >
                                  {formatLanguage(lang)}
                                  {isSelected && (
                                    <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-tl-full ${
                                      index % 6 === 0 ? 'bg-green-600' :
                                      index % 6 === 1 ? 'bg-pink-600' :
                                      index % 6 === 2 ? 'bg-blue-600' :
                                      index % 6 === 3 ? 'bg-yellow-600' :
                                      index % 6 === 4 ? 'bg-purple-600' :
                                      'bg-gray-600'
                                    }`} />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {user.languages_known && user.languages_known.length > 0 ? (
                      user.languages_known.map((lang, index) => (
                        <div
                          key={lang}
                          className={`px-4 py-3 rounded-xl border-2 text-sm font-medium relative overflow-hidden ${getLanguageCardColor(lang, index)}`}
                        >
                          {formatLanguage(lang)}
                          <div className={`absolute bottom-0 right-0 w-6 h-6 rounded-tl-full ${
                            index % 6 === 0 ? 'bg-green-600' :
                            index % 6 === 1 ? 'bg-pink-600' :
                            index % 6 === 2 ? 'bg-blue-600' :
                            index % 6 === 3 ? 'bg-yellow-600' :
                            index % 6 === 4 ? 'bg-purple-600' :
                            'bg-gray-600'
                          }`} />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500 col-span-full">No languages specified</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Call Recordings */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Call Recordings</h2>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {calls.length > 0 ? (
                    calls.map((call) => (
                      <div key={call.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                <div>
                            <p className="font-medium text-gray-900">{call.lead.name}</p>
                            <p className="text-sm text-gray-500">{call.lead.phone}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            call.outcome === 'connected' ? 'bg-green-100 text-green-800' :
                            call.outcome === 'not_reachable' ? 'bg-yellow-100 text-yellow-800' :
                            call.outcome === 'wrong_number' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {call.outcome.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          <p>Duration: {formatDuration(call.call_duration)}</p>
                          <p>Date: {formatDate(call.created_at)}</p>
                        </div>
                        {call.notes && (
                          <p className="text-sm text-gray-600 mt-2">{call.notes}</p>
                        )}
                        <div className="mt-3 flex gap-2">
                          <button className="flex-1 px-3 py-1.5 bg-[#de0510] text-white rounded text-sm hover:bg-[#c0040e] transition-colors flex items-center justify-center gap-1">
                            <Play size={14} />
                            Play
                          </button>
                          <button className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200 transition-colors">
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-8">No call recordings found</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          {canEdit && (
            <div className="flex justify-end mt-6">
              <button
                onClick={handleSave}
                disabled={saving || uploadingImage}
                className="px-6 py-2 bg-[#de0510] text-white rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {saving || uploadingImage ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
