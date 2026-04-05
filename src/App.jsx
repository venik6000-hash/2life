import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { EditorProvider } from './context/EditorContext';
import { DashboardProvider } from './context/DashboardContext';
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
          <Dashboard />
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
