import { supabase } from '../lib/supabase';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export async function verifyAdminAccess(accessToken: string): Promise<boolean> {
  if (!ADMIN_API_URL) return true;

  try {
    const res = await fetch(`${ADMIN_API_URL}/admins/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function rejectUnauthorizedAdmin(accessToken: string): Promise<boolean> {
  const isValid = await verifyAdminAccess(accessToken);
  if (!isValid) {
    await supabase.auth.signOut();
  }
  return isValid;
}
