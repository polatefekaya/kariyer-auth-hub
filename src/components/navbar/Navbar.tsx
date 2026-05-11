import { type Component, createSignal, Show } from "solid-js";
import { theme, setTheme, writeCookieTheme, writeStoredTheme } from "../../stores/theme";
import { session } from "../../stores/auth";
import { FiSun, FiMoon, FiChevronDown, FiLogOut, FiUser } from "solid-icons/fi";
import { useNavigate } from "@solidjs/router";
import { supabase } from "../../lib/supabase";

type DropdownId = "login" | "register" | "profile";

const Navbar: Component = () => {
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = createSignal<DropdownId | null>(null);

  const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || "";

  const toggleDropdown = (id: DropdownId) => {
    setActiveDropdown((prev) => (prev === id ? null : id));
  };

  const handleNav = (path: string) => {
    setActiveDropdown(null);
    navigate(path);
  };

  const handleLogoClick = () => {
    if (WEB_APP_URL) window.location.href = WEB_APP_URL;
    else navigate("/");
  };

  const toggleTheme = () => {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    writeCookieTheme(next);
    writeStoredTheme(next);
  };

  const handleLogout = async () => {
    setActiveDropdown(null);
    await supabase.auth.signOut();
    navigate("/login");
  };

  const userEmail = () => session()?.user?.email ?? "";

  return (
    <>
      <Show when={activeDropdown() !== null}>
        <div class="fixed inset-0 z-30" onClick={() => setActiveDropdown(null)} />
      </Show>

      <header class="fixed top-0 left-0 w-full h-16 bg-background/95 backdrop-blur-md border-b border-border z-40 transition-colors duration-300">
        <div class="max-w-[1400px] mx-auto px-4 h-full flex items-center justify-between">

          <div
            onClick={handleLogoClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleLogoClick();
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Ana Sayfaya Git"
            class="flex items-center gap-2 cursor-pointer transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <img src="/logo.png" alt="Kariyer Zamanı" class="w-auto h-8 object-contain" />
          </div>

          <div class="flex items-center gap-2 sm:gap-4">
            <button
              onClick={toggleTheme}
              class="p-2 mr-1 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Temayı Değiştir"
              title={theme() === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            >
              <Show when={theme() === "dark"} fallback={<FiMoon size={20} />}>
                <FiSun size={20} />
              </Show>
            </button>

            <Show
              when={session()}
              fallback={
                <>
                  {/* Login dropdown */}
                  <div class="relative z-40">
                    <button
                      onClick={() => toggleDropdown("login")}
                      class="flex items-center gap-1 px-2 py-2 tracking-[0.15px] text-sm font-medium text-primary hover:text-primary-hover transition-colors focus:outline-none"
                    >
                      Giriş Yap
                      <span class={`inline-flex transition-transform duration-200 ${activeDropdown() === "login" ? "rotate-180" : ""}`}>
                        <FiChevronDown size={14} />
                      </span>
                    </button>
                    <Show when={activeDropdown() === "login"}>
                      <div class="absolute right-0 top-full mt-2 z-50 min-w-[150px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                        <button
                          onClick={() => handleNav("/login?type=c")}
                          class="w-full text-left cursor-pointer px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors"
                        >
                          Aday Girişi
                        </button>
                        <button
                          onClick={() => handleNav("/login?type=b")}
                          class="w-full text-left cursor-pointer px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors"
                        >
                          İşveren Girişi
                        </button>
                      </div>
                    </Show>
                  </div>

                  {/* Register dropdown */}
                  <div class="relative z-40">
                    <button
                      onClick={() => toggleDropdown("register")}
                      class="flex items-center gap-1 px-3 sm:px-4 py-2 tracking-[0.15px] text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      Kayıt Ol
                      <span class={`inline-flex transition-transform duration-200 ${activeDropdown() === "register" ? "rotate-180" : ""}`}>
                        <FiChevronDown size={14} />
                      </span>
                    </button>
                    <Show when={activeDropdown() === "register"}>
                      <div class="absolute right-0 top-full mt-2 z-50 min-w-[150px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                        <button
                          onClick={() => handleNav("/register?type=c")}
                          class="w-full text-left cursor-pointer px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors"
                        >
                          Aday Kaydı
                        </button>
                        <button
                          onClick={() => handleNav("/register?type=b")}
                          class="w-full text-left cursor-pointer px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors"
                        >
                          İşveren Kaydı
                        </button>
                      </div>
                    </Show>
                  </div>
                </>
              }
            >
              {/* Authenticated: avatar + logout dropdown */}
              <div class="relative z-40">
                <button
                  onClick={() => toggleDropdown("profile")}
                  class="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Hesap menüsü"
                >
                  <FiUser size={20} />
                </button>
                <Show when={activeDropdown() === "profile"}>
                  <div class="absolute right-0 top-full mt-2 z-50 min-w-[200px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
                    <div class="px-3 py-2 mb-1 border-b border-border">
                      <p class="text-xs text-muted-foreground truncate">{userEmail()}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      class="w-full text-left cursor-pointer flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent outline-none transition-colors text-destructive"
                    >
                      <FiLogOut size={14} />
                      Çıkış Yap
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </header>
    </>
  );
};

export default Navbar;
