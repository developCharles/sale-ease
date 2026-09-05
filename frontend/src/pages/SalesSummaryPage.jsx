import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { supabase } from '../lib/supabase'
import { getPendingSales } from '../utils/indexedDB'

const DAILY_BUCKETS = [
  { label: '08am', startHour: 8 },
  { label: '10am', startHour: 10 },
  { label: '12pm', startHour: 12 },
  { label: '02pm', startHour: 14 },
  { label: '04pm', startHour: 16 },
]

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

const PAYMENT_COLORS = {
  cash: '#22C55E',
  gcash: '#3B82F6',
  maya: '#F59E0B',
  other: '#9CA3AF',
}

function formatPeso(n) {
  const num = Number(n) || 0
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatShort(n) {
  const num = Number(n) || 0
  if (num >= 1000) return `₱${(num / 1000).toFixed(1)}k`
  return `₱${Math.round(num)}`
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

function formatDateTime(iso) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) return formatTime(iso)
    const date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    return `${date} · ${formatTime(iso)}`
  } catch {
    return formatTime(iso)
  }
}

function formatMethod(method) {
  if (method === 'gcash') return 'GCash'
  if (method === 'maya') return 'Maya'
  if (method === 'cash') return 'Cash'
  return method || 'Other'
}

function orderLabel(id) {
  if (!id) return '#----'
  return `#${String(id).slice(-4).toUpperCase()}`
}

