# Build Spec: Login + Cashier (POS) Page

## Context

**Project:** Sale Ease — a PWA POS system (SaaS)
**Stack:** React 19 + Vite + Tailwind CSS v4 + Supabase + IndexedDB (idb)
**Design:** Mobile-first, dark theme, touch-optimized
**Folder:** All frontend code lives in `frontend/src/`

---

## Supabase Tables (already designed)

```sql
-- tenants
id (uuid, PK)
business_name (text)
theme_config (jsonb)
subscription_status (text)

-- users
id (uuid, PK, FK → auth.users)
tenant_id (uuid, FK → tenants)
email (text)
role (text: 'owner' | 'admin' | 'cashier')
pin_hash (text, nullable)

-- products
id (uuid, PK)
tenant_id (uuid, FK → tenants)
name (text)
price (decimal)
stock_quantity (integer)
category (text)
image_url (text, nullable)
is_active (boolean, default true)

-- sales
id (uuid, PK)
tenant_id (uuid, FK → tenants)
user_id (uuid, FK → users)
total_amount (decimal)
payment_method (text: 'cash' | 'gcash' | 'maya')
sync_status (text: 'pending' | 'synced')
offline_id (text, nullable, unique)
created_at (timestamptz)

-- sale_items
id (uuid, PK)
sale_id (uuid, FK → sales)
product_id (uuid, FK → products)
quantity (integer)
unit_price (decimal)

-- inventory_logs
id (uuid, PK)
product_id (uuid, FK → products)
change_quantity (integer)
reason (text: 'sale' | 'restock' | 'adjustment' | 'void')
created_by (uuid, FK → users)
created_at (timestamptz)
```

**RLS Policy:** Every query must filter by `tenant_id` matching the authenticated user's tenant. This ensures multi-tenant data isolation.

---

## Files to Create

### 1. `frontend/src/lib/supabase.js`

Initialize and export the Supabase client.

```js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 2. `frontend/.env.example`

```
VITE_SUPABASE_URL=your_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

User must create `.env` from this and fill in their Supabase credentials.

### 3. `frontend/src/contexts/AuthContext.jsx`

React Context that provides:
- `user` — the Supabase auth user object (or null)
- `profile` — the user's row from the `users` table including their `role` and `tenant`
- `loading` — true while checking auth state
- `login(email, password)` — calls `supabase.auth.signInWithPassword()`, then fetches the user profile from the `users` table (join `tenants` to get `business_name` and `theme_config`)
- `logout()` — calls `supabase.auth.signOut()`
- `isAdmin()` — returns true if role is `'owner'` or `'admin'`

Use `supabase.auth.onAuthStateChange()` in a useEffect to listen for session changes. On mount, call `supabase.auth.getSession()` to restore session.

### 4. `frontend/src/components/ProtectedRoute.jsx`

A wrapper component that:
- Shows a loading spinner while `loading` is true
- Redirects to `/login` if no `user`
- Accepts an optional `requiredRole` prop — if the user's role doesn't match, redirect to `/`

### 5. `frontend/src/pages/Login.jsx`

**Layout:** Centered card on dark gradient background.

**Content:**
- "Sale Ease" logo/title at top with tagline "Smooth sailing for your business"
- Email input
- Password input
- "Sign In" button — calls `login()` from AuthContext, navigates to `/` on success
- Toggle link at bottom: "Use 4-digit PIN" — swaps password field for a 4-digit PIN input (numeric, max 4 chars, centered letterspacing)
- Error message display (red box above button)
- Footer: "Sale Ease v1.0"

**Styling notes:**
- Use Tailwind classes only. No custom CSS file.
- Inputs use: `bg-dark-700 border border-dark-600 rounded-xl px-4 py-3 text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500`
- Primary button: `bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-6 rounded-xl transition-all active:scale-95`
- PIN input: `text-center text-2xl tracking-widest`

**Note:** PIN login for MVP can just use the password field (send PIN as password). Real bcrypt PIN verification is a later feature.

### 6. `frontend/src/utils/indexedDB.js`

Offline storage using the `idb` library.

Create a DB named `'sale-ease-db'` with version 1. Object stores:

**`cart`** — keyPath: `'id'`
- `getCart()` — returns all items
- `addToCart(item)` — if item exists, increment quantity; otherwise add it with `quantity: 1` and `added_at` timestamp
- `updateCartItem(id, updates)` — merge updates into existing item
- `removeFromCart(id)` — delete by id
- `clearCart()` — clear all

**`pending-sales`** — keyPath: `'offline_id'`, index on `sync_status`
- `addPendingSale(sale)` — store a sale made offline
- `getPendingSales()` — get all pending sales
- `removePendingSale(offlineId)` — delete after successful sync
- `generateOfflineId()` — returns `"offline_{timestamp}_{random}"`

**`products`** — keyPath: `'id'`
- `cacheProducts(products)` — bulk put products for offline access
- `getCachedProducts()` — return all cached products

### 7. `frontend/src/pages/POS.jsx`

This is the **main cashier checkout screen**. Full-screen, no sidebar nav.

