import { render } from 'solid-js/web';
import { Router, Route, Navigate } from '@solidjs/router';
import './index.css';

import App from './App';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Verify from './pages/Verify';
import ForgotPassword from './pages/ForgotPassword';
import Migrate from './pages/Migrate';
import AuthCallback from './pages/AuthCallback';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error('Root element not found. The HTML file is missing the <div id="root"></div>.');
}

render(() => (
  <Router root={App}>
    <Route path="/login" component={Login} />
    <Route path="/register" component={Register} />
    <Route path="/reset-password" component={ResetPassword} />
    <Route path="/verify" component={Verify} />
    <Route path="/forgot-password" component={ForgotPassword} />
    <Route path={"/migrate"} component={Migrate} />
    <Route path="/auth-callback" component={AuthCallback} />
    
    <Route path="*" component={() => <Navigate href="/login" />} />
  </Router>
), root!);