// Resolve the [start, end) window for a mode + offset.
// offset 0 = current period, -1 = previous, etc. Future is clamped in UI.
function getPeriodRange(mode, offset) {
  const now = new Date()
  if (mode === 'daily') {
    const start = new Date(now)
    start.setDate(now.getDate() + offset)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    return { start, end }
  }
  if (mode === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return { start, end }
  }
  // weekly, Monday-first
  const base = new Date(now)
  const day = base.getDay()
  const diff = day === 0 ? -6 : 1 - day
  base.setDate(base.getDate() + diff)
  base.setHours(0, 0, 0, 0)
  const start = new Date(base)
  start.setDate(base.getDate() + offset * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

function periodLabel(mode, start, end, offset) {
  if (mode === 'daily') {
    const fmt = start.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    if (offset === 0) return `Today · ${fmt}`
    if (offset === -1) return `Yesterday · ${fmt}`
    return fmt
  }
  if (mode === 'monthly') {
    return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  const last = new Date(end.getTime() - 1)
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = last.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return offset === 0 ? `This week · ${s} – ${e}` : `${s} – ${e}`
}

export default function SalesSummaryPage() {
  const { profile } = useAuth()
  const { isOnline } = useCart()

  const [mode, setMode] = useState('daily')
  const [offset, setOffset] = useState(0)
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)

  const { start, end } = useMemo(() => getPeriodRange(mode, offset), [mode, offset])
  const label = periodLabel(mode, start, end, offset)
  const resetLabel = mode === 'daily' ? 'Today' : mode === 'weekly' ? 'This week' : 'This month'

  function selectMode(m) {
    setMode(m)
    setOffset(0)
  }

  useEffect(() => {
    fetchSales()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.tenant_id, mode, offset])

  async function fetchSales() {
    setLoading(true)
    const { start: s, end: e } = getPeriodRange(mode, offset)
    const startISO = s.toISOString()
    const endISO = e.toISOString()

    let synced = []
    if (profile?.tenant_id) {
      try {
        const { data, error } = await supabase
          .from('sales')
          .select('id,total_amount,payment_method,created_at,sync_status')
          .eq('tenant_id', profile.tenant_id)
          .gte('created_at', startISO)
          .lt('created_at', endISO)
          .order('created_at', { ascending: false })
          .limit(1000)

        if (error) throw error
        synced = (data || []).map((row) => ({
          id: row.id,
          total_amount: Number(row.total_amount) || 0,
          payment_method: row.payment_method,
          created_at: row.created_at,
          sync_status: row.sync_status || 'synced',
        }))
      } catch (err) {
        console.error('Error fetching sales, falling back to offline:', err)
      }
    }

    // Offline-first: always merge pending sales from IndexedDB
    let pending = []
    try {
      const allPending = await getPendingSales()
      pending = (allPending || [])
        .filter((row) => {
          const d = new Date(row.created_at)
          return d >= s && d < e
        })
        .map((row) => ({
          id: row.offline_id,
          total_amount: Number(row.total_amount) || 0,
          payment_method: row.payment_method,
          created_at: row.created_at,
          sync_status: 'pending',
        }))
    } catch (err) {
      console.error('Error reading pending sales:', err)
    }

    const merged = [...pending, ...synced].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
    setSales(merged)
    setLoading(false)
  }

  const total = useMemo(
    () => sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
    [sales]
  )
  const avg = sales.length > 0 ? total / sales.length : 0

  // Bar distribution buckets (existing behavior)
  const chartData = useMemo(() => {
    if (mode === 'monthly') {
      // Group month into 4 weekly buckets: days 1-7, 8-14, 15-21, 22-end
      const sums = [0, 0, 0, 0]
      sales.forEach((s) => {
        const day = new Date(s.created_at).getDate()
        const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
        sums[idx] += Number(s.total_amount) || 0
      })
      return ['W1', 'W2', 'W3', 'W4'].map((label, i) => ({
        label,
        value: Math.round(sums[i]),
      }))
    }
    if (mode === 'weekly') {
      const sums = [0, 0, 0, 0, 0, 0, 0]
      sales.forEach((s) => {
        const d = new Date(s.created_at).getDay()
        sums[d] += Number(s.total_amount) || 0
      })
      return MON_FIRST.map((d) => ({ label: WEEK_DAYS[d], value: Math.round(sums[d]) }))
    }
    const sums = DAILY_BUCKETS.map(() => 0)
    sales.forEach((s) => {
      const h = new Date(s.created_at).getHours()
      DAILY_BUCKETS.forEach((b, i) => {
        if (h >= b.startHour && h < b.startHour + 2) sums[i] += Number(s.total_amount) || 0
      })
    })
    return DAILY_BUCKETS.map((b, i) => ({ label: b.label, value: Math.round(sums[i]) }))
  }, [sales, mode])

  const peak = useMemo(() => {
    let best = { label: '—', value: 0 }
    chartData.forEach((d) => {
      if (d.value > best.value) best = d
    })
    return best
  }, [chartData])
  const peakIndex = chartData.findIndex((d) => d.value === peak.value && peak.value > 0)

  // Trend series — CRM-style "Sales Trend" line
  const trendData = useMemo(() => {
    if (mode === 'monthly') {
      const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
      const sums = Array(daysInMonth).fill(0)
      sales.forEach((s) => {
        const day = new Date(s.created_at).getDate()
        if (day >= 1 && day <= daysInMonth) sums[day - 1] += Number(s.total_amount) || 0
      })
      return sums.map((value, i) => ({ label: `${i + 1}`, value: Math.round(value) }))
    }
    if (mode === 'weekly') {
      const sums = [0, 0, 0, 0, 0, 0, 0]
      sales.forEach((s) => {
        sums[new Date(s.created_at).getDay()] += Number(s.total_amount) || 0
      })
      return MON_FIRST.map((d) => ({ label: WEEK_DAYS[d], value: Math.round(sums[d]) }))
    }
    const sums = DAILY_BUCKETS.map(() => 0)
    sales.forEach((s) => {
      const h = new Date(s.created_at).getHours()
      DAILY_BUCKETS.forEach((b, i) => {
        if (h >= b.startHour && h < b.startHour + 2) sums[i] += Number(s.total_amount) || 0
      })
    })
    return DAILY_BUCKETS.map((b, i) => ({ label: b.label, value: Math.round(sums[i]) }))
  }, [sales, mode, start])

  const bestTrend = useMemo(() => {
    let best = { label: '—', value: 0 }
    trendData.forEach((d) => {
      if (d.value > best.value) best = d
    })
    return best
  }, [trendData])

  // Payment mix donut — CRM-style "Sales This Month" pie
  const paymentMix = useMemo(() => {
    const sums = { cash: 0, gcash: 0, maya: 0, other: 0 }
    sales.forEach((s) => {
      const key = ['cash', 'gcash', 'maya'].includes(s.payment_method)
        ? s.payment_method
        : 'other'
      sums[key] += Number(s.total_amount) || 0
    })
    return Object.entries(sums)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name: formatMethod(name),
        key: name,
        value: Math.round(value),
      }))
  }, [sales])

  const topMethod = useMemo(() => {
    let best = { name: '—', value: 0 }
    paymentMix.forEach((p) => {
      if (p.value > best.value) best = p
    })
    const pct = total > 0 ? Math.round((best.value / total) * 100) : 0
    return { ...best, pct }
  }, [paymentMix, total])

  const distributionTitle =
    mode === 'daily' ? 'Hourly Distribution' : mode === 'weekly' ? 'Daily Distribution' : 'Weekly Distribution'
  const trendTitle = mode === 'daily' ? 'Sales Trend · Hourly' : mode === 'weekly' ? 'Sales Trend · Last 7 days' : 'Sales Trend · Daily'

  return (
    <div className="p-4 flex flex-col min-h-full">
      {/* Header — same type scale as Tray/Cart */}
      <header className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reports</h1>
          <p className="text-sm text-gray-400">Live analytics of Terminal #01</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 ${
            isOnline ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500'}`}
          />
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </span>
      </header>

      {/* Daily / Weekly / Monthly toggle — segmented control */}
      <div className="grid grid-cols-3 bg-gray-200/70 rounded-xl p-1 mb-3">
        {['daily', 'weekly', 'monthly'].map((m) => (
          <button
            key={m}
            onClick={() => selectMode(m)}
            className={`min-h-11 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              mode === m ? 'bg-blue-600 text-white shadow' : 'text-gray-500'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Period navigator — browse current + previous periods */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-2 py-1.5 mb-4">
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Previous period"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 active:scale-95 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          {offset !== 0 && (
            <button
              onClick={() => setOffset(0)}
              className="text-xs text-blue-600 font-medium hover:text-blue-700"
            >
              Back to {resetLabel.toLowerCase()}
            </button>
          )}
        </div>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset >= 0}
          aria-label="Next period"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Total', value: formatShort(total), title: formatPeso(total) },
          { label: 'Orders', value: String(sales.length), title: `${sales.length} orders` },
          { label: 'Avg', value: formatShort(avg), title: formatPeso(avg) },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-gray-200 rounded-2xl p-3 text-center"
          >
            <p className="text-xs text-gray-400">{s.label}</p>
            <p title={s.title} className="font-bold text-gray-900 text-sm mt-0.5 truncate">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Distribution bar card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-900">{distributionTitle}</h2>
          <p className="text-sm font-bold text-blue-600">{formatPeso(total)} Total</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Receipt size={32} className="mb-2 text-gray-300" />
            <p className="text-sm">No sales in this period</p>
          </div>
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => [formatPeso(value), 'Sales']}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E5E7EB',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === peakIndex ? '#D97706' : '#3B82F6'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Peak: {peak.label} · {formatShort(peak.value)}
            </p>
          </>
        )}
      </div>

      {/* Trend line card — CRM "Sales Trend" analog */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-900">{trendTitle}</h2>
          <p className="text-xs text-gray-400">Count: {sales.length}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Receipt size={32} className="mb-2 text-gray-300" />
            <p className="text-sm">No trend yet</p>
          </div>
        ) : (
          <>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={16}
                  />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value) => [formatPeso(value), 'Sales']}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E5E7EB',
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="#DBEAFE"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Best: {bestTrend.label} · {formatShort(bestTrend.value)}
            </p>
          </>
        )}
      </div>

      {/* Payment mix donut — CRM pie analog */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-900">Payment Mix</h2>
          <p className="text-xs text-gray-400">Avg order: {formatPeso(avg)}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : paymentMix.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Receipt size={32} className="mb-2 text-gray-300" />
            <p className="text-sm">No payments yet</p>
          </div>
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {paymentMix.map((p) => (
                      <Cell key={p.key} fill={PAYMENT_COLORS[p.key] || PAYMENT_COLORS.other} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatPeso(value), 'Sales']}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E5E7EB',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-1">
              {paymentMix.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PAYMENT_COLORS[p.key] || PAYMENT_COLORS.other }}
                  />
                  {p.name}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">
              Top: {topMethod.name} · {topMethod.pct}%
            </p>
          </>
        )}
      </div>

      {/* Recent transactions — same card style as Cart line items */}
      <h2 className="text-xs font-medium text-gray-400 tracking-wide mb-2">
        RECENT TRANSACTIONS
      </h2>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : sales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <Receipt size={40} className="mb-2 text-gray-300" />
          <p className="text-sm">No transactions in this period</p>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          {sales.slice(0, 20).map((sale) => {
            const isPending = sale.sync_status === 'pending'
            return (
              <div
                key={sale.id}
                className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-11 h-11 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Receipt size={20} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">
                    Order {orderLabel(sale.id)}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {formatDateTime(sale.created_at)} • {formatMethod(sale.payment_method)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-medium text-sm text-gray-900">
                    {formatPeso(sale.total_amount)}
                  </p>
                  <span
                    className={`inline-block mt-0.5 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                      isPending
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {isPending ? 'Pending' : 'Synced'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
