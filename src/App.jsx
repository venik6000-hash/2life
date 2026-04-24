import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import { DashboardProvider } from './context/DashboardContext';
import { MessengerProvider } from './context/MessengerContext';
import Dashboard from './dashboard';
import LoginScreen from './components/LoginScreen';
import LoadingScreen from './components/LoadingScreen';

function AppInner() {
  const { user, checking } = useAuth();
  if (checking) return <LoadingScreen />;
  if (!user) return <LoginScreen />;
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
