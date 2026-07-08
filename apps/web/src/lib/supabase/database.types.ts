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
      patients: {
        Row: {
          caregiver_id: string;
          created_at: string;
          display_name: string;
          etiology: Database["public"]["Enums"]["etiology"];
          id: string;
          is_demo: boolean;
          notes: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          caregiver_id: string;
          created_at?: string;
          display_name: string;
          etiology?: Database["public"]["Enums"]["etiology"];
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          caregiver_id?: string;
          created_at?: string;
          display_name?: string;
          etiology?: Database["public"]["Enums"]["etiology"];
          id?: string;
          is_demo?: boolean;
          notes?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
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
      ai_calls_today: { Args: never; Returns: number };
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
