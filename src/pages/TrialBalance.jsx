import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { formatCurrency } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

function monthRange(offset = 0) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1).toISOString().slice(0, 10)
  const end   = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).toISOString().slice(0, 10)
  return { start, end }
}

function quarterRange() {
  const now = new Date(); const q = Math.floor(now.getMonth() / 3)
  return {
    start: new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10),
    end:   new Date(now.getFullYear(), q * 3 + 3, 0).toISOString().slice(0, 10),
  }
}

const DATE_PRESETS = [
  { label: 'This Month',   fn: () => monthRange(0) },
  { label: 'Last Month',   fn: () => monthRange(-1) },
  { label: 'This Quarter', fn: quarterRange },
  { label: 'This Year',    fn: () => ({ start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31` }) },
  { label: 'All Time',     fn: () => ({ start: '2000-01-01', end: new Date().toISOString().slice(0, 10) }) },
]

// ─── Row components ───────────────────────────────────────────────────────────

function TBRow({ label, debit, credit, bold, indent, separator, muted }) {
  if (separator) return <tr><td colSpan={3} className="pt-1 pb-0"><div className="border-t border-gray-200" /></td></tr>
  return (
    <tr className={bold ? 'bg-gray-50' : ''}>
      <td className={`py-2 text-sm ${indent ? 'pl-8' : bold ? 'pl-3 font-semibold' : 'pl-3'} ${muted ? 'text-gray-400' : 'text-gray-700'} pr-2`}>
        {label}
      </td>
      <td className="py-2 text-sm text-right pr-4 tabular-nums text-gray-800 font-medium">
        {debit != null && debit !== 0 ? formatCurrency(debit) : (bold && debit === 0 ? formatCurrency(0) : '')}
      </td>
      <td className="py-2 text-sm text-right pr-3 tabular-nums text-gray-800 font-medium">
        {credit != null && credit !== 0 ? formatCurrency(credit) : (bold && credit === 0 ? formatCurrency(0) : '')}
      </td>
    </tr>
  )
}

function SectionHead({ label }) {
  return (
    <tr className="bg-indigo-50">
      <td colSpan={3} className="pl-3 py-1.5 text-xs font-bold text-indigo-700 uppercase tracking-widest">{label}</td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrialBalance() {
  const { organization } = useAuth()
  const [loading,       setLoading]       = useState(false)
  const [activePreset,  setActivePreset]  = useState('This Month')
  const [dateRange,     setDateRange]     = useState(monthRange(0))

  // Income / expense data (period-scoped)
  const [chickenSales,  setChickenSales]  = useState([])
  const [goodsSales,    setGoodsSales]    = useState([])
  const [chickPurch,    setChickPurch]    = useState([])   // batch_chick_purchases — chick cost + ancillary
  const [farmExp,       setFarmExp]       = useState([])
  const [farmExpRet,    setFarmExpRet]    = useState([])
  const [expenses,      setExpenses]      = useState([])
  const [gfLedger,      setGfLedger]      = useState([])

  // Balance sheet data (cumulative up to period end)
  const [accounts,      setAccounts]      = useState([])
  const [transactions,  setTransactions]  = useState([])
  const [vendors,       setVendors]       = useState([])
  const [allSales,      setAllSales]      = useState([])
  const [allCollections,setAllCollections]= useState([])
  const [suppliers,     setSuppliers]     = useState([])
  const [allProcurement,setAllProcurement]= useState([])
  const [allSupPayments,setAllSupPayments]= useState([])

  useEffect(() => { fetchData() }, [dateRange, organization])

  async function fetchData() {
    if (!organization?.id) return
    setLoading(true)
    const { start, end } = dateRange

    // ── Period income / expense queries ──────────────────────────────────────
    const [
      { data: cs }, { data: gs },
      { data: fe }, { data: fer }, { data: ex },
      { data: soldBatches },
    ] = await Promise.all([
      supabase.from('sales').select('total_amount').eq('organization_id', organization.id).eq('status', 'confirmed').eq('sale_type', 'chicken').gte('date', start).lte('date', end),
      supabase.from('sales').select('total_amount, item_quantity, purchase_cost_per_unit').eq('organization_id', organization.id).eq('status', 'confirmed').eq('sale_type', 'goods').gte('date', start).lte('date', end),
      supabase.from('farm_expenses').select('item_type, total_cost').eq('organization_id', organization.id).gte('date', start).lte('date', end),
      supabase.from('farm_expense_returns').select('item_type, total_cost').eq('organization_id', organization.id).gte('date', start).lte('date', end),
      supabase.from('expenses').select('category, amount').eq('organization_id', organization.id).gte('date', start).lte('date', end),
      supabase.from('batches').select('id').eq('organization_id', organization.id).eq('status', 'sold').gte('sold_at', start).lte('sold_at', end),
    ])

    // batch_chick_purchases for batches started in period
    const { data: startedBatches } = await supabase.from('batches').select('id').eq('organization_id', organization.id).gte('start_date', start).lte('start_date', end)
    let cpData = []
    if ((startedBatches || []).length > 0) {
      const { data } = await supabase.from('batch_chick_purchases')
        .select('quantity, price_per_chick, ancillary_per_chick')
        .eq('organization_id', organization.id)
        .in('batch_id', startedBatches.map(b => b.id))
      cpData = data || []
    }

    // Growing fee ledger for batches closed in period
    let gfl = []
    const soldIds = (soldBatches || []).map(b => b.id)
    if (soldIds.length > 0) {
      const { data } = await supabase.from('growing_fee_ledger').select('total_fee').eq('organization_id', organization.id).in('batch_id', soldIds)
      gfl = data || []
    }

    // ── Balance sheet queries (cumulative up to period end) ───────────────────
    const [
      { data: accts }, { data: txns },
      { data: vs },    { data: aSales }, { data: aCollect },
      { data: sups },  { data: aProcurement }, { data: aSupPay },
    ] = await Promise.all([
      supabase.from('accounts').select('id, name, type, opening_balance, is_active').eq('organization_id', organization.id).eq('is_active', true),
      supabase.from('transactions').select('account_id, transaction_type, amount').eq('organization_id', organization.id).lte('transaction_date', end),
      supabase.from('contacts').select('id, name').eq('organization_id', organization.id).eq('is_vendor', true),
      supabase.from('sales').select('vendor_id, total_amount, final_amount').eq('organization_id', organization.id).eq('status', 'confirmed').lte('date', end),
      supabase.from('cash_collection').select('vendor_id, amount_paid').eq('organization_id', organization.id).lte('date', end),
      supabase.from('suppliers').select('id, name, opening_balance').eq('organization_id', organization.id),
      supabase.from('procurement').select('supplier_id, cost, is_return').eq('organization_id', organization.id).lte('date', end),
      supabase.from('supplier_payments').select('supplier_id, amount').eq('organization_id', organization.id).lte('payment_date', end),
    ])

    setChickenSales(cs || [])
    setGoodsSales(gs || [])
    setChickPurch(cpData)
    setFarmExp(fe || [])
    setFarmExpRet(fer || [])
    setExpenses(ex || [])
    setGfLedger(gfl)
    setAccounts(accts || [])
    setTransactions(txns || [])
    setVendors(vs || [])
    setAllSales(aSales || [])
    setAllCollections(aCollect || [])
    setSuppliers(sups || [])
    setAllProcurement(aProcurement || [])
    setAllSupPayments(aSupPay || [])
    setLoading(false)
  }

  // ─── Income calculations ──────────────────────────────────────────────────
  const chickenSalesTotal = useMemo(() => chickenSales.reduce((s, r) => s + Number(r.total_amount), 0), [chickenSales])
  const goodsSalesTotal   = useMemo(() => goodsSales.reduce((s, r) => s + Number(r.total_amount), 0), [goodsSales])
  const ancillaryIncome   = useMemo(() => chickPurch.reduce((s, r) => s + Number(r.ancillary_per_chick || 0) * Number(r.quantity || 0), 0), [chickPurch])
  const totalIncome       = chickenSalesTotal + goodsSalesTotal + ancillaryIncome

  // ─── Direct cost calculations ─────────────────────────────────────────────
  const chickCost = useMemo(() => chickPurch.reduce((s, r) => s + Number(r.price_per_chick || 0) * Number(r.quantity || 0), 0), [chickPurch])
  const feedCost  = useMemo(() => {
    const gross  = farmExp.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost), 0)
    const credit = farmExpRet.filter(r => r.item_type?.toLowerCase().includes('feed')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, gross - credit)
  }, [farmExp, farmExpRet])
  const medCost   = useMemo(() => {
    const gross  = farmExp.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    const credit = farmExpRet.filter(r => r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, gross - credit)
  }, [farmExp, farmExpRet])
  const otherFarmCost = useMemo(() => {
    const gross  = farmExp.filter(r => !r.item_type?.toLowerCase().includes('feed') && !r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    const credit = farmExpRet.filter(r => !r.item_type?.toLowerCase().includes('feed') && !r.item_type?.toLowerCase().includes('medicine')).reduce((s, r) => s + Number(r.total_cost), 0)
    return Math.max(0, gross - credit)
  }, [farmExp, farmExpRet])
  const goodsCOGS     = useMemo(() => goodsSales.reduce((s, r) => s + Number(r.purchase_cost_per_unit || 0) * Number(r.item_quantity || 0), 0), [goodsSales])
  const totalDirectCosts = chickCost + feedCost + medCost + otherFarmCost + goodsCOGS

  // ─── Operating expense calculations ──────────────────────────────────────
  const expByCategory = useMemo(() => {
    const map = {}
    for (const e of expenses) {
      const cat = e.category || 'Other'
      map[cat] = (map[cat] || 0) + Number(e.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [expenses])
  const totalOpExp = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses])
  const growingFeeTotal = useMemo(() => gfLedger.reduce((s, r) => s + Number(r.total_fee || 0), 0), [gfLedger])
  const totalOpExpWithGF = totalOpExp + growingFeeTotal

  const totalExpenses = totalDirectCosts + totalOpExpWithGF
  const netProfit     = totalIncome - totalExpenses

  // ─── Balance sheet calculations ───────────────────────────────────────────

  // Cash/bank: opening_balance + tx_in - tx_out per account
  const accountBalances = useMemo(() => {
    const txMap = {}
    for (const t of transactions) {
      if (!txMap[t.account_id]) txMap[t.account_id] = { in: 0, out: 0 }
      if (t.transaction_type === 'in')  txMap[t.account_id].in  += Number(t.amount)
      if (t.transaction_type === 'out') txMap[t.account_id].out += Number(t.amount)
    }
    return accounts.map(a => ({
      ...a,
      balance: Number(a.opening_balance || 0) + (txMap[a.id]?.in || 0) - (txMap[a.id]?.out || 0),
    })).filter(a => a.balance !== 0)
  }, [accounts, transactions])
  const totalCash = accountBalances.reduce((s, a) => s + a.balance, 0)

  // Vendor receivables: total confirmed sales - total cash collected (cumulative)
  const vendorReceivables = useMemo(() => {
    const salesByVendor   = {}
    const collectByVendor = {}
    for (const s of allSales)       salesByVendor[s.vendor_id]   = (salesByVendor[s.vendor_id]   || 0) + Number(s.final_amount || s.total_amount)
    for (const c of allCollections) collectByVendor[c.vendor_id] = (collectByVendor[c.vendor_id] || 0) + Number(c.amount_paid)
    const rows = vendors.map(v => ({
      ...v,
      outstanding: (salesByVendor[v.id] || 0) - (collectByVendor[v.id] || 0),
    })).filter(v => v.outstanding > 0.01)
    return { rows, total: rows.reduce((s, v) => s + v.outstanding, 0) }
  }, [vendors, allSales, allCollections])

  // Supplier payables: opening_balance + purchases - returns - payments (cumulative)
  const supplierPayables = useMemo(() => {
    const purchBySupplier = {}; const payBySupplier = {}
    for (const p of allProcurement) {
      const sign = p.is_return ? -1 : 1
      purchBySupplier[p.supplier_id] = (purchBySupplier[p.supplier_id] || 0) + sign * Number(p.cost)
    }
    for (const p of allSupPayments) payBySupplier[p.supplier_id] = (payBySupplier[p.supplier_id] || 0) + Number(p.amount)
    const rows = suppliers.map(s => ({
      ...s,
      outstanding: Number(s.opening_balance || 0) + (purchBySupplier[s.id] || 0) - (payBySupplier[s.id] || 0),
    })).filter(s => Math.abs(s.outstanding) > 0.01)
    return { rows, total: rows.reduce((s, v) => s + v.outstanding, 0) }
  }, [suppliers, allProcurement, allSupPayments])

  // ─── Trial balance totals ─────────────────────────────────────────────────
  // Debit  = expenses + assets (receivables + cash)
  // Credit = income + liabilities (payables)
  const totalDebit  = totalExpenses + vendorReceivables.total + (totalCash > 0 ? totalCash : 0)
  const totalCredit = totalIncome   + (supplierPayables.total > 0 ? supplierPayables.total : 0) + (totalCash < 0 ? Math.abs(totalCash) : 0)
  const difference  = totalCredit - totalDebit  // positive = profit

  const ICON = { cash: '💵', bank: '🏦', wallet: '📱' }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Income & expenses for the period · Balance sheet as of period end
          </p>
        </div>
        {loading && <span className="text-sm text-indigo-500 animate-pulse">Loading…</span>}
      </div>

      {/* Date range */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map(p => (
            <button key={p.label} onClick={() => { setActivePreset(p.label); setDateRange(p.fn()) }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${activePreset === p.label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From</label>
            <input type="date" value={dateRange.start}
              onChange={e => { setActivePreset('Custom'); setDateRange(r => ({ ...r, start: e.target.value })) }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To</label>
            <input type="date" value={dateRange.end}
              onChange={e => { setActivePreset('Custom'); setDateRange(r => ({ ...r, end: e.target.value })) }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
      </div>

      {/* Trial Balance Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="grid grid-cols-3 bg-gray-800 text-white text-xs font-bold uppercase tracking-widest px-3 py-3">
          <span>Account</span>
          <span className="text-right pr-4">Debit (₹)</span>
          <span className="text-right pr-3">Credit (₹)</span>
        </div>

        <table className="w-full">
          <tbody>
            {/* ─── INCOME ─── */}
            <SectionHead label="Income" />
            <TBRow label="Chicken Sales"   indent credit={chickenSalesTotal} />
            <TBRow label="Goods Sales"     indent credit={goodsSalesTotal} />
            <TBRow label="Ancillary Income" indent credit={ancillaryIncome} />
            <TBRow label="Total Income" bold debit={0} credit={totalIncome} />
            <TBRow separator />

            {/* ─── DIRECT COSTS ─── */}
            <SectionHead label="Direct Costs" />
            <TBRow label="Chick Procurement" indent debit={chickCost} />
            <TBRow label="Feed Expenses"     indent debit={feedCost} />
            <TBRow label="Medicine Expenses" indent debit={medCost} />
            {otherFarmCost > 0 && <TBRow label="Other Farm Expenses" indent debit={otherFarmCost} />}
            {goodsCOGS > 0     && <TBRow label="Goods Cost of Sales" indent debit={goodsCOGS} />}
            <TBRow label="Total Direct Costs" bold debit={totalDirectCosts} credit={0} />
            <TBRow separator />

            {/* ─── OPERATING EXPENSES ─── */}
            <SectionHead label="Operating Expenses" />
            {expByCategory.map(([cat, amt]) => (
              <TBRow key={cat} label={cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} indent debit={amt} />
            ))}
            {expByCategory.length === 0 && <TBRow label="No expenses in period" indent muted debit={0} />}
            {growingFeeTotal > 0 && <TBRow label="Growing Fees" indent debit={growingFeeTotal} />}
            <TBRow label="Total Operating Expenses" bold debit={totalOpExpWithGF} credit={0} />
            <TBRow separator />

            {/* ─── BALANCE SHEET ─── */}
            <SectionHead label="Balance Sheet (cumulative as of period end)" />

            {/* Cash / Bank */}
            {accountBalances.map(a => (
              <TBRow key={a.id} label={`${ICON[a.type] || '💰'} ${a.name}`} indent
                debit={a.balance > 0 ? a.balance : undefined}
                credit={a.balance < 0 ? Math.abs(a.balance) : undefined} />
            ))}
            {accountBalances.length === 0 && <TBRow label="No accounts" indent muted />}
            <TBRow label={`Cash / Bank Total`} bold
              debit={totalCash > 0 ? totalCash : 0}
              credit={totalCash < 0 ? Math.abs(totalCash) : 0} />
            <TBRow separator />

            {/* Vendor Receivables */}
            {vendorReceivables.rows.map(v => (
              <TBRow key={v.id} label={`${v.name} (receivable)`} indent debit={v.outstanding} />
            ))}
            {vendorReceivables.rows.length === 0 && <TBRow label="No outstanding vendor receivables" indent muted />}
            <TBRow label="Vendor Receivables Total" bold debit={vendorReceivables.total} credit={0} />
            <TBRow separator />

            {/* Supplier Payables */}
            {supplierPayables.rows.map(s => (
              <TBRow key={s.id} label={`${s.name} (payable)`} indent
                debit={s.outstanding < 0 ? Math.abs(s.outstanding) : undefined}
                credit={s.outstanding > 0 ? s.outstanding : undefined} />
            ))}
            {supplierPayables.rows.length === 0 && <TBRow label="No outstanding supplier payables" indent muted />}
            <TBRow label="Supplier Payables Total" bold
              debit={supplierPayables.total < 0 ? Math.abs(supplierPayables.total) : 0}
              credit={supplierPayables.total > 0 ? supplierPayables.total : 0} />
            <TBRow separator />

            {/* ─── GRAND TOTALS ─── */}
            <tr className="bg-gray-900 text-white">
              <td className="pl-3 py-3 text-sm font-bold">Grand Total</td>
              <td className="py-3 text-sm font-bold text-right pr-4 tabular-nums">{formatCurrency(totalDebit)}</td>
              <td className="py-3 text-sm font-bold text-right pr-3 tabular-nums">{formatCurrency(totalCredit)}</td>
            </tr>

            {/* Net Profit / Loss row */}
            <tr className={difference >= 0 ? 'bg-green-50' : 'bg-red-50'}>
              <td className={`pl-3 py-3 text-sm font-bold ${difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {difference >= 0 ? '▲ Net Profit (Period)' : '▼ Net Loss (Period)'}
              </td>
              <td className={`py-3 text-sm font-bold text-right pr-4 tabular-nums ${difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {difference < 0 ? formatCurrency(Math.abs(difference)) : ''}
              </td>
              <td className={`py-3 text-sm font-bold text-right pr-3 tabular-nums ${difference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {difference >= 0 ? formatCurrency(difference) : ''}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Income',    value: totalIncome,              color: 'text-green-700', bg: 'bg-green-50  border-green-200' },
          { label: 'Total Expenses',  value: totalExpenses,            color: 'text-red-700',   bg: 'bg-red-50    border-red-200' },
          { label: netProfit >= 0 ? 'Net Profit' : 'Net Loss',
            value: Math.abs(netProfit),
            color: netProfit >= 0 ? 'text-indigo-700' : 'text-orange-700',
            bg:    netProfit >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200' },
          { label: 'Vendor Receivables', value: vendorReceivables.total, color: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200' },
          { label: 'Supplier Payables',  value: supplierPayables.total,  color: 'text-amber-700',  bg: 'bg-amber-50  border-amber-200' },
          { label: 'Cash / Bank',        value: totalCash,               color: totalCash >= 0 ? 'text-teal-700' : 'text-red-700', bg: totalCash >= 0 ? 'bg-teal-50 border-teal-200' : 'bg-red-50 border-red-200' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.bg}`}>
            <p className="text-xs text-gray-500 font-medium">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
