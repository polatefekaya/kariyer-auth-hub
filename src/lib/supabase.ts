import { createClient } from '@supabase/supabase-js';
import { sharedAuthStorage, sharedCookieDomain } from './sharedAuthStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// On *.kariyerzamani.com the session lives in parent-domain cookies (sharedAuthStorage), so a
// login here is the same login on the portal and the main site — and one already made there is
// found here, which is what lets the login page redirect straight away.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: sharedCookieDomain() ? sharedAuthStorage : undefined },
});