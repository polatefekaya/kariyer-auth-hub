import { type Component, createMemo, onMount, Show, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { AuthFooter } from "../components/layout/AuthFooter";
import { TextInput } from "../components/ui/TextInput";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import { OAuthProviders } from "../components/ui/OAuthProviders";
import { AccMapById, AccMapByType, type AccountType, type AccountTypeId } from "../types/account";
import { AuthHeaderTexts } from "../constants/authTexts";
import { getDefaultRedirect } from "../utils/redirectHelper";

type ValidationState = "idle" | "valid" | "invalid";

const Login: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = createStore({
    payload: { 
      email: "", 
      password: "", 
      cfToken: null as string | null,
      accountType: "employee" as AccountType 
    },
    errors: { global: null as string | null },
    isSubmitting: false,
    isCheckingLegacy: false,
  });
  
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const apiUrl = import.meta.env.VITE_API_URL; 

  onMount(() => {
    const rawRedirect = searchParams.redirect_to;
    const appRedirect = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
    if (appRedirect) {
      sessionStorage.setItem("kariyer_auth_redirect", appRedirect);
      setSearchParams({ redirect_to: undefined }, { replace: true });
    }

    const rawError = searchParams.error_description || searchParams.error;
    const urlError = Array.isArray(rawError) ? rawError[0] : rawError;
    if (urlError) {
      try {
        setState("errors", "global", decodeURIComponent(urlError.replace(/\+/g, " ")));
      } catch (err) {
        console.warn("[Login] Malformed error parameter in URL.");
      }
      setSearchParams({ error: undefined, error_description: undefined }, { replace: true });
    }
  });

  createEffect(() => {
      const rawType = searchParams.type;
      const typeParam = Array.isArray(rawType) ? rawType[0] : rawType;
      
      const resolvedType = typeParam 
        ? (AccMapById[typeParam as AccountTypeId] || (typeParam in AccMapByType ? typeParam : "employee"))
        : "employee";
        
      setState("payload", "accountType", resolvedType as AccountType);
    });

  const validEmail = createMemo<ValidationState>(() => {
    if (!state.payload.email) return "idle";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(state.payload.email.trim()) ? "valid" : "invalid";
  });

  const validPassword = createMemo<ValidationState>(() => {
    if (!state.payload.password) return "idle";
    return state.payload.password.length >= 6 ? "valid" : "invalid";
  });

  const isSubmitDisabled = createMemo(() => {
    if (state.isSubmitting || state.isCheckingLegacy) return true;
    if (validEmail() !== "valid" || validPassword() !== "valid") return true;
    if (turnstileSiteKey && !state.payload.cfToken) return true;
    return false;
  });

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    setState("isSubmitting", true);
    setState("errors", "global", null);

    const cleanEmail = state.payload.email.trim().toLowerCase();
    try {
      setState("isCheckingLegacy", true);
      const legacyCheckRes = await fetch(`${apiUrl}/migration/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (legacyCheckRes.ok) {
        const result = await legacyCheckRes.json();
        const accounts = result.data; 

        if (result.success && Array.isArray(accounts) && accounts.length > 0) {
          const hasMigratedAccount = accounts.some((acc: any) => acc.is_migrated);

          if (!hasMigratedAccount) {
            console.log("[Auth] Unmigrated legacy user detected. Intercepting.");
            
            if (accounts.length > 1) {
              navigate(`/migrate?email=${encodeURIComponent(cleanEmail)}&conflict=true`);
            } else {
              const shortCode = AccMapByType[accounts[0].role as AccountType] || "c";
              navigate(`/migrate?email=${encodeURIComponent(cleanEmail)}&type=${shortCode}`);
            }
            return;
          }
        }
      }
    } catch (err) {
      console.warn("[Auth] Legacy check service unreachable. Failing open to Supabase.", err);
    } finally {
      setState("isCheckingLegacy", false);
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: state.payload.password,
      options: { captchaToken: state.payload.cfToken || undefined },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes("email not confirmed")) {
        navigate(`/verify?email=${encodeURIComponent(cleanEmail)}`);
        return;
      }

      setState("errors", "global", "E-posta veya şifre hatalı.");
      setState("payload", "cfToken", null);
      
      if (typeof window !== "undefined" && window.turnstile) {
        window.turnstile.reset();
      }
    } else {
      console.log("User logged in:", data.user?.id);
      const intendedTarget = sessionStorage.getItem("kariyer_auth_redirect");

      if (intendedTarget) {
        sessionStorage.removeItem("kariyer_auth_redirect");
        const url = new URL(intendedTarget);
        url.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=${data.session.expires_in}`;
        window.location.replace(url.toString());
      } else {
        window.location.href = getDefaultRedirect(AccMapByType[state.payload.accountType]);
      }
    }

    setState("isSubmitting", false);
  };

  const currentTypeParams = () => `?type=${AccMapByType[state.payload.accountType]}`;
  const dynamicRegisterRoute = () => `/register${currentTypeParams()}`;
  const dynamicForgotRoute = () => `/forgot-password${currentTypeParams()}`;

  const headerText = createMemo(() => AuthHeaderTexts.login(state.payload.accountType));

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={headerText().title}
        description={headerText().description}
        class="mb-12"
        accountType={state.payload.accountType}
      />
      <ErrorAlert message={state.errors.global} />

      <form onSubmit={handleLogin} class="space-y-4 mt-8">
        <TextInput
          label="E-Posta Adresi"
          type="email"
          value={state.payload.email}
          onInput={(e) => setState("payload", "email", e.currentTarget.value)}
          validationState={validEmail()}
          error="Geçersiz E-Posta formatı"
          disabled={state.isSubmitting || state.isCheckingLegacy}
        />

        <TextInput
          label="Şifre"
          type="password"
          value={state.payload.password}
          onInput={(e) =>
            setState("payload", "password", e.currentTarget.value)
          }
          disabled={state.isSubmitting || state.isCheckingLegacy}
          helperRight={
            <a
              href={dynamicForgotRoute()}
              class="text-xs font-semibold text-blue-900 hover:text-blue-950 transition-colors"
            >
              Şifreni mi unuttun?
            </a>
          }
        />

        <Show when={turnstileSiteKey}>
          <div class="py-2 flex justify-center">
            <Turnstile
              siteKey={turnstileSiteKey}
              theme="light"
              size="flexible"
              appearance="interaction-only"
              onVerify={(token) => {
                setState("payload", "cfToken", token);
                //if (state.errors.global) setState("errors", "global", null);
              }}
              onError={() =>
                setState("errors", "global", "Güvenlik doğrulama başarısız oldu.")
              }
            />
          </div>
        </Show>

        <SubmitButton
          type="submit"
          loading={state.isSubmitting || state.isCheckingLegacy}
          disabled={isSubmitDisabled()}
        >
          {state.isCheckingLegacy ? "Kontrol Ediliyor..." : "Giriş Yap"}
        </SubmitButton>

        <Show when={state.payload.accountType === "employee"}>
          <OAuthProviders 
            actionText="Sign In" 
            onError={(msg) => setState("errors", "global", msg)} 
          />
        </Show>
        <Show when={state.payload.accountType !== "admin"}>
          
        <AuthFooter>
          <span class="text-sm font-normal text-blue-950/60">
            Hesabın yok mu?{" "}
          </span>
          <a
            href={dynamicRegisterRoute()}
            class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors"
          >
            Kayıt ol
          </a>
        </AuthFooter>
        </Show>
      </form>
    </div>
  );
};

export default Login;