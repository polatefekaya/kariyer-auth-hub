import { createSignal } from 'solid-js';
import type { Session } from '@supabase/supabase-js';

export const [session, setSession] = createSignal<Session | null>(null);
