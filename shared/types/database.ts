export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          phone: string | null
          name: string
          role_id: string
          branch_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          phone?: string | null
          name: string
          role_id: string
          branch_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          phone?: string | null
          name?: string
          role_id?: string
          branch_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      roles: {
        Row: {
          id: string
          name: string
          description: string | null
          is_system_role: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          is_system_role?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          is_system_role?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      permissions: {
        Row: {
          id: string
          name: string
          resource: string
          action: string
          description: string | null
        }
        Insert: {
          id?: string
          name: string
          resource: string
          action: string
          description?: string | null
        }
        Update: {
          id?: string
          name?: string
          resource?: string
          action?: string
          description?: string | null
        }
      }
      role_permissions: {
        Row: {
          role_id: string
          permission_id: string
        }
        Insert: {
          role_id: string
          permission_id: string
        }
        Update: {
          role_id?: string
          permission_id?: string
        }
      }
      leads: {
        Row: {
          id: string
          lead_id: string
          name: string
          phone: string
          email: string | null
          source: 'meta' | 'manual' | 'form' | 'whatsapp' | 'ivr'
          campaign_id: string | null
          ad_id: string | null
          adset_id: string | null
          form_id: string | null
          form_name: string | null
          ad_name: string | null
          campaign_name: string | null
          meta_data: Json | null
          status: 'new' | 'qualified' | 'unqualified' | 'quotation_shared' | 'interested' | 'negotiation' | 'lost' | 'converted'
          interest_level: 'hot' | 'warm' | 'cold' | null
          budget_range: string | null
          requirement: string | null
          timeline: string | null
          assigned_to: string | null
          branch_id: string | null
          created_at: string
          updated_at: string
          first_contact_at: string | null
          converted_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          name: string
          phone: string
          email?: string | null
          source: 'meta' | 'manual' | 'form' | 'whatsapp' | 'ivr'
          campaign_id?: string | null
          ad_id?: string | null
          adset_id?: string | null
          form_id?: string | null
          form_name?: string | null
          ad_name?: string | null
          campaign_name?: string | null
          meta_data?: Json | null
          status?: 'new' | 'qualified' | 'unqualified' | 'quotation_shared' | 'interested' | 'negotiation' | 'lost' | 'converted'
          interest_level?: 'hot' | 'warm' | 'cold' | null
          budget_range?: string | null
          requirement?: string | null
          timeline?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          created_at?: string
          updated_at?: string
          first_contact_at?: string | null
          converted_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          name?: string
          phone?: string
          email?: string | null
          source?: 'meta' | 'manual' | 'form' | 'whatsapp' | 'ivr'
          campaign_id?: string | null
          ad_id?: string | null
          adset_id?: string | null
          form_id?: string | null
          form_name?: string | null
          ad_name?: string | null
          campaign_name?: string | null
          meta_data?: Json | null
          status?: 'new' | 'qualified' | 'unqualified' | 'quotation_shared' | 'interested' | 'negotiation' | 'lost' | 'converted'
          interest_level?: 'hot' | 'warm' | 'cold' | null
          budget_range?: string | null
          requirement?: string | null
          timeline?: string | null
          assigned_to?: string | null
          branch_id?: string | null
          created_at?: string
          updated_at?: string
          first_contact_at?: string | null
          converted_at?: string | null
        }
      }
      lead_status_history: {
        Row: {
          id: string
          lead_id: string
          old_status: string | null
          new_status: string
          changed_by: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          old_status?: string | null
          new_status: string
          changed_by: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          old_status?: string | null
          new_status?: string
          changed_by?: string
          notes?: string | null
          created_at?: string
        }
      }
      calls: {
        Row: {
          id: string
          lead_id: string
          called_by: string
          outcome: 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'
          disposition: string | null
          notes: string | null
          call_duration: number | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          called_by: string
          outcome: 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'
          disposition?: string | null
          notes?: string | null
          call_duration?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          called_by?: string
          outcome?: 'connected' | 'not_reachable' | 'wrong_number' | 'call_later'
          disposition?: string | null
          notes?: string | null
          call_duration?: number | null
          created_at?: string
        }
      }
      follow_ups: {
        Row: {
          id: string
          lead_id: string
          assigned_to: string
          scheduled_at: string
          completed_at: string | null
          status: 'pending' | 'done' | 'rescheduled' | 'no_response'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          assigned_to: string
          scheduled_at: string
          completed_at?: string | null
          status?: 'pending' | 'done' | 'rescheduled' | 'no_response'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          assigned_to?: string
          scheduled_at?: string
          completed_at?: string | null
          status?: 'pending' | 'done' | 'rescheduled' | 'no_response'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      quotations: {
        Row: {
          id: string
          lead_id: string
          quote_number: string
          version: number
          items: Json
          subtotal: number
          discount: number
          gst: number
          total: number
          validity_date: string
          status: 'sent' | 'viewed' | 'accepted' | 'expired'
          pdf_url: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          quote_number: string
          version?: number
          items: Json
          subtotal: number
          discount?: number
          gst: number
          total: number
          validity_date: string
          status?: 'sent' | 'viewed' | 'accepted' | 'expired'
          pdf_url?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          quote_number?: string
          version?: number
          items?: Json
          subtotal?: number
          discount?: number
          gst?: number
          total?: number
          validity_date?: string
          status?: 'sent' | 'viewed' | 'accepted' | 'expired'
          pdf_url?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          lead_id: string | null
          name: string
          phone: string
          email: string | null
          customer_type: 'new' | 'repeat' | 'high_value'
          tags: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          name: string
          phone: string
          email?: string | null
          customer_type?: 'new' | 'repeat' | 'high_value'
          tags?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          name?: string
          phone?: string
          email?: string | null
          customer_type?: 'new' | 'repeat' | 'high_value'
          tags?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          customer_id: string
          lead_id: string | null
          order_number: string
          status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          payment_status: 'pending' | 'advance_received' | 'fully_paid'
          assigned_team: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          lead_id?: string | null
          order_number: string
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          payment_status?: 'pending' | 'advance_received' | 'fully_paid'
          assigned_team?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          lead_id?: string | null
          order_number?: string
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          payment_status?: 'pending' | 'advance_received' | 'fully_paid'
          assigned_team?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      assignments: {
        Row: {
          id: string
          user_id: string
          lead_source: 'meta' | 'manual' | 'form'
          last_assigned_at: string
          assignment_count: number
        }
        Insert: {
          id?: string
          user_id: string
          lead_source: 'meta' | 'manual' | 'form'
          last_assigned_at?: string
          assignment_count?: number
        }
        Update: {
          id?: string
          user_id?: string
          lead_source?: 'meta' | 'manual' | 'form'
          last_assigned_at?: string
          assignment_count?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
