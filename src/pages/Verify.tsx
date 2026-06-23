import {
  type Component,
  createMemo,
  onMount,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import { cn } from "../utils/cn";
import { AuthFooter } from "../components/layout/AuthFooter";
import { AuthHeaderTexts } from "../constants/authTexts";
import { AccMapByType } from "../types/account";
import { getDefaultRedirect } from "../utils/redirectHelper";
import { theme } from "../stores/theme";
import { resetTurnstile } from "../utils/turnstile";
import { t } from "../i18n";
import { getAuthRedirect, clearAuthRedirect } from "../utils/sessionRedirect";
import { useAccountType } from "../hooks/useAccountType";
import { useSearchParams } from "@solidjs/router";
import { trackAuthStep, completeAuthFunnel, trackAuthError } from '../utils/authFunnel';
import { injectTraceparent } from '../tracing';
import { rejectUnauthorizedAdmin } from '../utils/verifyAdmin';

const Verify: Component = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resolvedType, currentTypeParam } = useAccountType();

  const rawEmail = searchParams.email;
  let initialEmail = "";
  if (rawEmail) {
    try {
      const extracted = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;
      initialEmail = decodeURIComponent(extracted).trim().toLowerCase();
    } catch (e) {
      console.warn("[Verify] Malformed email parameter in URL.");
      initialEmail = (Array.isArray(rawEmail) ? rawEmail[0] : rawEmail)
        .trim()
        .toLowerCase();
    }
  }

  const [code, setCode] = createSignal("");
  const [cfToken, setCfToken] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [successMsg, setSuccessMsg] = createSignal<string | null>(null);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [resendTimer, setResendTimer] = createSignal(0);
  const [isFocused, setIsFocused] = createSignal(false);

  let inputRef!: HTMLInputElement;
  let resendInterval: ReturnType<typeof setInterval> | null = null;

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const dynamicLoginRoute = () => `/login${currentTypeParam()}`;

  onMount(() => {
    trackAuthStep('registration', 'verify_page_view', { email: initialEmail });

    if (!initialEmail) {
      navigate("/login", { replace: true });
      return;
    }
    setTimeout(() => {
      if (inputRef) inputRef.focus();
    }, 100);
  });

  onCleanup(() => {
    if (resendInterval !== null) clearInterval(resendInterval);
  });

  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const val = target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    target.value = val;
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData?.getData("text") || "";
    const cleanPasted = pastedData.replace(/\D/g, "").slice(0, 6);
    setCode(cleanPasted);
    if (inputRef) {
      inputRef.value = cleanPasted;
      enforceCaretAtEnd();
    }
  };

  const enforceCaretAtEnd = () => {
    if (inputRef) {
      const len = inputRef.value.length;
      setTimeout(() => {
        try {
          inputRef.setSelectionRange(len, len);
        } catch (e) {}
      }, 0);
    }
  };

  const isComplete = createMemo(() => {
    if (code().length !== 6) return false;
    if (turnstileSiteKey && !cfToken()) return false;
    return true;
  });

  const handleVerify = async (e: Event) => {
    e.preventDefault();
    if (!isComplete()) return;

    trackAuthStep('registration', 'verify_submit', { email: initialEmail });

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: initialEmail,
      token: code(),
      type: "email",
    });

    if (verifyError) {
      let errorMessage = t('verify.errInvalidCode');
      const errStr = verifyError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = t('verify.errRateLimit');
      } else if (errStr.includes("expired")) {
        errorMessage = t('verify.errExpired');
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? t('verify.errSecurityWait', { count: match[1] })
          : t('verify.errSecurityWaitShort');
      }

      trackAuthError('registration', 'verify_error', errorMessage, { email: initialEmail });
      setError(errorMessage);
      setCode("");
      if (inputRef) inputRef.value = "";
      setCfToken(null);
      resetTurnstile();
      inputRef?.focus();
    } else if (data.session) {
      const accountType = data.session.user?.user_metadata?.account_type;
      if (accountType === "admin" || accountType === "super_admin") {
        const isAdmin = await rejectUnauthorizedAdmin(data.session.access_token);
        if (!isAdmin) {
          trackAuthError('registration', 'verify_error', 'unauthorized_admin', { email: initialEmail });
          setError(t('login.unauthorizedAdmin'));
          setCode("");
          if (inputRef) inputRef.value = "";
          setCfToken(null);
          resetTurnstile();
          setIsSubmitting(false);
          return;
        }
      }

      completeAuthFunnel('registration', { email: initialEmail });
      try { const { getPostHog } = await import('../posthog'); getPostHog()?.identify(data.session.user.id); } catch {}
      const intendedTarget = getAuthRedirect();
      const targetRedirect = getDefaultRedirect(
        resolvedType() ? AccMapByType[resolvedType()!] : undefined
      );

      if (intendedTarget) {
        clearAuthRedirect();
        try {
          const url = new URL(intendedTarget);
          url.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=${data.session.expires_in}`;
          window.location.replace(injectTraceparent(url.toString()));
        } catch (urlErr) {
          window.location.href = injectTraceparent(targetRedirect);
        }
      } else {
        window.location.href = injectTraceparent(targetRedirect);
      }
    }

    setIsSubmitting(false);
  };

  const handleResend = async () => {
    if (resendTimer() > 0) return;

    trackAuthStep('registration', 'resend_code', { email: initialEmail });

    if (turnstileSiteKey && !cfToken()) {
      setError(t('verify.turnstileRequired'));
      return;
    }

    setError(null);
    setSuccessMsg(null);

    // Clear any existing interval before starting a new one
    if (resendInterval !== null) {
      clearInterval(resendInterval);
      resendInterval = null;
    }

    setResendTimer(60);
    resendInterval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(resendInterval!);
          resendInterval = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: initialEmail,
      options: {
        captchaToken: cfToken() || undefined,
      },
    });

    if (resendError) {
      let errorMessage = t('verify.errResendFailed');
      const errStr = resendError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = t('verify.errResendRateLimit');
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? t('verify.errSecurityWait', { count: match[1] })
          : t('verify.errSecurityWaitShort');
      } else {
        errorMessage = resendError.message;
      }

      trackAuthError('registration', 'verify_error', errorMessage, { email: initialEmail });
      setError(errorMessage);
      setResendTimer(0);
      if (resendInterval !== null) {
        clearInterval(resendInterval);
        resendInterval = null;
      }
      setCfToken(null);
      resetTurnstile();
    } else {
      setSuccessMsg(t('verify.successResent'));
    }
  };

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={AuthHeaderTexts.verify().title}
        description={AuthHeaderTexts.verify().description}
        class="mb-12"
        accountType={resolvedType() ? AccMapByType[resolvedType()!] : undefined}
      />

      <div class="w-full flex flex-col gap-2">
        <div class="flex items-center justify-center bg-secondary/60 text-foreground/60 p-2 rounded-xl text-sm font-medium">
          {initialEmail}
        </div>
        <ErrorAlert message={error()} />
        <Show when={successMsg()}>
          <div class="p-3 mb-4 bg-success-subtle text-success-subtle-foreground text-sm font-semibold rounded-xl border border-success/20 text-center animate-in fade-in duration-300">
            {successMsg()}
          </div>
        </Show>
      </div>

      <form onSubmit={handleVerify} class="space-y-6 mt-14">
        <div
          class="relative flex justify-between gap-2"
          onClick={() => inputRef?.focus()}
        >
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autocomplete="one-time-code"
            maxLength={6}
            value={code()}
            onInput={handleInput}
            onPaste={handlePaste}
            onFocus={() => {
              setIsFocused(true);
              enforceCaretAtEnd();
            }}
            onBlur={() => setIsFocused(false)}
            onClick={enforceCaretAtEnd}
            onKeyUp={enforceCaretAtEnd}
            disabled={isSubmitting()}
            class={cn(
              "absolute inset-0 w-full h-full z-10 opacity-0 cursor-text",
              "text-transparent bg-transparent caret-transparent selection:bg-transparent disabled:cursor-not-allowed",
            )}
          />

          {Array.from({ length: 6 }).map((_, i) => {
            const isActive =
              isFocused() &&
              (code().length === i || (code().length === 6 && i === 5));
            const char = code()[i];

            return (
              <div
                class={cn(
                  "relative w-14 h-16 flex items-center justify-center text-2xl font-extrabold text-foreground border rounded-xl transition-all duration-200 pointer-events-none",
                  isActive
                    ? "bg-background border-primary ring-4 ring-primary/10"
                    : char
                      ? "bg-muted border-primary"
                      : "bg-muted border-primary/10",
                )}
              >
                <Show when={isActive && !char}>
                  <div class="w-0.5 h-6 bg-primary animate-pulse rounded-full" />
                </Show>
                {char || ""}
              </div>
            );
          })}
        </div>

        <Show when={turnstileSiteKey}>
          <div class="py-2 flex justify-center">
            <Turnstile
              siteKey={turnstileSiteKey}
              theme={theme()}
              size="flexible"
              appearance="interaction-only"
              onVerify={(token) => {
                setCfToken(token);
              }}
              onError={() => setError(t('verify.turnstileError'))}
            />
          </div>
        </Show>

        <SubmitButton
          type="submit"
          loading={isSubmitting()}
          disabled={!isComplete()}
        >
          {t('verify.submit')}
        </SubmitButton>

        <div class="text-center mt-6 flex flex-col gap-2">
          <p class="text-xs text-primary/60 font-normal bg-secondary/60 py-2 px-3 rounded-lg inline-block border border-border">
            {t('verify.spamNote')}
          </p>

          <div class="mt-2 text-sm text-center">
            <Show
              when={resendTimer() === 0}
              fallback={
                <span class="font-medium text-foreground/50">
                  {t('verify.resendCountdown', { count: resendTimer() })}
                </span>
              }
            >
              <span class="font-normal text-foreground/60">
                {t('verify.notReceived')}{" "}
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={isSubmitting()}
                class="font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:text-foreground/50 disabled:cursor-not-allowed"
              >
                {t('verify.resend')}
              </button>
            </Show>
          </div>

          <AuthFooter>
            <span class="text-sm font-normal text-muted-foreground">
              {t('verify.orGoBack')}{" "}
            </span>
            <a
              href={dynamicLoginRoute()}
              class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              {t('verify.loginPage')}
            </a>
          </AuthFooter>
        </div>
      </form>
    </div>
  );
};

export default Verify;
