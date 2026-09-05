import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Minus, Plus, X, Trash2, Banknote, Smartphone, QrCode, ShoppingCart
} from 'lucide-react'
import { useCart } from '../contexts/CartContext'

// Payment methods — same 3 as the old POS, but icons now come from lucide
// instead of emoji. iconBg is now a colored circle with a tinted icon.
const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash Payment', description: 'Fast checkout, change calculator',
    icon: Banknote, iconBg: 'bg-green-100 text-green-700' },
  { id: 'gcash', label: 'GCash e-Wallet', description: 'Instant QR code generation',
    icon: Smartphone, iconBg: 'bg-blue-100 text-blue-700' },
  { id: 'maya', label: 'Maya QR', description: 'Scan and pay instantly',
    icon: QrCode, iconBg: 'bg-amber-100 text-amber-700' },
]

export default function CartPage() {
  // Everything data-related ships from CartContext — this page is pure UI
  const {
    cart, cartTotal, netSubtotal, vatAmount,
    updateQuantity, removeFromCart, clearCart, checkout, isOnline
  } = useCart()
  const navigate = useNavigate()

  // Local UI state: payment sheet open/closed, chosen method, order number
  const [showPayment, setShowPayment] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState('cash')
  const [orderRef, setOrderRef] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  function openPayment() {
    setOrderRef(`#${Date.now().toString().slice(-4)}`)
    setSelectedPayment('cash')
    setShowPayment(true)
  }

  // Hey! This is where checkout happens — the heavy lifting is inside CartContext.
  // It returns { ok, offline } so this page just handles the UI aftermath.
  async function handleCheckout(paymentMethod) {
    setIsProcessing(true)
    const result = await checkout(paymentMethod)
    setIsProcessing(false)

    if (result?.ok) {
      setShowPayment(false)
      if (result.offline) {
        alert('Sale saved offline. Will sync when connected.')
      } else {
        alert(`Sale completed! Order ${orderRef}`)
        navigate('/app')
      }
    } else {
      alert('Error completing sale. Please try again.')
    }
  }

  const selectedMethod = PAYMENT_METHODS.find(m => m.id === selectedPayment)

  return (
    <div className="flex flex-col h-full p-4 pb-2">
      {/* Page header — title + Clear action with icon */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Cart</h1>
        {cart.length > 0 && (
          <button
            onClick={clearCart}
            aria-label="Clear cart"
            className="flex items-center gap-1.5 text-red-500 hover:text-red-600 text-sm font-medium active:scale-95 transition-all"
          >
            <Trash2 size={18} />
            Clear
          </button>
        )}
      </header>

      {/* Cart line items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          // Empty state — icon instead of 🛒 emoji
          <div className="text-center py-20 text-gray-400">
            <ShoppingCart size={48} className="mx-auto mb-3 text-gray-300" />
            <p>Your cart is empty</p>
            <p className="text-sm">Tap products on the tray to add them</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {cart.map(item => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                <div className="w-11 h-11 bg-gray-100 rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-gray-900">{item.name}</p>
                  <p className="text-blue-600 text-sm font-medium">₱{item.price.toFixed(2)}</p>
                </div>
                {/* Quantity controls + remove — icons replace −/+✕ text */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.id, -1)}
                    aria-label="Decrease quantity"
                    className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-6 text-center font-medium text-gray-900 text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, 1)}
                    aria-label="Increase quantity"
                    className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    aria-label="Remove item"
                    className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + proceed — pinned to bottom of the page */}
      {cart.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
          <div className="space-y-1.5 mb-4 text-sm">
            <div className="flex items-center justify-between text-gray-500">
              <span>Subtotal</span>
              <span>₱{netSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-500">
              <span>VAT (12%)</span>
              <span>₱{vatAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <span className="font-medium text-gray-900">Total</span>
              <span className="text-2xl font-bold text-blue-600">₱{cartTotal.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={openPayment}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 px-6 rounded-xl transition-all active:scale-95"
          >
            Proceed to Payment
          </button>
        </div>
      )}

      {/* Payment sheet — slides up from the bottom on mobile (bottom sheet),
          centers on desktop. Icons, not emoji. */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60]">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Select Payment</h2>
                <p className="text-gray-400 text-sm">Choose gateway or tender type</p>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                aria-label="Close"
                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Total due */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl py-6 text-center mb-6">
              <p className="text-gray-500 text-sm">Total Due Amount</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">₱{cartTotal.toFixed(2)}</p>
              {orderRef && (
                <span className="inline-block mt-2 text-xs font-medium text-green-700 bg-green-100 rounded-full px-3 py-1">
                  Order ID: {orderRef}
                </span>
              )}
            </div>

            {/* Payment method picker */}
            <div className="space-y-3 mb-4">
              {PAYMENT_METHODS.map(method => {
                const Icon = method.icon
                const isSelected = selectedPayment === method.id
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className={`w-full rounded-xl p-4 text-left flex items-center gap-4 transition-colors border ${
                      isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-11 h-11 rounded-xl ${method.iconBg} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{method.label}</p>
                      <p className="text-gray-400 text-sm">{method.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-blue-600' : 'border-gray-300'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Offline note */}
            {!isOnline && (
              <p className="text-gray-400 text-xs mb-4 flex items-center gap-1.5">
                Saved locally. Syncing in background...
              </p>
            )}

            <button
              onClick={() => handleCheckout(selectedPayment)}
              disabled={isProcessing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : `Confirm & Pay ${selectedMethod?.label.split(' ')[0]}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}