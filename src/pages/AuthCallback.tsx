import { type Component, createSignal, onMount, onCleanup, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { AuthHeader } from "../components/layout/AuthHeader";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { ALLOWED_ORIGINS } from "../types/config";
import { AuthHeaderTexts } from "../constants/authTexts";
import { IoReloadOutline } from "solid-icons/io";
import { getAuthRedirect, clearAuthRedirect } from "../utils/sessionRedirect";
import { trackAuthStep, completeAuthFunnel, trackAuthError } from '../utils/authFunnel';
import { injectTraceparent } from '../tracing';

const AuthCallback: Component = () => {
  const navigate = useNavigate();
  const [statusText, setStatusText] = createSignal("Kimlik doğrulanıyor...");
  const [error, setError] = createSignal<string | null>(null);
  const [manualRedirectUrl, setManualRedirectUrl] = createSignal<string | null>(null);
  const [isHandingOff, setIsHandingOff] = createSignal(false);

  let authSubscription: { unsubscribe: () => void } | null = null;
  const defaultRedirectUrl = import.meta.env.VITE_DEFAULT_REDIRECT_URL;

  const validateRedirectTarget = (target: string | null): string => {
    const defaultTarget = defaultRedirectUrl;
    if (!target) return defaultTarget;

    try {
      const url = new URL(target);
      if (url.protocol === "kariyerzamani:") return target;
      if (ALLOWED_ORIGINS.has(url.origin)) return target;
      return defaultTarget;
    } catch (err) {
      return defaultTarget;
    }
  };

  const executeHandoff = async (initialSession: Session) => {
    if (isHandingOff() || !initialSession?.access_token) return;
    setIsHandingOff(true);
    setStatusText("Senkronizasyon bekleniyor...");

    let activeSession = initialSession;
    let accountType = activeSession.user?.user_metadata?.account_type;

    // Backend (veya Trigger) veritabanına account_type yazana kadar bekle ve token'ı tazele
    if (!accountType) {
      let retryCount = 0;
      const maxRetries = 5;

      while (!accountType && retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // 1.5 saniye bekle
        const { data: refreshData } = await supabase.auth.refreshSession();
        
        if (refreshData?.session) {
          activeSession = refreshData.session;
          accountType = activeSession.user?.user_metadata?.account_type;
        }
        retryCount++;
      }
    }

    if (!accountType) {
      console.error("FATAL: Backend did not inject account_type in time.");
      const timeoutError = "Hesap türü alınamadı. Lütfen tekrar giriş yapın.";
      trackAuthError('oauth', 'callback', timeoutError);
      setError(timeoutError);
      setIsHandingOff(false);
      await supabase.auth.signOut();
      return;
    }

    completeAuthFunnel('oauth', { account_type: accountType });
    try { const { getPostHog } = await import('../posthog'); getPostHog()?.identify(activeSession.user.id); } catch {}
    setStatusText("Uygulamaya geçiş yapılıyor...");

    const finalQueryParams = new URLSearchParams(window.location.search);
    const urlPreservedTarget = finalQueryParams.get("next");
    const storageTarget = getAuthRedirect();
    const safeTargetUrl = validateRedirectTarget(urlPreservedTarget || storageTarget);

    try {
      const url = new URL(safeTargetUrl);
      url.hash = `access_token=${activeSession.access_token}&refresh_token=${activeSession.refresh_token}`;
      const finalUrl = injectTraceparent(url.toString());

      clearAuthRedirect();
      sessionStorage.removeItem("kariyer_oauth_type");

      setManualRedirectUrl(finalUrl);

      setTimeout(() => {
              window.location.href = finalUrl;
            }, 100);

    } catch (err) {
      trackAuthError('oauth', 'callback', "Yönlendirme bağlantısı oluşturulamadı.");
      setError("Yönlendirme bağlantısı oluşturulamadı.");
    }
  };

  onMount(() => {
    trackAuthStep('oauth', 'callback_received');

    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const urlError = hashParams.get("error_description") || queryParams.get("error_description");

    if (urlError) {
      const decodedError = decodeURIComponent(urlError.replace(/\+/g, " "));
      trackAuthError('oauth', 'callback', decodedError);
      setError(decodedError);
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        executeHandoff(session);
      }
    });
    authSubscription = data.subscription;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) executeHandoff(session);
    });
  });

  onCleanup(() => {
    authSubscription?.unsubscribe?.();
  });

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm flex flex-col items-center justify-center min-h-[400px]">
      <Show when={error()}>
        <div class="w-full">
          <AuthHeader title={AuthHeaderTexts.callbackError().title} description={AuthHeaderTexts.callbackError().description} />
          <ErrorAlert message={error()} />
          <button onClick={() => navigate("/login", { replace: true })} class="mt-6 w-full px-4 py-3 font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors">
            Giriş'e dön
          </button>
        </div>
      </Show>

      <Show when={!error()}>
        <div class="relative flex flex-col items-center justify-center w-full animate-in fade-in duration-500">
           <div class="relative w-20 h-20 mb-8 flex items-center justify-center">
             <IoReloadOutline class="w-10 h-10 animate-spin text-primary" />
           </div>
          <h2 class="text-xl font-semibold text-foreground mb-2">Doğrulanıyor</h2>
          <p class="text-sm font-medium text-foreground/50 animate-pulse">{statusText()}</p>

          <Show when={manualRedirectUrl()}>
            <div class="mt-8 flex flex-col items-center animate-in slide-in-from-bottom-4 fade-in duration-500 w-full gap-4">
              <p class="text-xs text-center text-foreground/60 font-normal">
                Tarayıcı otomatik yönlendirmeyi engellemiş olabilir. Uygulamaya dönmek için tıklayın:
              </p>
              <a href={manualRedirectUrl()!} class="font-semibold w-full text-center px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors">
                Uygulamaya Dön
              </a>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default AuthCallback;