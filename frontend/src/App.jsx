import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { CartProvider } from './contexts/CartContext'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

// ---------------------------------------------------

import AppLayout from './components/AppLayout'
import TrayPage from './pages/TrayPage'
import CartPage from './pages/CartPage'
import QrPage from './pages/QrPage'
import SalesSummaryPage from './pages/SalesSummaryPage'
import SettingsPage from './pages/SettingsPage'

// ---------------------------------------------------

// September 5, 2026 — Dividing the app into separate pages with bottom navigation. Best for mobile usage.
function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<TrayPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="qr" element={<QrPage />} />
              <Route path="summary" element={<SalesSummaryPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  )
}

export default App