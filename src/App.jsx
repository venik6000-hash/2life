import { Component, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import { DashboardProvider } from './context/DashboardContext';
import { MessengerProvider } from './context/MessengerContext';
import Dashboard from './dashboard';
import LoginScreen from './components/LoginScreen';
import MobileLoginScreen from './components/MobileLoginScreen';
import LoadingScreen from './components/LoadingScreen';
import MessengerApp from './mobile/MessengerApp';
import { isDesktopMessengerPath, isMobileAppPath, isMobileViewport } from './utils/device';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff', color: '#c00', minHeight: '100vh' }}>
          <h2>Ошибка приложения</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{String(this.state.error)}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#666' }}>{this.state.error?.stack}</pre>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Сбросить и перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return pathname;
}

function AppInner() {
  const { user, checking } = useAuth();
  const pathname = usePathname();
  const wantsMobileApp = isMobileAppPath(pathname);
  const wantsDesktopMessenger = isDesktopMessengerPath(pathname);

  if (checking) return <LoadingScreen />;
  if (!user) return wantsMobileApp || isMobileViewport() ? <MobileLoginScreen /> : <LoginScreen />;
  if (wantsMobileApp) return <MessengerApp />;
  if (wantsDesktopMessenger) localStorage.setItem('dash_sec', 'messenger');

  return (
    <EditorProvider>
      <DashboardProvider>
        <MessengerProvider>
          <Dashboard />
        </MessengerProvider>
      </DashboardProvider>
    </EditorProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
