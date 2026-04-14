import {
  type Component,
  createMemo,
  onMount,
  Show,
  createSignal,
  onCleanup,
} from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import { cn } from "../utils/cn";
import { AuthFooter } from "../components/layout/AuthFooter";
import { AuthHeaderTexts } from "../constants/authTexts";
import {
  AccMapById,
  AccMapByType,
  type AccountType,
  type AccountTypeId,
} from "../types/account";
import { getDefaultRedirect } from "../utils/redirectHelper";

const Verify: Component = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const rawTypeParam = searchParams.type;
  const typeParam = Array.isArray(rawTypeParam)
    ? rawTypeParam[0]
    : rawTypeParam;
  const resolvedType = typeParam
    ? AccMapById[typeParam as AccountTypeId] ||
      (typeParam in AccMapByType ? (typeParam as AccountType) : null)
    : null;

  const currentTypeParams = resolvedType
    ? `?type=${AccMapByType[resolvedType]}`
    : "";
  const dynamicLoginRoute = `/login${currentTypeParams}`;

  onMount(() => {
    if (!initialEmail) {
      navigate("/login", { replace: true });
      return;
    }
    setTimeout(() => {
      if (inputRef) inputRef.focus();
    }, 100);
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

  const resetTurnstile = () => {
    if (typeof window !== "undefined" && window.turnstile) {
      window.turnstile.reset();
    }
  };

  const handleVerify = async (e: Event) => {
    e.preventDefault();
    if (!isComplete()) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: initialEmail,
      token: code(),
      type: "email",
    });

    if (verifyError) {
      let errorMessage = "Geçersiz doğrulama kodu.";
      const errStr = verifyError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage = "Çok fazla deneme yaptınız. Lütfen biraz bekleyin.";
      } else if (errStr.includes("expired")) {
        errorMessage = "Kodun süresi dolmuş. Lütfen yeni bir kod isteyin.";
      }

      setError(errorMessage);
      setCode("");
      if (inputRef) inputRef.value = "";
      setCfToken(null);
      resetTurnstile();
      inputRef?.focus();
    } else if (data.session) {
      console.log("Verified user:", data.user?.id);

      const intendedTarget = sessionStorage.getItem("kariyer_auth_redirect");
      const targetRedirect = getDefaultRedirect(typeParam as AccountTypeId);

      if (intendedTarget) {
        sessionStorage.removeItem("kariyer_auth_redirect");
        try {
          const url = new URL(intendedTarget);
          url.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&expires_in=${data.session.expires_in}`;
          window.location.replace(url.toString());
        } catch (urlErr) {
          window.location.href = targetRedirect;
        }
      } else {
        window.location.href = targetRedirect;
      }
    }

    setIsSubmitting(false);
  };

  const handleResend = async () => {
    if (resendTimer() > 0) return;

    if (turnstileSiteKey && !cfToken()) {
      setError("Lütfen önce güvenlik doğrulamasını tamamlayın.");
      return;
    }

    setError(null);
    setSuccessMsg(null);
    setResendTimer(60);

    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) clearInterval(interval);
        return prev - 1;
      });
    }, 1000);

    onCleanup(() => clearInterval(interval));

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: initialEmail,
      options: {
        captchaToken: cfToken() || undefined,
      },
    });

    if (resendError) {
      let errorMessage = "Kod gönderilirken bir hata oluştu.";
      const errStr = resendError.message.toLowerCase();

      if (errStr.includes("rate limit")) {
        errorMessage =
          "Çok sık kod istediniz. Lütfen e-postanızı kontrol edin veya biraz bekleyin.";
      } else {
        errorMessage = resendError.message;
      }

      setError(errorMessage);
      setResendTimer(0);
      clearInterval(interval);
      setCfToken(null);
      resetTurnstile();
    } else {
      setSuccessMsg("Yeni kod gönderildi! Lütfen e-postanızı kontrol edin.");
    }
  };

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={AuthHeaderTexts.verify().title}
        description={AuthHeaderTexts.verify().description}
        class="mb-12"
        accountType={AccMapByType[resolvedType!]}
      />

      <div class="w-full flex flex-col gap-2">
        <div class="flex items-center justify-center bg-blue-50/60 text-blue-950/60 p-2 rounded-xl text-sm font-medium">
          {initialEmail}
        </div>
        <ErrorAlert message={error()} />
        <Show when={successMsg()}>
          <div class="p-3 mb-4 bg-emerald-50 text-emerald-800 text-sm font-semibold rounded-xl border border-emerald-200 text-center animate-in fade-in duration-300">
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
                  "relative w-14 h-16 flex items-center justify-center text-2xl font-extrabold text-blue-950 border rounded-xl transition-all duration-200 pointer-events-none",
                  isActive
                    ? "bg-white border-blue-900 shadow-[0_0_0_4px_rgba(2,132,199,0.1)]"
                    : char
                      ? "bg-slate-50 border-blue-900"
                      : "bg-slate-50 border-blue-900/10",
                )}
              >
                <Show when={isActive && !char}>
                  <div class="w-0.5 h-6 bg-blue-900 animate-pulse rounded-full" />
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
              theme="light"
              size="flexible"
              appearance="interaction-only"
              onVerify={(token) => {
                setCfToken(token);
                //if (error()) setError(null);
              }}
              onError={() => setError("Güvenlik doğrulaması başarısız oldu.")}
            />
          </div>
        </Show>

        <SubmitButton
          type="submit"
          loading={isSubmitting()}
          disabled={!isComplete()}
        >
          Hesabını Doğrula
        </SubmitButton>

        <div class="text-center mt-6 flex flex-col gap-2">
          <p class="text-xs text-blue-900/60 font-normal bg-blue-50/60 py-2 px-3 rounded-lg inline-block border border-blue-100">
            Eğer e-postayı göremezsen lütfen spam (gereksiz) klasörünü de
            kontrol et.
          </p>

          <div class="mt-2 text-sm text-center">
            <Show
              when={resendTimer() === 0}
              fallback={
                <span class="font-medium text-blue-950/50">
                  {resendTimer()} saniye sonra yeniden gönderebilirsin.
                </span>
              }
            >
              <span class="font-normal text-blue-950/60">
                Kodu almadın mı?{" "}
              </span>
              <button
                type="button"
                onClick={handleResend}
                disabled={isSubmitting()}
                class="font-semibold text-blue-900 hover:text-blue-950 transition-colors cursor-pointer disabled:text-blue-950/50 disabled:cursor-not-allowed"
              >
                Yeniden Gönder
              </button>
            </Show>
          </div>

          <AuthFooter>
            <span class="text-sm font-normal text-slate-500">
              Ya da geri dön.{" "}
            </span>
            <a
              href={dynamicLoginRoute}
              class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors"
            >
              Giriş sayfası
            </a>
          </AuthFooter>
        </div>
      </form>
    </div>
  );
};

export default Verify;
