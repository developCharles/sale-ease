import { NavLink } from 'react-router-dom'
import { Package, ShoppingCart, QrCode, ChartColumn, Settings } from 'lucide-react'
import { useCart } from '../contexts/CartContext'

const TABS = [
  { to: '/app', label: 'Tray', icon: Package },
  { to: '/app/cart', label: 'Cart', icon: ShoppingCart },
  { to: '/app/qr', label: 'QR', icon: QrCode },
  { to: '/app/summary', label: 'Summary', icon: ChartColumn },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

export default function BottomNav() {
  const { cart } = useCart()

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-50 flex justify-center px-4">
      <nav className="mx-auto w-full max-w-md bg-white rounded-full shadow-lg border border-gray-200 grid grid-cols-5 px-2 py-1.5">
        {TABS.map(tab => {
          const Icon = tab.icon

          return (
            <NavLink
              key={tab.label}
              to={tab.to}
              end={tab.to === '/app'}
              aria-label={tab.label}
              className={({ isActive }) =>
                `relative flex items-center justify-center rounded-full min-h-11 transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-900 active:scale-95'
                }`
              }
            >
              {tab.label === 'Cart' && cart.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {cart.length}
                </span>
              )}
              <Icon size={24} strokeWidth={2} />
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}