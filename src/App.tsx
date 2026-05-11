import { type Component, type JSX } from 'solid-js';
import ThemeWatcher from './ThemeWatcher';
import AuthWatcher from './AuthWatcher';
import Navbar from './components/navbar/Navbar';

const App: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <>
      <ThemeWatcher />
      <AuthWatcher />
      <Navbar />
      <main class="min-h-screen pt-16 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-background text-foreground">
        {props.children}
      </main>
    </>
  );
};

export default App;