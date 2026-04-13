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
          profile_image_url: string | null
          address: string | null
          dob: string | null
          doj: string | null
          receives_new_lead_assignments: boolean
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
          profile_image_url?: string | null
          address?: string | null
          dob?: string | null
          doj?: string | null
          receives_new_lead_assignments?: boolean
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
          profile_image_url?: string | null
          address?: string | null
          dob?: string | null
          doj?: string | null
          receives_new_lead_assignments?: boolean
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
      lead_notes: {
        Row: {
          id: string
          lead_id: string
          note: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          note: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          note?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      mcube_outbound_sessions: {
        Row: {
          id: string
          lead_id: string
          initiated_by: string
          mcube_call_id: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          lead_id: string
          initiated_by: string
          mcube_call_id?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          lead_id?: string
          initiated_by?: string
          mcube_call_id?: string | null
          created_at?: string
          completed_at?: string | null
        }
      }
      mcube_settings: {
        Row: {
          id: boolean
          hide_connected_when_last_mcube_not_connected: boolean
          updated_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          hide_connected_when_last_mcube_not_connected?: boolean
          updated_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          hide_connected_when_last_mcube_not_connected?: boolean
          updated_by?: string | null
          created_at?: string
          updated_at?: string
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
          mcube_call_id: string | null
          recording_url: string | null
          started_at: string | null
          ended_at: string | null
          answered_duration_seconds: number | null
          dial_status: string | null
          direction: 'inbound' | 'outbound' | null
          disconnected_by: string | null
          mcube_group_name: string | null
          mcube_agent_name: string | null
          integration: 'manual' | 'mcube'
          mcube_session_id: string | null
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
          mcube_call_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          ended_at?: string | null
          answered_duration_seconds?: number | null
          dial_status?: string | null
          direction?: 'inbound' | 'outbound' | null
          disconnected_by?: string | null
          mcube_group_name?: string | null
          mcube_agent_name?: string | null
          integration?: 'manual' | 'mcube'
          mcube_session_id?: string | null
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
          mcube_call_id?: string | null
          recording_url?: string | null
          started_at?: string | null
          ended_at?: string | null
          answered_duration_seconds?: number | null
          dial_status?: string | null
          direction?: 'inbound' | 'outbound' | null
          disconnected_by?: string | null
          mcube_group_name?: string | null
          mcube_agent_name?: string | null
          integration?: 'manual' | 'mcube'
          mcube_session_id?: string | null
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
      user_push_tokens: {
        Row: {
          id: string
          user_id: string
          fcm_token: string
          device_label: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          fcm_token: string
          device_label?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          fcm_token?: string
          device_label?: string | null
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
          product_id: string | null
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
          product_id?: string | null
          order_number?: string
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
          payment_status?: 'pending' | 'advance_received' | 'fully_paid'
          assigned_team?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          title: string
          description: string | null
          price: number
          mrp: number
          image_url: string | null
          sku: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          price: number
          mrp: number
          image_url?: string | null
          sku?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          price?: number
          mrp?: number
          image_url?: string | null
          sku?: string | null
          is_active?: boolean
          created_by?: string | null
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
      whatsapp_templates: {
        Row: {
          id: string
          name: string
          language: string
          category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          body_text: string
          header_text: string | null
          footer_text: string | null
          header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
          header_media_url: string | null
          buttons: Json | null
          status: 'draft' | 'pending' | 'approved' | 'rejected'
          meta_id: string | null
          rejection_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          language: string
          category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          body_text: string
          header_text?: string | null
          footer_text?: string | null
          header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
          header_media_url?: string | null
          buttons?: Json | null
          status?: 'draft' | 'pending' | 'approved' | 'rejected'
          meta_id?: string | null
          rejection_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          language?: string
          category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
          body_text?: string
          header_text?: string | null
          footer_text?: string | null
          header_format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null
          header_media_url?: string | null
          buttons?: Json | null
          status?: 'draft' | 'pending' | 'approved' | 'rejected'
          meta_id?: string | null
          rejection_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      whatsapp_messages: {
        Row: {
          id: string
          lead_id: string | null
          phone: string
          direction: string
          body: string
          message_type: 'text' | 'image' | 'video' | 'document'
          attachment_url: string | null
          attachment_mime_type: string | null
          attachment_file_name: string | null
          attachment_size_bytes: number | null
          thumbnail_url: string | null
          conversation_key: string | null
          assigned_to: string | null
          is_read: boolean
          read_at: string | null
          meta_message_id: string | null
          reply_to_meta_message_id: string | null
          reply_context_from: string | null
          status: 'sent' | 'delivered' | 'read' | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          phone: string
          direction: string
          body: string
          message_type?: 'text' | 'image' | 'video' | 'document'
          attachment_url?: string | null
          attachment_mime_type?: string | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          thumbnail_url?: string | null
          conversation_key?: string | null
          assigned_to?: string | null
          is_read?: boolean
          read_at?: string | null
          meta_message_id?: string | null
          reply_to_meta_message_id?: string | null
          reply_context_from?: string | null
          status?: 'sent' | 'delivered' | 'read' | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          phone?: string
          direction?: string
          body?: string
          message_type?: 'text' | 'image' | 'video' | 'document'
          attachment_url?: string | null
          attachment_mime_type?: string | null
          attachment_file_name?: string | null
          attachment_size_bytes?: number | null
          thumbnail_url?: string | null
          conversation_key?: string | null
          assigned_to?: string | null
          is_read?: boolean
          read_at?: string | null
          meta_message_id?: string | null
          reply_to_meta_message_id?: string | null
          reply_context_from?: string | null
          status?: 'sent' | 'delivered' | 'read' | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_lead_counts_by_status: {
        Args: { p_assigned_to?: string | null }
        Returns: { status: string; cnt: number }[]
      }
      get_analytics_dashboard: {
        Args: { p_start: string; p_end: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
