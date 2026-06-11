import { type Component, createSignal, Show, For } from "solid-js";
import { FiGlobe } from "solid-icons/fi";
import { language, setLanguage, SUPPORTED_LANGUAGES, type AppLanguage } from "../../stores/language";
import { t } from "../../i18n";

const LANGUAGE_LABELS: Record<AppLanguage, { flag: string; label: string }> = {
  tr: { flag: "🇹🇷", label: "Türkçe" },
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
  nl: { flag: "🇳🇱", label: "Nederlands" },
  fr: { flag: "🇫🇷", label: "Français" },
  it: { flag: "🇮🇹", label: "Italiano" },
};

const LanguageToggle: Component = () => {
  const [isOpen, setIsOpen] = createSignal(false);

  const handleSelect = (lang: AppLanguage) => {
    setLanguage(lang);
    setIsOpen(false);
  };

  return (
    <>
      <Show when={isOpen()}>
        <div class="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
      </Show>

      <div class="relative z-40">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          class="flex items-center gap-1.5 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("nav.changeLanguage")}
          title={t("nav.changeLanguage")}
        >
          <FiGlobe size={20} />
          <span class="text-xs font-semibold uppercase tracking-wide hidden sm:inline">
            {language()}
          </span>
        </button>

        <Show when={isOpen()}>
          <div class="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <For each={[...SUPPORTED_LANGUAGES]}>
              {(lang) => (
                <button
                  onClick={() => handleSelect(lang)}
                  class={`w-full text-left cursor-pointer flex items-center gap-2.5 px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors ${
                    language() === lang ? "text-primary font-semibold" : ""
                  }`}
                >
                  <span class="text-base leading-none">{LANGUAGE_LABELS[lang].flag}</span>
                  <span>{LANGUAGE_LABELS[lang].label}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
};

export default LanguageToggle;
