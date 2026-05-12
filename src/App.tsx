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
      <main class="min-h-screen pt-[68px] flex items-center justify-center p-4 sm:p-6 lg:p-8 text-foreground" style="background: linear-gradient(to bottom, hsl(var(--primary)) 0%, hsl(var(--background)) 25%)">
        {props.children}
      </main>
    </>
  );
};

export default App;