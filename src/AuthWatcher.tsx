import { onMount, onCleanup } from 'solid-js';
import { supabase } from './lib/supabase';
import { setSession } from './stores/auth';

const AuthWatcher = () => {
  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    onCleanup(() => subscription.unsubscribe());
  });

  return null;
};

export default AuthWatcher;
