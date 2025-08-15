import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types pour TypeScript
export interface LeaderboardEntry {
  id: number;
  username: string;
  wallet_address: string;
  waves_completed: number;
  enemies_killed: number;
  score: number;
  created_at: string;
}

export interface NewLeaderboardEntry {
  username: string;
  wallet_address: string;
  waves_completed: number;
  enemies_killed: number;
  score: number;
}