import { createSignal, createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { getPostHog } from '../posthog';

export function useFeatureFlag(flagKey: string): Accessor<boolean> {
  const [enabled, setEnabled] = createSignal(false);

  createEffect(() => {
    const ph = getPostHog();
    if (!ph) return;

    setEnabled(ph.isFeatureEnabled(flagKey) ?? false);
    const cb = () => setEnabled(ph.isFeatureEnabled(flagKey) ?? false);
    ph.onFeatureFlags(cb);
  });

  return enabled;
}

export function useFeatureFlagVariant(flagKey: string): Accessor<string | boolean | undefined> {
  const [variant, setVariant] = createSignal<string | boolean | undefined>(undefined);

  createEffect(() => {
    const ph = getPostHog();
    if (!ph) return;

    setVariant(ph.getFeatureFlag(flagKey));
    const cb = () => setVariant(ph.getFeatureFlag(flagKey));
    ph.onFeatureFlags(cb);
  });

  return variant;
}
