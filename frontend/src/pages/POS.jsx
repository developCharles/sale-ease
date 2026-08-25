import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  addPendingSale,
  getPendingSales,
  removePendingSale,
  generateOfflineId,
  cacheProducts,
  getCachedProducts
} from '../utils/indexedDB'

const PAYMENT_METHODS = [
  {
    id: 'cash',
    label: 'Cash Payment',
    description: 'Fast checkout, change calculator',
    icon: '💵',
    iconBg: 'bg-green-100'
  },
  {
    id: 'gcash',
    label: 'GCash e-Wallet',
    description: 'Instant QR code generation',
    icon: '📱',
    iconBg: 'bg-blue-100'
  },
  {
    id: 'maya',
    label: 'Maya QR',
    description: 'Scan and pay instantly',
    icon: '🟩',
    iconBg: 'bg-amber-100'
  }
]

export default function POS() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState('cash')
  const [orderRef, setOrderRef] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCart()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    // profile loads asynchronously after auth resolves — wait for it
    if (!profile) return
    loadProducts()
  }, [profile])

  function handleOnline() {
    setIsOnline(true)
    syncPendingSales()
  }

  function handleOffline() {
    setIsOnline(false)
  }

  async function loadProducts() {
    if (!profile?.tenant_id) {
      const cached = await getCachedProducts()
      setProducts(cached)
      setCategories(['All', ...new Set(cached.map(p => p.category))])
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_active', true)
        .order('name')

      if (error) throw error

      const productList = data || []
      setProducts(productList)
      setCategories(['All', ...new Set(productList.map(p => p.category))])

      await cacheProducts(productList)
    } catch (error) {
      console.error('Error fetching products, loading from cache:', error)
      const cached = await getCachedProducts()
      setProducts(cached)
      setCategories(['All', ...new Set(cached.map(p => p.category))])
    } finally {
      setLoading(false)
    }
  }

  async function loadCart() {
    const items = await getCart()
    setCart(items)
  }

  async function handleAddToCart(product) {
    if (product.stock_quantity <= 0) {
      alert('Out of stock!')
      return
    }

    const existingItem = cart.find(item => item.id === product.id)
    if (existingItem && existingItem.quantity >= product.stock_quantity) {
      alert('Not enough stock!')
      return
    }

    await addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      stock_quantity: product.stock_quantity
    })

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1 }]
    })
  }

  async function handleUpdateQuantity(productId, delta) {
    const item = cart.find(i => i.id === productId)
    if (!item) return

    const newQuantity = item.quantity + delta
    if (newQuantity <= 0) {
      await removeFromCart(productId)
      setCart(prev => prev.filter(i => i.id !== productId))
    } else {
      await updateCartItem(productId, { quantity: newQuantity })
      setCart(prev => prev.map(i =>
        i.id === productId ? { ...i, quantity: newQuantity } : i
      ))
    }
  }

  async function handleRemoveFromCart(productId) {
    await removeFromCart(productId)
    setCart(prev => prev.filter(i => i.id !== productId))
  }

  function openPayment() {
    setOrderRef(`#${Date.now().toString().slice(-4)}`)
    setSelectedPayment('cash')
    setShowPayment(true)
  }

  async function handleCheckout(paymentMethod) {
    const saleItems = cart.map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      unit_price: item.price
    }))

    const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

    if (isOnline) {
      try {
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert({
            tenant_id: profile.tenant_id,
            user_id: user.id,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            sync_status: 'synced'
          })
          .select()
          .single()

        if (saleError) throw saleError

        const { error: itemsError } = await supabase
          .from('sale_items')
          .insert(saleItems.map(item => ({ ...item, sale_id: sale.id })))

        if (itemsError) throw itemsError

        for (const item of cart) {
          const { data: product } = await supabase
            .from('products')
            .select('stock_quantity')
            .eq('id', item.id)
            .single()

          if (product) {
            await supabase
              .from('products')
              .update({ stock_quantity: Math.max(0, product.stock_quantity - item.quantity) })
              .eq('id', item.id)

            await supabase
              .from('inventory_logs')
              .insert({
                product_id: item.id,
                change_quantity: -item.quantity,
                reason: 'sale',
                created_by: user.id
              })
          }
        }

        await clearCart()
        setCart([])
        setShowPayment(false)
        loadProducts()
      } catch (error) {
        console.error('Error completing sale:', error)
        alert('Error completing sale. Please try again.')
      }
    } else {
      const offlineId = generateOfflineId()
      await addPendingSale({
        offline_id: offlineId,
        items: saleItems,
        total_amount: totalAmount,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
        sync_status: 'pending'
      })

      await clearCart()
      setCart([])
      setShowPayment(false)
      alert('Sale saved offline. Will sync when connected.')
    }
  }

  async function syncPendingSales() {
    try {
      const pending = await getPendingSales()
      for (const sale of pending) {
        const { error } = await supabase
          .from('sales')
          .insert({
            tenant_id: profile.tenant_id,
            user_id: user.id,
            total_amount: sale.total_amount,
            payment_method: sale.payment_method,
            sync_status: 'synced',
            offline_id: sale.offline_id,
            created_at: sale.created_at
          })

        if (!error) {
          const saleId = (await supabase
            .from('sales')
            .select('id')
            .eq('offline_id', sale.offline_id)
            .single()
          ).data?.id

          if (saleId) {
            await supabase
              .from('sale_items')
              .insert(sale.items.map(item => ({ ...item, sale_id: saleId })))

            for (const item of sale.items) {
              const { data: product } = await supabase
                .from('products')
                .select('stock_quantity')
                .eq('id', item.product_id)
                .single()

              if (product) {
                await supabase
                  .from('products')
                  .update({ stock_quantity: Math.max(0, product.stock_quantity - item.quantity) })
                  .eq('id', item.product_id)

                await supabase
                  .from('inventory_logs')
                  .insert({
                    product_id: item.product_id,
                    change_quantity: -item.quantity,
                    reason: 'sale',
                    created_by: user.id
                  })
              }
            }
          }

          await removePendingSale(sale.offline_id)
        }
      }
    } catch (error) {
      console.error('Sync error:', error)
    }
  }

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  // Prices are VAT-inclusive; back out the 12% VAT for the receipt-style breakdown
  const VAT_RATE = 0.12
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const netSubtotal = cartTotal / (1 + VAT_RATE)
  const vatAmount = cartTotal - netSubtotal
  const selectedMethod = PAYMENT_METHODS.find(m => m.id === selectedPayment)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center py-2 text-sm font-medium z-50">
          Offline Mode - Sales will sync when connected
        </div>
      )}

      <header className={`bg-white border-b border-gray-200 ${!isOnline ? 'mt-10' : ''}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-gray-500 hover:text-gray-900 transition-colors">
            &larr; Back
          </button>
          <h1 className="font-bold text-lg text-gray-900">
            <span className="text-blue-600">Sale</span> Ease
          </h1>
          <div className="w-16"></div>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search products..."
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-4 mb-4 -mx-4 px-4">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => handleAddToCart(product)}
                  disabled={product.stock_quantity <= 0}
                  className={`bg-white rounded-2xl p-3 text-left border border-gray-200 transition-all active:scale-95 ${
                    product.stock_quantity <= 0
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-blue-500 hover:shadow-sm'
                  }`}
                >
                  <div className="aspect-square bg-gray-100 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl opacity-50">📦</span>
                    )}
                  </div>
                  <h3 className="font-medium text-sm truncate text-gray-900">{product.name}</h3>
                  <p className="text-blue-600 font-bold text-sm">₱{product.price}</p>
                  <p className="text-gray-400 text-xs mt-1">
                    {product.stock_quantity > 0 ? `Stock: ${product.stock_quantity}` : 'Out of stock'}
                  </p>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full text-center py-10 text-gray-400">
                  <p className="text-4xl mb-2">📦</p>
                  <p>No products found</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full md:w-96 bg-white border-t md:border-t-0 md:border-l border-gray-200 flex flex-col max-h-[50vh] md:max-h-none">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-900">Current Order</h2>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-gray-400 text-xs">Verify order and quantity</p>
              {cart.length > 0 && (
                <button
                  onClick={async () => { await clearCart(); setCart([]) }}
                  className="text-red-500 hover:text-red-600 text-xs font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <p className="text-4xl mb-2">🛒</p>
                <p>Tap products to add</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-lg flex-shrink-0"></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-gray-900">{item.name}</p>
                      <p className="text-blue-600 text-sm font-medium">₱{item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-medium text-gray-900 text-sm">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-lg bg-white border border-gray-300 hover:bg-gray-100 flex items-center justify-center text-gray-700 transition-colors"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200">
            {cart.length > 0 && (
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
                  <span className="text-xl font-bold text-blue-600">₱{cartTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
            <button
              onClick={openPayment}
              disabled={cart.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Proceed to Payment (₱{cartTotal.toFixed(2)})
            </button>
          </div>
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Select Payment</h2>
                <p className="text-gray-400 text-sm">Choose gateway or tender type</p>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                className="text-gray-400 hover:text-gray-900 text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-2xl py-6 text-center mb-6">
              <p className="text-gray-500 text-sm">Total Due Amount</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                ₱{cartTotal.toFixed(2)}
              </p>
              {orderRef && (
                <span className="inline-block mt-2 text-xs font-medium text-green-700 bg-green-100 rounded-full px-3 py-1">
                  Order ID: {orderRef}
                </span>
              )}
            </div>

            <div className="space-y-3 mb-4">
              {PAYMENT_METHODS.map(method => {
                const isSelected = selectedPayment === method.id
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    className={`w-full rounded-xl p-4 text-left flex items-center gap-4 transition-colors border ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg ${method.iconBg} flex items-center justify-center text-lg flex-shrink-0`}>
                      {method.icon}
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

            {!isOnline && (
              <p className="text-gray-400 text-xs mb-4 flex items-center gap-1.5">
                <span>💾</span> Saved locally in IndexedDB. Syncing in background...
              </p>
            )}

            <button
              onClick={() => handleCheckout(selectedPayment)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-all active:scale-95"
            >
              Confirm &amp; Pay {selectedMethod?.label.split(' ')[0]}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}