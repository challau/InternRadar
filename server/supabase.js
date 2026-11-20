import 'dotenv/config';
import {createClient} from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const clientOptions = {auth:{persistSession:false,autoRefreshToken:false}};

export const supabasePublic = url && publishableKey
  ? createClient(url, publishableKey, clientOptions)
  : null;

export const supabaseAdmin = url && serviceRoleKey
  ? createClient(url, serviceRoleKey, clientOptions)
  : null;
