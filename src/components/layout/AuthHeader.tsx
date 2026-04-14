import { type Component, Show, splitProps, type JSX, createMemo } from 'solid-js';
import { cn } from '../../utils/cn';
import type { AccountTypeId } from '../../types/account';
import { getDefaultRedirect } from '../../utils/redirectHelper';

interface AuthHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  accountType?: AccountTypeId | null;
}

export const AuthHeader: Component<AuthHeaderProps> = (props) => {
  const [local, rest] = splitProps(props, ['title', 'description', 'class', 'accountType']);

  const targetUrl = createMemo(() => {
      if (local.accountType) {
        return getDefaultRedirect(local.accountType);
      }
  
      if (typeof window === 'undefined') {
        return import.meta.env.VITE_WEB_APP_URL || '/';
      }
  
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobileDevice) {
        return import.meta.env.VITE_APP_URL || import.meta.env.VITE_WEB_APP_URL || '/';
      }
  
      return import.meta.env.VITE_WEB_APP_URL || '/';
    });

  return (
    <div 
      {...rest} 
      class={cn(
        "mb-8 text-center flex flex-row justify-center items-center gap-6 z-20", 
        local.class
      )}
    >
      <a 
        href={targetUrl()} 
        class="shrink-0 transition-all duration-200 hover:scale-105 hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-900/20 rounded-xl"
        aria-label="Kariyer Zamanı Ana Sayfasına Dön"
      >
        <img 
          src="/logo.png" 
          alt="Kariyer Zamanı Logo" 
          class="h-14 w-auto object-contain cursor-pointer"
        />
      </a>
      
      <div class="flex flex-col items-start">
        <h1 class="text-3xl font-semibold text-blue-950">
          {local.title}
        </h1>
        
        <Show when={local.description}>
          <p class="text-blue-950/60 font-normal text-start">
            {local.description}
          </p>
        </Show>
      </div>
    </div>
  );
};