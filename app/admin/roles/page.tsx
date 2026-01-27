'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Layout from '@/components/Layout'

interface Permission {
  id: string
  name: string
  resource: string
  action: string
  description: string | null
}

interface Role {
  id: string
  name: string
  description: string | null
  is_system_role: boolean
  permissions: Permission[]
}

interface UserRoleRow {
  role_id: string | null
}

interface RoleNameRow {
  name: string
}

export default function RolesPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [syncingPermissions, setSyncingPermissions] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissionIds: [] as string[],
  })

  useEffect(() => {
    checkAuth()
    fetchRoles()
    fetchPermissions()
  }, [])

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Check if user has permission
    const { data } = await supabase
      .from('users')
      .select('role_id')
      .eq('id', user.id)
      .single()

    const userData = data as UserRoleRow | null

    if (userData?.role_id) {
      // Fetch role name using role_id
      const { data } = await supabase
        .from('roles')
        .select('name')
        .eq('id', userData.role_id)
        .single()

      const roleData = data as RoleNameRow | null
      const roleName = roleData?.name
      if (roleName !== 'super_admin' && roleName !== 'admin') {
        router.push('/dashboard')
      }
    } else {
      // If no role found, redirect to dashboard
      router.push('/dashboard')
    }
  }

  async function fetchRoles() {
    try {
      const response = await fetch('/api/roles')
      if (response.ok) {
        const data = await response.json()
        setRoles(data.roles || [])
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPermissions() {
    try {
      const response = await fetch('/api/permissions')
      const data = await response.json()
      
      if (response.ok) {
        setPermissions(data.permissions || [])
        console.log('Permissions loaded:', data.permissions?.length || 0)
      } else {
        console.error('Failed to fetch permissions:', data)
        alert('Failed to load permissions: ' + (data.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error)
      alert('Failed to load permissions. Please refresh the page.')
    }
  }

  async function handleSyncPermissions() {
    if (!confirm('This will sync permissions from the sidebar configuration. Continue?')) {
      return
    }

    setSyncingPermissions(true)
    try {
      const response = await fetch('/api/permissions/sync', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        alert(
          `Permissions synced successfully!\n` +
          `Created: ${data.summary.created}\n` +
          `Existing: ${data.summary.existing}\n` +
          `Errors: ${data.summary.errors}`
        )
        // Refresh permissions list
        await fetchPermissions()
      } else {
        alert(data.error || 'Failed to sync permissions')
      }
    } catch (error) {
      console.error('Failed to sync permissions:', error)
      alert('Failed to sync permissions: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setSyncingPermissions(false)
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault()
    
    // Validate that at least one permission is selected
    if (formData.permissionIds.length === 0) {
      alert('Please select at least one permission')
      return
    }
    
    try {
      console.log('Creating role with data:', formData)
      const response = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      
      if (response.ok) {
        setShowCreateModal(false)
        setFormData({ name: '', description: '', permissionIds: [] })
        fetchRoles()
        alert('Role created successfully!')
      } else {
        console.error('Error creating role:', data)
        alert(data.error || data.details || 'Failed to create role')
      }
    } catch (error) {
      console.error('Failed to create role:', error)
      alert('Failed to create role: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  async function handleUpdateRole(e: React.FormEvent) {
    e.preventDefault()
    
    if (!editingRole) return
    
    // Validate that at least one permission is selected
    if (formData.permissionIds.length === 0) {
      alert('Please select at least one permission')
      return
    }
    
    try {
      const response = await fetch(`/api/roles/${editingRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          permissionIds: formData.permissionIds,
        }),
      })

      const data = await response.json()
      
      if (response.ok) {
        setEditingRole(null)
        setShowCreateModal(false)
        setFormData({ name: '', description: '', permissionIds: [] })
        fetchRoles()
        alert('Role updated successfully!')
      } else {
        console.error('Error updating role:', data)
        alert(data.error || data.details || 'Failed to update role')
      }
    } catch (error) {
      console.error('Failed to update role:', error)
      alert('Failed to update role: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  function openEditModal(role: Role) {
    setEditingRole(role)
    setFormData({
      name: role.name,
      description: role.description || '',
      permissionIds: role.permissions?.map(p => p.id) || [],
    })
    setShowCreateModal(true)
  }

  async function handleDeleteRole(roleId: string, isSystemRole: boolean) {
    if (isSystemRole) {
      alert('Cannot delete system roles')
      return
    }

    if (!confirm('Are you sure you want to delete this role?')) {
      return
    }

    try {
      const response = await fetch(`/api/roles/${roleId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchRoles()
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to delete role')
      }
    } catch (error) {
      console.error('Failed to delete role:', error)
      alert('Failed to delete role')
    }
  }

  function togglePermission(permissionId: string) {
    setFormData((prev) => {
      const newPermissionIds = prev.permissionIds.includes(permissionId)
        ? prev.permissionIds.filter((id) => id !== permissionId)
        : [...prev.permissionIds, permissionId]
      console.log('Permission toggled. Selected permissions:', newPermissionIds)
      return {
        ...prev,
        permissionIds: newPermissionIds,
      }
    })
  }

  // Group permissions by resource
  const permissionsByResource = permissions.reduce((acc, perm) => {
    if (!acc[perm.resource]) {
      acc[perm.resource] = []
    }
    acc[perm.resource].push(perm)
    return acc
  }, {} as Record<string, Permission[]>)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Role Management</h1>
            <p className="text-gray-600 mt-1">Create and manage custom roles with specific permissions</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSyncPermissions}
              disabled={syncingPermissions}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Sync permissions from sidebar configuration"
            >
              {syncingPermissions ? 'Syncing...' : '🔄 Sync Permissions'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium"
            >
              + Create New Role
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permissions</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {role.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {role.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      role.is_system_role 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {role.is_system_role ? 'System' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {role.permissions?.length || 0} permissions
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-3">
                      <button
                        onClick={() => openEditModal(role)}
                        className="text-indigo-600 hover:text-indigo-900 font-medium"
                      >
                        Edit
                      </button>
                      {!role.is_system_role && (
                        <button
                          onClick={() => handleDeleteRole(role.id, role.is_system_role)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h2>
              <form onSubmit={editingRole ? handleUpdateRole : handleCreateRole}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="e.g., sales_manager"
                    disabled={editingRole?.is_system_role || false}
                  />
                  {editingRole?.is_system_role && (
                    <p className="text-xs text-gray-500 mt-1">System role name cannot be changed</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows={3}
                    placeholder="Role description..."
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Permissions {formData.permissionIds.length > 0 && (
                      <span className="text-indigo-600 font-normal">
                        ({formData.permissionIds.length} selected)
                      </span>
                    )}
                  </label>
                  {permissions.length === 0 ? (
                    <div className="border border-gray-300 rounded-md p-4 text-center text-gray-500">
                      Loading permissions...
                    </div>
                  ) : (
                    <div className="border border-gray-300 rounded-md p-4 max-h-64 overflow-y-auto">
                      {Object.entries(permissionsByResource).map(([resource, perms]) => (
                        <div key={resource} className="mb-4">
                          <h4 className="font-semibold text-gray-700 mb-2 capitalize">{resource}</h4>
                          <div className="space-y-2">
                            {perms.map((perm) => (
                              <label key={perm.id} className="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded">
                                <input
                                  type="checkbox"
                                  checked={formData.permissionIds.includes(perm.id)}
                                  onChange={() => togglePermission(perm.id)}
                                  className="mr-2 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-600">
                                  {perm.action} {perm.description && `- ${perm.description}`}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      setEditingRole(null)
                      setFormData({ name: '', description: '', permissionIds: [] })
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    {editingRole ? 'Update Role' : 'Create Role'}
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
