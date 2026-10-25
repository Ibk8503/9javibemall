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
      delivery_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          order_id: string
          partner_id: string
          rating: number
          rider_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id: string
          partner_id: string
          rating: number
          rider_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          order_id?: string
          partner_id?: string
          rating?: number
          rider_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_ratings_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          partner_id: string
          role: Database["public"]["Enums"]["partner_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          partner_id: string
          role?: Database["public"]["Enums"]["partner_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          partner_id?: string
          role?: Database["public"]["Enums"]["partner_role"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_replies: {
        Row: {
          author_id: string
          author_name: string | null
          body: string
          created_at: string
          id: string
          is_support: boolean
          issue_id: string
        }
        Insert: {
          author_id: string
          author_name?: string | null
          body: string
          created_at?: string
          id?: string
          is_support?: boolean
          issue_id: string
        }
        Update: {
          author_id?: string
          author_name?: string | null
          body?: string
          created_at?: string
          id?: string
          is_support?: boolean
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_replies_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issue_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          closed_at: string | null
          created_at: string
          description: string
          emailed_at: string | null
          id: string
          order_id: string | null
          partner_id: string
          recommendation: string | null
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["issue_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          description: string
          emailed_at?: string | null
          id?: string
          order_id?: string | null
          partner_id: string
          recommendation?: string | null
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          description?: string
          emailed_at?: string | null
          id?: string
          order_id?: string | null
          partner_id?: string
          recommendation?: string | null
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["issue_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_reports_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          order_id: string | null
          partner_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          order_id?: string | null
          partner_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          order_id?: string | null
          partner_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          acknowledged_at: string | null
          assigned_rider: string | null
          assigned_rider_id: string | null
          created_at: string
          delivered_at: string | null
          dropoff_address: string
          dropoff_contact_name: string | null
          dropoff_contact_phone: string | null
          id: string
          items: string | null
          order_ref: string
          partner_id: string
          pickup_address: string
          pickup_contact_name: string | null
          pickup_contact_phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_rider?: string | null
          assigned_rider_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dropoff_address: string
          dropoff_contact_name?: string | null
          dropoff_contact_phone?: string | null
          id?: string
          items?: string | null
          order_ref: string
          partner_id: string
          pickup_address: string
          pickup_contact_name?: string | null
          pickup_contact_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assigned_rider?: string | null
          assigned_rider_id?: string | null
          created_at?: string
          delivered_at?: string | null
          dropoff_address?: string
          dropoff_contact_name?: string | null
          dropoff_contact_phone?: string | null
          id?: string
          items?: string | null
          order_ref?: string
          partner_id?: string
          pickup_address?: string
          pickup_contact_name?: string | null
          pickup_contact_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_api_credentials: {
        Row: {
          api_key: string
          created_at: string
          partner_id: string
          rotated_at: string | null
        }
        Insert: {
          api_key: string
          created_at?: string
          partner_id: string
          rotated_at?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string
          partner_id?: string
          rotated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_api_credentials_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_members: {
        Row: {
          created_at: string
          id: string
          partner_id: string
          role: Database["public"]["Enums"]["partner_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          partner_id: string
          role?: Database["public"]["Enums"]["partner_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          partner_id?: string
          role?: Database["public"]["Enums"]["partner_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          name: string
          partner_code: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          name: string
          partner_code: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          name?: string
          partner_code?: string
        }
        Relationships: []
      }
      platform_support: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rider_availability: {
        Row: {
          note: string | null
          partner_id: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          note?: string | null
          partner_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          note?: string | null
          partner_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_availability_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_locations: {
        Row: {
          accuracy: number | null
          latitude: number
          longitude: number
          order_id: string | null
          partner_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          latitude: number
          longitude: number
          order_id?: string | null
          partner_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          latitude?: number
          longitude?: number
          order_id?: string | null
          partner_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_locations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      support_emails: {
        Row: {
          body_preview: string | null
          created_at: string
          error: string | null
          id: string
          issue_id: string | null
          kind: string
          order_id: string | null
          order_ref: string | null
          partner_id: string | null
          partner_name: string | null
          recipients: string[]
          reply_to: string | null
          status: string
          subject: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          error?: string | null
          id?: string
          issue_id?: string | null
          kind: string
          order_id?: string | null
          order_ref?: string | null
          partner_id?: string | null
          partner_name?: string | null
          recipients?: string[]
          reply_to?: string | null
          status?: string
          subject: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          error?: string | null
          id?: string
          issue_id?: string | null
          kind?: string
          order_id?: string | null
          order_ref?: string | null
          partner_id?: string | null
          partner_name?: string | null
          recipients?: string[]
          reply_to?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_emails_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issue_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_emails_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      user_device_tokens: {
        Row: {
          created_at: string
          device_type: string
          id: string
          partner_id: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_type?: string
          id?: string
          partner_id: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_type?: string
          id?: string
          partner_id?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_device_tokens_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          event: string
          id: string
          order_id: string | null
          order_ref: string | null
          partner_id: string | null
          request_headers: Json | null
          request_payload: Json
          response_body: string | null
          response_status: number | null
          signature: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event: string
          id?: string
          order_id?: string | null
          order_ref?: string | null
          partner_id?: string | null
          request_headers?: Json | null
          request_payload: Json
          response_body?: string | null
          response_status?: number | null
          signature?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          event?: string
          id?: string
          order_id?: string | null
          order_ref?: string | null
          partner_id?: string | null
          request_headers?: Json | null
          request_payload?: Json
          response_body?: string | null
          response_status?: number | null
          signature?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      add_platform_admin: { Args: { _email: string }; Returns: string }
      bootstrap_partner: { Args: { _name: string }; Returns: string }
      check_unattended_orders: {
        Args: { _partner_id?: string }
        Returns: number
      }
      create_partner_order: {
        Args: {
          _dropoff_address?: string
          _dropoff_contact_name?: string
          _dropoff_contact_phone?: string
          _items?: string
          _order_ref: string
          _partner_id: string
          _pickup_address: string
          _pickup_contact_name?: string
          _pickup_contact_phone?: string
          _webhook_url?: string
        }
        Returns: Json
      }
      escalate_unacknowledged_orders: { Args: never; Returns: undefined }
      get_partner_order_by_id: {
        Args: { _order_id: string; _partner_id: string }
        Returns: Json
      }
      invitation_preview: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          partner_name: string
          role: Database["public"]["Enums"]["partner_role"]
          status: string
        }[]
      }
      is_partner_admin: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      is_partner_member: {
        Args: { _partner_id: string; _user_id: string }
        Returns: boolean
      }
      is_platform_support: { Args: { _user_id: string }; Returns: boolean }
      list_platform_admins: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notification_read: { Args: { _id: string }; Returns: boolean }
      partner_role_of: {
        Args: { _partner_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["partner_role"]
      }
      partner_team: {
        Args: { _partner_id: string }
        Returns: {
          email: string
          full_name: string
          role: Database["public"]["Enums"]["partner_role"]
          user_id: string
        }[]
      }
      remove_platform_admin: { Args: { _user_id: string }; Returns: undefined }
      rotate_api_key: { Args: { _partner_id: string }; Returns: string }
      set_partner_approval: {
        Args: { _partner_id: string; _status: string }
        Returns: undefined
      }
      verify_partner_api_key: { Args: { _key: string }; Returns: string }
    }
    Enums: {
      issue_status: "open" | "in_progress" | "resolved" | "closed"
      order_status:
        | "pending"
        | "acknowledged"
        | "in_transit"
        | "delivered"
        | "failed"
      partner_role: "owner" | "manager" | "rider"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      issue_status: ["open", "in_progress", "resolved", "closed"],
      order_status: [
        "pending",
        "acknowledged",
        "in_transit",
        "delivered",
        "failed",
      ],
      partner_role: ["owner", "manager", "rider"],
    },
  },
} as const
