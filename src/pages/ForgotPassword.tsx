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
import { AccMapById, AccMapByType, type AccountType, type AccountTypeId } from "../types/account";

type ValidationState = "idle" | "valid" | "invalid";

const ForgotPassword: Component = () => {
  const [searchParams] = useSearchParams();

  const [state, setState] = createStore({
    email: "",
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
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: state.cfToken || undefined,
      },
    );

    if (resetError) {
      let errorMessage = "Şifre sıfırlama bağlantısı gönderilemedi. Lütfen tekrar deneyin.";
      const errStr = resetError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = "Çok fazla deneme yaptınız. Lütfen biraz bekleyip tekrar deneyin.";
      } else {
        errorMessage = resetError.message;
      }

      setState("error", errorMessage);
      setState("cfToken", null);
      
      if (typeof window !== "undefined" && window.turnstile) {
        window.turnstile.reset();
      }
    } else {
      setState("success", true);
    }

    setState("isSubmitting", false);
  };

  const rawTypeParam = searchParams.type;
  const typeParam = Array.isArray(rawTypeParam) ? rawTypeParam[0] : rawTypeParam;
  const resolvedType = typeParam ? (AccMapById[typeParam as AccountTypeId] || (typeParam in AccMapByType ? typeParam as AccountType : null)) : null;

  const currentTypeParams = resolvedType ? `?type=${AccMapByType[resolvedType]}` : "";
  const dynamicLoginRoute = `/login${currentTypeParams}`;
  const headerText = createMemo(() => AuthHeaderTexts.forgotPassword(state.success));

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
              title={headerText().title}
              description={headerText().description}
              class="mb-12"
            />

      <Show when={state.success}>
        <div class="mt-12 flex flex-col items-center animate-in fade-in zoom-in duration-300">
          <div class="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p class="text-sm text-slate-500 text-center mb-12">
            Güvenli bağlantıyı buraya gönderdik: <br />
            <span class="font-bold text-slate-700">{state.email.trim().toLowerCase()}</span>
          </p>
          <a href={dynamicLoginRoute} class="px-6 py-2 bg-slate-100 text-sm font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
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
            disabled={state.isSubmitting}
            class="mb-0"
          />

          <Show when={turnstileSiteKey}>
            <div class="py-2 flex justify-center">
              <Turnstile
                siteKey={turnstileSiteKey}
                theme="light"
                size="flexible"
                appearance="interaction-only"
                onVerify={(token) => {
                  setState("cfToken", token);
                  //if (state.error) setState("error", null);
                }}
                onError={() => setState("error", "Güvenlik doğrulama başarısız oldu.")}
              />
            </div>
          </Show>

          <SubmitButton type="submit" loading={state.isSubmitting} disabled={isSubmitDisabled()}>
            Sıfırlama Bağlantısını Gönder
          </SubmitButton>

          <AuthFooter>
            <span class="text-sm font-normal text-slate-500">Ya da geri dön. </span>
            <a href={dynamicLoginRoute} class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors">Giriş sayfası</a>
          </AuthFooter>
        </form>
      </Show>
    </div>
  );
};

export default ForgotPassword;