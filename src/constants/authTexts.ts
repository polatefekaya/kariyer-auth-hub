import { t } from '../i18n';
import type { AccountType, AccountTypeId } from '../types/account';

export type AuthHeaderContent = {
  title: string;
  description: string;
};

function loginVariant(type: AccountType | AccountTypeId): string {
  if (type === 'company' || type === 'b') return 'company';
  if (type === 'admin' || type === 'a') return 'admin';
  if (type === 'community' || type === 'co') return 'community';
  return 'candidate';
}

function registerVariant(type: AccountType | AccountTypeId): string {
  if (type === 'company' || type === 'b') return 'company';
  if (type === 'admin' || type === 'a') return 'admin';
  if (type === 'community' || type === 'co') return 'community';
  return 'candidate';
}

export const AuthHeaderTexts = {
  login: (type: AccountType | AccountTypeId): AuthHeaderContent => {
    const v = loginVariant(type);
    return { title: t(`header.login.${v}.title`), description: t(`header.login.${v}.desc`) };
  },

  register: (type: AccountType | AccountTypeId): AuthHeaderContent => {
    const v = registerVariant(type);
    return { title: t(`header.register.${v}.title`), description: t(`header.register.${v}.desc`) };
  },

  forgotPassword: (isSuccess: boolean): AuthHeaderContent => {
    const v = isSuccess ? 'success' : 'default';
    return { title: t(`header.forgotPassword.${v}.title`), description: t(`header.forgotPassword.${v}.desc`) };
  },

  resetPassword: (): AuthHeaderContent => ({
    title: t('header.resetPassword.title'),
    description: t('header.resetPassword.desc'),
  }),

  verify: (): AuthHeaderContent => ({
    title: t('header.verify.title'),
    description: t('header.verify.desc'),
  }),

  migrate: (): AuthHeaderContent => ({
    title: t('header.migrate.title'),
    description: t('header.migrate.desc'),
  }),

  callbackError: (): AuthHeaderContent => ({
    title: t('header.callbackError.title'),
    description: t('header.callbackError.desc'),
  }),
} as const;
