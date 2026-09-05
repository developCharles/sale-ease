import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'
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

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user, profile } = useAuth()

  const [products, setProducts] = useState([])
  const [cart, setCart] = useState([])
  const [categories, setCategories] = useState([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
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

  async function handleClearCart() {
    await clearCart()
    setCart([])
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

        await handleClearCart()
        loadProducts()

        return { ok: true, offline: false }
      } catch (error) {
        console.error('Error completing sale:', error)
        return { ok: false }
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

      await handleClearCart()

      return { ok: true, offline: true }
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

  const VAT_RATE = 0.12
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const netSubtotal = cartTotal / (1 + VAT_RATE)
  const vatAmount = cartTotal - netSubtotal

  const value = {
    products,
    cart,
    categories,
    isOnline,
    loading,
    addToCart: handleAddToCart,
    updateQuantity: handleUpdateQuantity,
    removeFromCart: handleRemoveFromCart,
    clearCart: handleClearCart,
    checkout: handleCheckout,
    refreshProducts: loadProducts,
    cartTotal,
    netSubtotal,
    vatAmount
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}