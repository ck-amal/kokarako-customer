import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { formatDate } from '../utils/dateFormat'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'
import AuditInfo from '../components/AuditInfo'
import { SaleTypePicker, ChickenSaleModal, GoodsSaleModal } from '../components/SaleModals'

function batchLabel(batch, i18nLanguage) {
  if (!batch) return '—'
  return `${batch.farms?.name ?? 'Farm'} — ${formatDate(batch.start_date, i18nLanguage)} (${batch.chick_count?.toLocaleString()} chicks)`
}

const STATUS_STYLE = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-green-100 text-green-700' }
const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed' }

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Sales() {
  const { t, i18n } = useTranslation()
  const { organization, user, userRole, canRecordOperations } = useAuth()
  const { currentStep, stepDone } = useOnboarding()
  const navigate = useNavigate()
  const userName = user?.user_metadata?.full_name || user?.email || 'Unknown'
  const canManage = ['owner', 'manager', 'accountant'].includes(userRole)

  const [sales,         setSales]         = useState([])
  const [batches,       setBatches]       = useState([])
  const [vendors,       setVendors]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [showPicker,    setShowPicker]    = useState(false)
  const [showChicken,   setShowChicken]   = useState(false)
  const [showGoods,     setShowGoods]     = useState(false)
  const [editingSale,   setEditingSale]   = useState(null)

  async function fetchData() {
    setLoading(true)
    const [{ data: salesData }, { data: batchData }, { data: vendorData }] = await Promise.all([
      supabase
        .from('sales')
        .select('*, batches(start_date, chick_count, farms(name)), vendors(name), items(name, unit, item_types(name)), created_by_name, created_at, updated_by_name, updated_at, confirmed_by_name, confirmed_at')
        .eq('organization_id', organization?.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('batches')
        .select('id, start_date, chick_count, mortality_count, farms(name)')
        .eq('organization_id', organization?.id)
        .eq('status', 'active')
        .order('start_date', { ascending: false }),
      supabase
        .from('vendors')
        .select('id, name')
        .eq('organization_id', organization?.id)
        .order('name'),
    ])
    setSales(salesData || [])
    setBatches(batchData || [])
    setVendors(vendorData || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function confirmSale(s) {
    const { error } = await supabase.rpc('confirm_sale', { p_id: s.id, p_by_name: userName })
    if (error) alert(error.message); else fetchData()
  }

  async function deleteSale(s) {
    if (!window.confirm('Delete this sale? This cannot be undone.')) return

    if (s.sale_type === 'goods') {
      // Restore stock
      const itemName = s.items?.name
      if (itemName && s.item_quantity) {
        const { data: stockRow } = await supabase.from('stock').select('id, quantity')
          .eq('organization_id', organization.id).ilike('item_name', itemName).maybeSingle()
        if (stockRow) {
          await supabase.from('stock')
            .update({ quantity: Number(stockRow.quantity) + Number(s.item_quantity) })
            .eq('id', stockRow.id)
        }
        // Remove the stock ledger OUT entry
        await supabase.from('stock_ledger')
          .delete()
          .eq('reference_type', 'goods_sale')
          .eq('reference_id', s.id)
          .eq('organization_id', organization.id)
      }
    }

    const { error } = await supabase.from('sales').delete().eq('id', s.id)
    if (error) alert(error.message); else fetchData()
  }

  function openPicker() { setShowPicker(true) }
  function closePicker() { setShowPicker(false) }
  function chooseType(type) {
    setShowPicker(false)
    if (type === 'chicken') setShowChicken(true)
    else setShowGoods(true)
  }

  // Revenue this month (confirmed only)
  const now = new Date()
  const thisMonthRevenue = sales
    .filter(s => {
      const d = new Date(s.date)
      return s.status === 'confirmed' && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    .reduce((sum, s) => sum + Number((s.final_amount ?? s.total_amount) || 0), 0)

  const monthLabel = now.toLocaleDateString(i18n.language === 'ml' ? 'ml-IN' : 'en-IN', { month: 'long', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('sales.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record and track all sales</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/vendors')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition"
          >
            🤝 Vendors
          </button>
          {canRecordOperations && (
            <button
              data-tour="sale"
              onClick={openPicker}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
            >
              <span className="text-base leading-none">+</span> {t('sales.recordSale')}
            </button>
          )}
        </div>
      </div>

      {/* Revenue this month */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-400 rounded-2xl px-6 py-5 mb-6 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-sm text-amber-100 font-medium">{t('sales.totalRevenue')} — {monthLabel}</p>
          <p className="text-3xl font-bold text-white mt-0.5">
            {loading ? '…' : formatCurrency(thisMonthRevenue)}
          </p>
        </div>
        <span className="text-5xl opacity-30">💰</span>
      </div>

      {/* Sales table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-5xl mb-3">📦</span>
            <p className="text-sm font-medium">{t('sales.noSales')}</p>
            <p className="text-xs mt-1">{t('sales.recordSale')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3">{t('common.date')}</th>
                <th className="px-5 py-3">Batch / Item</th>
                <th className="px-5 py-3">{t('sales.vendor')}</th>
                <th className="px-5 py-3 text-right">Quantity</th>
                <th className="px-5 py-3 text-right">Unit Price</th>
                <th className="px-5 py-3 text-right">{t('common.total')}</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="w-8 px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sales.map(s => {
                const isGoods = s.sale_type === 'goods'
                const unitPrice = Number(s.price_per_kg || 0)
                return (
                  <tr key={s.id} className="hover:bg-amber-50/40 transition">
                    <td className="px-5 py-4 text-gray-600 whitespace-nowrap">{formatDate(s.date, i18n.language)}</td>
                    <td className="px-5 py-4 text-gray-700">
                      {isGoods
                        ? <span className="flex items-center gap-2">
                            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-600 leading-tight">Goods</span>
                            <span>{s.items?.name ?? '—'}</span>
                          </span>
                        : s.batches
                          ? `${s.batches.farms?.name ?? '—'} (${formatDate(s.batches.start_date, i18n.language)})`
                          : '—'
                      }
                    </td>
                    <td className="px-5 py-4 text-gray-700">{s.vendors?.name ?? '—'}</td>
                    <td className="px-5 py-4 text-right text-gray-700">
                      {isGoods
                        ? `${Number(s.item_quantity).toLocaleString('en-IN')} ${s.items?.unit ?? ''}`
                        : s.kg_sold
                          ? <>
                              <div>{Number(s.kg_sold).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg</div>
                              {s.chicken_count != null && (
                                <div className="text-xs text-gray-400">{Number(s.chicken_count).toLocaleString('en-IN')} birds</div>
                              )}
                            </>
                          : '—'
                      }
                    </td>
                    <td className="px-5 py-4 text-right text-gray-700">
                      {unitPrice ? formatCurrency(unitPrice) + (isGoods ? `/${s.items?.unit ?? 'unit'}` : '/kg') : '—'}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-gray-800">
                      {formatCurrency(s.final_amount ?? s.total_amount)}
                      {s.final_amount != null && Math.abs(Number(s.final_amount) - Number(s.total_amount)) > 0.01 && (
                        <div className="text-xs text-gray-400 font-normal line-through">
                          {formatCurrency(s.total_amount)}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status] || STATUS_STYLE.pending}`}>
                        {STATUS_LABEL[s.status] || s.status}
                      </span>
                      {canManage && (
                        <div className="flex gap-1.5 justify-center mt-2 flex-wrap">
                          {s.status === 'pending' && !isGoods && (
                            <button onClick={() => confirmSale(s)}
                              className="rounded-md bg-green-600 hover:bg-green-700 px-2 py-1 text-[11px] font-semibold text-white transition">Confirm</button>
                          )}
                          {!isGoods && (
                            <button onClick={() => setEditingSale(s)}
                              className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition">Edit</button>
                          )}
                          <button onClick={() => deleteSale(s)}
                            className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition">Delete</button>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <AuditInfo createdByName={s.created_by_name} createdAt={s.created_at} updatedByName={s.updated_by_name} updatedAt={s.updated_at} confirmedByName={s.confirmed_by_name} confirmedAt={s.confirmed_at} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  {t('common.total')} (confirmed)
                </td>
                <td className="px-5 py-3 text-right font-bold text-gray-800">
                  {formatCurrency(sales.filter(s => s.status === 'confirmed').reduce((sum, s) => sum + Number((s.final_amount ?? s.total_amount) || 0), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
          </div>
        )}
      </div>

      {/* Type picker */}
      {showPicker && <SaleTypePicker onChoose={chooseType} onClose={closePicker} />}

      {/* Chicken Sale Modal */}
      {showChicken && (
        <ChickenSaleModal
          batches={batches}
          vendors={vendors}
          onClose={() => setShowChicken(false)}
          onSaved={() => {
            setShowChicken(false)
            fetchData()
            if (currentStep?.id === 'sale') stepDone('sale')
          }}
        />
      )}

      {/* Goods Sale Modal */}
      {showGoods && (
        <GoodsSaleModal
          vendors={vendors}
          onClose={() => setShowGoods(false)}
          onSaved={() => { setShowGoods(false); fetchData() }}
        />
      )}

      {/* Edit Chicken Sale Modal */}
      {editingSale && (
        <ChickenSaleModal
          batches={batches}
          vendors={vendors}
          sale={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={() => { setEditingSale(null); fetchData() }}
        />
      )}
    </div>
  )
}
