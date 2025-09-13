import { createClient } from '@supabase/supabase-js';

// Prefer environment variables, but fall back to the provided project credentials
// so the app works even without a local .env.* file.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qkwiauivaerrrbemdlyj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrd2lhdWl2YWVycnJiZW1kbHlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MDg3MTMsImV4cCI6MjA3MzE4NDcxM30.iZcv-LIQQtMGBYD4it5hZRf6kFTVApng-7upJ12eXV4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ResearchArticle {
  id: number;
  title: string;
  keyword: string;
  doc_link: string | null;
  status: string;
}