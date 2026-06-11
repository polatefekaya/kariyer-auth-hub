import { type Component, createMemo, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { AuthFooter } from "../components/layout/AuthFooter";
import { TextInput } from "../components/ui/TextInput";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import { AuthHeaderTexts } from "../constants/authTexts";
import { AccMapByType } from "../types/account";
import { theme } from "../stores/theme";
import { resetTurnstile } from "../utils/turnstile";
import { t } from "../i18n";
import { useAccountType } from "../hooks/useAccountType";
import { trackAuthStep, trackAuthError } from '../utils/authFunnel';

type ValidationState = "idle" | "valid" | "invalid";

const ForgotPassword: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { resolvedType, currentTypeParam } = useAccountType();

  const emailFromQuery = searchParams.email;
  const emailIsLocked = !!emailFromQuery;
  if (emailFromQuery) setSearchParams({ email: undefined });

  const [state, setState] = createStore({
    email: typeof emailFromQuery === "string" ? emailFromQuery : "",
    cfToken: null as string | null,
    error: null as string | null,
    success: false,
    isSubmitting: false,
  });

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  onMount(() => {
    trackAuthStep('password_reset', 'page_view');
  });

  const validEmail = createMemo<ValidationState>(() => {
    if (!state.email) return "idle";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(state.email.trim()) ? "valid" : "invalid";
  });

  const isSubmitDisabled = createMemo(() => {
    if (state.isSubmitting) return true;
    if (validEmail() !== "valid") return true;
    if (turnstileSiteKey && !state.cfToken) return true;
    return false;
  });

  const handleReset = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    trackAuthStep('password_reset', 'request_submit', { email: state.email });

    setState("isSubmitting", true);
    setState("error", null);

    const cleanEmail = state.email.trim().toLowerCase();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      cleanEmail,
      {
        redirectTo: `${window.location.origin}/reset-password${currentTypeParam()}`,
        captchaToken: state.cfToken || undefined,
      },
    );

    if (resetError) {
      let errorMessage = t('forgotPassword.errGeneric');
      const errStr = resetError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = t('forgotPassword.errRateLimit');
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? t('forgotPassword.errSecurityWait', { count: match[1] })
          : t('forgotPassword.errSecurityWaitShort');
      } else {
        errorMessage = resetError.message;
      }

      trackAuthError('password_reset', 'request_submit', errorMessage);
      setState("error", errorMessage);
      setState("cfToken", null);
      resetTurnstile();
    } else {
      trackAuthStep('password_reset', 'email_sent', { email: cleanEmail });
      setState("success", true);
    }

    setState("isSubmitting", false);
  };

  const dynamicLoginRoute = () => `/login${currentTypeParam()}`;
  const headerText = createMemo(() => AuthHeaderTexts.forgotPassword(state.success));

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={headerText().title}
        description={headerText().description}
        class="mb-12"
        accountType={resolvedType() ? AccMapByType[resolvedType()!] : undefined}
      />

      <Show when={state.success}>
        <div class="mt-12 flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div class="w-16 h-16 bg-success-subtle rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p class="text-sm text-muted-foreground text-center mb-12">
            {t('forgotPassword.sentTo')} <br />
            <span class="font-bold text-foreground">{state.email.trim().toLowerCase()}</span>
          </p>
          <a href={dynamicLoginRoute()} class="px-6 py-2 bg-secondary text-sm font-bold text-secondary-foreground hover:bg-secondary-hover rounded-lg transition-colors">
            {t('forgotPassword.backToLogin')}
          </a>
        </div>
      </Show>

      <Show when={!state.success}>
        <ErrorAlert message={state.error} />

        <form onSubmit={handleReset} class="space-y-6 mt-12">
          <TextInput
            label={t('forgotPassword.emailLabel')}
            type="email"
            maxLength={255}
            value={state.email}
            onInput={(e) => setState("email", e.currentTarget.value)}
            validationState={validEmail()}
            error={t('forgotPassword.emailError')}
            disabled={state.isSubmitting || emailIsLocked}
            class="mb-0"
          />

          <Show when={turnstileSiteKey}>
            <div class="py-2 flex justify-center">
              <Turnstile
                siteKey={turnstileSiteKey}
                theme={theme()}
                size="flexible"
                appearance="interaction-only"
                onVerify={(token) => {
                  setState("cfToken", token);
                }}
                onError={() => setState("error", t('forgotPassword.turnstileFailed'))}
              />
            </div>
          </Show>

          <SubmitButton type="submit" loading={state.isSubmitting} disabled={isSubmitDisabled()}>
            {t('forgotPassword.submit')}
          </SubmitButton>

          <AuthFooter>
            <span class="text-sm font-normal text-muted-foreground">{t('forgotPassword.orGoBack')} </span>
            <a href={dynamicLoginRoute()} class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">{t('forgotPassword.loginPage')}</a>
          </AuthFooter>
        </form>
      </Show>
    </div>
  );
};

export default ForgotPassword;
