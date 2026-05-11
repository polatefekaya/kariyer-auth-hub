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
import { AccMapByType, type AccountType } from "../types/account";
import { AuthHeaderTexts } from "../constants/authTexts";
import { getDefaultRedirect } from "../utils/redirectHelper";
import { theme } from "../stores/theme";
import { resetTurnstile } from "../utils/turnstile";
import { saveAuthRedirect, getAuthRedirect, clearAuthRedirect } from "../utils/sessionRedirect";
import { useAccountType } from "../hooks/useAccountType";

type ValidationState = "idle" | "valid" | "invalid";

const Login: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resolvedType: accountTypeFromUrl, currentTypeParam } = useAccountType("employee");

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
    mismatchRole: null as AccountType | null,
  });

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const apiUrl = import.meta.env.VITE_API_URL;

  onMount(() => {
    const rawRedirect = searchParams.redirect_to;
    const appRedirect = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
    if (appRedirect) {
      saveAuthRedirect(appRedirect);
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
    setState("payload", "accountType", accountTypeFromUrl() ?? "employee");
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
    setState("mismatchRole", null);

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
          const currentRole = state.payload.accountType;
          const hasMatchingRole = accounts.some((acc: any) => acc.role === currentRole);

          if (!hasMatchingRole) {
            const hasAdminAccount = accounts.some((acc: any) => acc.role === "admin");

            if (hasAdminAccount) {
              setState("errors", "global", "Bu mail ile kayıtlı farklı türde bir hesabınız var, lütfen doğru giriş panelini kullanınız.");
            } else {
              const mismatchAcc = accounts.find((acc: any) => acc.role !== currentRole)!;
              setState("mismatchRole", mismatchAcc.role as AccountType);
            }

            setState("payload", "cfToken", null);
            resetTurnstile();
            setState("isSubmitting", false);
            return;
          }

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
      resetTurnstile();
    } else {
      const intendedTarget = getAuthRedirect();

      if (intendedTarget) {
        clearAuthRedirect();
        const url = new URL(intendedTarget);
        url.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=${data.session.expires_in}`;
        window.location.replace(url.toString());
      } else {
        window.location.href = getDefaultRedirect(AccMapByType[state.payload.accountType]);
      }
    }

    setState("isSubmitting", false);
  };

  const dynamicRegisterRoute = () => `/register${currentTypeParam()}`;
  const dynamicForgotRoute = () => `/forgot-password${currentTypeParam()}`;

  const headerText = createMemo(() => AuthHeaderTexts.login(state.payload.accountType));

  const mismatchLoginLabel = createMemo(() => AuthHeaderTexts.login(state.mismatchRole ?? "employee").title);

  const mismatchMessage = createMemo(() => {
    const mismatch = state.mismatchRole;
    if (!mismatch) return "";
    const roleLabel: Partial<Record<AccountType, string>> = {
      employee: "aday",
      company: "işveren",
      community: "topluluk",
    };
    const label = roleLabel[mismatch] ?? mismatch;
    return `Bu e-posta adresiyle kayıtlı bir ${label} hesabınız bulunuyor. ${mismatchLoginLabel()} panelinden giriş yapmanız gerekiyor.`;
  });

  const handleNavigateToCorrectLogin = () => {
    const role = state.mismatchRole;
    if (!role) return;
    setState("mismatchRole", null);
    navigate(`/login?type=${AccMapByType[role]}`);
  };

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={headerText().title}
        description={headerText().description}
        class="mb-12"
        accountType={AccMapByType[state.payload.accountType]}
      />
      <ErrorAlert message={state.errors.global} />

      <Show when={state.mismatchRole}>
        <div class="p-3 bg-warning/[0.08] text-warning text-sm font-medium rounded-lg border border-warning/20">
          <p>{mismatchMessage()}</p>
          <button
            type="button"
            class="mt-1.5 text-primary hover:text-primary-hover text-sm font-semibold transition-colors hover:underline underline-offset-2"
            onClick={handleNavigateToCorrectLogin}
          >
            {mismatchLoginLabel()}'ne git →
          </button>
        </div>
      </Show>

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
              class="text-xs font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              Şifreni mi unuttun?
            </a>
          }
        />

        <Show when={turnstileSiteKey}>
          <div class="py-2 flex justify-center">
            <Turnstile
              siteKey={turnstileSiteKey}
              theme={theme()}
              size="flexible"
              appearance="interaction-only"
              onVerify={(token) => {
                setState("payload", "cfToken", token);
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
            <span class="text-sm font-normal text-foreground/60">
              Hesabın yok mu?{" "}
            </span>
            <a
              href={dynamicRegisterRoute()}
              class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
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
