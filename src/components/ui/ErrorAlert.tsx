import { type Component, Show } from 'solid-js';

export const ErrorAlert: Component<{ message: string | null }> = (props) => {
  return (
    <Show when={props.message}>
      <div class="p-3 bg-red-50 text-red-800 text-sm font-medium rounded-lg border border-red-200">
        {props.message}
      </div>
    </Show>
  );
};