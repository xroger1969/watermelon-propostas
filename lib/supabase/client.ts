import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_BOOKING_PUBLISHABLE_KEY,
  SUPABASE_BOOKING_URL,
} from "@/lib/supabase/config";

export function createClient() {
  return createSupabaseClient(
    SUPABASE_BOOKING_URL,
    SUPABASE_BOOKING_PUBLISHABLE_KEY
  );
}
