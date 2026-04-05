import { type Component, createSignal, Show } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { supabase } from '../../lib/supabase';
import { cn } from '../../utils/cn';
import { SiApple } from 'solid-icons/si';
import { IoReloadOutline } from 'solid-icons/io';
import { ImGoogle } from 'solid-icons/im';
import { AccMapById, AccMapByType, type AccountType, type AccountTypeId } from '../../types/account';
import type { OAuthProviderTypes } from '../../types/oauth';

interface OAuthProvidersProps {
  actionText?: string;
  onError?: (errorMessage: string) => void;
  redirectTo?: string;
}

export const OAuthProviders: Component<OAuthProvidersProps> = (props) => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = createSignal<OAuthProviderTypes | null>(null);

  const handleOAuth = async (provider: OAuthProviderTypes) => {
    if (loading() !== null) return;
    setLoading(provider);

    try {
      const rawTypeParam = searchParams.type;
      const typeParam = Array.isArray(rawTypeParam) ? rawTypeParam[0] : rawTypeParam;
      const storageType = sessionStorage.getItem('kariyer_oauth_type');
      
      const rawResolvedType = typeParam || storageType;
      
      const finalType: AccountType | null = rawResolvedType 
        ? (AccMapById[rawResolvedType as AccountTypeId] || (rawResolvedType in AccMapByType ? rawResolvedType as AccountType : null))
        : null;

      const intendedTarget = props.redirectTo || searchParams.redirect_to || sessionStorage.getItem('kariyer_auth_redirect');

      if (finalType) sessionStorage.setItem('kariyer_oauth_type', finalType);
      if (intendedTarget) sessionStorage.setItem('kariyer_auth_redirect', intendedTarget as string);

      const callbackUrl = new URL(`${window.location.origin}/auth-callback`);
      if (intendedTarget) callbackUrl.searchParams.set('next', intendedTarget as string);
      if (finalType) callbackUrl.searchParams.set('type', AccMapByType[finalType]); // Use short code

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
          skipBrowserRedirect: true
        }
      });

      if (error) throw error;
      
      if (data?.url) {
        window.location.assign(data.url);
      }

    } catch (err: any) {
      console.error(`[OAuthProviders] ${provider} Login Error:`, err.message);
      
      if (props.onError) {
        const errorStr = err.message.toLowerCase();
        let friendlyError = "Sosyal hesap ile giriş yapılamadı. Lütfen tekrar deneyin.";
        
        if (errorStr.includes("user_canceled") || errorStr.includes("cancelled")) {
          friendlyError = "Giriş işlemi iptal edildi.";
        }
        
        props.onError(friendlyError);
      }
      
      setLoading(null);
    }
  };

  return (
    <div class="mt-6">
      <div class="relative">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-slate-200"></div>
        </div>
        <div class="relative flex justify-center text-sm px-2">
          <span class="px-4 bg-white text-blue-950/60 font-normal text-xs tracking-wide">
            Ya da farklı bir yöntem ile devam et
          </span>
        </div>
      </div>

      <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={loading() !== null}
          class={cn(
            "flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl hover:cursor-pointer",
            "text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Show when={loading() === 'google'} fallback={<ImGoogle class="w-4 h-4" />}>
            <IoReloadOutline class="w-5 h-5 animate-spin text-slate-400" />
          </Show>
          Google
        </button>

        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={loading() !== null}
          class={cn(
            "flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-black border border-black rounded-xl hover:cursor-pointer",
            "text-sm font-bold text-white hover:bg-zinc-800 transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Show when={loading() === 'apple'} fallback={<SiApple class="w-5 h-5 text-white pb-0.5" />}>
            <IoReloadOutline class="w-5 h-5 animate-spin text-zinc-400" />
          </Show>
          Apple
        </button>
      </div>
    </div>
  );
};