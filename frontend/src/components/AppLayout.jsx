import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useCart } from '../contexts/CartContext'

export default function AppLayout() {
  // Grab the online/offline state from the cart context
  // so the banner below shows on EVERY tab, not just one page
  const { isOnline } = useCart()

  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      {/* Hey! This is the OFFLINE BANNER — shows at the top when the device loses connection.
          Same amber look as the old POS page, now app-wide. */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center py-2 text-sm font-medium z-50">
          Offline Mode - Sales will sync when connected
        </div>
      )}

      {/* The MAIN scroll area. Every page (Tray, Cart, QR, Summary, Settings) renders
          inside <Outlet /> right here.
          - flex-1 lets it fill the space between banner and nav
          - overflow-y-auto makes the page scroll, not the whole screen
          - pb-24 keeps content from hiding behind the floating bottom pill (~96px)
          - pt-10 makes room for the banner when offline */}
      <main className={`flex-1 overflow-y-auto pb-24 ${isOnline ? '' : 'pt-10'}`}>
        <Outlet />
      </main>

      {/* Navigate to the fixed bottom bar. Tabs live in BottomNav file. */}
      <BottomNav />
    </div>
  )
}