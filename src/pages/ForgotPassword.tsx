import { type Component, createMemo, Show } from "solid-js";
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
import { useAccountType } from "../hooks/useAccountType";

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
      let errorMessage = "Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.";
      const errStr = resetError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = "Çok fazla deneme yaptınız. Lütfen biraz bekleyip tekrar deneyin.";
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? `Güvenlik nedeniyle lütfen ${match[1]} saniye bekleyin.`
          : "Güvenlik nedeniyle lütfen kısa bir süre bekleyin.";
      } else {
        errorMessage = resetError.message;
      }

      setState("error", errorMessage);
      setState("cfToken", null);
      resetTurnstile();
    } else {
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
            Güvenli bağlantıyı buraya gönderdik: <br />
            <span class="font-bold text-foreground">{state.email.trim().toLowerCase()}</span>
          </p>
          <a href={dynamicLoginRoute()} class="px-6 py-2 bg-secondary text-sm font-bold text-secondary-foreground hover:bg-secondary-hover rounded-lg transition-colors">
            Giriş'e Dön
          </a>
        </div>
      </Show>

      <Show when={!state.success}>
        <ErrorAlert message={state.error} />

        <form onSubmit={handleReset} class="space-y-6 mt-12">
          <TextInput
            label="E-Posta Adresi"
            type="email"
            maxLength={255}
            value={state.email}
            onInput={(e) => setState("email", e.currentTarget.value)}
            validationState={validEmail()}
            error="Geçersiz E-Posta formatı"
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
                onError={() => setState("error", "Güvenlik doğrulama başarısız oldu.")}
              />
            </div>
          </Show>

          <SubmitButton type="submit" loading={state.isSubmitting} disabled={isSubmitDisabled()}>
            Sıfırlama Bağlantısını Gönder
          </SubmitButton>

          <AuthFooter>
            <span class="text-sm font-normal text-muted-foreground">Ya da geri dön. </span>
            <a href={dynamicLoginRoute()} class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">Giriş sayfası</a>
          </AuthFooter>
        </form>
      </Show>
    </div>
  );
};

export default ForgotPassword;
