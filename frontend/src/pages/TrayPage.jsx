import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Coffee, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'

export default function TrayPage() {
  // Tenant name for the header + nav to Settings
  const { profile } = useAuth()
  const navigate = useNavigate()

  // products/categories/loading come from CartContext (shared app-wide)
  const { products, categories, loading, addToCart } = useCart()

  // LOCAL page state — search + category stay here, they're only for this page
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="p-4 flex flex-col min-h-full">
      {/* Row 1 — Cafe name (left) + Settings button (right) */}
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profile?.tenant?.business_name || 'Sale Ease'}
          </h1>
          <p className="text-sm text-gray-400">Smooth sailing for your business</p>
        </div>
        {/* Hey! This is the SETTINGS button — takes over the burger spot, routes to /app/settings */}
        <button
          onClick={() => navigate('/app/settings')}
          aria-label="Settings"
          className="w-11 h-11 flex items-center justify-center bg-white border border-gray-200 rounded-full text-gray-600 hover:text-gray-900 active:scale-95 transition-all"
        >
          <Settings size={22} />
        </button>
      </header>

      {/* Row 2 — Search bar */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search products..."
        className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
      />

      {/* Row 3 — Category chips (scrollable horizontally) */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 mb-1">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              selectedCategory === category
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Row 4 — Product cards (2 cols on phones, 3+ on bigger screens) */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pb-2">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => addToCart(product)}
              disabled={product.stock_quantity <= 0}
              className={`bg-white rounded-2xl p-3 text-left border border-gray-200 transition-all active:scale-95 ${
                product.stock_quantity <= 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500 hover:shadow-sm'
              }`}
            >
              {/* Placeholder picture area */}
              <div className="aspect-square bg-gray-100 rounded-xl mb-2 flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Coffee size={32} strokeWidth={1.5} className="text-gray-300" />
                )}
              </div>
              {/* Product name + price — tap does addToCart automatically */}
              <h3 className="font-medium text-sm truncate text-gray-900">{product.name}</h3>
              <p className="text-blue-600 font-bold text-sm">₱{product.price}</p>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center py-10 text-gray-400">
              <Coffee size={40} className="mx-auto mb-2 text-gray-300" />
              <p>No products found</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}