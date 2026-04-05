import { type Component, onMount, onCleanup, createUniqueId } from "solid-js";

declare global {
  interface Window {
    turnstile: any;
  }
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
}

export const Turnstile: Component<TurnstileProps> = (props) => {
  const id = createUniqueId();
  let containerRef!: HTMLDivElement;
  let widgetId: string | null = null;

  onMount(() => {
    if (!document.getElementById("cf-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const renderWidget = () => {
      if (window.turnstile) {
        widgetId = window.turnstile.render(containerRef, {
          sitekey: props.siteKey,
          theme: props.theme || "light",
          size: props.size || "flexible",
          appearance: props.appearance || "always",
          callback: props.onVerify,
          "error-callback": props.onError,
        });
      } else {
        setTimeout(renderWidget, 100);
      }
    };

    renderWidget();
  });

  onCleanup(() => {
    if (widgetId && window.turnstile) {
      window.turnstile.remove(widgetId);
    }
  });

  return (
    <div
      ref={containerRef}
      id={`turnstile-${id}`}
      class="w-full"
    />
  );
};
