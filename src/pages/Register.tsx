import {
  type Component,
  createMemo,
  onMount,
  Show,
  createEffect,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { zxcvbn } from "@zxcvbn-ts/core";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { AuthFooter } from "../components/layout/AuthFooter";
import { TextInput } from "../components/ui/TextInput";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import { AuthHeaderTexts } from "../constants/authTexts";
import {
  PasswordStrength,
  type PasswordRules,
} from "../components/ui/PasswordStrength";
import { OAuthProviders } from "../components/ui/OAuthProviders";
import {
  AccMapById,
  AccMapByType,
  type AccountType,
  type AccountTypeId,
} from "../types/account";
import type { ValidationStatus } from "../types/validation";

const CustomCheckbox: Component<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  linkText: string;
  afterText: string;
  href: string;
  disabled?: boolean;
}> = (props) => (
  <label class="flex items-start gap-1.5 sm:gap-2 cursor-pointer font-sans text-[10px] sm:text-xs leading-tight text-slate-600">
    <div class="relative flex items-center pt-0.5 shrink-0">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        disabled={props.disabled}
        class="peer sr-only"
      />
      <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 border-[1.5px] border-blue-900 rounded-sm bg-white transition-all duration-200 flex items-center justify-center peer-checked:bg-blue-900 peer-checked:border-blue-900 peer-hover:border-blue-700 peer-disabled:opacity-60 peer-disabled:cursor-not-allowed">
        <svg
          class="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
    <span class="flex-1">
      <a
        href={props.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        class="text-blue-900 underline font-medium hover:text-blue-700 hover:no-underline transition-colors duration-200"
      >
        {props.linkText}
      </a>
      {props.afterText}
    </span>
  </label>
);

const Register: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = createStore({
    payload: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      cfToken: null as string | null,
      accountType: "employee" as AccountType,
      referralCode: "",
      kvkkAccepted: false,
      userAgreementAccepted: false,
      commercialConsentAccepted: false,
    },
    status: {
      email: "idle" as ValidationStatus,
      phone: "idle" as ValidationStatus,
    },
    messages: {
      email: "",
      phone: "",
    },
    errors: { global: null as string | null },
    isSubmitting: false,
  });

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const API_BASE_URL = import.meta.env.VITE_API_URL;
  const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || window.location.origin;

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
      } catch (err) {}
      setSearchParams({ error: undefined, error_description: undefined }, { replace: true });
    }
  });

  const passwordsMatch = createMemo(() => {
    return (
      state.payload.password.length > 0 &&
      state.payload.password === state.payload.confirmPassword
    );
  });

  const validConfirmPassword = createMemo<ValidationStatus>(() => {
    if (!state.payload.confirmPassword) return "idle";
    return passwordsMatch() ? "valid" : "invalid";
  });

  createEffect(() => {
    const rawType = searchParams.type;
    const typeParam = Array.isArray(rawType) ? rawType[0] : rawType;

    const resolvedType = typeParam
      ? AccMapById[typeParam as AccountTypeId] ||
        (typeParam in AccMapByType ? typeParam : "employee")
      : "employee";

    if (resolvedType === "admin" || resolvedType === "community") {
      console.warn(`[Security] Blocked public registration attempt for type: ${resolvedType}`);
      navigate(`/login?type=${AccMapByType[resolvedType]}&error=İşlem Reddedildi&error_description=Yönetici kaydı buradan yapılamaz.`, { replace: true });
      return;
    }

    setState("payload", "accountType", resolvedType as AccountType);
  });

  createEffect(() => {
    const email = state.payload.email.trim();
    if (!email) {
      setState("status", "email", "idle");
      setState("messages", "email", "");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setState("status", "email", "invalid");
      setState("messages", "email", "Geçerli bir e-posta adresi giriniz");
      return;
    }

    setState("status", "email", "checking");
    setState("messages", "email", "Kontrol ediliyor...");

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/register_valid/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            type: state.payload.accountType,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && !result.data.has_duplicates) {
            setState("status", "email", "available");
            setState("messages", "email", "E-posta kullanılabilir");
          } else {
            setState("status", "email", "taken");
            setState("messages", "email", "Bu e-posta adresi zaten kullanımda");
          }
        }
      } catch (err) {
        setState("status", "email", "error");
        setState("messages", "email", "Bağlantı hatası, tekrar deneyin");
      }
    }, 500);

    onCleanup(() => clearTimeout(timer));
  });

  createEffect(() => {
    const phone = state.payload.phone;
    if (!phone) {
      setState("status", "phone", "idle");
      setState("messages", "phone", "");
      return;
    }

    const phoneRegex = /^5\d{9}$/;
    if (!phoneRegex.test(phone)) {
      setState("status", "phone", "invalid");
      setState("messages", "phone", "10 haneli olmalıdır (5XXXXXXXXX)");
      return;
    }

  });

  const validFirstName = createMemo<ValidationStatus>(() => {
    if (!state.payload.firstName) return "idle";
    return state.payload.firstName.trim().length >= 2 ? "valid" : "invalid";
  });

  const validLastName = createMemo<ValidationStatus>(() => {
    if (!state.payload.lastName) return "idle";
    return state.payload.lastName.trim().length >= 2 ? "valid" : "invalid";
  });

  const passwordRules = createMemo<PasswordRules>(() => {
    const p = state.payload.password;
    const score = p ? zxcvbn(p).score : 0;

    return {
      hasLength: p.length >= 8 && p.length <= 128,
      hasUpper: /[A-Z]/.test(p),
      hasNumber: /[0-9]/.test(p),
      hasSpecial: /[^A-Za-z0-9]/.test(p),
      hasScore: score >= 3,
      isAllValid:
        p.length >= 8 &&
        p.length <= 128 &&
        /[A-Z]/.test(p) &&
        /[0-9]/.test(p) &&
        /[^A-Za-z0-9]/.test(p) &&
        score >= 3,
    };
  });

  const validPassword = createMemo<ValidationStatus>(() => {
    if (!state.payload.password) return "idle";
    return passwordRules().isAllValid ? "valid" : "invalid";
  });

  const isSubmitDisabled = createMemo(() => {
    if (state.isSubmitting) return true;
    if (validFirstName() !== "valid") return true;
    if (validLastName() !== "valid") return true;
    if (validPassword() !== "valid") return true;
    if (!passwordsMatch()) return true;

    if (state.status.email !== "available") return true;
    if (state.status.phone !== "available") return true;

    if (!state.payload.kvkkAccepted) return true;
    if (!state.payload.userAgreementAccepted) return true;

    if (turnstileSiteKey && !state.payload.cfToken) return true;
    return false;
  });

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    setState("isSubmitting", true);
    setState("errors", "global", null);

    const cleanEmail = state.payload.email.trim().toLowerCase();
    const cleanFirstName = state.payload.firstName.trim();
    const cleanLastName = state.payload.lastName.trim();

    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: state.payload.password,
      options: {
        data: {
          first_name: cleanFirstName,
          last_name: cleanLastName,
          phone_number: state.payload.phone,
          account_type: state.payload.accountType,
          referral_code: state.payload.referralCode.trim().toUpperCase(),
          kvkk_accepted: state.payload.kvkkAccepted,
          user_agreement_accepted: state.payload.userAgreementAccepted,
          commercial_consent_accepted: state.payload.commercialConsentAccepted,
        },
        captchaToken: state.payload.cfToken || undefined,
      },
    });

    if (authError) {
      let errorMessage = "Bir hata oluştu. Lütfen tekrar deneyin.";
      const errStr = authError.message.toLowerCase();

      if (errStr.includes("already registered") || errStr.includes("already exists")) {
        errorMessage = "Bu e-posta adresi ile zaten bir hesap oluşturulmuş. Lütfen giriş yapın.";
      } else if (errStr.includes("rate limit")) {
        errorMessage = "Çok fazla deneme yaptınız. Lütfen biraz bekleyip tekrar deneyin.";
      } else {
        errorMessage = authError.message;
      }

      setState("errors", "global", errorMessage);
      setState("payload", "cfToken", null);
      if (typeof window !== "undefined" && window.turnstile) {
        window.turnstile.reset();
      }
    } else if (data.user?.identities?.length === 0) {
      setState("errors", "global", "Bu hesap zaten kullanımda. Lütfen giriş yapmayı deneyin.");
      setState("payload", "cfToken", null);
      if (typeof window !== "undefined" && window.turnstile) {
        window.turnstile.reset();
      }
    } else {
      const onboardingUrl = `${WEB_APP_URL}/onboarding/${state.payload.accountType}`;
      sessionStorage.setItem("kariyer_auth_redirect", onboardingUrl);
      navigate(`/verify?email=${encodeURIComponent(cleanEmail)}`, {
        replace: true,
      });
    }

    setState("isSubmitting", false);
  };

  const currentTypeParams = () => `?type=${AccMapByType[state.payload.accountType]}`;
  const dynamicLoginRoute = () => `/login${currentTypeParams()}`;
  const headerText = createMemo(() => AuthHeaderTexts.register(state.payload.accountType));

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={headerText().title}
        description={headerText().description}
        class="mb-12"
        accountType={AccMapByType[state.payload.accountType]}
      />
      <ErrorAlert message={state.errors.global} />

      <form onSubmit={handleRegister} class="space-y-3 mt-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextInput
            label="Adınız"
            type="text"
            maxLength={50}
            value={state.payload.firstName}
            onInput={(e) => setState("payload", "firstName", e.currentTarget.value)}
            validationState={validFirstName() as "idle" | "valid" | "invalid"}
            error="Zorunlu (Minimum 2 karakter)"
            disabled={state.isSubmitting}
          />
          <TextInput
            label="Soyadınız"
            type="text"
            maxLength={50}
            value={state.payload.lastName}
            onInput={(e) => setState("payload", "lastName", e.currentTarget.value)}
            validationState={validLastName() as "idle" | "valid" | "invalid"}
            error="Zorunlu (Minimum 2 karakter)"
            disabled={state.isSubmitting}
          />
        </div>

        <TextInput
          label="Telefon Numarası"
          type="tel"
          maxLength={15}
          inputMode="numeric"
          pattern="[0-9]*"
          value={state.payload.phone}
          onInput={(e) => {
            let cleanVal = e.currentTarget.value.replace(/\D/g, "");
            if (cleanVal.startsWith("90")) cleanVal = cleanVal.substring(2);
            if (cleanVal.startsWith("0")) cleanVal = cleanVal.substring(1);
            cleanVal = cleanVal.substring(0, 10);

            setState("payload", "phone", cleanVal);
            e.currentTarget.value = cleanVal;
          }}
          validationState={
            state.status.phone === "available"
              ? "valid"
              : state.status.phone === "taken" ||
                state.status.phone === "invalid" ||
                state.status.phone === "error"
              ? "invalid"
              : "idle"
          }
          error={state.messages.phone}
          disabled={state.isSubmitting}
        />

        <TextInput
          label="E-Posta Adresi"
          type="email"
          maxLength={255}
          value={state.payload.email}
          onInput={(e) => setState("payload", "email", e.currentTarget.value)}
          validationState={
            state.status.email === "available"
              ? "valid"
              : state.status.email === "taken" ||
                state.status.email === "invalid" ||
                state.status.email === "error"
              ? "invalid"
              : "idle"
          }
          error={state.messages.email}
          disabled={state.isSubmitting}
          autocomplete="off"
          readOnly
          onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
        />

        <div class="flex flex-col gap-2">
          <TextInput
            label="Şifre"
            type="password"
            maxLength={128}
            value={state.payload.password}
            onInput={(e) => setState("payload", "password", e.currentTarget.value)}
            validationState={validPassword() as "idle" | "valid" | "invalid"}
            error="Güvenlik kriterlerine uymuyor"
            disabled={state.isSubmitting}
            autocomplete="off"
            readOnly
            onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
          />
          <Show when={state.payload.password.length > 0}>
            <PasswordStrength password={state.payload.password} rules={passwordRules()} />
          </Show>
        </div>

        <TextInput
          label="Şifre Tekrar"
          type="password"
          maxLength={128}
          value={state.payload.confirmPassword}
          onInput={(e) => setState("payload", "confirmPassword", e.currentTarget.value)}
          validationState={validConfirmPassword()}
          error="Şifreler eşleşmiyor"
          disabled={state.isSubmitting}
          autocomplete="off"
        />

        <div class="flex flex-col gap-3 py-2 mt-2 border-t border-slate-100">
          <CustomCheckbox
            checked={state.payload.kvkkAccepted}
            onChange={(val) => setState("payload", "kvkkAccepted", val)}
            disabled={state.isSubmitting}
            label="KVKK"
            linkText="KVKK Aydınlatma Metni ve Açık Rıza Metni"
            afterText="'ni okudum ve kabul ediyorum. *"
            href={`${WEB_APP_URL}/gizlilik-politikasi`}
          />
          <CustomCheckbox
            checked={state.payload.commercialConsentAccepted}
            onChange={(val) => setState("payload", "commercialConsentAccepted", val)}
            disabled={state.isSubmitting}
            label="Ticari"
            linkText="Ticari elektronik ileti aydınlatma metni"
            afterText=" kapsamında tarafıma iletişim kurulmasını onaylıyorum."
            href={`${WEB_APP_URL}/iletisim`}
          />
          <CustomCheckbox
            checked={state.payload.userAgreementAccepted}
            onChange={(val) => setState("payload", "userAgreementAccepted", val)}
            disabled={state.isSubmitting}
            label="Kullanıcı Sözleşmesi"
            linkText="Kullanıcı Sözleşmesi"
            afterText="'ni okudum ve kabul ediyorum. *"
            href={`${WEB_APP_URL}/kullanim-sartlari`}
          />
        </div>

        <Show when={turnstileSiteKey}>
          <div class="py-2 flex justify-center">
            <Turnstile
              siteKey={turnstileSiteKey}
              theme="light"
              size="flexible"
              appearance="interaction-only"
              onVerify={(token) => setState("payload", "cfToken", token)}
              onError={() => setState("errors", "global", "Güvenlik doğrulama başarısız oldu.")}
            />
          </div>
        </Show>

        <SubmitButton type="submit" loading={state.isSubmitting} disabled={isSubmitDisabled()}>
          Kayıt Ol
        </SubmitButton>

        <Show when={state.payload.accountType === "employee"}>
          <OAuthProviders
            actionText="Sign Up"
            onError={(msg) => setState("errors", "global", msg)}
            redirectTo={`${WEB_APP_URL}/onboarding/${state.payload.accountType}`}
          />
          <div class="text-[10px] sm:text-xs text-center text-slate-400 mb-2 mt-3 px-2 leading-tight">
            Sosyal hesapla kayıt olarak Kullanıcı Sözleşmesi ve KVKK metinlerini kabul etmiş sayılırsınız.
          </div>
        </Show>

        <AuthFooter>
          <span class="text-sm font-normal text-blue-950/60">Zaten bir hesabın var mı? </span>
          <a
            href={dynamicLoginRoute()}
            class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors"
          >
            Giriş yap
          </a>
        </AuthFooter>
      </form>
    </div>
  );
};

export default Register;