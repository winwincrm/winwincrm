export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_api_keys: {
        Row: {
          affiliate_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          label: string | null
          last_used_at: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          label?: string | null
          last_used_at?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          label?: string | null
          last_used_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_api_keys_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          ip_address: string | null
          office_id: string | null
          payload: Json | null
          status: "success" | "failed"
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          office_id?: string | null
          payload?: Json | null
          status: "success" | "failed"
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          office_id?: string | null
          payload?: Json | null
          status?: "success" | "failed"
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      bookkeeping_clients: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name_ciphertext: string
          name_iv: string
          name_tag: string
          office_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name_ciphertext: string
          name_iv: string
          name_tag: string
          office_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name_ciphertext?: string
          name_iv?: string
          name_tag?: string
          office_id?: string
        }
        Relationships: []
      }
      bookkeeping_deposits: {
        Row: {
          amount_ciphertext: string
          amount_iv: string
          amount_tag: string
          client_id: string
          created_at: string
          created_by: string | null
          deposit_date: string
          id: string
          note_ciphertext: string | null
          note_iv: string | null
          note_tag: string | null
          office_id: string
        }
        Insert: {
          amount_ciphertext: string
          amount_iv: string
          amount_tag: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deposit_date: string
          id?: string
          note_ciphertext?: string | null
          note_iv?: string | null
          note_tag?: string | null
          office_id: string
        }
        Update: {
          amount_ciphertext?: string
          amount_iv?: string
          amount_tag?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deposit_date?: string
          id?: string
          note_ciphertext?: string | null
          note_iv?: string | null
          note_tag?: string | null
          office_id?: string
        }
        Relationships: []
      }
      bookkeeping_log_entries: {
        Row: {
          amount_ciphertext: string
          amount_iv: string
          amount_tag: string
          cashout: boolean
          client_name_ciphertext: string
          client_name_iv: string
          client_name_tag: string
          created_at: string
          created_by: string | null
          entry_month: string
          id: string
          kyc: boolean
          office_label: string | null
          sent: boolean
          updated_at: string
          verification: boolean
        }
        Insert: {
          amount_ciphertext: string
          amount_iv: string
          amount_tag: string
          cashout?: boolean
          client_name_ciphertext: string
          client_name_iv: string
          client_name_tag: string
          created_at?: string
          created_by?: string | null
          entry_month: string
          id?: string
          kyc?: boolean
          office_label?: string | null
          sent?: boolean
          updated_at?: string
          verification?: boolean
        }
        Update: {
          amount_ciphertext?: string
          amount_iv?: string
          amount_tag?: string
          cashout?: boolean
          client_name_ciphertext?: string
          client_name_iv?: string
          client_name_tag?: string
          created_at?: string
          created_by?: string | null
          entry_month?: string
          id?: string
          kyc?: boolean
          office_label?: string | null
          sent?: boolean
          updated_at?: string
          verification?: boolean
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string | null
          handled_at: string | null
          handled_by: string | null
          id: string
          ip: string | null
          message: string | null
          name: string
          office_id: string
          phone: string
          preferred_time: string | null
          raw: Json | null
          source: string | null
          status: "new" | "seen" | "handled" | "dismissed"
          topic: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip?: string | null
          message?: string | null
          name: string
          office_id: string
          phone: string
          preferred_time?: string | null
          raw?: Json | null
          source?: string | null
          status?: "new" | "seen" | "handled" | "dismissed"
          topic?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip?: string | null
          message?: string | null
          name?: string
          office_id?: string
          phone?: string
          preferred_time?: string | null
          raw?: Json | null
          source?: string | null
          status?: "new" | "seen" | "handled" | "dismissed"
          topic?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      ip_whitelist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ip_address: string
          label: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address: string
          label?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ip_address?: string
          label?: string | null
          status?: string
        }
        Relationships: []
      }
      lead_activity: {
        Row: {
          activity_type: string
          created_at: string
          field_name: string | null
          id: string
          lead_id: string
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          field_name?: string | null
          id?: string
          lead_id: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          field_name?: string | null
          id?: string
          lead_id?: string
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          lead_id: string
          user_id: string | null
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          lead_id: string
          user_id?: string | null
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          lead_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_comments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_transfers: {
        Row: {
          from_office_id: string | null
          id: string
          lead_id: string
          note: string | null
          to_office_id: string | null
          transferred_at: string
          transferred_by: string | null
        }
        Insert: {
          from_office_id?: string | null
          id?: string
          lead_id: string
          note?: string | null
          to_office_id?: string | null
          transferred_at?: string
          transferred_by?: string | null
        }
        Update: {
          from_office_id?: string | null
          id?: string
          lead_id?: string
          note?: string | null
          to_office_id?: string | null
          transferred_at?: string
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_transfers_from_office_id_fkey"
            columns: ["from_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfers_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_transfers_to_office_id_fkey"
            columns: ["to_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          amount: number | null
          assigned_at: string | null
          assigned_user_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description_1: string | null
          description_2: string | null
          description_3: string | null
          description_4: string | null
          email: string | null
          first_name: string | null
          external_lead_id: string | null
          full_name: string | null
          hide_in_house_from_agents: boolean
          id: string
          is_in_house: boolean
          last_contacted_at: string | null
          last_name: string | null
          lead_kind: string | null
          madara_lead_id: string | null
          office_id: string | null
          origin_agent_id: string | null
          origin_agent_name: string | null
          origin_office_id: string | null
          payload: Json
          percentage: number | null
          phone: string | null
          phone_k9: string | null
          platform: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          timeframe: string | null
          transfer_count: number
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description_1?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          email?: string | null
          external_lead_id?: string | null
          first_name?: string | null
          full_name?: string | null
          hide_in_house_from_agents?: boolean
          id?: string
          is_in_house?: boolean
          last_contacted_at?: string | null
          last_name?: string | null
          lead_kind?: string | null
          madara_lead_id?: string | null
          office_id?: string | null
          origin_agent_id?: string | null
          origin_agent_name?: string | null
          origin_office_id?: string | null
          payload: Json
          percentage?: number | null
          phone?: string | null
          phone_k9?: string | null
          platform?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          timeframe?: string | null
          transfer_count?: number
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description_1?: string | null
          description_2?: string | null
          description_3?: string | null
          description_4?: string | null
          email?: string | null
          external_lead_id?: string | null
          first_name?: string | null
          full_name?: string | null
          hide_in_house_from_agents?: boolean
          id?: string
          is_in_house?: boolean
          last_contacted_at?: string | null
          last_name?: string | null
          lead_kind?: string | null
          madara_lead_id?: string | null
          office_id?: string | null
          origin_agent_id?: string | null
          origin_agent_name?: string | null
          origin_office_id?: string | null
          payload?: Json
          percentage?: number | null
          phone?: string | null
          phone_k9?: string | null
          platform?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          timeframe?: string | null
          transfer_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_origin_office_id_fkey"
            columns: ["origin_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          label: string | null
          last_used_at: string | null
          office_id: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          label?: string | null
          last_used_at?: string | null
          office_id: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          label?: string | null
          last_used_at?: string | null
          office_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_api_keys_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          slug: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          language_preference: string
          manager_id: string | null
          must_change_password: boolean
          office_id: string | null
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          language_preference?: string
          manager_id?: string | null
          must_change_password?: boolean
          office_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          language_preference?: string
          manager_id?: string | null
          must_change_password?: boolean
          office_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          actions: Json
          dashboard: Json
          lead_fields: Json
          nav_items: Json
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actions: Json
          dashboard: Json
          lead_fields: Json
          nav_items: Json
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actions?: Json
          dashboard?: Json
          lead_fields?: Json
          nav_items?: Json
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sheet_sync_events: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
          lead_id: string | null
          lead_name: string | null
          office_id: string | null
          sheet_url: string | null
          sync_id: string | null
          sync_name: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          lead_id?: string | null
          lead_name?: string | null
          office_id?: string | null
          sheet_url?: string | null
          sync_id?: string | null
          sync_name?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          lead_name?: string | null
          office_id?: string | null
          sheet_url?: string | null
          sync_id?: string | null
          sync_name?: string | null
        }
        Relationships: []
      }
      sheet_sync_rows: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          lead_id: string | null
          row_key: string
          sync_id: string
          updated_at: string
        }
        Insert: {
          content_hash?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          row_key: string
          sync_id: string
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          row_key?: string
          sync_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sheet_syncs: {
        Row: {
          assigned_user_id: string | null
          consecutive_failures: number
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          interval_seconds: number
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          list_name: string | null
          mapping: Json
          name: string
          next_run_at: string
          office_id: string | null
          sheet_url: string
          source: string | null
          update_existing: boolean
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          interval_seconds?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          list_name?: string | null
          mapping: Json
          name?: string
          next_run_at?: string
          office_id?: string | null
          sheet_url: string
          source?: string | null
          update_existing?: boolean
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          interval_seconds?: number
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          list_name?: string | null
          mapping?: Json
          name?: string
          next_run_at?: string
          office_id?: string | null
          sheet_url?: string
          source?: string | null
          update_existing?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          office_id: string
          supervisor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          office_id: string
          supervisor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          office_id?: string
          supervisor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_permission_overrides: {
        Row: {
          actions: Json
          dashboard: Json
          lead_fields: Json
          nav_items: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          actions: Json
          dashboard: Json
          lead_fields: Json
          nav_items: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          actions?: Json
          dashboard?: Json
          lead_fields?: Json
          nav_items?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_lead: { Args: { _lead_id: string }; Returns: boolean }
      can_manage_hierarchy_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      can_view_hierarchy_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      current_user_is_active: { Args: never; Returns: boolean }
      current_user_office_id: { Args: never; Returns: string }
      current_user_role_text: { Args: never; Returns: string }
      current_user_team_id: { Args: never; Returns: string }
      dashboard_stats: {
        Args: { p_from?: string; p_office?: string; p_to?: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ip_allowed: { Args: { _ip: string }; Returns: boolean }
      is_user_in_current_user_office: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_user_in_current_user_team: {
        Args: { _user_id: string }
        Returns: boolean
      }
      user_role_text: { Args: { target_user_id: string }; Returns: string }
      leads_filter_options: { Args: never; Returns: Json }
      leads_group_counts: {
        Args: {
          p_agent?: string[]
          p_country?: string[]
          p_from?: string
          p_inbox_only?: boolean
          p_office?: string[]
          p_platform?: string[]
          p_q?: string
          p_source?: string[]
          p_src?: string
          p_to?: string
          p_unassigned?: boolean
        }
        Returns: Json
      }
      leads_page: {
        Args: {
          p_agent?: string[]
          p_country?: string[]
          p_from?: string
          p_group?: string
          p_inbox_only?: boolean
          p_limit?: number
          p_office?: string[]
          p_offset?: number
          p_platform?: string[]
          p_q?: string
          p_sort?: string
          p_source?: string[]
          p_src?: string
          p_status?: string[]
          p_to?: string
          p_unassigned?: boolean
        }
        Returns: {
          amount: number
          assigned_at: string
          assigned_user_id: string
          created_at: string
          email: string
          first_name: string
          full_name: string
          hide_in_house_from_agents: boolean
          id: string
          is_in_house: boolean
          last_contacted_at: string
          last_name: string
          lead_kind: string
          office_id: string
          origin_agent_id: string
          origin_agent_name: string
          payload: Json
          percentage: number
          phone: string
          platform: string
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          timeframe: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "superiormanager" | "agent"
      lead_status:
        | "new"
        | "contacted"
        | "callback"
        | "no_answer_1"
        | "no_answer_2"
        | "no_answer_3"
        | "no_answer_4"
        | "no_answer_5"
        | "try_again"
        | "not_available"
        | "low_potential"
        | "high_potential"
        | "wrong_number"
        | "wrong_person"
        | "bad_number"
        | "appointment"
        | "qualified"
        | "converted"
        | "rejected"
        | "lost"
        | "not_interested"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "superiormanager", "agent"],
      lead_status: [
        "new",
        "contacted",
        "callback",
        "no_answer_1",
        "no_answer_2",
        "no_answer_3",
        "no_answer_4",
        "no_answer_5",
        "try_again",
        "not_available",
        "low_potential",
        "high_potential",
        "wrong_number",
        "wrong_person",
        "bad_number",
        "appointment",
        "qualified",
        "converted",
        "rejected",
        "lost",
        "not_interested",
      ],
    },
  },
} as const
