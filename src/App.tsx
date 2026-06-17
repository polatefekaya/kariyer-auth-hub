import { type Component, type JSX, createEffect, onMount, onCleanup } from 'solid-js';
import { useLocation } from '@solidjs/router';
import ThemeWatcher from './ThemeWatcher';
import AuthWatcher from './AuthWatcher';
import Navbar from './components/navbar/Navbar';
import { captureAuthEvent } from './utils/posthog-events';
import { trackAuthDropoffIfMidFlight } from './utils/authFunnel';

const App: Component<{ children?: JSX.Element }> = (props) => {
  const location = useLocation();
  createEffect(() => {
    captureAuthEvent('$pageview', {
      path: location.pathname,
      search: location.search,
    });
  });

  // Record an explicit abandonment if the user leaves mid-funnel (form open, never
  // submitted/completed). This is the "left without registering and without an error"
  // signal the funnel can't infer on its own. Successful redirects clear the funnel
  // state first, so they're never counted as dropoffs.
  onMount(() => {
    const onHide = () => trackAuthDropoffIfMidFlight('page_hide');
    window.addEventListener('pagehide', onHide);
    onCleanup(() => window.removeEventListener('pagehide', onHide));
  });

  return (
    <>
      <ThemeWatcher />
      <AuthWatcher />
      <Navbar />
      <main class="min-h-screen pt-[68px] flex items-center justify-center p-4 sm:p-6 lg:p-8 text-foreground" style="background: linear-gradient(to bottom, hsl(var(--primary)) 0%, hsl(var(--background)) 25%)">
        {props.children}
      </main>
    </>
  );
};

export default App;