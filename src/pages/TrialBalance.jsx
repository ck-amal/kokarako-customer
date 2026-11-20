import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

function fmt(n) {
  if (n == null || n === 0) return ''
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fyRange() {
  const now = new Date()
  const yr  = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return { start: `${yr}-04-01`, end: now.toISOString().slice(0, 10), label: `FY : ${String(yr).slice(-2)}-${String(yr + 1).slice(-2)}` }
}

// ─── Print styles injected once ──────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  body * { visibility: hidden !important; }
  #tb-print-area, #tb-print-area * { visibility: visible !important; }
  #tb-print-area { position: fixed; top: 0; left: 0; width: 100%; }
  #tb-no-print { display: none !important; }
}
`

export default function TrialBalance() {
  const { organization } = useAuth()
  const [loading,  setLoading]  = useState(false)
  const [asOf,     setAsOf]     = useState(new Date().toISOString().slice(0, 10))
  const [fyLabel,  setFyLabel]  = useState(fyRange().label)

  // Raw data
  const [chickenSales,   setChickenSales]   = useState([])
  const [goodsSales,     setGoodsSales]     = useState([])
  const [chickPurch,     setChickPurch]     = useState([])
  const [farmExp,        setFarmExp]        = useState([])
  const [farmExpRet,     setFarmExpRet]     = useState([])
  const [expenses,       setExpenses]       = useState([])
  const [gfLedger,       setGfLedger]       = useState([])
  const [vendors,        setVendors]        = useState([])
  const [allSales,       setAllSales]       = useState([])
  const [allCollections, setAllCollections] = useState([])
  const [suppliers,      setSuppliers]      = useState([])
  const [allProcurement, setAllProcurement] = useState([])
  const [allSupPayments, setAllSupPayments] = useState([])
  const [accounts,       setAccounts]       = useState([])
  const [transactions,   setTransactions]   = useState([])
  const [farms,          setFarms]          = useState([])
  const [gfLedgerAll,    setGfLedgerAll]    = useState([])
  const [gfAdvAll,       setGfAdvAll]       = useState([])
  const [gfPayAll,       setGfPayAll]       = useState([])

  useEffect(() => {
    const { label } = fyRange()
    setFyLabel(label)
    fetchData(fyRange().start, asOf)
  }, [organization, asOf])

  async function fetchData(start, end) {
    if (!organization?.id) return
    setLoading(true)
    const oid = organization.id

    // Income / expense (FY period)
    const [
      { data: cs }, { data: gs },
      { data: fe }, { data: fer }, { data: ex },
      { data: soldB },
    ] = await Promise.all([
      supabase.from('sales').select('total_amount, final_amount').eq('organization_id', oid).eq('status', 'confirmed').eq('sale_type', 'chicken').gte('date', start).lte('date', end),
      supabase.from('sales').select('total_amount, final_amount, item_quantity, purchase_cost_per_unit').eq('organization_id', oid).eq('status', 'confirmed').eq('sale_type', 'goods').gte('date', start).lte('date', end),
      supabase.from('farm_expenses').select('item_type, total_cost').eq('organization_id', oid).gte('date', start).lte('date', end),
      supabase.from('farm_expense_returns').select('item_type, total_cost').eq('organization_id', oid).gte('date', start).lte('date', end),
      supabase.from('expenses').select('category, amount').eq('organization_id', oid).gte('date', start).lte('date', end),
      supabase.from('batches').select('id').eq('organization_id', oid).eq('status', 'sold').gte('sold_at', start).lte('sold_at', end),
    ])

    // Chick purchases for batches started in period
    const { data: stB } = await supabase.from('batches').select('id').eq('organization_id', oid).gte('start_date', start).lte('start_date', end)
    let cpData = []
    if ((stB || []).length > 0) {
      const { data } = await supabase.from('batch_chick_purchases').select('quantity, price_per_chick, ancillary_per_chick').eq('organization_id', oid).in('batch_id', stB.map(b => b.id))
      cpData = data || []
    }

    // Growing fees for batches closed in period
    let gfl = []
    const soldIds = (soldB || []).map(b => b.id)
    if (soldIds.length > 0) {
      const { data } = await supabase.from('growing_fee_ledger').select('total_fee').eq('organization_id', oid).in('batch_id', soldIds)
      gfl = data || []
    }

    // Balance sheet — cumulative up to `end`
    const [
      { data: vs },   { data: aSales }, { data: aCollect },
      { data: sups }, { data: aProc },  { data: aSupPay },
      { data: accts },{ data: txns },
      { data: fms },  { data: gfla },   { data: gfaa },   { data: gfpa },
    ] = await Promise.all([
      supabase.from('contacts').select('id, name').eq('organization_id', oid).eq('is_vendor', true).order('name'),
      supabase.from('sales').select('vendor_id, total_amount, final_amount').eq('organization_id', oid).eq('status', 'confirmed').lte('date', end),
      supabase.from('cash_collection').select('vendor_id, amount_paid').eq('organization_id', oid).lte('date', end),
      supabase.from('contacts').select('id, name, opening_balance').eq('organization_id', oid).eq('is_supplier', true).order('name'),
      supabase.from('procurement').select('supplier_id, cost, is_return').eq('organization_id', oid).lte('date', end),
      supabase.from('supplier_payments').select('supplier_id, amount').eq('organization_id', oid).lte('payment_date', end),
      supabase.from('accounts').select('id, name, type, opening_balance').eq('organization_id', oid).eq('is_active', true).order('name'),
      supabase.from('transactions').select('account_id, transaction_type, amount').eq('organization_id', oid).lte('transaction_date', end),
      supabase.from('farms').select('id, name').eq('organization_id', oid).order('name'),
      supabase.from('growing_fee_ledger').select('farm_id, total_fee').eq('organization_id', oid).lte('created_at', end + 'T23:59:59Z'),
      supabase.from('growing_fee_advances').select('farm_id, amount').eq('organization_id', oid).lte('payment_date', end),
      supabase.from('growing_fee_payments').select('farm_id, amount').eq('organization_id', oid).lte('payment_date', end),
    ])

    setChickenSales(cs || [])
    setGoodsSales(gs || [])
    setChickPurch(cpData)
    setFarmExp(fe || [])
    setFarmExpRet(fer || [])
    setExpenses(ex || [])
    setGfLedger(gfl)
    setVendors(vs || [])
    setAllSales(aSales || [])
    setAllCollections(aCollect || [])
    setSuppliers(sups || [])
    setAllProcurement(aProc || [])
    setAllSupPayments(aSupPay || [])
    setAccounts(accts || [])
    setTransactions(txns || [])
    setFarms(fms || [])
    setGfLedgerAll(gfla || [])
    setGfAdvAll(gfaa || [])
    setGfPayAll(gfpa || [])
    setLoading(false)
  }

  // ─── Computed values ──────────────────────────────────────────────────────

  const chickenSalesAmt  = useMemo(() => chickenSales.reduce((s, r) => s + Number(r.final_amount || r.total_amount), 0), [chickenSales])
  const goodsSalesAmt    = useMemo(() => goodsSales.reduce((s, r) => s + Number(r.final_amount || r.total_amount), 0), [goodsSales])
  const ancillaryAmt     = useMemo(() => chickPurch.reduce((s, r) => s + Number(r.ancillary_per_chick || 0) * Number(r.quantity || 0), 0), [chickPurch])

  const chickCostAmt = useMemo(() => chickPurch.reduce((s, r) => s + Number(r.price_per_chick || 0) * Number(r.quantity || 0), 0), [chickPurch])

  const feedCostAmt = useMemo(() => {
    const g = farmExp.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost), 0)
    const c = farmExpRet.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, g - c)
  }, [farmExp, farmExpRet])

  const medCostAmt = useMemo(() => {
    const g = farmExp.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    const c = farmExpRet.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, g - c)
  }, [farmExp, farmExpRet])

  const otherFarmAmt = useMemo(() => {
    const g = farmExp.filter(r => !r.item_type?.toLowerCase().includes('feed') && !r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    const c = farmExpRet.filter(r => !r.item_type?.toLowerCase().includes('feed') && !r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, g - c)
  }, [farmExp, farmExpRet])

  const expByCategory = useMemo(() => {
    const map = {}
    for (const e of expenses) {
      const cat = (e.category || 'Other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      map[cat] = (map[cat] || 0) + Number(e.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])

  const growingFeeAmt = useMemo(() => gfLedger.reduce((s, r) => s + Number(r.total_fee || 0), 0), [gfLedger])

  const vendorRows = useMemo(() => {
    const salesMap = {}; const collectMap = {}
    for (const s of allSales)       salesMap[s.vendor_id]   = (salesMap[s.vendor_id]   || 0) + Number(s.final_amount || s.total_amount)
    for (const c of allCollections) collectMap[c.vendor_id] = (collectMap[c.vendor_id] || 0) + Number(c.amount_paid)
    return vendors.map(v => ({ ...v, balance: (salesMap[v.id] || 0) - (collectMap[v.id] || 0) })).filter(v => Math.abs(v.balance) > 0.01)
  }, [vendors, allSales, allCollections])

  const supplierRows = useMemo(() => {
    const purchMap = {}; const payMap = {}
    for (const p of allProcurement) {
      const sign = p.is_return ? -1 : 1
      purchMap[p.supplier_id] = (purchMap[p.supplier_id] || 0) + sign * Number(p.cost)
    }
    for (const p of allSupPayments) payMap[p.supplier_id] = (payMap[p.supplier_id] || 0) + Number(p.amount)
    return suppliers.map(s => ({ ...s, balance: Number(s.opening_balance || 0) + (purchMap[s.id] || 0) - (payMap[s.id] || 0) })).filter(s => Math.abs(s.balance) > 0.01)
  }, [suppliers, allProcurement, allSupPayments])

  const accountRows = useMemo(() => {
    const txMap = {}
    for (const t of transactions) {
      if (!txMap[t.account_id]) txMap[t.account_id] = { in: 0, out: 0 }
      if (t.transaction_type === 'in')  txMap[t.account_id].in  += Number(t.amount)
      if (t.transaction_type === 'out') txMap[t.account_id].out += Number(t.amount)
    }
    return accounts.map(a => ({ ...a, balance: Number(a.opening_balance || 0) + (txMap[a.id]?.in || 0) - (txMap[a.id]?.out || 0) })).filter(a => Math.abs(a.balance) > 0.01)
  }, [accounts, transactions])

  const farmRows = useMemo(() => {
    const feeMap = {}; const advMap = {}; const payMap = {}
    for (const r of gfLedgerAll) feeMap[r.farm_id] = (feeMap[r.farm_id] || 0) + Number(r.total_fee || 0)
    for (const r of gfAdvAll)    advMap[r.farm_id] = (advMap[r.farm_id] || 0) + Number(r.amount || 0)
    for (const r of gfPayAll)    payMap[r.farm_id] = (payMap[r.farm_id] || 0) + Number(r.amount || 0)
    return farms
      .map(f => ({ ...f, balance: (feeMap[f.id] || 0) - (advMap[f.id] || 0) - (payMap[f.id] || 0) }))
      .filter(f => Math.abs(f.balance) > 0.01)
  }, [farms, gfLedgerAll, gfAdvAll, gfPayAll])

  // ─── Build sections ───────────────────────────────────────────────────────

  const sections = useMemo(() => {
    const list = []

    // 1. DIRECT INCOME
    const incItems = [
      { name: 'Chicken Sales Account', debit: 0, credit: chickenSalesAmt },
      { name: 'Goods Sales Account',   debit: 0, credit: goodsSalesAmt },
      ...(ancillaryAmt > 0 ? [{ name: 'Ancillary Income Account', debit: 0, credit: ancillaryAmt }] : []),
    ].filter(i => i.credit > 0)
    if (incItems.length > 0) list.push({ code: 'INC', title: 'DIRECT INCOME', items: incItems })

    // 2. DIRECT EXPENSE
    const expItems = [
      { name: 'Chick Procurement Account',   debit: chickCostAmt,  credit: 0 },
      { name: 'Feed Expenses Account',        debit: feedCostAmt,   credit: 0 },
      { name: 'Medicine Expenses Account',    debit: medCostAmt,    credit: 0 },
      ...(otherFarmAmt > 0 ? [{ name: 'Other Farm Expenses Account', debit: otherFarmAmt, credit: 0 }] : []),
    ].filter(i => i.debit > 0)
    if (expItems.length > 0) list.push({ code: 'DEXP', title: 'DIRECT EXPENSE', items: expItems })

    // 3. INDIRECT EXPENSE
    const indItems = [
      ...expByCategory.filter(([, amt]) => amt > 0).map(([cat, amt]) => ({ name: cat, debit: amt, credit: 0 })),
      ...(growingFeeAmt > 0 ? [{ name: 'Growing Fee', debit: growingFeeAmt, credit: 0 }] : []),
    ]
    if (indItems.length > 0) list.push({ code: 'IEXP', title: 'INDIRECT EXPENSE', items: indItems })

    // 4. CUSTOMERS (vendor receivables)
    if (vendorRows.length > 0) {
      list.push({
        code: 'AA',
        title: 'CUSTOMERS',
        items: vendorRows.map(v => ({
          name:   v.name,
          debit:  v.balance > 0 ? v.balance : 0,
          credit: v.balance < 0 ? Math.abs(v.balance) : 0,
        })),
      })
    }

    // 5. SUPPLIERS
    if (supplierRows.length > 0) {
      list.push({
        code: 'SUP',
        title: 'SUPPLIER ACCOUNT',
        items: supplierRows.map(s => ({
          name:   s.name,
          debit:  s.balance < 0 ? Math.abs(s.balance) : 0,
          credit: s.balance > 0 ? s.balance : 0,
        })),
      })
    }

    // 6. FARM ACCOUNTS (growing fee outstanding)
    if (farmRows.length > 0) {
      list.push({
        code: 'FARM',
        title: 'FARM ACCOUNTS',
        items: farmRows.map(f => ({
          name:   f.name,
          debit:  f.balance < 0 ? Math.abs(f.balance) : 0,
          credit: f.balance > 0 ? f.balance : 0,
        })),
      })
    }

    // 7. CASH / BANK
    if (accountRows.length > 0) {
      list.push({
        code: 'CASH',
        title: 'CASH / BANK ACCOUNT',
        items: accountRows.map(a => ({
          name:   a.name,
          debit:  a.balance > 0 ? a.balance : 0,
          credit: a.balance < 0 ? Math.abs(a.balance) : 0,
        })),
      })
    }

    return list
  }, [chickenSalesAmt, goodsSalesAmt, ancillaryAmt, chickCostAmt, feedCostAmt, medCostAmt, otherFarmAmt, expByCategory, growingFeeAmt, vendorRows, supplierRows, farmRows, accountRows])

  const grandDebit  = useMemo(() => sections.reduce((s, sec) => s + sec.items.reduce((a, i) => a + i.debit,  0), 0), [sections])
  const grandCredit = useMemo(() => sections.reduce((s, sec) => s + sec.items.reduce((a, i) => a + i.credit, 0), 0), [sections])

  // Sequential Sl numbering across all sections
  let slCounter = 0

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">

        {/* Controls */}
        <div id="tb-no-print" className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">As on:</label>
            <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            {loading && <span className="text-sm text-indigo-500 animate-pulse">Loading…</span>}
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-semibold hover:bg-gray-700 transition">
            🖨️ Print
          </button>
        </div>

        {/* Trial Balance Table */}
        <div id="tb-print-area" className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Header */}
          <div className="text-center py-4 border-b border-gray-200 px-6">
            <div className="flex items-start justify-between">
              <div className="text-left">
                <p className="text-xl font-extrabold text-gray-900 tracking-wide">{organization?.name || 'Organization'}</p>
                <p className="text-sm text-gray-500">{organization?.business_name || ''}</p>
              </div>
              <div className="border-2 border-gray-800 px-4 py-2 rounded text-sm font-bold text-gray-800 text-center">
                {fyLabel}
              </div>
            </div>
            <p className="text-lg font-bold text-gray-800 mt-3">Trial Balance as on {new Date(asOf).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
          </div>

          {/* Table */}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-center py-2.5 px-3 font-bold w-12">Sl</th>
                <th className="text-left py-2.5 px-4 font-bold">Name</th>
                <th className="text-right py-2.5 px-4 font-bold w-36 tabular-nums">Debit</th>
                <th className="text-right py-2.5 px-4 font-bold w-36 tabular-nums">Credit</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, si) => {
                const secDebit  = sec.items.reduce((a, i) => a + i.debit,  0)
                const secCredit = sec.items.reduce((a, i) => a + i.credit, 0)
                return (
                  <>
                    {/* Group code row */}
                    <tr key={`code-${si}`} className="bg-gray-50">
                      <td colSpan={4} className="px-4 py-1.5 text-xs font-bold text-gray-500 tracking-widest">{sec.code}</td>
                    </tr>
                    {/* Group title row */}
                    <tr key={`title-${si}`}>
                      <td colSpan={4} className="px-4 py-1 text-sm font-bold text-gray-800 border-b border-gray-100">{sec.title}</td>
                    </tr>
                    {/* Item rows */}
                    {sec.items.map((item, ii) => {
                      slCounter++
                      const sl = slCounter
                      return (
                        <tr key={`${si}-${ii}`} className="hover:bg-gray-50 border-b border-gray-50">
                          <td className="text-center py-1.5 px-3 text-gray-500">{sl}</td>
                          <td className="py-1.5 px-4 text-gray-700">{item.name}</td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-gray-800">{fmt(item.debit)}</td>
                          <td className="py-1.5 px-4 text-right tabular-nums text-gray-800">{fmt(item.credit)}</td>
                        </tr>
                      )
                    })}
                    {/* Section subtotal row */}
                    <tr key={`sub-${si}`} className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={2}></td>
                      <td className="py-1.5 px-4 text-right font-bold tabular-nums text-gray-900">{fmt(secDebit)}</td>
                      <td className="py-1.5 px-4 text-right font-bold tabular-nums text-gray-900">{fmt(secCredit)}</td>
                    </tr>
                  </>
                )
              })}

              {/* Grand Total */}
              <tr className="bg-gray-800 text-white border-t-2 border-gray-400">
                <td colSpan={2} className="py-3 px-4 font-bold text-sm"></td>
                <td className="py-3 px-4 text-right font-bold tabular-nums text-base">{fmt(grandDebit)}</td>
                <td className="py-3 px-4 text-right font-bold tabular-nums text-base">{fmt(grandCredit)}</td>
              </tr>

              {/* Difference note if books don't balance */}
              {Math.abs(grandDebit - grandCredit) > 0.01 && (
                <tr className="bg-amber-50 border-t border-amber-200">
                  <td colSpan={2} className="py-2 px-4 text-xs text-amber-700 font-medium">
                    Difference (Net Profit / Closing Balance)
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-xs font-bold text-amber-700">
                    {grandCredit > grandDebit ? fmt(grandCredit - grandDebit) : ''}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums text-xs font-bold text-amber-700">
                    {grandDebit > grandCredit ? fmt(grandDebit - grandCredit) : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
