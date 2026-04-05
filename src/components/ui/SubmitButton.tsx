import { type Component, type JSX, splitProps } from 'solid-js';
import { cn } from '../../utils/cn';

interface SubmitButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export const SubmitButton: Component<SubmitButtonProps> = (props) => {
  const [local, buttonProps] = splitProps(props, ['loading', 'children', 'class']);

  return (
    <button
      {...buttonProps}
      disabled={buttonProps.disabled || local.loading}
      class={cn(
        "relative w-full overflow-hidden bg-blue-900 text-white font-medium py-3.5 px-4 rounded-xl",
        "hover:bg-blue-950 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none",
        "transition-all duration-200 flex items-center justify-center gap-2 tracking-wide",
        local.class
      )}
    >
      {local.loading ? (
        <>
          <svg class="animate-spin h-5 w-5 text-white/70" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Authenticating...
        </>
      ) : (
        local.children
      )}
    </button>
  );
};