import { type Component, Show } from 'solid-js';

export const ErrorAlert: Component<{ message: string | null }> = (props) => {
  return (
    <Show when={props.message}>
      <div class="p-3 bg-destructive/[0.08] text-destructive text-sm font-medium rounded-lg border border-destructive/20">
        {props.message}
      </div>
    </Show>
  );
};
