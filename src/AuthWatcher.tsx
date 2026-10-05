import { onMount, onCleanup } from 'solid-js';
import { AUTH_STORAGE_KEY, supabase } from './lib/supabase';
import { watchSharedAuthSession } from './lib/sharedAuthStorage';
import { setSession } from './stores/auth';

const AuthWatcher = () => {
  onMount(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    const stopWatching = watchSharedAuthSession(supabase, AUTH_STORAGE_KEY, setSession);
    onCleanup(() => {
      subscription.unsubscribe();
      stopWatching();
    });
  });

  return null;
};

export default AuthWatcher;
