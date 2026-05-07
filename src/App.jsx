import { useEffect, useState } from 'react';
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
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
