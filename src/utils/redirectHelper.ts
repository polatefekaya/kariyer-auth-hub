import { type AccountTypeId } from "../types/account";

export const getDefaultRedirect = (type?: AccountTypeId | null): string => {
  const redirectMap: Record<AccountTypeId, string> = {
    c: import.meta.env.VITE_REDIRECT_EMPLOYEE,
    b: import.meta.env.VITE_REDIRECT_COMPANY,
    a: import.meta.env.VITE_REDIRECT_ADMIN,
    co: import.meta.env.VITE_REDIRECT_COMMUNITY,
  };
  
  return (type ? redirectMap[type] : null) || import.meta.env.VITE_DEFAULT_REDIRECT_URL;
};