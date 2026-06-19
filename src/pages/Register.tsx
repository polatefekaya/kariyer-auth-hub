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
import { AccMapByType, type AccountType } from "../types/account";
import type { ValidationStatus } from "../types/validation";
import { theme } from "../stores/theme";
import { computePasswordRules } from "../utils/passwordValidation";
import { resetTurnstile } from "../utils/turnstile";
import { saveAuthRedirect, getAuthRedirect } from "../utils/sessionRedirect";
import { useAccountType } from "../hooks/useAccountType";
import { trackAuthStep, trackAuthError } from '../utils/authFunnel';
import { t } from '../i18n';

const CustomCheckbox: Component<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  linkText: string;
  afterText: string;
  href: string;
  disabled?: boolean;
  secondLinkText?: string;
  secondHref?: string;
}> = (props) => (
  <label class="flex items-start gap-2.5 cursor-pointer font-sans text-xs sm:text-sm leading-relaxed text-muted-foreground">
    <div class="relative flex items-center pt-0.5 shrink-0">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        disabled={props.disabled}
        class="peer sr-only"
      />
      <div class="w-4 h-4 sm:w-5 sm:h-5 border-[1.5px] border-primary rounded-sm bg-background transition-all duration-200 flex items-center justify-center peer-checked:bg-primary peer-checked:border-primary peer-hover:border-primary/80 peer-disabled:opacity-60 peer-disabled:cursor-not-allowed">
        <svg
          class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary-foreground opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
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
        class="text-primary underline font-medium hover:text-primary/80 hover:no-underline transition-colors duration-200"
      >
        {props.linkText}
      </a>
      <Show when={props.secondLinkText && props.secondHref}>
        {t('register.and')}
        <a
          href={props.secondHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          class="text-primary underline font-medium hover:text-primary/80 hover:no-underline transition-colors duration-200"
        >
          {props.secondLinkText}
        </a>
      </Show>
      {props.afterText}
    </span>
  </label>
);

const Register: Component = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { resolvedType, currentTypeParam } = useAccountType("employee");

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
      acikRizaAccepted: false,
      sozlesmeAccepted: false,
      ticariIletiAccepted: false,
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

  // Post-auth we send the user to onboarding, but that URL must carry the deferred
  // "apply-on-register" intent (kz_apply) from the original redirect_to. The web app's
  // PendingApplicationOrchestrator replays it primarily from localStorage, which is
  // PER-ORIGIN and is lost whenever the landing origin (VITE_WEB_APP_URL, e.g. www) differs
  // from where the user browsed jobs (e.g. apex) — so the URL param is the origin-independent
  // channel. Without this, a registered applicant lands on a bare /onboarding URL with no
  // intent on it and nothing ever auto-applies.
  const buildOnboardingUrl = (accountType: string): string => {
    const url = new URL(`${WEB_APP_URL}/onboarding/${accountType}`);
    const original = getAuthRedirect();
    if (original) {
      try {
        const applyIntent = new URL(original).searchParams.get("kz_apply");
        if (applyIntent) url.searchParams.set("kz_apply", applyIntent);
      } catch {
        /* original wasn't an absolute URL — nothing to carry */
      }
    }
    return url.toString();
  };

  onMount(() => {
    trackAuthStep('registration', 'page_view', { account_type: resolvedType() || 'employee' });

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
      } catch (err) {}
      setSearchParams({ error: undefined, error_description: undefined }, { replace: true });
    }
  });

  createEffect(() => {
    const type = resolvedType();
    if (type === "admin" || type === "community") {
      console.warn(`[Security] Blocked public registration attempt for type: ${type}`);
      navigate(`/login?type=${AccMapByType[type]}&error=${encodeURIComponent(t('register.blockedTitle'))}&error_description=${encodeURIComponent(t('register.blockedDesc'))}`, { replace: true });
      return;
    }
    setState("payload", "accountType", type ?? "employee");
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
      setState("messages", "email", t('register.emailInvalid'));
      return;
    }

    setState("status", "email", "checking");
    setState("messages", "email", t('register.emailChecking'));

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/register_valid/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, type: state.payload.accountType }),
          signal: controller.signal,
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && !result.data.has_duplicates) {
            setState("status", "email", "available");
            setState("messages", "email", t('register.emailValid'));
          } else {
            setState("status", "email", "taken");
            setState("messages", "email", t('register.emailTaken'));
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setState("status", "email", "error");
        setState("messages", "email", t('register.emailConnError'));
      }
    }, 500);

    // onCleanup cancels both the pending timeout and any in-flight request
    onCleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
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
      setState("messages", "phone", t('register.phoneError'));
      return;
    }

    setState("status", "phone", "available");
    setState("messages", "phone", "");
  });

  const validFirstName = createMemo<ValidationStatus>(() => {
    if (!state.payload.firstName) return "idle";
    return state.payload.firstName.trim().length >= 2 ? "valid" : "invalid";
  });

  const validLastName = createMemo<ValidationStatus>(() => {
    if (!state.payload.lastName) return "idle";
    return state.payload.lastName.trim().length >= 2 ? "valid" : "invalid";
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

  const passwordRules = createMemo<PasswordRules>(() =>
    computePasswordRules(state.payload.password)
  );

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
    if (state.payload.accountType === "employee" && !state.payload.acikRizaAccepted) return true;
    if (!state.payload.sozlesmeAccepted) return true;

    if (turnstileSiteKey && !state.payload.cfToken) return true;
    return false;
  });

  const handleRegister = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    trackAuthStep('registration', 'submit', { email: state.payload.email, account_type: state.payload.accountType });

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
          ticari_elektronik_ileti_accepted: state.payload.ticariIletiAccepted,
          ...(state.payload.accountType === "employee"
            ? {
                kvkk_aydinlatma_accepted: state.payload.kvkkAccepted,
                acik_riza_accepted: state.payload.acikRizaAccepted,
                kullanici_sozlesmesi_accepted: state.payload.sozlesmeAccepted,
              }
            : {
                kvkk_isveren_accepted: state.payload.kvkkAccepted,
                isveren_sozlesmesi_accepted: state.payload.sozlesmeAccepted,
              }),
        },
        captchaToken: state.payload.cfToken || undefined,
      },
    });

    if (authError) {
      let errorMessage = t('register.errGeneric');
      const errStr = authError.message.toLowerCase();

      if (errStr.includes("already registered") || errStr.includes("already exists")) {
        errorMessage = t('register.errAlreadyRegistered');
      } else if (errStr.includes("rate limit")) {
        errorMessage = t('register.errRateLimit');
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? t('register.errSecurityWait', { count: match[1] })
          : t('register.errSecurityWaitShort');
      } else {
        errorMessage = authError.message;
      }

      trackAuthError('registration', 'submit', errorMessage, { email: state.payload.email });
      setState("errors", "global", errorMessage);
      setState("payload", "cfToken", null);
      resetTurnstile();
    } else if (data.user?.identities?.length === 0) {
      const duplicateError = t('register.errDuplicate');
      trackAuthError('registration', 'submit', duplicateError, { email: state.payload.email });
      setState("errors", "global", duplicateError);
      setState("payload", "cfToken", null);
      resetTurnstile();
    } else {
      trackAuthStep('registration', 'email_sent', { email: state.payload.email });
      // Read the original redirect (still saved from onMount) and carry its apply intent
      // onto the onboarding URL BEFORE overwriting the saved redirect with it.
      const onboardingUrl = buildOnboardingUrl(state.payload.accountType);
      saveAuthRedirect(onboardingUrl);
      navigate(`/verify?email=${encodeURIComponent(cleanEmail)}`, {
        replace: true,
      });
    }

    setState("isSubmitting", false);
  };

  const dynamicLoginRoute = () => `/login${currentTypeParam()}`;
  const headerText = createMemo(() => AuthHeaderTexts.register(state.payload.accountType));

  return (
    <div class="flex flex-col bg-transparent rounded-3xl w-full max-w-2xl sm:pt-16 py-16 sm:py-0 items-center justify-center">
      <AuthHeader
        title={headerText().title}
        description={headerText().description}
        class="mb-8 sm:mb-12"
        accountType={AccMapByType[state.payload.accountType]}
      />
      <ErrorAlert message={state.errors.global} />

      <form onSubmit={handleRegister} class="mt-8">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">

          {/* Left: input fields */}
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <TextInput
                label={t('register.firstName')}
                type="text"
                maxLength={50}
                value={state.payload.firstName}
                onInput={(e) => setState("payload", "firstName", e.currentTarget.value)}
                validationState={validFirstName() as "idle" | "valid" | "invalid"}
                error={t('register.firstNameError')}
                disabled={state.isSubmitting}
              />
              <TextInput
                label={t('register.lastName')}
                type="text"
                maxLength={50}
                value={state.payload.lastName}
                onInput={(e) => setState("payload", "lastName", e.currentTarget.value)}
                validationState={validLastName() as "idle" | "valid" | "invalid"}
                error={t('register.lastNameError')}
                disabled={state.isSubmitting}
              />
            </div>

            <TextInput
              label={t('register.phone')}
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
              label={t('register.emailLabel')}
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
                label={t('register.passwordLabel')}
                type="password"
                maxLength={128}
                value={state.payload.password}
                onInput={(e) => setState("payload", "password", e.currentTarget.value)}
                validationState={validPassword() as "idle" | "valid" | "invalid"}
                error={t('register.passwordError')}
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
              label={t('register.confirmPassword')}
              type="password"
              maxLength={128}
              value={state.payload.confirmPassword}
              onInput={(e) => setState("payload", "confirmPassword", e.currentTarget.value)}
              validationState={validConfirmPassword()}
              error={t('register.confirmError')}
              disabled={state.isSubmitting}
              autocomplete="off"
            />
          </div>

          {/* Right: agreements + submit */}
          <div class="flex flex-col gap-5 pt-6 md:pt-0 border-t border-border md:border-t-0">
            <Show
              when={state.payload.accountType === "employee"}
              fallback={
                <>
                  <CustomCheckbox
                    checked={state.payload.kvkkAccepted}
                    onChange={(val) => setState("payload", "kvkkAccepted", val)}
                    disabled={state.isSubmitting}
                    label="İşveren KVKK"
                    linkText={t('register.isverenKvkkLink')}
                    afterText={t('register.consentAfter')}
                    href={`${WEB_APP_URL}/kvkk-isveren`}
                  />
                  <CustomCheckbox
                    checked={state.payload.ticariIletiAccepted}
                    onChange={(val) => setState("payload", "ticariIletiAccepted", val)}
                    disabled={state.isSubmitting}
                    label="Elektronik İleti"
                    linkText={t('register.elektronikIletiLink')}
                    afterText={t('register.ticariAfter')}
                    href={`${WEB_APP_URL}/acik-riza-isveren`}
                  />
                  <CustomCheckbox
                    checked={state.payload.sozlesmeAccepted}
                    onChange={(val) => setState("payload", "sozlesmeAccepted", val)}
                    disabled={state.isSubmitting}
                    label="İşveren Sözleşmesi"
                    linkText={t('register.isverenSozlesmeLink')}
                    afterText={t('register.consentAfter')}
                    href={`${WEB_APP_URL}/isveren-sozlesmesi`}
                  />
                </>
              }
            >
              <CustomCheckbox
                checked={state.payload.kvkkAccepted}
                onChange={(val) => {
                  setState("payload", "kvkkAccepted", val);
                  setState("payload", "acikRizaAccepted", val);
                }}
                disabled={state.isSubmitting}
                label="KVKK ve Açık Rıza"
                linkText={t('register.kvkkLink')}
                secondLinkText={t('register.acikRizaLink')}
                secondHref={`${WEB_APP_URL}/acik-riza`}
                afterText={t('register.consentAfter')}
                href={`${WEB_APP_URL}/kvkk-aydinlatma`}
              />
              <CustomCheckbox
                checked={state.payload.ticariIletiAccepted}
                onChange={(val) => setState("payload", "ticariIletiAccepted", val)}
                disabled={state.isSubmitting}
                label="Ticari İleti"
                linkText={t('register.ticariLink')}
                afterText={t('register.ticariAfter')}
                href={`${WEB_APP_URL}/elektronik-ileti-onayi`}
              />
              <CustomCheckbox
                checked={state.payload.sozlesmeAccepted}
                onChange={(val) => setState("payload", "sozlesmeAccepted", val)}
                disabled={state.isSubmitting}
                label="Kullanıcı Sözleşmesi"
                linkText={t('register.sozlesmeLink')}
                afterText={t('register.consentAfter')}
                href={`${WEB_APP_URL}/kullanici-sozlesmesi`}
              />
            </Show>

            <Show when={turnstileSiteKey}>
              <div class="py-1 flex justify-center">
                <Turnstile
                  siteKey={turnstileSiteKey}
                  theme={theme()}
                  size="flexible"
                  appearance="interaction-only"
                  onVerify={(token) => setState("payload", "cfToken", token)}
                  onError={() => setState("errors", "global", t('register.turnstileFailed'))}
                />
              </div>
            </Show>

            <SubmitButton type="submit" loading={state.isSubmitting} disabled={isSubmitDisabled()}>
              {t('register.submit')}
            </SubmitButton>

            <Show when={state.payload.accountType === "employee"}>
              <OAuthProviders
                actionText="Sign Up"
                onError={(msg) => setState("errors", "global", msg)}
                redirectTo={buildOnboardingUrl(state.payload.accountType)}
              />
              <div class="text-[10px] sm:text-xs text-center text-muted-foreground mt-1 px-2 leading-tight">
                {t('register.socialConsent')}
              </div>
            </Show>

            <AuthFooter>
              <span class="text-sm font-normal text-foreground/60">{t('register.hasAccount')} </span>
              <a
                href={dynamicLoginRoute()}
                class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                {t('register.loginLink')}
              </a>
            </AuthFooter>
          </div>

        </div>
      </form>
    </div>
  );
};

export default Register;
