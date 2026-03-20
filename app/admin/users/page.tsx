'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'
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
  role: Role
  created_at: string
}

interface UserRoleRow {
  role_id: string | null
}

interface RoleNameRow {
  name: string
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    checkAuth()
    fetchUsers()
    fetchRoles()
  }, [])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    const { data } = await supabase
      .from('users')
      .select('role_id')
      .eq('id', user.id)
      .single()

    const userData = data as UserRoleRow | null

    if (userData?.role_id) {
      // Fetch role name using role_id
      const { data: roleDataResult } = await supabase
        .from('roles')
        .select('name')
        .eq('id', userData.role_id)
        .single()

      const roleData = roleDataResult as RoleNameRow | null
      const roleName = roleData?.name
      if (roleName !== 'super_admin' && roleName !== 'admin') {
        router.push('/dashboard')
      }
    } else {
      // If no role found, redirect to dashboard
      router.push('/dashboard')
    }
  }

  async function fetchUsers() {
    try {
      const response = await cachedFetch('/api/users')
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRoles() {
    try {
      const response = await cachedFetch('/api/roles')
      if (response.ok) {
        const data = await response.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    try {
      const profileImageUrl: string | null = null

      // Upload profile image if provided
      if (profileImage) {
        setUploadingImage(true)
        const imageFormData = new FormData()
        imageFormData.append('file', profileImage)
        // We'll need to create the user first to get the ID, then upload image
        // For now, we'll upload after user creation
      }

      const userData = {
        ...formData,
        profileImageUrl: null, // Will be updated after image upload
        dob: formData.dob || null,
        doj: formData.doj || null,
        address: formData.address || null,
      }

      const response = await cachedFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      })

      if (response.ok) {
        const { user } = await response.json()
        
        // Upload profile image if provided
        if (profileImage && user.id) {
          try {
            const imageFormData = new FormData()
            imageFormData.append('file', profileImage)
            imageFormData.append('userId', user.id)

            const imageResponse = await cachedFetch('/api/users/upload-profile-image', {
              method: 'POST',
              body: imageFormData,
            })

            if (imageResponse.ok) {
              const imageData = await imageResponse.json()
              // Update user with image URL
              await cachedFetch(`/api/users/${user.id}`, {
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
          }
        }

        setShowCreateModal(false)
        setFormData({ name: '', email: '', password: '', phone: '', roleId: '', address: '', dob: '', doj: '' })
        setProfileImage(null)
        setProfileImagePreview(null)
        fetchUsers()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to create user')
      }
    } catch (error) {
      console.error('Failed to create user:', error)
      alert('Failed to create user')
    } finally {
      setUploadingImage(false)
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

  async function handleDeleteUser(userId: string) {
    if (!confirm('Are you sure you want to delete this user?')) {
      return
    }

    try {
      const response = await cachedFetch(`/api/users/${userId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchUsers()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert('Failed to delete user')
    }
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-1">Create users and assign them to roles</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium"
          >
            + Create New User
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-10 rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profile</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.profile_image_url ? (
                      <img
                        src={user.profile_image_url}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-gray-600 text-sm font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.phone || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                    {user.role?.name?.replace('_', ' ') || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        View/Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Create New User</h2>
              <form onSubmit={handleCreateUser}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role *
                  </label>
                  <select
                    required
                    value={formData.roleId}
                    onChange={(e) => setFormData({ ...formData, roleId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select a role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name.replace('_', ' ')} - {role.description || 'No description'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Profile Image
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  {profileImagePreview && (
                    <div className="mt-2">
                      <img
                        src={profileImagePreview}
                        alt="Preview"
                        className="h-20 w-20 rounded-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Enter address..."
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth (DOB)
                  </label>
                  <input
                    type="date"
                    value={formData.dob}
                    onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Joining (DOJ)
                  </label>
                  <input
                    type="date"
                    value={formData.doj}
                    onChange={(e) => setFormData({ ...formData, doj: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      setFormData({ name: '', email: '', password: '', phone: '', roleId: '', address: '', dob: '', doj: '' })
                      setProfileImage(null)
                      setProfileImagePreview(null)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </div>
      </div>
    </Layout>
  )
}
