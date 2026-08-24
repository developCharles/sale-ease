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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProducts()
    loadCart()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function handleOnline() {
    setIsOnline(true)
    syncPendingSales()
  }

  function handleOffline() {
    setIsOnline(false)
  }

  async function loadProducts() {
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

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col">
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-amber-500 text-black text-center py-2 text-sm font-medium z-50">
          Offline Mode - Sales will sync when connected
        </div>
      )}

      <header className={`bg-dark-800 border-b border-dark-700 ${!isOnline ? 'mt-10' : ''}`}>
        <div className="px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="text-dark-400 hover:text-white transition-colors">
            &larr; Back
          </button>
          <h1 className="font-bold text-lg">
            <span className="text-primary-500">Sale</span> Ease
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
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-3 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-dark-300 hover:bg-dark-700 border border-dark-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => handleAddToCart(product)}
                  disabled={product.stock_quantity <= 0}
                  className={`bg-dark-800 rounded-2xl p-3 text-left border border-dark-700 transition-all active:scale-95 ${
                    product.stock_quantity <= 0
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-primary-500'
                  }`}
                >
                  <div className="aspect-square bg-dark-700 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
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
                  <h3 className="font-medium text-sm truncate text-white">{product.name}</h3>
                  <p className="text-primary-500 font-bold text-sm">₱{product.price}</p>
                  <p className="text-dark-400 text-xs mt-1">
                    {product.stock_quantity > 0 ? `Stock: ${product.stock_quantity}` : 'Out of stock'}
                  </p>
                </button>
              ))}
              {filteredProducts.length === 0 && (
                <div className="col-span-full text-center py-10 text-dark-400">
                  <p className="text-4xl mb-2">📦</p>
                  <p>No products found</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full md:w-96 bg-dark-800 border-t md:border-t-0 md:border-l border-dark-700 flex flex-col max-h-[50vh] md:max-h-none">
          <div className="p-4 border-b border-dark-700 flex items-center justify-between">
            <h2 className="font-bold">
              Cart ({cart.length})
            </h2>
            {cart.length > 0 && (
              <button
                onClick={async () => { await clearCart(); setCart([]) }}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="text-center py-10 text-dark-400">
                <p className="text-4xl mb-2">🛒</p>
                <p>Tap products to add</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.id} className="bg-dark-700 rounded-xl p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-white">{item.name}</p>
                      <p className="text-primary-500 text-sm">₱{item.price}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="w-8 h-8 rounded-lg bg-dark-600 hover:bg-dark-500 flex items-center justify-center text-white transition-colors"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-medium text-white text-sm">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="w-8 h-8 rounded-lg bg-dark-600 hover:bg-dark-500 flex items-center justify-center text-white transition-colors"
                      >
                        +
                      </button>
                      <button
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="w-8 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-dark-700">
            <div className="flex items-center justify-between mb-4">
              <span className="text-dark-400">Total</span>
              <span className="text-2xl font-bold text-white">₱{cartTotal.toLocaleString()}</span>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.length === 0}
              className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-6 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Checkout
            </button>
          </div>
        </div>
      </div>

      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50">
          <div className="bg-dark-800 rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 border border-dark-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Select Payment</h2>
              <button
                onClick={() => setShowPayment(false)}
                className="text-dark-400 hover:text-white text-xl transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="text-center mb-6">
              <p className="text-dark-400 text-sm">Total Amount</p>
              <p className="text-3xl font-bold text-primary-500">
                ₱{cartTotal.toLocaleString()}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handleCheckout('cash')}
                className="w-full bg-dark-700 hover:bg-dark-600 rounded-xl p-4 text-left flex items-center gap-4 transition-colors border border-dark-600"
              >
                <span className="text-2xl">💵</span>
                <div>
                  <p className="font-medium text-white">Cash</p>
                  <p className="text-dark-400 text-sm">Physical cash payment</p>
                </div>
              </button>
              <button
                onClick={() => handleCheckout('gcash')}
                className="w-full bg-dark-700 hover:bg-dark-600 rounded-xl p-4 text-left flex items-center gap-4 transition-colors border border-dark-600"
              >
                <span className="text-2xl">📱</span>
                <div>
                  <p className="font-medium text-white">GCash</p>
                  <p className="text-dark-400 text-sm">GCash e-wallet</p>
                </div>
              </button>
              <button
                onClick={() => handleCheckout('maya')}
                className="w-full bg-dark-700 hover:bg-dark-600 rounded-xl p-4 text-left flex items-center gap-4 transition-colors border border-dark-600"
              >
                <span className="text-2xl">💳</span>
                <div>
                  <p className="font-medium text-white">Maya</p>
                  <p className="text-dark-400 text-sm">Maya e-wallet</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
