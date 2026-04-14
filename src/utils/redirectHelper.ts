import { type AccountType } from "../types/account";

export const getDefaultRedirect = (type?: AccountType | null): string => {
  const redirectMap: Record<AccountType, string> = {
    employee: import.meta.env.VITE_REDIRECT_EMPLOYEE,
    company: import.meta.env.VITE_REDIRECT_COMPANY,
    admin: import.meta.env.VITE_REDIRECT_ADMIN,
    community: import.meta.env.VITE_REDIRECT_COMMUNITY,
  };
  
  return (type ? redirectMap[type] : null) || import.meta.env.VITE_DEFAULT_REDIRECT_URL;
};