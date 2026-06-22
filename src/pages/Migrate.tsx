import { type Component, createMemo, onMount, Show, For } from "solid-js";
import { createStore } from "solid-js/store";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { supabase } from "../lib/supabase";
import { AuthHeader } from "../components/layout/AuthHeader";
import { AuthFooter } from "../components/layout/AuthFooter";
import { TextInput } from "../components/ui/TextInput";
import { SubmitButton } from "../components/ui/SubmitButton";
import { ErrorAlert } from "../components/ui/ErrorAlert";
import { Turnstile } from "../components/Turnstile";
import {
  PasswordStrength,
  type PasswordRules,
} from "../components/ui/PasswordStrength";
import { AuthHeaderTexts } from "../constants/authTexts";
import {
  AccMapById,
  AccMapByType,
  type AccountType,
  type AccountTypeId,
} from "../types/account";
import type { ValidationStatus } from "../types/validation";
import { theme } from "../stores/theme";
import { computePasswordRules } from "../utils/passwordValidation";
import { resetTurnstile } from "../utils/turnstile";
import { trackAuthStep, trackAuthError } from '../utils/authFunnel';
import { t } from '../i18n';

const AccountSelectButton: Component<{
  title: string;
  description: string;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    class="w-full p-4 bg-card border border-border rounded-xl hover:border-primary transition-all text-left group flex items-center justify-between"
  >
    <div>
      <div class="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
        {props.title}
      </div>
      <div class="text-xs text-foreground/50 mt-0.5">
        {props.description}
      </div>
    </div>
    <svg class="w-5 h-5 text-muted-foreground/50 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

const getAccountDisplayInfo = (role: string) => {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole === "company" || normalizedRole === "b" || normalizedRole === "employer") {
    return { title: t('migrate.companyTitle'), description: t('migrate.companyDesc') };
  }
  if (normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "moderator" || normalizedRole === "a") {
    return { title: t('migrate.adminTitle'), description: t('migrate.adminDesc') };
  }
  if (normalizedRole === "community" || normalizedRole === "co") {
    return { title: t('migrate.communityTitle'), description: t('migrate.communityDesc') };
  }
  return { title: t('migrate.candidateTitle'), description: t('migrate.candidateDesc') };
};

