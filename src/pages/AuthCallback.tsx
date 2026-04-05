import {
  type Component,
  createSignal,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { AuthHeader } from "../components/layout/AuthHeader";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { ALLOWED_ORIGINS } from "../types/config";
import { AuthHeaderTexts } from "../constants/authTexts";
import {
  AccMapById,
  AccMapByType,
  type AccountType,
  type AccountTypeId,
} from "../types/account";

const AuthCallback: Component = () => {
  const navigate = useNavigate();
  const [statusText, setStatusText] = createSignal("Bilgiler doğrulanıyor...");
  const [error, setError] = createSignal<string | null>(null);
  const [manualRedirectUrl, setManualRedirectUrl] = createSignal<string | null>(
    null,
  );
  const [isHandingOff, setIsHandingOff] = createSignal(false);

  let safetyTimeout: number;
  let stuckTimeout: number;
  let authSubscription: { unsubscribe: () => void } | null = null;

  const defaultRedirectUrl = import.meta.env.VITE_DEFAULT_REDIRECT_URL;

  const validateRedirectTarget = (target: string | null): string => {
    const defaultTarget = defaultRedirectUrl;
    if (!target) return defaultTarget;

    try {
      const url = new URL(target);
      if (url.protocol === "kariyerzamani:") return target;
      if (ALLOWED_ORIGINS.has(url.origin)) return target;

      console.warn(
        `[SECURITY] Blocked malicious redirect origin: ${url.origin}`,
      );
      return defaultTarget;
    } catch (err) {
      console.warn("[SECURITY] Blocked malformed redirect URL.");
      return defaultTarget;
    }
  };

  const executeHandoff = async (initialSession: Session) => {
    if (
      isHandingOff() ||
      !initialSession?.access_token ||
      !initialSession?.refresh_token
    )
      return;
    setIsHandingOff(true);
    setStatusText("Bağlantı güvenliği sağlanıyor...");

    if (window.history && window.history.replaceState) {
      const cleanUrl =
        window.location.protocol +
        "//" +
        window.location.host +
        window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    let activeSession = initialSession;
    const metadata = activeSession.user?.user_metadata || {};

    if (!metadata.account_type) {
      const queryParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.substring(1));

      const urlType = queryParams.get("type") || hashParams.get("type");
      const storageType = sessionStorage.getItem("kariyer_oauth_type");

      const rawTypeString = urlType || storageType;

      const finalType: AccountType | null = rawTypeString
        ? AccMapById[rawTypeString as AccountTypeId] ||
          (rawTypeString in AccMapByType
            ? (rawTypeString as AccountType)
            : null)
        : null;

      if (!finalType) {
        console.error(
          `FATAL: OAuth handoff aborted. Unrecognized account type: ${rawTypeString}`,
        );
        setError(
          "Hesap türü belirlenemedi. Lütfen giriş sayfasına dönerek tekrar deneyin.",
        );
        setIsHandingOff(false);
        await supabase.auth.signOut();
        return;
      }

      setStatusText("Kullanıcı profili yapılandırılıyor...");

      try {
        const { error: updateErr } = await supabase.auth.updateUser({
          data: { account_type: finalType },
        });

        if (updateErr) throw updateErr;

        const {
          data: { session: freshSession },
          error: refreshErr,
        } = await supabase.auth.getSession();

        if (refreshErr || !freshSession) {
          throw new Error("Profil güncellendi ancak yeni oturum alınamadı.");
        }

        activeSession = freshSession;
      } catch (err) {
        console.error("Failed to patch OAuth user metadata:", err);
        setError(
          "Profil yapılandırması başarısız oldu. Lütfen tekrar giriş yapın.",
        );
        setIsHandingOff(false);
        return;
      }
    }

    const finalQueryParams = new URLSearchParams(window.location.search);
    const urlPreservedTarget = finalQueryParams.get("next");
    const storageTarget = sessionStorage.getItem("kariyer_auth_redirect");

    const safeTargetUrl = validateRedirectTarget(
      urlPreservedTarget || storageTarget,
    );

    setStatusText("Uygulamaya yönlendiriliyor...");

    try {
      const url = new URL(safeTargetUrl);
      url.hash = `access_token=${activeSession.access_token}&refresh_token=${activeSession.refresh_token}&expires_in=${activeSession.expires_in || 3600}`;
      const finalUrl = url.toString();

      sessionStorage.removeItem("kariyer_auth_redirect");
      sessionStorage.removeItem("kariyer_oauth_type");

      setManualRedirectUrl(finalUrl);
      window.location.replace(finalUrl);
    } catch (err) {
      console.error("URL Construction Error:", err);
      setError("Güvenli bir yönlendirme sağlanamadı.");
    }
  };

  onMount(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);

    const urlError =
      hashParams.get("error_description") ||
      queryParams.get("error_description") ||
      hashParams.get("error") ||
      queryParams.get("error");

    if (urlError) {
      try {
        setError(decodeURIComponent(urlError.replace(/\+/g, " ")));
      } catch (e) {
        console.warn("[AuthCallback] Malformed error parameter in URL");
        setError("Kimlik doğrulama sırasında bir hata oluştu.");
      }
      return;
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        clearTimeout(safetyTimeout);
        executeHandoff(session);
      }
    });
    authSubscription = data.subscription;

    supabase.auth
      .getSession()
      .then(({ data: { session }, error: sessionError }) => {
        if (sessionError) {
          setError("Oturum alınamadı: " + sessionError.message);
          return;
        }
        if (session) {
          clearTimeout(safetyTimeout);
          executeHandoff(session);
        }
      });

    safetyTimeout = window.setTimeout(() => {
      if (!error() && !manualRedirectUrl() && !isHandingOff()) {
        setError(
          "Doğrulama zaman aşımına uğradı. Bağlantının süresi geçmiş olabilir.",
        );
        authSubscription?.unsubscribe?.();
      }
    }, 8000);

    stuckTimeout = window.setTimeout(() => {
      if (manualRedirectUrl()) {
        setStatusText("Uygulama bekleniyor...");
      }
    }, 3000);
  });

  onCleanup(() => {
    clearTimeout(safetyTimeout);
    clearTimeout(stuckTimeout);
    authSubscription?.unsubscribe?.();
  });

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm flex flex-col items-center justify-center min-h-[400px]">
      <Show when={error()}>
        <div class="w-full">
          <AuthHeader
                      title={AuthHeaderTexts.callbackError().title}
                      description={AuthHeaderTexts.callbackError().description}
                    />
          <ErrorAlert message={error()} />
          <button
            onClick={() => navigate("/login", { replace: true })}
            class="mt-6 w-full px-4 py-3 font-semibold bg-blue-900 text-white font-semibold rounded-xl hover:bg-blue-950 transition-colors"
          >
            Giriş'e dön
          </button>
        </div>
      </Show>

      <Show when={!error()}>
        <div class="relative flex flex-col items-center justify-center w-full animate-in fade-in duration-500">
          <div class="relative w-20 h-20 mb-8">
            <svg
              class="absolute inset-0 w-full h-full animate-[spin_3s_linear_infinite] text-blue-800/20"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="48"
                fill="none"
                stroke="currentColor"
                stroke-width="4"
                stroke-dasharray="20 10"
              />
            </svg>
            <svg
              class="absolute inset-2 w-16 h-16 animate-[spin_2s_ease-in-out_infinite_reverse] text-blue-800"
              viewBox="0 0 100 100"
            >
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                stroke-width="6"
                stroke-dasharray="100 50"
                stroke-linecap="round"
              />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center text-blue-900">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
          </div>
          <h2 class="text-xl font-semibold text-blue-900 mb-2">Doğrulanıyor</h2>
          <p class="text-sm font-medium text-blue-950/50 animate-pulse">
            {statusText()}
          </p>
          <Show when={manualRedirectUrl()}>
            <div class="mt-8 flex flex-col items-center animate-in slide-in-from-bottom-4 fade-in duration-500 w-full gap-4">
              <p class="text-xs text-center text-blue-950/60 font-normal ">
                Eğer uygulama otomatik olarak açılmazsa:
              </p>
              <a
                href={manualRedirectUrl()!}
                class="font-semibold w-full text-center px-4 py-3 bg-blue-900 text-white rounded-xl hover:bg-blue-950 transition-colors"
              >
                Devam etmek için buraya dokun
              </a>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default AuthCallback;
