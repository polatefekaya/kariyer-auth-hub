import { type Component, type JSX } from 'solid-js';

interface AuthFooterProps {
  children: JSX.Element;
}

export const AuthFooter: Component<AuthFooterProps> = (props) => {
  return (
    <div class="text-center mt-6">
      {props.children}
    </div>
  );
};