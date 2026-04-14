import { type Component, createMemo, onMount, Show, For } from "solid-js";
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

const AccountSelectButton: Component<{
  title: string;
  description: string;
  onClick: () => void;
}> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    class="w-full p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-900 transition-all text-left group flex items-center justify-between"
  >
    <div>
      <div class="text-sm font-bold text-slate-800 group-hover:text-blue-900 transition-colors">
        {props.title}
      </div>
      <div class="text-xs text-blue-950/50 mt-0.5">
        {props.description}
      </div>
    </div>
    <svg class="w-5 h-5 text-slate-300 group-hover:text-blue-900 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  </button>
);

const getAccountDisplayInfo = (role: string) => {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole === "company" || normalizedRole === "b" || normalizedRole === "employer") {
    return { title: "Kurumsal İşveren", description: "Şirket profilim ile devam et." };
  }
  if (normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "moderator" || normalizedRole === "a") {
    return { title: "Yönetici", description: "Yönetim paneli profilim ile devam et." };
  }
  if (normalizedRole === "community" || normalizedRole === "co") {
    return { title: "Topluluk", description: "Topluluk profilim ile devam et." };
  }
  return { title: "Bireysel Aday", description: "İş arayan profilim ile devam et." };
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
        return; // We don't need to fetch if we have an explicit lock
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
    if (state.ui.isSubmitting || state.ui.isFetchingType) return true;
    if (state.ui.step === 2 && !state.payload.accountType) return true;
    if (validEmail() !== "valid" || validPassword() !== "valid") return true;
    if (!passwordsMatch()) return true;
    if (turnstileSiteKey && !state.payload.cfToken) return true;
    return false;
  });

  const handleAccountSelect = (type: string) => {
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
      let errorMessage = "Bir hata oluştu. Lütfen tekrar deneyin.";
      const errStr = authError.message.toLowerCase();

      if (
        errStr.includes("already registered") ||
        errStr.includes("already exists")
      ) {
        errorMessage =
          "Hesabınız zaten yakın zamanda güncellenmiş. Lütfen giriş yapın.";
      } else if (errStr.includes("rate limit")) {
        errorMessage =
          "Çok fazla deneme yaptınız. Lütfen biraz bekleyip tekrar deneyin.";
      } else if (errStr.includes("password")) {
        errorMessage = "Şifreniz güvenlik kriterlerini karşılamıyor.";
      } else {
        errorMessage = authError.message;
      }

      setState("errors", "global", errorMessage);
      setState("payload", "cfToken", null);

      if (typeof window !== "undefined" && window.turnstile) {
        window.turnstile.reset();
      }
    } else {
      console.log("Migration initiated for:", data.user?.id);
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
        class="absolute -top-12 left-0 flex items-center text-sm font-semibold text-blue-950/60 hover:text-blue-900 transition-colors"
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
        Geri
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
          <div class="mb-8 p-4 bg-amber-50  rounded-xl text-amber-900 text-sm">
            <div class="flex items-start gap-3">
              <svg
                class="w-5 h-5 text-amber-600 mt-0.5 shrink-0"
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
                <p class="font-bold mb-1">Hesap Çakışması</p>
                <p class="opacity-90">
                  Bu e-posta adresiyle birden fazla hesabınız var. Güncelleme işlemine devam etmek için öncelikli hesabınızı seçin.
                </p>
              </div>
            </div>
          </div>

          <h3 class="text-sm font-semibold text-slate-700 mb-3 px-1">
            Devam edilecek hesabı seçin:
          </h3>

          <div class="flex flex-col gap-3">
            <Show 
              when={state.ui.availableAccounts.length > 0} 
              fallback={<div class="p-4 text-center text-sm text-slate-500 animate-pulse">Hesaplar yükleniyor...</div>}
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
          <p class="text-xs text-slate-400 mt-4 text-center">
            *Diğer hesaba erişim için daha sonra destek talebi
            oluşturabilirsiniz.
          </p>
        </div>
      </Show>

      <Show when={state.ui.step === 2 && state.payload.accountType}>
        <form
          onSubmit={handleMigrate}
          class="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300"
        >
          <div class="mb-4">
            {/*<label class="block text-xs font-medium text-slate-500 tracking-wider mb-1">
              Güncellenecek Hesap
            </label>*/}
            <div class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 flex items-center gap-2 ">
              <Show
                when={!state.ui.isFetchingType}
                fallback={
                  <span class="animate-pulse text-slate-400">
                    Doğrulanıyor...
                  </span>
                }
              >
                <svg
                  class="w-4 h-4 text-emerald-500"
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
            label="E-Posta Adresiniz"
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
              label="Yeni Şifrenizi Belirleyin"
              type="password"
              maxLength={128}
              value={state.payload.password}
              onInput={(e) =>
                setState("payload", "password", e.currentTarget.value)
              }
              validationState={validPassword()}
              error="Güvenlik kriterlerine uymuyor"
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
              label="Yeni Şifrenizi Onaylayın"
              type="password"
              value={state.payload.confirmPassword}
              onInput={(e) => setState("payload", "confirmPassword", e.currentTarget.value)}
              validationState={validConfirmPassword()}
              error="Şifreler birbiriyle eşleşmiyor"
              disabled={state.ui.isSubmitting}
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
                }}
                onError={() =>
                  setState(
                    "errors",
                    "global",
                    "Güvenlik doğrulama başarısız oldu.",
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
            Şifremi Güncelle
          </SubmitButton>
          <Show 
            when={state.payload.accountType !== "admin"} 
            fallback={
              <AuthFooter>
                <span class="text-sm font-normal text-slate-500">
                  Yönetici hesapları doğrudan oluşturulamaz.{" "}
                </span>
                <a href="/login?type=a" class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors">
                  Giriş sayfasına dön
                </a>
              </AuthFooter>
            }
          >
            <AuthFooter>
              <span class="text-sm font-normal text-blue-950/60">
                Farklı bir hesap mı açacaksınız?{" "}
              </span>
              <a
                href={dynamicRegisterRoute()}
                class="text-sm font-semibold text-blue-900 hover:text-blue-950 transition-colors"
              >
                Kayıt Ol
              </a>
            </AuthFooter>
          </Show>
        </form>
      </Show>
    </div>
  );
};

export default Migrate;