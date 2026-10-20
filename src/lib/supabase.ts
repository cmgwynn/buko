import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Placeholders keep the app from crashing before .env is filled in; the root layout shows a setup screen instead.
export const supabase = createClient(config.supabaseUrl || 'http://localhost', config.supabaseAnonKey || 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
