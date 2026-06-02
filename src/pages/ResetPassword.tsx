import { type Component, createMemo, onMount, Show, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { useNavigate } from '@solidjs/router';
import { supabase } from '../lib/supabase';
import { AuthHeader } from '../components/layout/AuthHeader';
import { TextInput } from '../components/ui/TextInput';
import { SubmitButton } from '../components/ui/SubmitButton';
import { ErrorAlert } from '../components/ui/ErrorAlert';
import { PasswordStrength, type PasswordRules } from '../components/ui/PasswordStrength';
import { AuthFooter } from '../components/layout/AuthFooter';
import { AuthHeaderTexts } from "../constants/authTexts";
import { AccMapByType } from "../types/account";
import { computePasswordRules } from '../utils/passwordValidation';
import { getDefaultRedirect } from '../utils/redirectHelper';
import { useAccountType } from '../hooks/useAccountType';
import { trackAuthStep, completeAuthFunnel, trackAuthError } from '../utils/authFunnel';
import { injectTraceparent } from '../tracing';

type ValidationState = 'idle' | 'valid' | 'invalid';

const ResetPassword: Component = () => {
  const navigate = useNavigate();
  const { resolvedType, currentTypeParam } = useAccountType();

  const [state, setState] = createStore({
    password: '',
    confirmPassword: '',
    error: null as string | null,
    success: false,
    isSubmitting: false,
    isSessionChecking: true,
    isSessionValid: false,
  });

  const dynamicLoginRoute = () => `/login${currentTypeParam()}`;
  const dynamicForgotRoute = () => `/forgot-password${currentTypeParam()}`;

  onMount(() => {
    trackAuthStep('password_reset', 'reset_page_view');

    const hash = window.location.hash;
    const isImplicitFlow = hash.includes('type=recovery') || hash.includes('access_token=');

    // searchParams is reactive so read the code param via the URL directly at mount time
    const isPkceFlow = !!new URLSearchParams(window.location.search).get('code');

    if (!isImplicitFlow && !isPkceFlow) {
      navigate('/login', { replace: true });
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        if (session) {
          setState('isSessionValid', true);
          setState('isSessionChecking', false);

          if (window.history?.replaceState) {
            const cleanUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        }
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        setTimeout(() => {
          if (!state.isSessionValid) {
            setState('error', 'Şifre sıfırlama bağlantınız geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı talep edin.');
            setState('isSessionChecking', false);
          }
        }, 2000);
      } else {
        setState('isSessionValid', true);
        setState('isSessionChecking', false);
      }
    });

    onCleanup(() => {
      authListener.subscription.unsubscribe();
    });
  });

  const passwordRules = createMemo<PasswordRules>(() =>
    computePasswordRules(state.password)
  );

  const validPassword = createMemo<ValidationState>(() => {
    if (!state.password) return 'idle';
    return passwordRules().isAllValid ? 'valid' : 'invalid';
  });

  const validConfirm = createMemo<ValidationState>(() => {
    if (!state.confirmPassword) return 'idle';
    return state.password === state.confirmPassword ? 'valid' : 'invalid';
  });

  const isSubmitDisabled = createMemo(() => {
    if (state.isSubmitting) return true;
    if (validPassword() !== 'valid') return true;
    if (validConfirm() !== 'valid') return true;
    return false;
  });

  const handleReset = async (e: Event) => {
    e.preventDefault();
    if (isSubmitDisabled()) return;

    trackAuthStep('password_reset', 'set_password');

    setState('isSubmitting', true);
    setState('error', null);

    const { error: updateError } = await supabase.auth.updateUser({
      password: state.password
    });

    if (updateError) {
      let errorMessage = "Şifre güncellenirken bir hata oluştu. Lütfen tekrar deneyin.";
      const errStr = updateError.message.toLowerCase();

      if (errStr.includes("different from the old password") || errStr.includes("same password")) {
        errorMessage = "Yeni şifreniz eski şifrenizle aynı olamaz.";
      } else if (errStr.includes("expired")) {
        errorMessage = "Oturum süreniz dolmuş. Lütfen yeniden şifre sıfırlama bağlantısı talep edin.";
      } else {
        errorMessage = updateError.message;
      }

      trackAuthError('password_reset', 'set_password', errorMessage);
      setState('error', errorMessage);
      setState('isSubmitting', false);
    } else {
      completeAuthFunnel('password_reset');
      setState('success', true);
      setState('isSubmitting', false);

      setTimeout(() => {
        const redirectUrl = getDefaultRedirect(resolvedType() ? AccMapByType[resolvedType()!] : null);
        if (redirectUrl) {
          window.location.href = injectTraceparent(redirectUrl);
        } else {
          navigate(`/login${currentTypeParam()}`, { replace: true });
        }
      }, 3000);
    }
  };

  return (
    <div class="bg-transparent rounded-3xl w-full max-w-sm">
      <AuthHeader
        title={AuthHeaderTexts.resetPassword().title}
        description={AuthHeaderTexts.resetPassword().description}
        class="mb-12"
        accountType={resolvedType() ? AccMapByType[resolvedType()!] : undefined}
      />

      <Show when={state.success}>
        <div class="p-4 bg-success-subtle text-success-subtle-foreground text-sm font-bold rounded-xl border border-success/20 text-center mb-6 animate-in fade-in zoom-in duration-300">
          Şifreniz başarıyla güncellendi! Uygulamaya yönlendiriliyorsunuz...
        </div>
      </Show>

      <Show when={!state.success}>
        <ErrorAlert message={state.error} />

        <Show
          when={!state.isSessionChecking}
          fallback={
            <div class="flex flex-col items-center justify-center py-8 gap-3">
              <div class="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p class="text-sm text-muted-foreground font-medium">Bağlantı doğrulanıyor...</p>
            </div>
          }
        >
          <Show
            when={state.isSessionValid}
            fallback={
              <div class="mt-6 flex flex-col gap-4 items-center">
                <a
                  href={dynamicForgotRoute()}
                  class="w-full px-4 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-center hover:bg-primary-hover transition-colors"
                >
                  Yeni Bağlantı Talep Et
                </a>
                <AuthFooter>
                  <span class="text-sm font-normal text-muted-foreground">Ya da </span>
                  <a href={dynamicLoginRoute()} class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">Giriş yap</a>
                </AuthFooter>
              </div>
            }
          >
            <form onSubmit={handleReset} class="space-y-4 mt-6">
              <div class="flex flex-col gap-2">
                <TextInput
                  label="Yeni Şifre"
                  type="password"
                  maxLength={128}
                  value={state.password}
                  onInput={(e) => setState('password', e.currentTarget.value)}
                  validationState={validPassword()}
                  error="Güvenlik kriterlerine uymuyor"
                  disabled={state.isSubmitting}
                />
                <Show when={state.password.length > 0}>
                  <PasswordStrength password={state.password} rules={passwordRules()} />
                </Show>
              </div>

              <TextInput
                label="Yeni Şifre Tekrar"
                type="password"
                maxLength={128}
                value={state.confirmPassword}
                onInput={(e) => setState('confirmPassword', e.currentTarget.value)}
                validationState={validConfirm()}
                error="Şifreler eşleşmiyor"
                disabled={state.isSubmitting}
              />

              <SubmitButton
                type="submit"
                loading={state.isSubmitting}
                disabled={isSubmitDisabled()}
                class="mt-12"
              >
                Şifreni Güncelle
              </SubmitButton>

              <AuthFooter>
                <span class="text-sm font-normal text-muted-foreground">Ya da geri dön. </span>
                <a href={dynamicLoginRoute()} class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">Giriş sayfası</a>
              </AuthFooter>
            </form>
          </Show>
        </Show>
      </Show>
    </div>
  );
};

export default ResetPassword;
