export const resetTurnstile = () => {
  if (typeof window !== "undefined" && window.turnstile) {
    window.turnstile.reset();
  }
};
