import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig } from './env';

export const createClient = () => {
  const { url, anonKey } = getSupabasePublicConfig();
  return createBrowserClient(url, anonKey);
};