**Layout (mobile-first):**
```
┌─────────────────────────┐
│  ← Back    Sale Ease    │  ← header
├─────────────────────────┤
│  🔍 Search products...  │  ← search bar
├─────────────────────────┤
│ [All] [Coffee] [Food]   │  ← category filter (horizontal scroll)
├─────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐│
│ │ ☕  │ │ 🍞  │ │ 🥤  ││  ← product grid (2 cols mobile, 3-4 cols desktop)
│ │Ameri│ │Bread│ │Juice││
│ │₱120 │ │₱45  │ │₱60  ││
│ └─────┘ └─────┘ └─────┘│
│                         │
├─────────────────────────┤
│  🛒 Cart (3 items)      │  ← cart section (bottom on mobile, right sidebar on desktop)
│ ┌─────────────────────┐ │
│ │Americano    ₱120   │ │
│ │  [-] 2 [+]     [×] │ │
│ ├─────────────────────┤ │
│ │Bread         ₱45   │ │
│ │  [-] 1 [+]     [×] │ │
│ └─────────────────────┘ │
│ Total:      ₱285       │
│ [Checkout]              │
└─────────────────────────┘
```

**Functionality:**

1. **Load products** from Supabase on mount. Also cache them in IndexedDB for offline use.
2. **Category filter** — extract unique categories from products, show as horizontal pill buttons. "All" is default.
3. **Search** — filter products by name (case-insensitive).
4. **Add to cart** — tapping a product adds it. If already in cart, increment quantity. Check stock — if `stock_quantity <= 0`, show alert and don't add.
5. **Cart management** — +/- buttons to adjust quantity, × to remove. If quantity hits 0, remove item.
6. **Offline indicator** — when `navigator.onLine` is false, show a yellow banner: "⚠️ Offline Mode — Sales will sync when connected". Listen to `online`/`offline` events.
7. **Checkout button** — opens a payment modal (bottom sheet on mobile).
8. **Payment modal** — shows total amount and 3 options: Cash, GCash, Maya. Each is a button. Selecting one completes the sale:
   - **If online:** POST to Supabase `sales` table + `sale_items`. Update `products.stock_quantity`. Then clear cart.
   - **If offline:** Save to IndexedDB `pending-sales` store. Clear cart. Show "Sale saved offline" message.
9. **Back button** — navigates to `/`.

**Styling notes:**
- Product grid cards: `bg-dark-800 rounded-2xl p-4 border border-dark-700`
- Out of stock products: `opacity-50 cursor-not-allowed`
- Active/hover: `hover:border-primary-500`
- Cart item layout: flex row with name/price on left, quantity controls on right
- Payment modal: fixed overlay with `bg-black/50`, content slides up from bottom on mobile

### 8. `frontend/src/App.jsx`

Router setup:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Login from './pages/Login'
import POS from './pages/POS'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute><POS /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
export default App
```

More pages (Dashboard, Products, Reports, Settings) will be added later.

### 9. `frontend/src/index.css`

Should only contain:
```css
@import "tailwindcss";
```

All styling via Tailwind utility classes. No custom CSS.

### 10. Tailwind Custom Theme

The default Tailwind v4 config works fine. For the custom dark palette, add this to `index.css` above `@import "tailwindcss"` or use Tailwind's `@theme` directive:

```css
@import "tailwindcss";

@theme {
  --color-primary-50: #f0f9ff;
  --color-primary-100: #e0f2fe;
  --color-primary-200: #bae6fd;
  --color-primary-300: #7dd3fc;
  --color-primary-400: #38bdf8;
  --color-primary-500: #0ea5e9;
  --color-primary-600: #0284c7;
  --color-primary-700: #0369a1;
  --color-primary-800: #075985;
  --color-primary-900: #0c4a6e;

  --color-dark-50: #f8fafc;
  --color-dark-100: #f1f5f9;
  --color-dark-200: #e2e8f0;
  --color-dark-300: #cbd5e1;
  --color-dark-400: #94a3b8;
  --color-dark-500: #64748b;
  --color-dark-600: #475569;
  --color-dark-700: #334155;
  --color-dark-800: #1e293b;
  --color-dark-900: #0f172a;

  --font-sans: 'Inter', system-ui, sans-serif;
}
```

This allows classes like `bg-dark-900`, `text-primary-500`, `border-dark-700`, etc.

### 11. `frontend/index.html`

Add to `<head>`:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<meta name="theme-color" content="#0f172a" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Sale Ease</title>
```

Body should have `class="bg-dark-900 text-white"`.

---

## Build Order

Create files in this order:

1. `.env.example` + `.env` (user fills in credentials)
2. `lib/supabase.js`
3. `utils/indexedDB.js`
4. `contexts/AuthContext.jsx`
5. `components/ProtectedRoute.jsx`
6. `pages/Login.jsx`
7. `pages/POS.jsx`
8. Update `App.jsx` with router
9. Update `index.css` with theme
10. Update `index.html` with meta tags

---

## Key Notes

- **No custom CSS files.** Tailwind only.
- **No backend needed yet.** Everything talks directly to Supabase from the frontend.
- **No receipt generation.** Just complete the sale and update stock.
- **Payment methods are manual.** No gateway integration. User taps "Cash"/"GCash"/"Maya" and the sale is recorded.
- **Offline-first pattern:** IndexedDB is the source of truth for cart. Sales made offline are queued in IndexedDB and synced to Supabase when back online.
- **All files use ES modules** (`import`/`export`).
- **React 19** is being used — no special migration concerns for this scope.
