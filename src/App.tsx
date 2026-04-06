import { type Component, type JSX } from 'solid-js';

const App: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <main class="min-h-screen flex items-center justify-center p-4 bg-white">
      {props.children}
    </main>
  );
};

export default App;