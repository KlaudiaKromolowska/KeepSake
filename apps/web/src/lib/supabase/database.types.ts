export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_usage: {
        Row: {
          caregiver_id: string;
          created_at: string;
          id: string;
          kind: string;
        };
        Insert: {
          caregiver_id: string;
          created_at?: string;
          id?: string;
          kind: string;
        };
        Update: {
          caregiver_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          caregiver_id: string;
          created_at: string;
          detail: Json;
          id: number;
        };
        Insert: {
          action: string;
          caregiver_id: string;
          created_at?: string;
          detail?: Json;
          id?: never;
        };
        Update: {
          action?: string;
          caregiver_id?: string;
          created_at?: string;
          detail?: Json;
          id?: never;
        };
        Relationships: [];
      };
      clinician_patients: {
        Row: {
          clinician_id: string;
          created_at: string;
          patient_id: string;
        };
        Insert: {
          clinician_id: string;
          created_at?: string;
          patient_id: string;
        };
        Update: {
          clinician_id?: string;
          created_at?: string;
          patient_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinician_patients_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      consent: {
        Row: {
          caregiver_role_ack: boolean;
          created_at: string;
          granted_at: string | null;
          patient_consent: boolean;
          patient_id: string;
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          caregiver_role_ack?: boolean;
          created_at?: string;
          granted_at?: string | null;
          patient_consent?: boolean;
          patient_id: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          caregiver_role_ack?: boolean;
          created_at?: string;
          granted_at?: string | null;
          patient_consent?: boolean;
          patient_id?: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "consent_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: true;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      memory_capsules: {
        Row: {
          caption: string | null;
          created_at: string;
          created_by: string;
          id: string;
          kind: string;
          patient_id: string;
          storage_path: string;
          updated_at: string;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          kind: string;
          patient_id: string;
          storage_path: string;
          updated_at?: string;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          kind?: string;
          patient_id?: string;
          storage_path?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memory_capsules_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          org_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          org_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      patient_notes: {
        Row: {
          created_at: string;
          note: string;
          patient_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          note: string;
          patient_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          note?: string;
          patient_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_notes_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: true;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          caregiver_id: string | null;
          created_at: string;
          display_name: string;
          etiology: Database["public"]["Enums"]["etiology"];
          id: string;
          is_demo: boolean;
          org_id: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          caregiver_id?: string | null;
          created_at?: string;
          display_name: string;
          etiology?: Database["public"]["Enums"]["etiology"];
          id?: string;
          is_demo?: boolean;
          org_id?: string | null;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          caregiver_id?: string | null;
          created_at?: string;
          display_name?: string;
          etiology?: Database["public"]["Enums"]["etiology"];
          id?: string;
          is_demo?: boolean;
          org_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patients_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          affect_post: string | null;
          affect_pre: string | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          patient_id: string;
          started_at: string;
          summary: Json | null;
          updated_at: string;
        };
        Insert: {
          affect_post?: string | null;
          affect_pre?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          patient_id: string;
          started_at: string;
          summary?: Json | null;
          updated_at?: string;
        };
        Update: {
          affect_post?: string | null;
          affect_pre?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          patient_id?: string;
          started_at?: string;
          summary?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      target_state: {
        Row: {
          bad_sessions: number;
          between_session_gap_days: number | null;
          booster_step: number | null;
          created_at: string;
          last_start_success_day: string | null;
          last_success_interval_sec: number | null;
          mastered_at: string | null;
          next_due_at: string | null;
          schedule_mode: string | null;
          session_count: number;
          start_streak: number;
          target_id: string;
          updated_at: string;
        };
        Insert: {
          bad_sessions?: number;
          between_session_gap_days?: number | null;
          booster_step?: number | null;
          created_at?: string;
          last_start_success_day?: string | null;
          last_success_interval_sec?: number | null;
          mastered_at?: string | null;
          next_due_at?: string | null;
          schedule_mode?: string | null;
          session_count?: number;
          start_streak?: number;
          target_id: string;
          updated_at?: string;
        };
        Update: {
          bad_sessions?: number;
          between_session_gap_days?: number | null;
          booster_step?: number | null;
          created_at?: string;
          last_start_success_day?: string | null;
          last_success_interval_sec?: number | null;
          mastered_at?: string | null;
          next_due_at?: string | null;
          schedule_mode?: string | null;
          session_count?: number;
          start_streak?: number;
          target_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "target_state_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: true;
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
        ];
      };
      targets: {
        Row: {
          accepted_variants: Json;
          answer: string;
          answer_format: string;
          candidacy: string;
          created_at: string;
          id: string;
          image_url: string | null;
          patient_id: string;
          photo_path: string | null;
          question: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          accepted_variants?: Json;
          answer: string;
          answer_format?: string;
          candidacy?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          patient_id: string;
          photo_path?: string | null;
          question: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          accepted_variants?: Json;
          answer?: string;
          answer_format?: string;
          candidacy?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          patient_id?: string;
          photo_path?: string | null;
          question?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "targets_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      trials: {
        Row: {
          at: string;
          corrected: boolean;
          created_at: string;
          id: string;
          interval_sec: number;
          is_screening: boolean;
          latency_ms: number | null;
          outcome: string;
          session_id: string;
          target_id: string;
          updated_at: string;
        };
        Insert: {
          at: string;
          corrected?: boolean;
          created_at?: string;
          id?: string;
          interval_sec: number;
          is_screening?: boolean;
          latency_ms?: number | null;
          outcome: string;
          session_id: string;
          target_id: string;
          updated_at?: string;
        };
        Update: {
          at?: string;
          corrected?: boolean;
          created_at?: string;
          id?: string;
          interval_sec?: number;
          is_screening?: boolean;
          latency_ms?: number | null;
          outcome?: string;
          session_id?: string;
          target_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trials_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trials_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "targets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_org_member: {
        Args: { p_email: string; p_org_id: string; p_role?: string };
        Returns: string;
      };
      ai_calls_today: { Args: never; Returns: number };
      create_organization: { Args: { p_name: string }; Returns: string };
      is_clinician_for: { Args: { p_patient_id: string }; Returns: boolean };
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean };
      is_org_member: { Args: { p_org_id: string }; Returns: boolean };
      is_org_member_of_patient: {
        Args: { p_patient_id: string };
        Returns: boolean;
      };
      link_clinician: {
        Args: { p_clinician_email: string; p_patient_id: string };
        Returns: string;
      };
      list_clinicians_for_patient: {
        Args: { p_patient_id: string };
        Returns: {
          clinician_id: string;
          created_at: string;
          email: string;
        }[];
      };
      list_org_members: {
        Args: { p_org_id: string };
        Returns: {
          created_at: string;
          email: string;
          role: string;
          user_id: string;
        }[];
      };
    };
    Enums: {
      etiology: "alzheimers" | "vascular" | "lewy" | "parkinsons" | "mixed" | "unspecified";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      etiology: ["alzheimers", "vascular", "lewy", "parkinsons", "mixed", "unspecified"],
    },
  },
} as const;
