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
          endpoint: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          payload: Json | null
          source: string | null
          status: string | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          payload?: Json | null
          source?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          payload?: Json | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          payload: Json | null
          phone: string | null
          source: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          payload?: Json | null
          phone?: string | null
          source?: string | null
          status?: string
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
          email: string | null
          first_name: string | null
          full_name: string
          hide_in_house_from_agents: boolean | null
          id: string
          is_in_house: boolean | null
          last_contacted_at: string | null
          last_name: string | null
          lead_kind: string | null
          office_id: string | null
          origin_agent_id: string | null
          origin_agent_name: string | null
          origin_office_id: string | null
          payload: Json | null
          percentage: number | null
          phone: string | null
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
          email?: string | null
          first_name?: string | null
          full_name: string
          hide_in_house_from_agents?: boolean | null
          id?: string
          is_in_house?: boolean | null
          last_contacted_at?: string | null
          last_name?: string | null
          lead_kind?: string | null
          office_id?: string | null
          origin_agent_id?: string | null
          origin_agent_name?: string | null
          origin_office_id?: string | null
          payload?: Json | null
          percentage?: number | null
          phone?: string | null
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
          email?: string | null
          first_name?: string | null
          full_name?: string
          hide_in_house_from_agents?: boolean | null
          id?: string
          is_in_house?: boolean | null
          last_contacted_at?: string | null
          last_name?: string | null
          lead_kind?: string | null
          office_id?: string | null
          origin_agent_id?: string | null
          origin_agent_name?: string | null
          origin_office_id?: string | null
          payload?: Json | null
          percentage?: number | null
          phone?: string | null
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
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          language_preference: string
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
          must_change_password?: boolean
          office_id?: string | null
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      current_user_office_id: { Args: never; Returns: string }
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
      leads_filter_options: { Args: never; Returns: Json }
      leads_group_counts: {
        Args: {
          p_agent?: string[]
          p_country?: string[]
          p_from?: string
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
          p_limit?: number
          p_office?: string[]
          p_offset?: number
          p_platform?: string[]
          p_q?: string
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
        | "try_again"
        | "not_available"
        | "wrong_number"
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
        "try_again",
        "not_available",
        "wrong_number",
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
