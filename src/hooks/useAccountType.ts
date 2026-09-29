import { createMemo } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import {
  AccMapById,
  AccMapByType,
  type AccountType,
  type AccountTypeId,
} from "../types/account";

export function useAccountType(fallback?: AccountType) {
  const [searchParams] = useSearchParams();

  const resolvedType = createMemo<AccountType | null>(() => {
    const raw = searchParams.type;
    const typeParam = Array.isArray(raw) ? raw[0] : raw;
    if (!typeParam) return fallback ?? null;
    return (
      AccMapById[typeParam as AccountTypeId] ||
      (typeParam in AccMapByType ? (typeParam as AccountType) : null) ||
      fallback ||
      null
    );
  });

  const currentTypeParam = createMemo(() => {
    const parts: string[] = [];
    if (resolvedType()) {
      parts.push(`type=${AccMapByType[resolvedType()!]}`);
    }
    const rawRedirect = searchParams.redirect_to;
    const redirectParam = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
    if (redirectParam) {
      parts.push(`redirect_to=${encodeURIComponent(redirectParam)}`);
    }
    return parts.length > 0 ? `?${parts.join("&")}` : "";
  });

  return { resolvedType, currentTypeParam };
}
