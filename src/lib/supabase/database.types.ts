/**
 * Database types in the exact shape produced by `supabase gen types typescript`.
 * Kept in sync with supabase/migrations by hand; regenerate with `npm run db:types`
 * once the Supabase CLI is linked to the project.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Rel<FK extends string, Col extends string, Ref extends string, One extends boolean = false> = {
  foreignKeyName: FK;
  columns: [Col];
  isOneToOne: One;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      governorates: {
        Row: { code: string; name_fr: string; name_ar: string; name_en: string };
        Insert: { code: string; name_fr: string; name_ar: string; name_en: string };
        Update: { code?: string; name_fr?: string; name_ar?: string; name_en?: string };
        Relationships: [];
      };
      locations: {
        Row: {
          id: string;
          slug: string;
          governorate_code: string;
          name_fr: string;
          name_ar: string;
          name_en: string;
          kind: string;
          is_capital: boolean;
          lat: number;
          lng: number;
          popularity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          governorate_code: string;
          name_fr: string;
          name_ar: string;
          name_en: string;
          kind?: string;
          is_capital?: boolean;
          lat: number;
          lng: number;
          popularity?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["locations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "locations_governorate_code_fkey";
            columns: ["governorate_code"];
            isOneToOne: false;
            referencedRelation: "governorates";
            referencedColumns: ["code"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_path: string | null;
          bio: string | null;
          city_id: string | null;
          preferred_locale: Database["public"]["Enums"]["app_locale"];
          role: Database["public"]["Enums"]["user_role"];
          status: Database["public"]["Enums"]["account_status"];
          suspended_reason: string | null;
          rating_avg: number;
          rating_count: number;
          trips_driven: number;
          trips_taken: number;
          pref_smoking: boolean;
          pref_pets: boolean;
          pref_music: boolean;
          pref_chatty: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          preferred_locale?: Database["public"]["Enums"]["app_locale"];
          pref_smoking?: boolean;
          pref_pets?: boolean;
          pref_music?: boolean;
          pref_chatty?: boolean;
        };
        Update: {
          full_name?: string;
          avatar_path?: string | null;
          bio?: string | null;
          city_id?: string | null;
          preferred_locale?: Database["public"]["Enums"]["app_locale"];
          pref_smoking?: boolean;
          pref_pets?: boolean;
          pref_music?: boolean;
          pref_chatty?: boolean;
        };
        Relationships: [Rel<"profiles_city_id_fkey", "city_id", "locations">];
      };
      profile_private: {
        Row: { id: string; phone: string | null; date_of_birth: string | null; created_at: string; updated_at: string };
        Insert: { id: string; phone?: string | null; date_of_birth?: string | null };
        Update: { phone?: string | null; date_of_birth?: string | null };
        Relationships: [Rel<"profile_private_id_fkey", "id", "profiles", true>];
      };
      vehicles: {
        Row: {
          id: string;
          owner_id: string;
          type: Database["public"]["Enums"]["vehicle_type"];
          brand: string;
          model: string;
          color: string;
          year: number | null;
          seats: number;
          plate_number: string | null;
          photo_paths: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          type?: Database["public"]["Enums"]["vehicle_type"];
          brand: string;
          model: string;
          color: string;
          year?: number | null;
          seats: number;
          plate_number?: string | null;
          photo_paths?: string[];
        };
        Update: {
          type?: Database["public"]["Enums"]["vehicle_type"];
          brand?: string;
          model?: string;
          color?: string;
          year?: number | null;
          seats?: number;
          plate_number?: string | null;
          photo_paths?: string[];
          is_active?: boolean;
        };
        Relationships: [Rel<"vehicles_owner_id_fkey", "owner_id", "profiles">];
      };
      trips: {
        Row: {
          id: string;
          driver_id: string;
          vehicle_id: string | null;
          origin_id: string;
          destination_id: string;
          origin_address: string;
          destination_address: string;
          origin_lat: number;
          origin_lng: number;
          destination_lat: number;
          destination_lng: number;
          departure_at: string;
          seats_total: number;
          seats_available: number;
          price_per_seat: number;
          distance_km: number | null;
          duration_min: number | null;
          auto_accept: boolean;
          luggage_size: Database["public"]["Enums"]["luggage_size"];
          description: string | null;
          status: Database["public"]["Enums"]["trip_status"];
          cancellation_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          reminder_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          driver_id: string;
          vehicle_id?: string | null;
          origin_id: string;
          destination_id: string;
          origin_address: string;
          destination_address: string;
          origin_lat: number;
          origin_lng: number;
          destination_lat: number;
          destination_lng: number;
          departure_at: string;
          seats_total: number;
          price_per_seat: number;
          distance_km?: number | null;
          duration_min?: number | null;
          auto_accept?: boolean;
          luggage_size?: Database["public"]["Enums"]["luggage_size"];
          description?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["trips"]["Insert"], "driver_id">>;
        Relationships: [
          Rel<"trips_driver_id_fkey", "driver_id", "profiles">,
          Rel<"trips_vehicle_id_fkey", "vehicle_id", "vehicles">,
          Rel<"trips_origin_id_fkey", "origin_id", "locations">,
          Rel<"trips_destination_id_fkey", "destination_id", "locations">,
        ];
      };
      bookings: {
        Row: {
          id: string;
          trip_id: string;
          passenger_id: string;
          seats: number;
          price_per_seat: number;
          total_price: number;
          status: Database["public"]["Enums"]["booking_status"];
          message: string | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
          responded_at: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          Rel<"bookings_trip_id_fkey", "trip_id", "trips">,
          Rel<"bookings_passenger_id_fkey", "passenger_id", "profiles">,
          Rel<"bookings_cancelled_by_fkey", "cancelled_by", "profiles">,
        ];
      };
      conversations: {
        Row: {
          id: string;
          trip_id: string;
          driver_id: string;
          passenger_id: string;
          last_message_at: string | null;
          last_message_preview: string | null;
          last_sender_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          Rel<"conversations_trip_id_fkey", "trip_id", "trips">,
          Rel<"conversations_driver_id_fkey", "driver_id", "profiles">,
          Rel<"conversations_passenger_id_fkey", "passenger_id", "profiles">,
          Rel<"conversations_last_sender_id_fkey", "last_sender_id", "profiles">,
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          read_at: string | null;
          is_hidden: boolean;
          created_at: string;
        };
        Insert: { conversation_id: string; sender_id: string; body: string };
        Update: never;
        Relationships: [
          Rel<"messages_conversation_id_fkey", "conversation_id", "conversations">,
          Rel<"messages_sender_id_fkey", "sender_id", "profiles">,
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          data: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: { read_at?: string | null };
        Relationships: [Rel<"notifications_user_id_fkey", "user_id", "profiles">];
      };
      reviews: {
        Row: {
          id: string;
          trip_id: string;
          reviewer_id: string;
          reviewee_id: string;
          reviewee_role: string;
          rating: number;
          comment: string | null;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          Rel<"reviews_trip_id_fkey", "trip_id", "trips">,
          Rel<"reviews_reviewer_id_fkey", "reviewer_id", "profiles">,
          Rel<"reviews_reviewee_id_fkey", "reviewee_id", "profiles">,
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          trip_id: string | null;
          message_id: string | null;
          review_id: string | null;
          reason: Database["public"]["Enums"]["report_reason"];
          details: string | null;
          status: Database["public"]["Enums"]["report_status"];
          admin_note: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          reporter_id: string;
          reported_user_id: string;
          trip_id?: string | null;
          message_id?: string | null;
          review_id?: string | null;
          reason: Database["public"]["Enums"]["report_reason"];
          details?: string | null;
        };
        Update: never;
        Relationships: [
          Rel<"reports_reporter_id_fkey", "reporter_id", "profiles">,
          Rel<"reports_reported_user_id_fkey", "reported_user_id", "profiles">,
          Rel<"reports_trip_id_fkey", "trip_id", "trips">,
          Rel<"reports_message_id_fkey", "message_id", "messages">,
          Rel<"reports_review_id_fkey", "review_id", "reviews">,
          Rel<"reports_resolved_by_fkey", "resolved_by", "profiles">,
        ];
      };
      admin_actions: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          target_type: string;
          target_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [Rel<"admin_actions_admin_id_fkey", "admin_id", "profiles">];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      search_trips: {
        Args: {
          p_origin_id?: string | null;
          p_destination_id?: string | null;
          p_date?: string | null;
          p_seats?: number;
          p_max_price?: number | null;
          p_time_from?: string | null;
          p_time_to?: string | null;
          p_min_rating?: number | null;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
          p_radius_km?: number;
        };
        Returns: {
          id: string;
          departure_at: string;
          price_per_seat: number;
          seats_available: number;
          seats_total: number;
          origin_id: string;
          destination_id: string;
          origin_address: string;
          destination_address: string;
          auto_accept: boolean;
          distance_km: number | null;
          duration_min: number | null;
          driver_id: string;
          driver_name: string;
          driver_avatar_path: string | null;
          driver_rating: number;
          driver_rating_count: number;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"] | null;
          vehicle_brand: string | null;
          vehicle_model: string | null;
          vehicle_color: string | null;
          total_count: number;
        }[];
      };
      request_booking: { Args: { p_trip_id: string; p_seats: number; p_message?: string | null }; Returns: string };
      respond_booking: {
        Args: { p_booking_id: string; p_accept: boolean };
        Returns: Database["public"]["Enums"]["booking_status"];
      };
      cancel_booking: { Args: { p_booking_id: string; p_reason?: string | null }; Returns: undefined };
      cancel_trip: { Args: { p_trip_id: string; p_reason?: string | null }; Returns: undefined };
      complete_trip: { Args: { p_trip_id: string }; Returns: undefined };
      complete_past_trips: { Args: Record<string, never>; Returns: number };
      send_trip_reminders: { Args: Record<string, never>; Returns: number };
      start_conversation: { Args: { p_trip_id: string; p_passenger_id?: string | null }; Returns: string };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined };
      unread_message_count: { Args: Record<string, never>; Returns: number };
      conversation_unread_counts: {
        Args: Record<string, never>;
        Returns: { conversation_id: string; unread: number }[];
      };
      get_trip_contacts: {
        Args: { p_trip_id: string };
        Returns: { user_id: string; full_name: string; phone: string | null; role: string; plate_number: string | null }[];
      };
      get_trip_passengers_public: {
        Args: { p_trip_id: string };
        Returns: { user_id: string; full_name: string; avatar_path: string | null; rating_avg: number; seats: number }[];
      };
      get_my_vehicles: { Args: Record<string, never>; Returns: Database["public"]["Tables"]["vehicles"]["Row"][] };
      submit_review: {
        Args: { p_trip_id: string; p_reviewee_id: string; p_rating: number; p_comment?: string | null };
        Returns: string;
      };
      pending_reviews: {
        Args: Record<string, never>;
        Returns: {
          trip_id: string;
          reviewee_id: string;
          reviewee_name: string;
          reviewee_avatar: string | null;
          reviewee_role: string;
          departure_at: string;
          origin_id: string;
          destination_id: string;
        }[];
      };
      driver_stats: { Args: Record<string, never>; Returns: Json };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_active_user: { Args: Record<string, never>; Returns: boolean };
      admin_stats: { Args: Record<string, never>; Returns: Json };
      admin_list_users: {
        Args: {
          p_search?: string | null;
          p_status?: Database["public"]["Enums"]["account_status"] | null;
          p_role?: Database["public"]["Enums"]["user_role"] | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_path: string | null;
          role: Database["public"]["Enums"]["user_role"];
          status: Database["public"]["Enums"]["account_status"];
          suspended_reason: string | null;
          rating_avg: number;
          rating_count: number;
          trips_count: number;
          bookings_count: number;
          reports_count: number;
          created_at: string;
          last_sign_in_at: string | null;
          total_count: number;
        }[];
      };
      admin_set_user_status: {
        Args: { p_user_id: string; p_status: Database["public"]["Enums"]["account_status"]; p_reason?: string | null };
        Returns: undefined;
      };
      admin_set_user_role: {
        Args: { p_user_id: string; p_role: Database["public"]["Enums"]["user_role"] };
        Returns: undefined;
      };
      admin_update_report: {
        Args: { p_report_id: string; p_status: Database["public"]["Enums"]["report_status"]; p_note?: string | null };
        Returns: undefined;
      };
      admin_set_review_hidden: { Args: { p_review_id: string; p_hidden: boolean }; Returns: undefined };
      admin_set_message_hidden: { Args: { p_message_id: string; p_hidden: boolean }; Returns: undefined };
      admin_get_message: {
        Args: { p_message_id: string };
        Returns: {
          id: string;
          conversation_id: string;
          sender_id: string;
          sender_name: string;
          body: string;
          is_hidden: boolean;
          created_at: string;
        }[];
      };
    };
    Enums: {
      user_role: "user" | "admin";
      account_status: "active" | "suspended";
      app_locale: "ar" | "fr" | "en";
      trip_status: "scheduled" | "cancelled" | "completed";
      booking_status: "pending" | "confirmed" | "rejected" | "cancelled" | "completed";
      vehicle_type: "sedan" | "hatchback" | "suv" | "van" | "minibus" | "pickup" | "other";
      luggage_size: "none" | "small" | "medium" | "large";
      report_reason:
        | "inappropriate_behavior"
        | "harassment"
        | "fraud"
        | "no_show"
        | "dangerous_driving"
        | "fake_profile"
        | "spam"
        | "other";
      report_status: "open" | "in_review" | "resolved" | "dismissed";
      notification_type:
        | "booking_request"
        | "booking_confirmed"
        | "booking_rejected"
        | "booking_cancelled"
        | "new_message"
        | "trip_updated"
        | "trip_cancelled"
        | "trip_reminder"
        | "trip_completed"
        | "review_received"
        | "account_status";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type Profile = Tables<"profiles">;
export type Location = Tables<"locations">;
export type Governorate = Tables<"governorates">;
export type Trip = Tables<"trips">;
export type Booking = Tables<"bookings">;
export type Vehicle = Tables<"vehicles">;
export type Conversation = Tables<"conversations">;
export type Message = Tables<"messages">;
export type Notification = Tables<"notifications">;
export type Review = Tables<"reviews">;
export type Report = Tables<"reports">;
export type BookingStatus = Enums<"booking_status">;
export type TripStatus = Enums<"trip_status">;
export type VehicleType = Enums<"vehicle_type">;
export type NotificationType = Enums<"notification_type">;
export type ReportReason = Enums<"report_reason">;
export type ReportStatus = Enums<"report_status">;
export type LuggageSize = Enums<"luggage_size">;
export type SearchResult = PublicSchema["Functions"]["search_trips"]["Returns"][number];
