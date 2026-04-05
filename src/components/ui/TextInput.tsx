import { type Component, type JSX, splitProps, createSignal, Show, createUniqueId } from 'solid-js';
import { cn } from '../../utils/cn';
import type { ValidationStatus } from '../../types/validation';

interface TextInputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'placeholder' | 'id'> {
  label: string;
  error?: string;
  validationState?: ValidationStatus;
  helperRight?: JSX.Element;
  id?: string;
}

export const TextInput: Component<TextInputProps> = (props) => {
  const [local, inputProps] = splitProps(props, [
    'label', 'error', 'validationState', 'helperRight', 'class', 'type', 'value', 'id'
  ]);
  
  const [showPassword, setShowPassword] = createSignal(false);
  
  const isPassword = () => local.type === 'password';
  const currentType = () => (isPassword() && showPassword() ? 'text' : local.type);
  const vState = () => local.validationState || 'idle';

  const isFilled = () => {
    return local.value !== undefined && local.value !== null && String(local.value).length > 0;
  };

  // Robust ARIA Tree Linking
  const uniqueId = createUniqueId();
  const inputId = () => local.id || `kz-input-${uniqueId}`;
  const errorId = () => `${inputId()}-error`;
  const helperId = () => `${inputId()}-helper`;

  const ariaDescribedBy = () => {
    const ids = [];
    if (vState() === 'invalid') ids.push(errorId());
    if (local.helperRight) ids.push(helperId());
    return ids.length > 0 ? ids.join(' ') : undefined;
  };

  return (
    <div class={cn("relative flex flex-col gap-1", local.class)}>
      <div class="relative flex items-center">
        <input
          {...inputProps}
          id={inputId()}
          value={local.value}
          type={currentType()}
          placeholder=" "
          aria-invalid={vState() === 'invalid'}
          aria-describedby={ariaDescribedBy()}
          class={cn(
            "peer w-full px-4 pt-6 pb-2 bg-slate-50 border rounded-xl text-slate-900 font-medium transition-all duration-200",
            "focus:outline-none focus:bg-white focus:ring-2",
            "disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed",
            vState() === 'invalid' ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : 
            vState() === 'valid' ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/20" : 
            "border-blue-900/10 focus:border-blue-900 focus:ring-blue-900/30",
            "pr-2 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden [&::-webkit-clear-button]:hidden",
            vState() !== "idle" && "pr-12",
            isPassword() && "pr-10",
            vState() !== "idle" && isPassword() && "pr-18"
          )}
        />
        
        <label 
          for={inputId()}
          class={cn(
            "absolute left-4 transition-all duration-200 pointer-events-none select-none",
            
            // 1. BASE STATE
            "top-2 text-xs font-medium text-blue-950/60",
            
            // 2. FOCUS STATE
            "peer-focus:top-2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-blue-900",
            
            // 3. AUTOFILL STATE
            "peer-autofill:top-2 peer-autofill:text-xs peer-autofill:font-medium",

            // 4. RESTING STATE
            !isFilled() && "peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-placeholder-shown:text-blue-950/50",
            
            // Status colors
            vState() === 'invalid' ? "text-red-600 peer-focus:text-red-600 peer-autofill:text-red-600" : 
            vState() === 'valid' ? "text-emerald-600 peer-focus:text-emerald-600 peer-autofill:text-emerald-600" : ""
          )}>
          {local.label}
        </label>
        
        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-transparent pl-1">
          
          <Show when={vState() === 'valid'}>
            <svg aria-hidden="true" class="w-5 h-5 text-emerald-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </Show>
          
          <Show when={vState() === 'invalid'}>
            <div class="relative group flex items-center justify-center">
              <svg aria-hidden="true" class="w-5 h-5 text-red-500 cursor-help" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div 
                id={errorId()} 
                role="alert" 
                aria-live="assertive"
                class="absolute bottom-full right-0 mb-2 w-max max-w-[240px] px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none text-right"
              >
                {local.error || "Geçersiz format."}
                <div class="absolute top-full right-2 border-4 border-transparent border-t-slate-900"></div>
              </div>
            </div>
          </Show>
          
          <Show when={isPassword()}>
            <button
              type="button"
              tabIndex={-1}
              aria-label={showPassword() ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={showPassword()}
              aria-controls={inputId()}
              onClick={() => setShowPassword(!showPassword())}
              class="p-1.5 text-blue-900/60 hover:text-blue-900 transition-colors focus:outline-none bg-transparent rounded-lg"
            >
               <Show 
                when={!showPassword()} 
                fallback={
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>
                  </svg>
                }
              >
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
                </svg>
              </Show>
            </button>
          </Show>
        </div>
      </div>
      <Show when={local.helperRight}>
        <div id={helperId()} class="flex justify-end w-full px-1 mt-1">
          {local.helperRight}
        </div>
      </Show>
    </div>
  );
};