import { Database } from './database'

export type User = Database['public']['Tables']['users']['Row']
export type Role = Database['public']['Tables']['roles']['Row']
export type Permission = Database['public']['Tables']['permissions']['Row']

export interface UserWithRole extends User {
  role: Role & {
    permissions: Permission[]
  }
}

export interface AuthSession {
  user: UserWithRole
  accessToken: string
}
