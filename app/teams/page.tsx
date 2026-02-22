'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthContext } from '@/components/AuthProvider'
import Layout from '@/components/Layout'
import Image from 'next/image'
import { Plus, Table2, LayoutGrid, Phone, Mail, Calendar, Star, Users, UserCheck, Wifi, Award, X, ArrowLeft, DollarSign, Clock, Play, Download } from 'lucide-react'

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
  role: Role
  role_id?: string
  created_at: string
}

interface UserWithStats extends User {
  assignedLeads: number
  convertedLeads: number
  rating: number
  status: 'active' | 'on_leave'
  languages_known?: string[] | null
}

interface UserStats {
  firstDealDate: string | null
  totalConvertedCustomers: number
  rating: number
  totalSales: number
  assignedLeads: number
  convertedLeads: number
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

export default function TeamsPage() {
  const router = useRouter()
  const { isAuthenticated, role } = useAuthContext()
  const [users, setUsers] = useState<UserWithStats[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    roleId: '',
    address: '',
    dob: '',
    doj: '',
  })
  const [profileImage, setProfileImage] = useState<File | null>(null)
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Detail modal state
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null)
  const [userDetailStats, setUserDetailStats] = useState<UserStats | null>(null)
  const [userCalls, setUserCalls] = useState<Call[]>([])
  const [detailFormData, setDetailFormData] = useState({
    name: '',
    phone: '',
    roleId: '',
    address: '',
    dob: '',
    doj: '',
    languagesKnown: [] as string[],
  })
  const [detailProfileImage, setDetailProfileImage] = useState<File | null>(null)
  const [detailProfileImagePreview, setDetailProfileImagePreview] = useState<string | null>(null)
  const [showLanguagePicker, setShowLanguagePicker] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingDetail, setSavingDetail] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    checkAuth()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchUsers()
    fetchRoles()
  }, [isAuthenticated])

  async function checkAuth() {
    // Preserve the original restriction: only admins can access teams page.
    const roleName = role?.name ?? null
    if (roleName && roleName !== 'super_admin' && roleName !== 'admin') {
      router.push('/dashboard')
    }
  }

  async function fetchUsers() {
    try {
      const response = await fetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        const usersList: User[] = data.users || []

        // Fetch aggregated performance stats once and join with user list.
        const perfResponse = await fetch('/api/users/performance')
        let performanceByUser: Record<string, ReturnType<typeof mapPerfEntry>> = {}

        if (perfResponse.ok) {
          const perfData = await perfResponse.json()
          const entries: any[] = perfData.performance || []
          performanceByUser = entries.reduce((acc, entry) => {
            const mapped = mapPerfEntry(entry)
            acc[mapped.userId] = mapped
            return acc
          }, {} as Record<string, ReturnType<typeof mapPerfEntry>>)
        }

        const usersWithStats: UserWithStats[] = usersList.map((user) => {
          const perf = performanceByUser[user.id]
          if (perf) {
            return {
              ...user,
              assignedLeads: perf.assignedLeads,
              convertedLeads: perf.convertedLeads,
              rating: perf.rating,
              status: perf.status,
            }
          }
          return {
            ...user,
            assignedLeads: 0,
            convertedLeads: 0,
            rating: 0,
            status: 'active',
          }
        })

        setUsers(usersWithStats)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  function mapPerfEntry(entry: any) {
    return {
      userId: String(entry.userId),
      assignedLeads: Number(entry.assignedLeads ?? 0),
      convertedLeads: Number(entry.convertedLeads ?? 0),
      rating: Number(entry.rating ?? 0),
      status: (entry.status as 'active' | 'on_leave') || 'active',
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

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB')
        return
      }
      setProfileImage(file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  async function handleCreateUser() {
    setSaving(true)
    try {
      // Create user first (without image)
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || null,
          roleId: formData.roleId,
          profileImageUrl: null, // Will be updated after image upload
          address: formData.address || null,
          dob: formData.dob || null,
          doj: formData.doj || null,
        }),
      })

      if (response.ok) {
        const { user } = await response.json()
        
        // Upload profile image if provided (after user creation)
        if (profileImage && user.id) {
          setUploadingImage(true)
          try {
            const imageFormData = new FormData()
            imageFormData.append('file', profileImage)
            imageFormData.append('userId', user.id)

            const imageResponse = await fetch('/api/users/upload-profile-image', {
              method: 'POST',
              body: imageFormData,
            })

            if (imageResponse.ok) {
              const imageData = await imageResponse.json()
              // Update user with image URL
              await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: formData.name,
                  phone: formData.phone || null,
                  roleId: formData.roleId,
                  profileImageUrl: imageData.url,
                }),
              })
            }
          } catch (imageError) {
            console.error('Failed to upload profile image:', imageError)
            // Don't fail user creation if image upload fails
          } finally {
            setUploadingImage(false)
          }
        }

        await fetchUsers()
        setShowCreateModal(false)
        setFormData({
          name: '',
          email: '',
          password: '',
          phone: '',
          roleId: '',
          address: '',
          dob: '',
          doj: '',
        })
        setProfileImage(null)
        setProfileImagePreview(null)
        alert('User created successfully')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create user')
      }
    } catch (error) {
      console.error('Failed to create user:', error)
      alert(error instanceof Error ? error.message : 'Failed to create user')
    } finally {
      setSaving(false)
      setUploadingImage(false)
    }
  }

  function getRoleColor(roleName: string): string {
    const role = roleName.toLowerCase()
    if (role.includes('admin')) return 'bg-red-100 text-red-800 border-red-200'
    if (role.includes('manager')) return 'bg-orange-100 text-orange-800 border-orange-200'
    if (role.includes('lead')) return 'bg-blue-100 text-blue-800 border-blue-200'
    if (role.includes('telecaller')) return 'bg-purple-100 text-purple-800 border-purple-200'
    if (role.includes('sales') || role.includes('executive')) return 'bg-green-100 text-green-800 border-green-200'
    return 'bg-gray-100 text-gray-800 border-gray-200'
  }

  function getStatusColor(status: string): string {
    if (status === 'active') return 'bg-green-100 text-green-800 border-green-200'
    if (status === 'on_leave') return 'bg-orange-100 text-orange-800 border-orange-200'
    return 'bg-gray-100 text-gray-800 border-gray-200'
  }

  function formatDate(dateString: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (!confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      return
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        await fetchUsers()
        if (selectedUser?.id === userId) {
          setSelectedUser(null)
        }
        alert('User deleted successfully')
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert('Failed to delete user')
    }
  }

  async function openUserDetail(user: UserWithStats) {
    // Set user immediately with existing data
    setSelectedUser(user)
    
    // Set form data immediately from existing user data
    const languages = user.languages_known || []
    setDetailFormData({
      name: user.name,
      phone: user.phone || '',
      roleId: user.role_id || '',
      address: user.address || '',
      dob: user.dob || '',
      doj: user.doj || '',
      languagesKnown: languages,
    })
    setShowLanguagePicker(languages.length === 0)
    if (user.profile_image_url) {
      setDetailProfileImagePreview(user.profile_image_url)
    }
    
    // Fetch additional data in background (non-blocking)
    setLoadingDetail(true)
    
    // Fetch full user details, stats, and calls in parallel
    Promise.all([
      fetch(`/api/users/${user.id}`).then(res => res.ok ? res.json() : null),
      fetchUserDetailStats(user.id),
      fetchUserCalls(user.id)
    ]).then(([userData]) => {
      // Update with full user data if available
      if (userData?.user) {
        const fullUser = userData.user
        setSelectedUser({ ...user, ...fullUser })
        
        const updatedLanguages = fullUser.languages_known || []
        setDetailFormData({
          name: fullUser.name,
          phone: fullUser.phone || '',
          roleId: fullUser.role_id,
          address: fullUser.address || '',
          dob: fullUser.dob || '',
          doj: fullUser.doj || '',
          languagesKnown: updatedLanguages,
        })
        if (fullUser.profile_image_url) {
          setDetailProfileImagePreview(fullUser.profile_image_url)
        }
      }
    }).catch((error) => {
      console.error('Failed to fetch user details:', error)
    }).finally(() => {
      setLoadingDetail(false)
    })
  }

  async function fetchUserDetailStats(userId: string) {
    try {
      const supabase = createClient()
      
      // Get first deal date (earliest converted lead)
      const { data: firstDealData } = await supabase
        .from('leads')
        .select('created_at')
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
        .order('created_at', { ascending: true })
        .limit(1)
      
      const firstDeal = firstDealData && firstDealData.length > 0 ? firstDealData[0] : null
      
      // Get total converted customers
      const { count: convertedCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
      
      // Get assigned and converted leads
      const { count: assignedCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_to', userId)
      
      const assigned = assignedCount || 0
      const converted = convertedCount || 0
      const conversionRate = assigned > 0 ? (converted / assigned) : 0
      const rating = assigned > 0 && converted > 0
        ? Math.min(5, Math.max(0, conversionRate * 5))
        : 0
      
      // Get total sales (from orders linked to converted leads)
      // First get converted lead IDs for this user
      const { data: convertedLeadsData } = await supabase
        .from('leads')
        .select('id')
        .eq('assigned_to', userId)
        .in('status', ['converted', 'deal_won', 'fully_paid'])
      
      const convertedLeadIds = (convertedLeadsData as { id: string }[] | null)?.map(l => l.id) || []
      
      // Get orders for these leads with product prices (only if there are converted leads)
      let totalSales = 0
      if (convertedLeadIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select(`
            id,
            lead_id,
            lead:leads (
              payment_amount
            ),
            product:products (
              price
            )
          `)
          .in('lead_id', convertedLeadIds)
        
        totalSales = (orders as any[])?.reduce((sum: number, order: any) => {
          // Prefer payment_amount from lead, fallback to product price
          const amount = order.lead?.payment_amount || order.product?.price || 0
          return sum + (parseFloat(String(amount)) || 0)
        }, 0) || 0
      }
      
      setUserDetailStats({
        firstDealDate: (firstDeal as any)?.created_at || null,
        totalConvertedCustomers: converted,
        rating: Math.round(rating * 10) / 10,
        totalSales,
        assignedLeads: assigned,
        convertedLeads: converted,
      })
    } catch (error) {
      console.error('Failed to fetch user stats:', error)
    }
  }

  async function fetchUserCalls(userId: string) {
    try {
      const response = await fetch(`/api/calls?user_id=${userId}`)
      if (response.ok) {
        const data = await response.json()
        setUserCalls(data.calls || [])
      }
    } catch (error) {
      console.error('Failed to fetch calls:', error)
    }
  }

  function handleDetailImageChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      setDetailProfileImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setDetailProfileImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  async function handleDetailSave() {
    if (!selectedUser) return
    
    setSavingDetail(true)
    try {
      let profileImageUrl = selectedUser.profile_image_url || null

      if (detailProfileImage) {
        setUploadingImage(true)
        const imageFormData = new FormData()
        imageFormData.append('file', detailProfileImage)
        imageFormData.append('userId', selectedUser.id)

        const imageResponse = await fetch('/api/users/upload-profile-image', {
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
        name: detailFormData.name,
        phone: detailFormData.phone || null,
        profileImageUrl: profileImageUrl,
        address: detailFormData.address || null,
        dob: detailFormData.dob || null,
        doj: detailFormData.doj || null,
        languagesKnown: detailFormData.languagesKnown,
        roleId: detailFormData.roleId,
      }

      const response = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })

      if (response.ok) {
        await fetchUsers()
        await openUserDetail({ ...selectedUser, ...updatePayload })
        setDetailProfileImage(null)
        setShowLanguagePicker(false)
        alert('User updated successfully')
      } else {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update user')
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      alert(error instanceof Error ? error.message : 'Failed to update user')
    } finally {
      setSavingDetail(false)
      setUploadingImage(false)
    }
  }

  function toggleDetailLanguage(lang: string) {
    if (detailFormData.languagesKnown.includes(lang)) {
      setDetailFormData({
        ...detailFormData,
        languagesKnown: detailFormData.languagesKnown.filter(l => l !== lang),
      })
    } else {
      setDetailFormData({
        ...detailFormData,
        languagesKnown: [...detailFormData.languagesKnown, lang],
      })
    }
  }

  function getDetailLanguageCardColor(lang: string, index: number): string {
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

  function formatDetailLanguage(lang: string, showNative: boolean = true) {
    if (!lang) return ''
    // Simple format for now - can enhance with native names later
    const firstLetter = lang.charAt(0).toUpperCase()
    const rest = lang.slice(1)
    return (
      <span>
        <span className="font-bold">{firstLetter}</span>
        {rest}
      </span>
    )
  }

  function formatDetailDate(dateString: string | null): string {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function formatDetailDuration(seconds: number | null): string {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Language options for detail modal
  const detailLanguageMap: Record<string, { native: string; english: string }> = {
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

  const detailPopularLanguages = ['English', 'Hindi', 'Kannada', 'Tamil', 'Urdu']
  const detailIndianLanguages = [
    'Bengali', 'Telugu', 'Marathi', 'Gujarati', 'Malayalam', 'Punjabi',
    'Odia', 'Assamese', 'Maithili', 'Sanskrit', 'Kashmiri', 'Konkani'
  ]
  const detailOtherLanguages = [
    'Arabic', 'Chinese', 'Spanish', 'French', 'German', 'Japanese',
    'Korean', 'Portuguese', 'Russian', 'Italian', 'Turkish', 'Persian',
    'Vietnamese', 'Thai', 'Indonesian', 'Dutch', 'Polish', 'Romanian',
    'Greek', 'Hebrew', 'Swedish', 'Norwegian', 'Danish', 'Finnish',
    'Swahili', 'Ukrainian'
  ]

  function getDetailLanguageDisplay(lang: string) {
    const langInfo = detailLanguageMap[lang]
    if (!langInfo) return { native: lang, english: lang }
    return { native: langInfo.native, english: langInfo.english }
  }

  function formatDetailLanguageWithNative(lang: string) {
    const display = getDetailLanguageDisplay(lang)
    if (display.native !== display.english) {
      return (
        <div className="text-center">
          <div className="font-medium">{display.native}</div>
          <div className="text-xs opacity-70 mt-0.5">{display.english}</div>
        </div>
      )
    } else {
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

  // Calculate summary stats
  const totalTeam = users.length
  const activeUsers = users.filter(u => u.status === 'active').length
  const onlineNow = activeUsers // Can be enhanced with actual online status
  const topPerformer = users.length > 0 
    ? Math.max(...users.map(u => u.rating)).toFixed(1)
    : '0.0'

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-lg">Loading...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen w-full" style={{ fontFamily: 'Poppins, sans-serif' }}>
        <div className="w-full">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Team Management</h1>
              <p className="text-gray-600 text-base">Manage your team members and their roles.</p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-[#de0510] text-white px-6 py-2.5 rounded-lg hover:bg-[#c0040e] transition-colors font-medium flex items-center gap-2"
            >
              <Plus size={20} />
              Create New User
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Team</p>
                  <p className="text-2xl font-bold text-gray-900">{totalTeam}</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users size={24} className="text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <UserCheck size={24} className="text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Online Now</p>
                  <p className="text-2xl font-bold text-gray-900">{onlineNow}</p>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                  <Wifi size={24} className="text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Top Performer</p>
                  <p className="text-2xl font-bold text-gray-900">{topPerformer}</p>
                </div>
                <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                  <Award size={24} className="text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* View Toggle */}
          <div className="mb-6 flex items-center gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                viewMode === 'table'
                  ? 'bg-[#de0510] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Table2 size={18} />
              Table View
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                viewMode === 'card'
                  ? 'bg-[#de0510] text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              <LayoutGrid size={18} />
              Card View
            </button>
          </div>

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">User</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Mobile</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Performance</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr 
                        key={user.id} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => openUserDetail(user)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {user.profile_image_url ? (
                              <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                                <Image
                                  src={user.profile_image_url}
                                  alt={user.name}
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[#de0510] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleColor(user.role.name)}`}>
                            {user.role.name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}>
                            {user.status === 'active' ? 'Active' : 'On Leave'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <Phone size={14} className="text-gray-400" />
                            <span>{user.phone || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <Mail size={14} className="text-gray-400" />
                            <span>{user.email}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              <Star size={16} className="text-yellow-400 fill-yellow-400" />
                              <span className="text-sm font-medium text-gray-900 ml-1">{user.rating}</span>
                            </div>
                            <span className="text-sm text-gray-500">
                              {user.convertedLeads}/{user.assignedLeads} converted
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(user.doj || user.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Card View */}
          {viewMode === 'card' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {users.map((user) => (
                <div 
                  key={user.id} 
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Card Header */}
                  <div className="bg-[#de0510] h-20 relative">
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
                      {user.profile_image_url ? (
                        <div className="w-20 h-20 rounded-full border-4 border-white overflow-hidden flex-shrink-0">
                          <Image
                            src={user.profile_image_url}
                            alt={user.name}
                            width={80}
                            height={80}
                            className="w-20 h-20 rounded-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-[#de0510] font-bold text-2xl border-4 border-white flex-shrink-0">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="pt-12 pb-4 px-4">
                    <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{user.name}</h3>
                    
                    <div className="flex justify-center mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleColor(user.role.name)}`}>
                        {user.role.name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>

                    {/* Rating */}
                    <div className="flex items-center justify-center gap-1 mb-4">
                      <Star size={18} className="text-yellow-400 fill-yellow-400" />
                      <span className="text-base font-semibold text-gray-900">{user.rating}</span>
                    </div>

                    {/* Performance Metrics */}
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">Assigned</p>
                        <p className="text-lg font-semibold text-gray-900">{user.assignedLeads}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500 mb-1">Converted</p>
                        <p className="text-lg font-semibold text-green-600">{user.convertedLeads}</p>
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail size={14} className="text-gray-400" />
                        <span className="truncate">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone size={14} className="text-gray-400" />
                        <span>{user.phone || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{formatDate(user.doj || user.created_at)}</span>
                      </div>
                    </div>

                    {/* Status Button */}
                    <div className={`w-full py-2 rounded-lg text-sm font-medium text-center ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {user.status === 'active' ? 'Active' : 'On Leave'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create User Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'Poppins, sans-serif' }}>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Create New User</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Profile Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    {profileImagePreview && (
                      <div className="mt-2">
                        <Image
                          src={profileImagePreview}
                          alt="Preview"
                          width={100}
                          height={100}
                          className="rounded-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Password *</label>
                      <input
                        type="password"
                        required
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
                    <select
                      required
                      value={formData.roleId}
                      onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    >
                      <option value="">Select role...</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                      <input
                        type="date"
                        value={formData.dob}
                        onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date of Joining</label>
                      <input
                        type="date"
                        value={formData.doj}
                        onChange={(e) => setFormData({ ...formData, doj: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateUser}
                    disabled={saving || uploadingImage}
                    className="px-6 py-2 bg-[#de0510] text-white rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {saving || uploadingImage ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* User Detail Modal */}
          {selectedUser && (
            <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto p-4">
              <div className="bg-white rounded-xl w-full max-w-6xl my-8 max-h-[90vh] overflow-y-auto" style={{ fontFamily: 'Poppins, sans-serif' }}>
                <>
                  {loadingDetail && (
                    <div className="absolute top-4 right-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-700 flex items-center gap-2 z-20">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      Loading additional details...
                    </div>
                  )}
                    {/* Header */}
                    <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => {
                            setSelectedUser(null)
                            setDetailProfileImage(null)
                            setDetailProfileImagePreview(null)
                            setShowLanguagePicker(false)
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-2xl font-bold text-gray-900">User Profile</h2>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedUser(null)
                          setDetailProfileImage(null)
                          setDetailProfileImagePreview(null)
                          setShowLanguagePicker(false)
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={24} />
                      </button>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Performance Stats */}
                      {userDetailStats && (
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                                <Award size={20} className="text-blue-600" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">First Deal</p>
                                <p className="text-lg font-bold text-gray-900">{formatDetailDate(userDetailStats.firstDealDate)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                                <Users size={20} className="text-green-600" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Converted</p>
                                <p className="text-lg font-bold text-gray-900">{userDetailStats.totalConvertedCustomers}</p>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                                <Star size={20} className="text-yellow-600 fill-yellow-600" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Rating</p>
                                <p className="text-lg font-bold text-gray-900">{userDetailStats.rating}</p>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                                <DollarSign size={20} className="text-purple-600" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Total Sales</p>
                                <p className="text-lg font-bold text-gray-900">₹{userDetailStats.totalSales.toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                                <Clock size={20} className="text-orange-600" />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 mb-1">Tenure</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {selectedUser.doj ? Math.floor((new Date().getTime() - new Date(selectedUser.doj).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0} months
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
                              {detailProfileImagePreview ? (
                                <div className="w-[120px] h-[120px] rounded-full overflow-hidden flex-shrink-0">
                                  <Image
                                    src={detailProfileImagePreview}
                                    alt={selectedUser.name}
                                    width={120}
                                    height={120}
                                    className="w-[120px] h-[120px] rounded-full object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="w-[120px] h-[120px] rounded-full bg-[#de0510] flex items-center justify-center text-white text-4xl font-bold flex-shrink-0">
                                  {selectedUser.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Upload New Image</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleDetailImageChange}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500">Max size: 5MB. Formats: JPEG, PNG, WebP</p>
                              </div>
                            </div>
                          </div>

                          {/* User Information */}
                          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">User Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                                <input
                                  type="text"
                                  required
                                  value={detailFormData.name}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, name: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <p className="text-sm text-gray-900">{selectedUser.email}</p>
                                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                                <input
                                  type="tel"
                                  value={detailFormData.phone}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, phone: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Role *</label>
                                <select
                                  required
                                  value={detailFormData.roleId}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, roleId: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                >
                                  {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                      {role.name.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Address</label>
                                <textarea
                                  value={detailFormData.address}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, address: e.target.value })}
                                  rows={3}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                  placeholder="Enter address..."
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                                <input
                                  type="date"
                                  value={detailFormData.dob}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, dob: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Date of Joining</label>
                                <input
                                  type="date"
                                  value={detailFormData.doj}
                                  onChange={(e) => setDetailFormData({ ...detailFormData, doj: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#de0510] focus:border-[#de0510]"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Languages Known */}
                          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <div className="flex justify-between items-center mb-4">
                              <div>
                                <h2 className="text-xl font-semibold text-gray-900">Languages Known</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                  {detailFormData.languagesKnown.length > 0 
                                    ? `${detailFormData.languagesKnown.length} language${detailFormData.languagesKnown.length > 1 ? 's' : ''} selected`
                                    : 'No languages selected'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                                className="px-4 py-2 text-sm font-medium text-[#de0510] border border-[#de0510] rounded-lg hover:bg-[#de0510] hover:text-white transition-colors"
                              >
                                {showLanguagePicker ? 'Hide Picker' : detailFormData.languagesKnown.length > 0 ? 'Add More' : 'Select Languages'}
                              </button>
                            </div>
                            
                            {detailFormData.languagesKnown.length > 0 && (
                              <div className="mb-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                  {detailFormData.languagesKnown.map((lang, index) => (
                                    <div
                                      key={lang}
                                      className={`px-4 py-3 rounded-xl border-2 text-sm font-medium relative overflow-hidden ${getDetailLanguageCardColor(lang, index)}`}
                                    >
                                      {formatDetailLanguageWithNative(lang)}
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
                                        onClick={() => toggleDetailLanguage(lang)}
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

                            {(showLanguagePicker || detailFormData.languagesKnown.length === 0) && (
                              <div className="border-t border-gray-200 pt-6">
                                <div className="mb-6">
                                  <h3 className="text-sm font-medium text-gray-700 mb-3">Popular Languages</h3>
                                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                    {detailPopularLanguages.map((lang, index) => {
                                      const isSelected = detailFormData.languagesKnown.includes(lang)
                                      return (
                                        <button
                                          key={lang}
                                          type="button"
                                          onClick={() => toggleDetailLanguage(lang)}
                                          className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                            isSelected
                                              ? `${getDetailLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                              : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                          }`}
                                        >
                                          {formatDetailLanguageWithNative(lang)}
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
                                <div className="mb-6">
                                  <h3 className="text-sm font-medium text-gray-700 mb-3">Indian Languages</h3>
                                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {detailIndianLanguages.map((lang, index) => {
                                      const isSelected = detailFormData.languagesKnown.includes(lang)
                                      return (
                                        <button
                                          key={lang}
                                          type="button"
                                          onClick={() => toggleDetailLanguage(lang)}
                                          className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                            isSelected
                                              ? `${getDetailLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                              : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                          }`}
                                        >
                                          {formatDetailLanguageWithNative(lang)}
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
                                <div>
                                  <h3 className="text-sm font-medium text-gray-700 mb-3">Other Languages</h3>
                                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {detailOtherLanguages.map((lang, index) => {
                                      const isSelected = detailFormData.languagesKnown.includes(lang)
                                      return (
                                        <button
                                          key={lang}
                                          type="button"
                                          onClick={() => toggleDetailLanguage(lang)}
                                          className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all relative overflow-hidden ${
                                            isSelected
                                              ? `${getDetailLanguageCardColor(lang, index)} border-current shadow-md scale-105`
                                              : 'bg-white text-gray-700 border-gray-300 hover:border-[#de0510] hover:text-[#de0510]'
                                          }`}
                                        >
                                          {formatDetailLanguageWithNative(lang)}
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
                        </div>

                        {/* Right Column - Call Recordings */}
                        <div className="space-y-6">
                          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                            <h2 className="text-xl font-semibold text-gray-900 mb-4">Call Recordings</h2>
                            {userCalls.length > 0 ? (
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                {userCalls.map((call) => (
                                  <div key={call.id} className="border border-gray-200 rounded-lg p-3">
                                    <div className="flex items-start justify-between mb-2">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{call.lead.name}</p>
                                        <p className="text-xs text-gray-500">{call.lead.phone}</p>
                                      </div>
                                      <span className={`px-2 py-1 text-xs rounded-full ${
                                        call.outcome === 'connected' ? 'bg-green-100 text-green-800' :
                                        call.outcome === 'not_reachable' ? 'bg-yellow-100 text-yellow-800' :
                                        call.outcome === 'wrong_number' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {call.outcome.replace('_', ' ')}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                                      <span>{formatDetailDate(call.created_at)}</span>
                                      {call.call_duration && (
                                        <span>{formatDetailDuration(call.call_duration)}</span>
                                      )}
                                    </div>
                                    {call.notes && (
                                      <p className="text-xs text-gray-600 mt-2">{call.notes}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 text-center py-8">No call recordings available</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Save Button */}
                      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-between items-center">
                        <button
                          onClick={() => {
                            if (selectedUser && confirm(`Are you sure you want to delete ${selectedUser.name}? This action cannot be undone.`)) {
                              handleDeleteUser(selectedUser.id, selectedUser.name)
                              setSelectedUser(null)
                              setDetailProfileImage(null)
                              setDetailProfileImagePreview(null)
                              setShowLanguagePicker(false)
                            }
                          }}
                          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                        >
                          Delete User
                        </button>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              setSelectedUser(null)
                              setDetailProfileImage(null)
                              setDetailProfileImagePreview(null)
                              setShowLanguagePicker(false)
                            }}
                            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleDetailSave}
                            disabled={savingDetail || uploadingImage}
                            className="px-6 py-2 bg-[#de0510] text-white rounded-lg hover:bg-[#c0040e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                          >
                            {savingDetail || uploadingImage ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    </div>
                </>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
