import { createClient } from '@supabase/supabase-js';

// Prefer environment variables, but fall back to the provided project credentials
// so the app works even without a local .env.* file.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) { throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local'); }

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ResearchArticle {
  id: number;
  title: string;
  keyword: string;
  doc_link: string | null;
  // Optional content field coming from the Research table.
  // It may be null or an empty string when content hasn't been generated yet.
  content?: string | null;
  // Optional website field stored in the Research table
  website?: string | null;
  // Optional business name associated with the research row
  business_name?: string | null;
  status: string;
}