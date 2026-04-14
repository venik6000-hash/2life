import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import { DashboardProvider } from './context/DashboardContext';
import { MessengerProvider } from './context/MessengerContext';
import Dashboard from './dashboard';
import LoginScreen from './components/LoginScreen';

function AppInner() {
  const { user, checking } = useAuth();
  if (checking) return null; // пока проверяем токен — не рендерим ничего
  if (!user) return <LoginScreen />;
  return (
    <ThemeProvider>
      <EditorProvider>
        <DashboardProvider>
          <MessengerProvider>
            <Dashboard />
          </MessengerProvider>
        </DashboardProvider>
      </EditorProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
