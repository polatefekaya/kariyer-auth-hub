import { type Component, type JSX } from 'solid-js';
import Aurora from './components/Aurora';

const App: Component<{ children?: JSX.Element }> = (props) => {
  return (
    <main class="min-h-screen flex items-center justify-center p-4 bg-white">
      {/*<div class='absolute w-full h-220 opacity-60'>
      <Aurora
        colorStops={["#eff6ff" , "#b8e6fe", "#8ec5ff" ]}
        blend={0.2}
        amplitude={0.1}
        speed={0.5}
        
      />
      </div>
      */}
      {props.children}
    </main>
  );
};

export default App;