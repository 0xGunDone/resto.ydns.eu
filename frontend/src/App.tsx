import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SchedulePage from './pages/SchedulePage';
import ShiftTypesPage from './pages/ShiftTypesPage';
import TasksPage from './pages/TasksPage';
import RestaurantsPage from './pages/RestaurantsPage';
import RestaurantManagePage from './pages/RestaurantManagePage';
import TimesheetPage from './pages/TimesheetPage';
import ProfilePage from './pages/ProfilePage';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import NotificationsPage from './pages/NotificationsPage';
import SwapRequestsPage from './pages/SwapRequestsPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  // Инициализация темы при загрузке приложения
  const { effectiveTheme } = useTheme();

  useEffect(() => {
    // Применяем тему сразу при загрузке
    if (effectiveTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [effectiveTheme]);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
              <SchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shift-types"
          element={
            <ProtectedRoute>
              <ShiftTypesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <TasksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurants"
          element={
            <ProtectedRoute>
              <RestaurantsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/restaurants/:restaurantId/manage"
          element={
            <ProtectedRoute>
              <RestaurantManagePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute>
              <TimesheetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/swap-requests"
          element={
            <ProtectedRoute>
              <SwapRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/:userId/profile"
          element={
            <ProtectedRoute>
              <EmployeeProfilePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