const Migrate: Component = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [state, setState] = createStore({
    payload: {
      email: "",
      password: "",
      confirmPassword: "",
      cfToken: null as string | null,
      accountType: null as AccountType | null,
    },
    errors: { email: "", confirmPassword: "", global: null as string | null },
    ui: {
      step: 1,
      isSubmitting: false,
      isFetchingType: false,
      hasCollision: false,
      availableAccounts: [] as string[],
    },
  });

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const apiUrl =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

  onMount(async () => {
    let currentEmail = "";

    const rawEmailParam = searchParams.email;
    const emailParam = Array.isArray(rawEmailParam)
      ? rawEmailParam[0]
      : rawEmailParam;

    if (emailParam) {
      try {
        currentEmail = decodeURIComponent(emailParam).trim().toLowerCase();
        setState("payload", "email", currentEmail);
      } catch (err) {
        console.warn("[Migrate] Malformed email parameter.");
      }
    }

    trackAuthStep('migration', 'page_view', { email: currentEmail });

    const rawConflictParam = searchParams.conflict;
    const conflictParam = Array.isArray(rawConflictParam)
      ? rawConflictParam[0]
      : rawConflictParam;

    const rawTypeParam = searchParams.type;
    const typeParam = Array.isArray(rawTypeParam)
      ? rawTypeParam[0]
      : rawTypeParam;

    if (typeParam && conflictParam !== "true") {
      const resolvedType =
        AccMapById[typeParam as AccountTypeId] ||
        (typeParam in AccMapByType ? typeParam : null);

      if (resolvedType) {
        setState("payload", "accountType", resolvedType as AccountType);
        setState("ui", "step", 2);
        return;
      }
    }

    if (currentEmail) {
      try {
        setState("ui", "isFetchingType", true);
        const res = await fetch(`${apiUrl}/migration/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: currentEmail }),
        });

        if (res.ok) {
          const data = await res.json();
          const accounts = data.data;

          if (data.success && Array.isArray(accounts)) {
            const pendingAccounts = accounts
                .filter((acc: any) => !acc.is_migrated)
                .map((acc: any) => acc.role);

            setState("ui", "availableAccounts", pendingAccounts);

            if (pendingAccounts.length > 1 || conflictParam === "true") {
              setState("ui", "hasCollision", true);
              setState("ui", "step", 1);
            } else if (pendingAccounts.length === 1) {
              const accType = pendingAccounts[0] as AccountType;
              setState("payload", "accountType", accType);
              setState("ui", "step", 2);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch strict account type.", e);
      } finally {
        setState("ui", "isFetchingType", false);
      }
    }
  });

  const passwordsMatch = createMemo(() => {
    const p = state.payload.password;
    const cp = state.payload.confirmPassword;
    return p.length > 0 && p === cp;
  });

  const validConfirmPassword = createMemo<ValidationStatus>(() => {
    if (!state.payload.confirmPassword) return "idle";
    return passwordsMatch() ? "valid" : "invalid";
  });

  const validEmail = createMemo<ValidationStatus>(() => {
    if (!state.payload.email) return "idle";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(state.payload.email.trim()) ? "valid" : "invalid";
  });

  const passwordRules = createMemo<PasswordRules>(() =>
    computePasswordRules(state.payload.password)
  );

  const validPassword = createMemo<ValidationStatus>(() => {
    if (!state.payload.password) return "idle";
    return passwordRules().isAllValid ? "valid" : "invalid";
  });

  const isSubmitDisabled = createMemo(() => {
    if (state.ui.isSubmitting || state.ui.isFetchingType) return true;
    if (state.ui.step === 2 && !state.payload.accountType) return true;
    if (validEmail() !== "valid" || validPassword() !== "valid") return true;
    if (!passwordsMatch()) return true;
    if (turnstileSiteKey && !state.payload.cfToken) return true;
    return false;
  });

  const handleAccountSelect = (type: string) => {
    trackAuthStep('migration', 'select_account', { account_type: type });
    setState("payload", "accountType", type as AccountType);
    setState("ui", "step", 2);
    setState("errors", "global", null);
  };

  const handleBack = () => {
    if (state.ui.step === 2 && state.ui.hasCollision) {
      setState("ui", "step", 1);
      setState("payload", "accountType", null);
      setState("payload", "password", "");
      setState("payload", "confirmPassword", "");
    } else {
      navigate("/login");
    }
  };

  const handleMigrate = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    trackAuthStep('migration', 'submit', { email: state.payload.email ?? '', account_type: state.payload.accountType ?? '' });

    setState("ui", "isSubmitting", true);
    setState("errors", "global", null);

    const cleanEmail = state.payload.email.trim().toLowerCase();

    const { data, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: state.payload.password,
      options: {
        data: {
          account_type: state.payload.accountType,
          is_migration: true,
        },
        captchaToken: state.payload.cfToken || undefined,
      },
    });

    if (authError) {
      let errorMessage = t('migrate.errGeneric');
      const errStr = authError.message.toLowerCase();

      if (
        errStr.includes("already registered") ||
        errStr.includes("already exists")
      ) {
        errorMessage = t('migrate.errAlreadyMigrated');
      } else if (errStr.includes("rate limit")) {
        errorMessage = t('migrate.errRateLimit');
      } else if (errStr.includes("security purposes")) {
        const match = errStr.match(/after (\d+) second/);
        errorMessage = match?.[1]
          ? t('migrate.errSecurityWait', { count: match[1] })
          : t('migrate.errSecurityWaitShort');
      } else if (errStr.includes("password")) {
        errorMessage = t('migrate.errWeakPassword');
      } else {
        errorMessage = authError.message;
      }

      trackAuthError('migration', 'submit', errorMessage);
      setState("errors", "global", errorMessage);
      setState("payload", "cfToken", null);
      resetTurnstile();
    } else {
      trackAuthStep('migration', 'submitted_verify', { email: cleanEmail });
      navigate(`/verify?email=${encodeURIComponent(cleanEmail)}`, {
        replace: true,
      });
    }

    setState("ui", "isSubmitting", false);
  };

  const dynamicRegisterRoute = () => {
    const type = state.payload.accountType;
    return type ? `/register?type=${AccMapByType[type]}` : "/register";
  };

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm relative">
      <button
        type="button"
        onClick={handleBack}
        class="absolute -top-12 left-0 flex items-center text-sm font-semibold text-foreground/60 hover:text-primary transition-colors"
      >
        <svg
          class="w-4 h-4 mr-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        {t('migrate.back')}
      </button>

      <AuthHeader
        title={AuthHeaderTexts.migrate().title}
        description={AuthHeaderTexts.migrate().description}
        class="mb-12"
        accountType={AccMapByType[state.payload.accountType!]}
      />
      <ErrorAlert message={state.errors.global} />

      <Show when={state.ui.step === 1 && state.ui.hasCollision}>
        <div class="animate-in fade-in slide-in-from-right-4 duration-300">
          <div class="mb-8 p-4 bg-warning/[0.1] rounded-xl text-foreground text-sm">
            <div class="flex items-start gap-3">
              <svg
                class="w-5 h-5 text-warning mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p class="font-bold mb-1">{t('migrate.conflictTitle')}</p>
                <p class="opacity-90">
                  {t('migrate.conflictDesc')}
                </p>
              </div>
            </div>
          </div>

          <h3 class="text-sm font-semibold text-foreground mb-3 px-1">
            {t('migrate.chooseAccount')}
          </h3>

          <div class="flex flex-col gap-3">
            <Show
              when={state.ui.availableAccounts.length > 0}
              fallback={<div class="p-4 text-center text-sm text-muted-foreground animate-pulse">{t('migrate.accountsLoading')}</div>}
            >
              <For each={state.ui.availableAccounts}>
                {(role) => {
                  const displayInfo = getAccountDisplayInfo(role);
                  return (
                    <AccountSelectButton
                      title={displayInfo.title}
                      description={displayInfo.description}
                      onClick={() => handleAccountSelect(role)}
                    />
                  );
                }}
              </For>
            </Show>
          </div>
          <p class="text-xs text-muted-foreground mt-4 text-center">
            {t('migrate.supportNote')}
          </p>
        </div>
      </Show>

      <Show when={state.ui.step === 2 && state.payload.accountType}>
        <form
          onSubmit={handleMigrate}
          class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <div class="mb-4">
            <div class="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm font-semibold text-foreground flex items-center gap-2">
              <Show
                when={!state.ui.isFetchingType}
                fallback={
                  <span class="animate-pulse text-muted-foreground">
                    {t('migrate.verifying')}
                  </span>
                }
              >
                <svg
                  class="w-4 h-4 text-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="3"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {state.payload.accountType ? getAccountDisplayInfo(state.payload.accountType).title : ""}
              </Show>
            </div>
          </div>

          <TextInput
            label={t('migrate.emailLabel')}
            type="email"
            maxLength={255}
            value={state.payload.email}
            onInput={(e) => setState("payload", "email", e.currentTarget.value)}
            validationState={validEmail()}
            error={state.errors.email}
            disabled={true}
          />

          <div class="flex flex-col gap-2">
            <TextInput
              label={t('migrate.passwordLabel')}
              type="password"
              maxLength={128}
              value={state.payload.password}
              onInput={(e) =>
                setState("payload", "password", e.currentTarget.value)
              }
              validationState={validPassword()}
              error={t('migrate.passwordError')}
              disabled={state.ui.isSubmitting || state.ui.isFetchingType}
            />
            <Show when={state.payload.password.length > 0}>
              <PasswordStrength
                password={state.payload.password}
                rules={passwordRules()}
              />
            </Show>
          </div>
          <TextInput
              label={t('migrate.confirmLabel')}
              type="password"
              value={state.payload.confirmPassword}
              onInput={(e) => setState("payload", "confirmPassword", e.currentTarget.value)}
              validationState={validConfirmPassword()}
              error={t('migrate.confirmError')}
              disabled={state.ui.isSubmitting}
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
                  setState(
                    "errors",
                    "global",
                    t('migrate.turnstileFailed'),
                  )
                }
              />
            </div>
          </Show>

          <SubmitButton
            type="submit"
            loading={state.ui.isSubmitting}
            disabled={isSubmitDisabled()}
          >
            {t('migrate.submit')}
          </SubmitButton>
          <Show
            when={state.payload.accountType !== "admin"}
            fallback={
              <AuthFooter>
                <span class="text-sm font-normal text-muted-foreground">
                  {t('migrate.adminNote')}{" "}
                </span>
                <a href="/login?type=a" class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">
                  {t('migrate.adminBack')}
                </a>
              </AuthFooter>
            }
          >
            <AuthFooter>
              <span class="text-sm font-normal text-foreground/60">
                {t('migrate.differentAccount')}{" "}
              </span>
              <a
                href={dynamicRegisterRoute()}
                class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors"
              >
                {t('migrate.register')}
              </a>
            </AuthFooter>
          </Show>
        </form>
      </Show>
    </div>
  );
};

export default Migrate;
