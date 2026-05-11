import { zxcvbn } from "@zxcvbn-ts/core";
import type { PasswordRules } from "../components/ui/PasswordStrength";

export function computePasswordRules(password: string): PasswordRules {
  const score = password ? zxcvbn(password).score : 0;
  const hasLength = password.length >= 8 && password.length <= 128;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const hasScore = score >= 3;
  return {
    hasLength,
    hasUpper,
    hasNumber,
    hasSpecial,
    hasScore,
    isAllValid: hasLength && hasUpper && hasNumber && hasSpecial && hasScore,
  };
}
