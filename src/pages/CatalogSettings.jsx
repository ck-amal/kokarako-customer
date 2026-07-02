import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useOnboarding } from '../contexts/OnboardingContext'

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onClose, onConfirm, destructive = true, confirmLabel }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: destructive ? '#ef4444' : '#f59e0b' }}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
      style={{ backgroundColor: checked ? '#10b981' : '#d1d5db' }}>
      <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
    </button>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: 'KG',     label: 'KG'     },
  { value: 'ml',     label: 'ml'     },
  { value: 'Bag',    label: 'Bag'    },
  { value: 'Bottle', label: 'Bottle' },
  { value: 'Number', label: 'Number' },
]

const BLANK_ITEM = { name: '', unit: '', description: '', is_active: true, kg_per_unit: '', ml_per_unit: '' }

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogSettings() {
  const { t } = useTranslation()
  const { organization, canEdit } = useAuth()
  const { currentStep, stepDone } = useOnboarding()

  const orgId = organization?.id

  // All data
  const [itemTypes, setItemTypes] = useState([])
  const [allItems, setAllItems] = useState({})   // { typeId: [item, ...] }
  const [loading, setLoading] = useState(true)

  // Add-type form (shown inline at top as a new card)
  const [addTypeOpen, setAddTypeOpen] = useState(false)
  const [addTypeData, setAddTypeData] = useState({ name: '', description: '' })
  const [addTypeError, setAddTypeError] = useState('')
  const [addTypeSaving, setAddTypeSaving] = useState(false)
  // Pending items collected before the type is saved
  const [addTypeItems, setAddTypeItems] = useState([])
  const [addTypeItemForm, setAddTypeItemForm] = useState(false)
  const [addTypeItemData, setAddTypeItemData] = useState(BLANK_ITEM)
  const [addTypeItemError, setAddTypeItemError] = useState('')

  // Which card is in edit mode
  const [editingTypeId, setEditingTypeId] = useState(null)
  // Draft for the type name being edited inside the card
  const [typeNameDraft, setTypeNameDraft] = useState('')
  const [typeDescDraft, setTypeDescDraft] = useState('')
  const [typeNameError, setTypeNameError] = useState('')
  const [typeNameSaving, setTypeNameSaving] = useState(false)

  // Item form (add or edit), belongs to a specific card
  const [itemForm, setItemForm] = useState(null)   // { mode: 'add'|'edit', typeId, itemId? }
  const [itemFormData, setItemFormData] = useState(BLANK_ITEM)
  const [itemFormError, setItemFormError] = useState('')
  const [itemSaving, setItemSaving] = useState(false)

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState(null)

  // ── Load all types + items ────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    const [{ data: types }, { data: items }] = await Promise.all([
      supabase.from('item_types').select('id, name, description').eq('organization_id', orgId).order('name'),
      supabase.from('items').select('id, item_type_id, name, unit, description, is_active, kg_per_unit, ml_per_unit').eq('organization_id', orgId).order('name'),
    ])
    const grouped = {}
    ;(items || []).forEach(it => {
      if (!grouped[it.item_type_id]) grouped[it.item_type_id] = []
      grouped[it.item_type_id].push(it)
    })
    setItemTypes(types || [])
    setAllItems(grouped)
    setLoading(false)
  }, [orgId])

  useEffect(() => { loadAll() }, [loadAll])

  if (!canEdit) return <Navigate to="/dashboard" replace />

  // ── Add type ──────────────────────────────────────────────────────────────

  function openAddTypeCard() {
    setAddTypeOpen(true)
    setAddTypeData({ name: '', description: '' })
    setAddTypeError('')
    setAddTypeItems([])
    setAddTypeItemForm(false)
    setAddTypeItemData(BLANK_ITEM)
    setAddTypeItemError('')
  }

  function handleAddPendingItem(e) {
    e.preventDefault()
    setAddTypeItemError('')
    if (!addTypeItemData.name.trim()) { setAddTypeItemError('Item name is required'); return }
    if (!addTypeItemData.unit) { setAddTypeItemError('Please select a unit'); return }
    if (addTypeItemData.unit === 'Bag' && !addTypeItemData.kg_per_unit) { setAddTypeItemError('Please enter KG per bag'); return }
    if (addTypeItemData.unit === 'Bottle' && !addTypeItemData.ml_per_unit) { setAddTypeItemError('Please enter ml per bottle'); return }
    setAddTypeItems(prev => [...prev, { ...addTypeItemData, _id: Date.now() }])
    setAddTypeItemData(BLANK_ITEM)
    setAddTypeItemForm(false)
  }

  function removePendingItem(id) {
    setAddTypeItems(prev => prev.filter(i => i._id !== id))
  }

  async function handleAddType(e) {
    e.preventDefault()
    setAddTypeError('')
    if (!addTypeData.name.trim()) { setAddTypeError(t('errors.required')); return }
    setAddTypeSaving(true)
    const { data: typeRow, error } = await supabase
      .from('item_types')
      .insert({ name: addTypeData.name.trim(), description: addTypeData.description.trim() || null, organization_id: orgId })
      .select('id')
      .single()
    if (error) { setAddTypeError(error.message); setAddTypeSaving(false); return }
    if (addTypeItems.length > 0) {
      await supabase.from('items').insert(
        addTypeItems.map(it => ({
          name: it.name.trim(),
          unit: it.unit,
          description: it.description.trim() || null,
          is_active: it.is_active,
          kg_per_unit: it.unit === 'Bag' && it.kg_per_unit ? parseFloat(it.kg_per_unit) : null,
          ml_per_unit: it.unit === 'Bottle' && it.ml_per_unit ? parseFloat(it.ml_per_unit) : null,
          item_type_id: typeRow.id,
          organization_id: orgId,
        }))
      )
    }
    setAddTypeSaving(false)
    setAddTypeOpen(false)
    await loadAll()
    if (currentStep?.id === 'catalog') stepDone('catalog')
  }

  // ── Edit type name (inside card) ──────────────────────────────────────────

  function enterEditMode(type) {
    setEditingTypeId(type.id)
    setTypeNameDraft(type.name)
    setTypeDescDraft(type.description || '')
    setTypeNameError('')
    setItemForm(null)
  }

  function exitEditMode() {
    setEditingTypeId(null)
    setTypeNameError('')
  }

  async function handleSaveTypeName(typeId) {
    setTypeNameError('')
    if (!typeNameDraft.trim()) { setTypeNameError(t('errors.required')); return }
    setTypeNameSaving(true)
    const { error } = await supabase.from('item_types').update({
      name: typeNameDraft.trim(),
      description: typeDescDraft.trim() || null,
    }).eq('id', typeId)
    setTypeNameSaving(false)
    if (error) { setTypeNameError(error.message); return }
    await loadAll()
  }

  // ── Delete type ───────────────────────────────────────────────────────────

  function handleDeleteType(type) {
    const count = (allItems[type.id] || []).length
    setConfirmModal({
      title: 'Delete Item Type',
      message: count > 0
        ? `This type has ${count} item${count !== 1 ? 's' : ''}. Deleting it will deactivate all associated items.`
        : `Delete "${type.name}"?`,
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null)
        if (count > 0) await supabase.from('items').update({ is_active: false }).eq('item_type_id', type.id)
        await supabase.from('item_types').delete().eq('id', type.id)
        if (editingTypeId === type.id) exitEditMode()
        await loadAll()
      },
    })
  }

  // ── Add item ──────────────────────────────────────────────────────────────

  function openAddItem(typeId) {
    setItemForm({ mode: 'add', typeId })
    setItemFormData(BLANK_ITEM)
    setItemFormError('')
  }

  // ── Edit item ─────────────────────────────────────────────────────────────

  function openEditItem(item) {
    setItemForm({ mode: 'edit', typeId: item.item_type_id, itemId: item.id })
    setItemFormData({
      name: item.name,
      unit: item.unit,
      description: item.description || '',
      is_active: item.is_active,
      kg_per_unit: item.kg_per_unit != null ? String(item.kg_per_unit) : '',
      ml_per_unit: item.ml_per_unit != null ? String(item.ml_per_unit) : '',
    })
    setItemFormError('')
  }

  function cancelItemForm() {
    setItemForm(null)
    setItemFormError('')
  }

  async function handleSaveItem(e, typeId) {
    e.preventDefault()
    setItemFormError('')
    if (!itemFormData.name.trim()) { setItemFormError(t('errors.required')); return }
    if (!itemFormData.unit) { setItemFormError('Please select a unit'); return }
    if (itemFormData.unit === 'Bag' && !itemFormData.kg_per_unit) { setItemFormError('Please enter KG per bag'); return }
    if (itemFormData.unit === 'Bottle' && !itemFormData.ml_per_unit) { setItemFormError('Please enter ml per bottle'); return }
    setItemSaving(true)
    const payload = {
      name: itemFormData.name.trim(),
      unit: itemFormData.unit,
      description: itemFormData.description.trim() || null,
      is_active: itemFormData.is_active,
      kg_per_unit: itemFormData.unit === 'Bag' && itemFormData.kg_per_unit ? parseFloat(itemFormData.kg_per_unit) : null,
      ml_per_unit: itemFormData.unit === 'Bottle' && itemFormData.ml_per_unit ? parseFloat(itemFormData.ml_per_unit) : null,
    }
    let error
    if (itemForm.mode === 'edit') {
      ;({ error } = await supabase.from('items').update(payload).eq('id', itemForm.itemId))
    } else {
      ;({ error } = await supabase.from('items').insert({ ...payload, item_type_id: typeId, organization_id: orgId }))
    }
    setItemSaving(false)
    if (error) { setItemFormError(error.message); return }
    setItemForm(null)
    await loadAll()
  }

  // ── Toggle item active ────────────────────────────────────────────────────

  async function handleToggleActive(item) {
    await supabase.from('items').update({ is_active: !item.is_active }).eq('id', item.id)
    await loadAll()
  }

  // ── Delete item ───────────────────────────────────────────────────────────

  async function handleDeleteItem(item) {
    const [{ count: procCount }, { count: distCount }] = await Promise.all([
      supabase.from('procurement').select('id', { count: 'exact', head: true }).eq('item_id', item.id),
      supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('item_id', item.id),
    ])
    const isUsed = (procCount || 0) > 0 || (distCount || 0) > 0
    setConfirmModal({
      title: isUsed ? 'Deactivate Item' : 'Delete Item',
      message: isUsed
        ? `"${item.name}" has existing records and will be deactivated instead of deleted.`
        : `Delete "${item.name}"?`,
      confirmLabel: isUsed ? t('team.deactivate') : t('common.delete'),
      destructive: !isUsed,
      onConfirm: async () => {
        setConfirmModal(null)
        if (isUsed) {
          await supabase.from('items').update({ is_active: false }).eq('id', item.id)
        } else {
          await supabase.from('items').delete().eq('id', item.id)
        }
        await loadAll()
      },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('catalog.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage item types and items for procurement &amp; distributions</p>
        </div>
        <button
          data-tour="catalog"
          onClick={openAddTypeCard}
          disabled={addTypeOpen}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
        >
          + {t('catalog.addItemType')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-9 w-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">

          {/* ── Add Type card (inline) ─────────────────────────────────── */}
          {addTypeOpen && (
            <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
              {/* Type name section */}
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
                <span className="text-sm font-semibold text-amber-700">New Item Type</span>
              </div>
              <form onSubmit={handleAddType}>
                <div className="px-5 py-4 space-y-3 border-b border-gray-100">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      autoFocus required type="text"
                      placeholder="Type name *  (e.g. Feed, Medicine)"
                      value={addTypeData.name}
                      onChange={e => setAddTypeData(p => ({ ...p, name: e.target.value }))}
                      className="col-span-2 sm:col-span-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <input
                      type="text" placeholder="Description (optional)"
                      value={addTypeData.description}
                      onChange={e => setAddTypeData(p => ({ ...p, description: e.target.value }))}
                      className="col-span-2 sm:col-span-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                {/* Items section */}
                <div className="ml-5 border-l-2 border-amber-100">
                  {/* Pending items list */}
                  {addTypeItems.map((it, idx) => (
                    <div key={it._id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50">
                      <div className="flex-1 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-700">{it.name}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{it.unit}</span>
                        {it.unit === 'Bag' && it.kg_per_unit && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{it.kg_per_unit} kg/bag</span>
                        )}
                        {it.unit === 'Bottle' && it.ml_per_unit && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">{it.ml_per_unit} ml/bottle</span>
                        )}
                      </div>
                      <button type="button" onClick={() => removePendingItem(it._id)}
                        className="text-gray-300 hover:text-red-400 text-sm transition px-1">✕</button>
                    </div>
                  ))}

                  {/* Inline add-item form */}
                  {addTypeItemForm ? (
                    <div className="px-4 py-3 bg-green-50 border-t border-green-100">
                      <p className="text-xs font-semibold text-green-700 mb-2">New Item</p>
                      <ItemForm
                        formData={addTypeItemData}
                        setFormData={setAddTypeItemData}
                        error={addTypeItemError}
                        saving={false}
                        onSave={handleAddPendingItem}
                        onCancel={() => { setAddTypeItemForm(false); setAddTypeItemError('') }}
                        isEdit={false}
                      />
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <button type="button" onClick={() => { setAddTypeItemForm(true); setAddTypeItemData(BLANK_ITEM); setAddTypeItemError('') }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 px-4 py-2 text-xs font-medium text-gray-500 transition">
                        + Add Item
                      </button>
                    </div>
                  )}
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
                  {addTypeError && <p className="text-xs text-red-600 flex-1">{addTypeError}</p>}
                  <button type="submit" disabled={addTypeSaving}
                    className="rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-5 py-2 text-sm font-semibold text-white transition">
                    {addTypeSaving ? t('common.loading') : `Save${addTypeItems.length > 0 ? ` with ${addTypeItems.length} item${addTypeItems.length > 1 ? 's' : ''}` : ''}`}
                  </button>
                  <button type="button" onClick={() => setAddTypeOpen(false)}
                    className="rounded-xl border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Empty state ────────────────────────────────────────────── */}
          {itemTypes.length === 0 && !addTypeOpen && (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
              <p className="text-sm font-medium text-gray-400">{t('catalog.noItemTypes')}</p>
              <p className="text-xs text-gray-400 mt-1">Click "+ Add Item Type" to get started</p>
            </div>
          )}

          {/* ── Type cards ─────────────────────────────────────────────── */}
          {itemTypes.map(type => {
            const items   = allItems[type.id] || []
            const active  = items.filter(i => i.is_active)
            const inactive = items.filter(i => !i.is_active)
            const isEditing = editingTypeId === type.id

            return (
              <TypeCard
                key={type.id}
                type={type}
                activeItems={active}
                inactiveItems={inactive}
                isEditing={isEditing}
                typeNameDraft={typeNameDraft}
                setTypeNameDraft={setTypeNameDraft}
                typeDescDraft={typeDescDraft}
                setTypeDescDraft={setTypeDescDraft}
                typeNameError={typeNameError}
                typeNameSaving={typeNameSaving}
                onEnterEdit={() => enterEditMode(type)}
                onDone={exitEditMode}
                onSaveTypeName={() => handleSaveTypeName(type.id)}
                onDeleteType={() => handleDeleteType(type)}
                itemForm={isEditing ? itemForm : null}
                itemFormData={itemFormData}
                setItemFormData={setItemFormData}
                itemFormError={itemFormError}
                itemSaving={itemSaving}
                onOpenAddItem={() => openAddItem(type.id)}
                onOpenEditItem={openEditItem}
                onCancelItemForm={cancelItemForm}
                onSaveItem={e => handleSaveItem(e, type.id)}
                onDeleteItem={handleDeleteItem}
                onToggleActive={handleToggleActive}
              />
            )
          })}
        </div>
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          destructive={confirmModal.destructive}
          confirmLabel={confirmModal.confirmLabel}
          onClose={() => setConfirmModal(null)}
          onConfirm={confirmModal.onConfirm}
        />
      )}
    </div>
  )
}

// ─── TypeCard ─────────────────────────────────────────────────────────────────

function TypeCard({
  type, activeItems, inactiveItems,
  isEditing, typeNameDraft, setTypeNameDraft, typeDescDraft, setTypeDescDraft,
  typeNameError, typeNameSaving,
  onEnterEdit, onDone, onSaveTypeName, onDeleteType,
  itemForm, itemFormData, setItemFormData, itemFormError, itemSaving,
  onOpenAddItem, onOpenEditItem, onCancelItemForm, onSaveItem,
  onDeleteItem, onToggleActive,
}) {
  const { t } = useTranslation()
  const allItems = [...activeItems, ...inactiveItems]

  return (
    <div className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${
      isEditing ? 'border-2 border-amber-400' : 'border border-gray-100'
    }`}>

      {/* ── Card Header ────────────────────────────────────────────────── */}
      {isEditing ? (
        /* Edit mode header */
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2">
              <input
                autoFocus
                type="text"
                value={typeNameDraft}
                onChange={e => setTypeNameDraft(e.target.value)}
                placeholder="Type name *"
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <input
                type="text"
                value={typeDescDraft}
                onChange={e => setTypeDescDraft(e.target.value)}
                placeholder="Description (optional)"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {typeNameError && <p className="text-xs text-red-600">{typeNameError}</p>}
            </div>
            <div className="flex gap-2 shrink-0 mt-0.5">
              <button
                onClick={onSaveTypeName}
                disabled={typeNameSaving}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-white transition"
              >
                {typeNameSaving ? '…' : '✓ Save'}
              </button>
              <button
                onClick={onDone}
                className="rounded-xl border border-gray-300 bg-white hover:bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition"
              >
                Done
              </button>
              <button
                onClick={onDeleteType}
                className="rounded-xl border border-red-200 bg-white hover:bg-red-50 px-3 py-2 text-xs font-medium text-red-500 transition"
                title="Delete type"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* View mode header */
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-7 w-1 rounded-full bg-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-gray-800">{type.name}</p>
              {type.description && <p className="text-xs text-gray-400 mt-0.5">{type.description}</p>}
            </div>
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-600">
              {allItems.length} item{allItems.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onEnterEdit}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 px-3 py-1.5 text-xs font-medium text-gray-500 transition"
          >
            ✏️ Edit
          </button>
        </div>
      )}

      {/* ── Items list ─────────────────────────────────────────────────── */}
      {allItems.length === 0 && !isEditing ? (
        <div className="px-5 py-4 ml-5 border-l-2 border-gray-100 mt-1 mb-1">
          <p className="text-xs text-gray-400 italic">No items yet — click Edit to add items</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 ml-5 border-l-2 border-amber-100">
          {/* Active items */}
          {activeItems.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              isEditing={isEditing}
              itemForm={itemForm}
              itemFormData={itemFormData}
              setItemFormData={setItemFormData}
              itemFormError={itemFormError}
              itemSaving={itemSaving}
              onEdit={() => onOpenEditItem(item)}
              onDelete={() => onDeleteItem(item)}
              onToggleActive={() => onToggleActive(item)}
              onSaveItem={onSaveItem}
              onCancelItemForm={onCancelItemForm}
            />
          ))}

          {/* Inactive section */}
          {inactiveItems.length > 0 && (
            <>
              <div className="px-4 py-1 bg-gray-50 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('common.inactive')}</p>
              </div>
              {inactiveItems.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isEditing={isEditing}
                  itemForm={itemForm}
                  itemFormData={itemFormData}
                  setItemFormData={setItemFormData}
                  itemFormError={itemFormError}
                  itemSaving={itemSaving}
                  onEdit={() => onOpenEditItem(item)}
                  onDelete={() => onDeleteItem(item)}
                  onToggleActive={() => onToggleActive(item)}
                  onSaveItem={onSaveItem}
                  onCancelItemForm={onCancelItemForm}
                />
              ))}
            </>
          )}

          {/* Add item inline form */}
          {isEditing && itemForm?.mode === 'add' && itemForm?.typeId === type.id && (
            <div className="px-5 py-4 bg-green-50 border-t border-green-100">
              <p className="text-xs font-semibold text-green-700 mb-3">New Item</p>
              <ItemForm
                formData={itemFormData}
                setFormData={setItemFormData}
                error={itemFormError}
                saving={itemSaving}
                onSave={onSaveItem}
                onCancel={onCancelItemForm}
                isEdit={false}
              />
            </div>
          )}

          {/* Add item button — only in edit mode */}
          {isEditing && !(itemForm?.mode === 'add' && itemForm?.typeId === type.id) && (
            <div className="px-5 py-3 bg-gray-50/60">
              <button
                onClick={onOpenAddItem}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 px-4 py-2 text-xs font-medium text-gray-500 transition"
              >
                + Add Item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item, isEditing,
  itemForm, itemFormData, setItemFormData, itemFormError, itemSaving,
  onEdit, onDelete, onToggleActive, onSaveItem, onCancelItemForm,
}) {
  const { t } = useTranslation()
  const isEditingThis = itemForm?.mode === 'edit' && itemForm?.itemId === item.id

  if (isEditingThis) {
    return (
      <div className="px-5 py-4 bg-green-50 border-l-4 border-green-400">
        <p className="text-xs font-semibold text-green-700 mb-3">Edit Item</p>
        <ItemForm
          formData={itemFormData}
          setFormData={setItemFormData}
          error={itemFormError}
          saving={itemSaving}
          onSave={onSaveItem}
          onCancel={onCancelItemForm}
          isEdit={true}
        />
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 transition hover:bg-gray-50 ${!item.is_active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium text-gray-700 ${!item.is_active ? 'italic' : ''}`}>{item.name}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{item.unit}</span>
          {item.unit === 'Bag' && item.kg_per_unit != null && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{item.kg_per_unit} kg/bag</span>
          )}
          {item.unit === 'Bottle' && item.ml_per_unit != null && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">{item.ml_per_unit} ml/bottle</span>
          )}
          {!item.is_active && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">{t('common.inactive')}</span>
          )}
        </div>
        {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Toggle checked={item.is_active} onChange={onToggleActive} />
        {isEditing && (
          <>
            <button onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition">
              ✏️ Edit
            </button>
            <button onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 transition">
              🗑️ Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── ItemForm ─────────────────────────────────────────────────────────────────

function ItemForm({ formData, setFormData, error, saving, onSave, onCancel, isEdit }) {
  const { t } = useTranslation()

  function handleUnitChange(unit) {
    // Clear sub-fields when unit changes
    setFormData(p => ({ ...p, unit, kg_per_unit: '', ml_per_unit: '' }))
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {/* Name */}
        <input
          autoFocus required type="text"
          placeholder="Item name *"
          value={formData.name}
          onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
          className="col-span-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        {/* Unit dropdown */}
        <div className="col-span-2 sm:col-span-1">
          <select
            required
            value={formData.unit}
            onChange={e => handleUnitChange(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
          >
            <option value="">Select unit *</option>
            {UNIT_OPTIONS.map(u => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <input
          type="text"
          placeholder="Description (optional)"
          value={formData.description}
          onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
          className="col-span-2 sm:col-span-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* Bag → kg per bag */}
      {formData.unit === 'Bag' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-1">
          <label className="text-xs font-semibold text-emerald-700">How many KG is one bag? *</label>
          <input
            required type="number" step="0.01" min="0.01"
            placeholder="e.g. 50"
            value={formData.kg_per_unit}
            onChange={e => setFormData(p => ({ ...p, kg_per_unit: e.target.value }))}
            className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <p className="text-xs text-emerald-600">Used for FCR calculation.</p>
        </div>
      )}

      {/* Bottle → ml per bottle */}
      {formData.unit === 'Bottle' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
          <label className="text-xs font-semibold text-blue-700">How many ml is one bottle? *</label>
          <input
            required type="number" step="1" min="1"
            placeholder="e.g. 500"
            value={formData.ml_per_unit}
            onChange={e => setFormData(p => ({ ...p, ml_per_unit: e.target.value }))}
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <Toggle checked={formData.is_active} onChange={val => setFormData(p => ({ ...p, is_active: val }))} />
        <span className="text-xs text-gray-500">{formData.is_active ? t('common.active') : t('common.inactive')}</span>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 py-2 text-xs font-semibold text-white transition">
          {saving ? t('common.loading') : isEdit ? t('catalog.editItem') : t('common.save')}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 rounded-xl border border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
