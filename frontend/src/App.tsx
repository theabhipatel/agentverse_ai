import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AuthCallbackPage } from '@/modules/auth/auth-callback-page'
import { ForgotPasswordPage } from '@/modules/auth/forgot-password-page'
import { LoginPage } from '@/modules/auth/login-page'
import { RegisterPage } from '@/modules/auth/register-page'
import { ResetPasswordPage } from '@/modules/auth/reset-password-page'
import { AdminRoute, HomeRedirect, ProtectedRoute, PublicOnlyRoute } from '@/modules/auth/route-guards'
import { AdminAgentsPage } from '@/modules/admin/admin-agents-page'
import { LlmSettingsPage } from '@/modules/admin/llm-settings-page'
import { AdminIntegrationsPage } from '@/modules/admin/admin-integrations-page'
import { AdminOverviewPage } from '@/modules/admin/admin-overview-page'
import { AdminUsersPage } from '@/modules/admin/admin-users-page'
import { AdminVoicesPage } from '@/modules/admin/admin-voices-page'
import { IntelligenceHubPage } from '@/modules/admin/intelligence-hub-page'
import { AgentsPage } from '@/modules/agents/agents-page'
import { ChatPage } from '@/modules/chat/chat-page'
import { IntegrationsPage } from '@/modules/integration/integrations-page'
import { ProfilePage } from '@/modules/profile/profile-page'
import { useAuthStore } from '@/stores/auth-store'

function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap)

  // One silent refresh on boot rebuilds the session from the httpOnly cookie.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <ResetPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat/:conversationId"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agents"
        element={
          <ProtectedRoute>
            <AgentsPage />
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
        path="/integrations"
        element={
          <ProtectedRoute>
            <IntegrationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminOverviewPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <AdminRoute>
            <AdminUsersPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/agents"
        element={
          <AdminRoute>
            <AdminAgentsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/llm"
        element={
          <AdminRoute>
            <LlmSettingsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/voices"
        element={
          <AdminRoute>
            <AdminVoicesPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/integrations"
        element={
          <AdminRoute>
            <AdminIntegrationsPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/intelligence-hub"
        element={
          <AdminRoute>
            <IntelligenceHubPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

export default App
