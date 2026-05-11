const REDIRECT_KEY = "kariyer_auth_redirect";

export const saveAuthRedirect = (url: string) =>
  sessionStorage.setItem(REDIRECT_KEY, url);

export const getAuthRedirect = () =>
  sessionStorage.getItem(REDIRECT_KEY);

export const clearAuthRedirect = () =>
  sessionStorage.removeItem(REDIRECT_KEY);
