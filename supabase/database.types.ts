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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      companies: {
        Row: {
          active: boolean
          board_token: string | null
          created_at: string
          id: string
          name: string
          source: Database["public"]["Enums"]["job_source"]
        }
        Insert: {
          active?: boolean
          board_token?: string | null
          created_at?: string
          id?: string
          name: string
          source: Database["public"]["Enums"]["job_source"]
        }
        Update: {
          active?: boolean
          board_token?: string | null
          created_at?: string
          id?: string
          name?: string
          source?: Database["public"]["Enums"]["job_source"]
        }
        Relationships: []
      }
      job_scores: {
        Row: {
          ai_reasoning: string | null
          ai_score: number | null
          id: string
          job_id: string
          keyword_score: number
          resume_version: number
          role_selection_id: string
          scored_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_score?: number | null
          id?: string
          job_id: string
          keyword_score: number
          resume_version: number
          role_selection_id: string
          scored_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_score?: number | null
          id?: string
          job_id?: string
          keyword_score?: number
          resume_version?: number
          role_selection_id?: string
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_scores_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_scores_role_selection_id_fkey"
            columns: ["role_selection_id"]
            isOneToOne: false
            referencedRelation: "role_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      job_state: {
        Row: {
          job_id: string
          status_id: string | null
          updated_at: string
        }
        Insert: {
          job_id: string
          status_id?: string | null
          updated_at?: string
        }
        Update: {
          job_id?: string
          status_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_state_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_state_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "job_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      job_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      jobs: {
        Row: {
          company_id: string | null
          company_name: string
          description: string
          first_seen_at: string
          id: string
          inactive_reason: string | null
          is_active: boolean
          last_seen_at: string
          location_raw: string
          location_tags: Database["public"]["Enums"]["location_tag"][]
          min_years: number | null
          posted_at: string | null
          source: Database["public"]["Enums"]["job_source"]
          source_job_id: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          company_id?: string | null
          company_name: string
          description?: string
          first_seen_at?: string
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          last_seen_at?: string
          location_raw?: string
          location_tags?: Database["public"]["Enums"]["location_tag"][]
          min_years?: number | null
          posted_at?: string | null
          source: Database["public"]["Enums"]["job_source"]
          source_job_id: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          company_id?: string | null
          company_name?: string
          description?: string
          first_seen_at?: string
          id?: string
          inactive_reason?: string | null
          is_active?: boolean
          last_seen_at?: string
          location_raw?: string
          location_tags?: Database["public"]["Enums"]["location_tag"][]
          min_years?: number | null
          posted_at?: string | null
          source?: Database["public"]["Enums"]["job_source"]
          source_job_id?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          id: string
          job_id: string
          sent_at: string
        }
        Insert: {
          id?: string
          job_id: string
          sent_at?: string
        }
        Update: {
          id?: string
          job_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      resumes: {
        Row: {
          file_path: string
          id: string
          is_active: boolean
          parsed_text: string
          skills: string[]
          uploaded_at: string
          version: number
        }
        Insert: {
          file_path: string
          id?: string
          is_active?: boolean
          parsed_text?: string
          skills?: string[]
          uploaded_at?: string
          version?: number
        }
        Update: {
          file_path?: string
          id?: string
          is_active?: boolean
          parsed_text?: string
          skills?: string[]
          uploaded_at?: string
          version?: number
        }
        Relationships: []
      }
      role_pack_roles: {
        Row: {
          id: string
          pack_id: string
          role: string
          sort_order: number
        }
        Insert: {
          id?: string
          pack_id: string
          role: string
          sort_order?: number
        }
        Update: {
          id?: string
          pack_id?: string
          role?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_pack_roles_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "role_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      role_packs: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      role_expansion_map: {
        Row: {
          related_roles: string[]
          role: string
          source: Database["public"]["Enums"]["role_map_source"]
          updated_at: string
        }
        Insert: {
          related_roles: string[]
          role: string
          source: Database["public"]["Enums"]["role_map_source"]
          updated_at?: string
        }
        Update: {
          related_roles?: string[]
          role?: string
          source?: Database["public"]["Enums"]["role_map_source"]
          updated_at?: string
        }
        Relationships: []
      }
      role_selections: {
        Row: {
          created_at: string
          expanded_roles: string[]
          id: string
          is_active: boolean
          primary_role: string
        }
        Insert: {
          created_at?: string
          expanded_roles: string[]
          id?: string
          is_active?: boolean
          primary_role: string
        }
        Update: {
          created_at?: string
          expanded_roles?: string[]
          id?: string
          is_active?: boolean
          primary_role?: string
        }
        Relationships: []
      }
      scrape_runs: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error: string | null
          failed_count: number
          found_count: number
          id: string
          inserted_count: number | null
          kept_count: number | null
          metadata: Json | null
          run_at: string
          source: Database["public"]["Enums"]["job_source"]
          started_at: string | null
          status: Database["public"]["Enums"]["scrape_run_status"]
          updated_count: number | null
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          failed_count?: number
          found_count?: number
          id?: string
          inserted_count?: number | null
          kept_count?: number | null
          metadata?: Json | null
          run_at?: string
          source: Database["public"]["Enums"]["job_source"]
          started_at?: string | null
          status: Database["public"]["Enums"]["scrape_run_status"]
          updated_count?: number | null
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          failed_count?: number
          found_count?: number
          id?: string
          inserted_count?: number | null
          kept_count?: number | null
          metadata?: Json | null
          run_at?: string
          source?: Database["public"]["Enums"]["job_source"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["scrape_run_status"]
          updated_count?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_active_resume: {
        Args: { p_file_path: string; p_parsed_text: string; p_skills: string[] }
        Returns: {
          file_path: string
          id: string
          is_active: boolean
          parsed_text: string
          skills: string[]
          uploaded_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "resumes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_active_role_selection: {
        Args: { p_expanded_roles: string[]; p_primary_role: string }
        Returns: {
          created_at: string
          expanded_roles: string[]
          id: string
          is_active: boolean
          primary_role: string
        }[]
        SetofOptions: {
          from: "*"
          to: "role_selections"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      job_source:
        | "greenhouse"
        | "lever"
        | "ashby"
        | "wellfound"
        | "remoteok"
        | "mycareersfuture"
      location_tag: "india" | "singapore" | "uae" | "remote"
      role_map_source: "seed" | "ai"
      scrape_run_status: "success" | "partial" | "failed"
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
      job_source: [
        "greenhouse",
        "lever",
        "ashby",
        "wellfound",
        "remoteok",
        "mycareersfuture",
      ],
      location_tag: ["india", "singapore", "uae", "remote"],
      role_map_source: ["seed", "ai"],
      scrape_run_status: ["success", "partial", "failed"],
    },
  },
} as const
