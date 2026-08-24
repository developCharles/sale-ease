import { openDB } from 'idb'

const DB_NAME = 'sale-ease-db'
const DB_VERSION = 1

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('cart')) {
        db.createObjectStore('cart', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('pending-sales')) {
        const store = db.createObjectStore('pending-sales', { keyPath: 'offline_id' })
        store.createIndex('sync_status', 'sync_status')
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' })
      }
    }
  })
}

export async function getCart() {
  const db = await getDB()
  return db.getAll('cart')
}

export async function addToCart(item) {
  const db = await getDB()
  const existing = await db.get('cart', item.id)

  if (existing) {
    existing.quantity += 1
    await db.put('cart', existing)
    return existing
  }

  const cartItem = {
    ...item,
    quantity: 1,
    added_at: new Date().toISOString()
  }
  await db.put('cart', cartItem)
  return cartItem
}

export async function updateCartItem(id, updates) {
  const db = await getDB()
  const item = await db.get('cart', id)
  if (!item) return null

  const updated = { ...item, ...updates }
  await db.put('cart', updated)
  return updated
}

export async function removeFromCart(id) {
  const db = await getDB()
  await db.delete('cart', id)
}

export async function clearCart() {
  const db = await getDB()
  await db.clear('cart')
}

export async function addPendingSale(sale) {
  const db = await getDB()
  await db.put('pending-sales', sale)
}

export async function getPendingSales() {
  const db = await getDB()
  return db.getAll('pending-sales')
}

export async function removePendingSale(offlineId) {
  const db = await getDB()
  await db.delete('pending-sales', offlineId)
}

export async function cacheProducts(products) {
  const db = await getDB()
  const tx = db.transaction('products', 'readwrite')
  await Promise.all([
    ...products.map(p => tx.store.put(p)),
    tx.done
  ])
}

export async function getCachedProducts() {
  const db = await getDB()
  return db.getAll('products')
}

export function generateOfflineId() {
  return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
