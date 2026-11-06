import { useState } from 'react'
import {
  UserRound, Store, Lock, LogOut, Wifi, WifiOff, Palette,
  ImagePlus, ShieldCheck, CheckCircle2
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const { profile, logout, isAdmin, refreshProfile } = useAuth()
  const { isOnline } = useCart()
  const isAdminUser = isAdmin()

  // ---- Business / Storefront form state ----
  const [businessName, setBusinessName] = useState(profile?.tenant?.business_name || '')
  const [accent, setAccent] = useState(profile?.tenant?.theme_config?.accent || '#2563eb')
  const [logoUrl, setLogoUrl] = useState(profile?.tenant?.theme_config?.logo_url || '')
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [businessMsg, setBusinessMsg] = useState('')

  // ---- Change PIN state ----
  const [showPin, setShowPin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [pinMsg, setPinMsg] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  // ---- Sign out confirm ----
  const [showLogout, setShowLogout] = useState(false)

  const initials = (profile?.email || '?').slice(0, 2).toUpperCase()
  const roleLabel = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : 'Staff'

  // Save business name + accent color to the tenant row
  async function handleSaveBusiness() {
    setSavingBusiness(true)
    setBusinessMsg('')
    try {
      const theme_config = { ...(profile?.tenant?.theme_config || {}), accent, logo_url: logoUrl }
      const { error } = await supabase
        .from('tenants')
        .update({ business_name: businessName, theme_config })
        .eq('id', profile.tenant_id)
      if (error) throw error
      await refreshProfile()
      setBusinessMsg('Saved successfully')
    } catch (err) {
      console.error(err)
      setBusinessMsg('Error: ' + err.message)
    } finally {
      setSavingBusiness(false)
    }
  }

  // Upload logo to Supabase Storage, then save the public URL to the tenant
  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSavingBusiness(true)
    setBusinessMsg('')
    try {
      const ext = file.name.split('.').pop()
      const path = `${profile.tenant_id}/logo-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('tenant-assets')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('tenant-assets')
        .getPublicUrl(path)

      setLogoUrl(publicUrl)

      const theme_config = { ...(profile?.tenant?.theme_config || {}), accent, logo_url: publicUrl }
      await supabase.from('tenants').update({ theme_config }).eq('id', profile.tenant_id)
      await refreshProfile()
      setBusinessMsg('Logo updated')
    } catch (err) {
      console.error(err)
      setBusinessMsg('Upload failed: ' + err.message)
    } finally {
      setSavingBusiness(false)
    }
  }

  // Change the 4-digit PIN (this IS the account password)
  async function handleChangePin() {
    if (!/^\d{4}$/.test(newPin)) {
      setPinMsg('Enter exactly 4 digits')
      return
    }
    setSavingPin(true)
    setPinMsg('')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPin })
      if (error) throw error
      setPinMsg('PIN updated')
      setNewPin('')
      setShowPin(false)
    } catch (err) {
      console.error(err)
      setPinMsg('Error: ' + err.message)
    } finally {
      setSavingPin(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="p-4 flex flex-col min-h-full">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Settings</h1>

      {/* ---------- PROFILE ---------- */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{profile?.email}</p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 mt-1">
              <ShieldCheck size={12} /> {roleLabel}
            </span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
          <span className="text-gray-500 flex items-center gap-1.5">
            <Store size={16} /> Business
          </span>
          <span className="font-medium text-gray-900">{profile?.tenant?.business_name || '—'}</span>
        </div>
      </section>

      {/* ---------- BUSINESS / STOREFRONT (admin only) ---------- */}
      {isAdminUser && (
        <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <Store size={18} className="text-gray-400" /> Business & Storefront
            </h2>
            <span className="text-[10px] font-bold uppercase text-gray-400">Admin</span>
          </div>

          {/* Business name */}
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Business name</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
          />

          {/* Logo */}
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo</label>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus size={20} className="text-gray-300" />
              )}
            </div>
            <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700 active:scale-95 transition-all">
              Upload new
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
          </div>

          {/* Accent color */}
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
            <Palette size={14} /> Accent color
          </label>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-12 h-12 rounded-xl border border-gray-200 bg-white p-1"
            />
            <span className="text-sm text-gray-500 font-mono">{accent}</span>
          </div>

          {businessMsg && (
            <p className={`text-sm mb-3 ${businessMsg.startsWith('Error') || businessMsg.startsWith('Upload') ? 'text-red-500' : 'text-green-600'}`}>
              {businessMsg}
            </p>
          )}

          <button
            onClick={handleSaveBusiness}
            disabled={savingBusiness}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
          >
            {savingBusiness ? 'Saving...' : 'Save Changes'}
          </button>
        </section>
      )}

      {/* ---------- ACCOUNT ---------- */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
          <UserRound size={18} className="text-gray-400" /> Account
        </h2>

        {/* Change PIN */}
        <button
          onClick={() => { setShowPin(!showPin); setPinMsg('') }}
          className="w-full flex items-center justify-between py-2 text-sm text-gray-700"
        >
          <span className="flex items-center gap-2"><Lock size={16} className="text-gray-400" /> Change 4-digit PIN</span>
          <span className="text-gray-400">{showPin ? '−' : '+'}</span>
        </button>

        {showPin && (
          <div className="mt-2 mb-2">
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Enter new 4-digit PIN"
              maxLength={4}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-center text-xl tracking-widest text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            />
            {pinMsg && (
              <p className={`text-sm mb-2 ${pinMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{pinMsg}</p>
            )}
            <button
              onClick={handleChangePin}
              disabled={savingPin}
              className="w-full bg-gray-900 hover:bg-black text-white font-medium py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              {savingPin ? 'Updating...' : 'Update PIN'}
            </button>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={() => setShowLogout(true)}
          className="w-full flex items-center gap-2 py-2 mt-1 border-t border-gray-100 pt-3 text-sm font-medium text-red-500 hover:text-red-600"
        >
          <LogOut size={16} /> Sign out
        </button>
      </section>

      {/* ---------- APP INFO ---------- */}
      <section className="bg-white border border-gray-200 rounded-2xl p-4">
        <h2 className="font-bold text-gray-900 mb-3">App</h2>
        <div className="flex items-center justify-between text-sm py-1.5">
          <span className="text-gray-500">Connection</span>
          <span className={`inline-flex items-center gap-1.5 font-medium ${isOnline ? 'text-green-600' : 'text-amber-600'}`}>
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm py-1.5">
          <span className="text-gray-500">Version</span>
          <span className="font-medium text-gray-900">1.0.0</span>
        </div>
      </section>

      {/* ---------- SIGN OUT CONFIRM ---------- */}
      {showLogout && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60]">
          <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border border-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Sign out?</h2>
            <p className="text-gray-400 text-sm mb-5">You'll need your email and PIN to sign back in.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-all active:scale-95"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}