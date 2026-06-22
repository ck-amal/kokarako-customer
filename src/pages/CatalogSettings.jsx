import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, message, onClose, onConfirm, destructive = true, confirmLabel = 'Confirm' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{title}</h2>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition"
            style={{ backgroundColor: destructive ? '#ef4444' : '#f59e0b' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = destructive ? '#dc2626' : '#d97706' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = destructive ? '#ef4444' : '#f59e0b' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
      style={{ backgroundColor: checked ? '#10b981' : '#d1d5db' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogSettings() {
  const [itemTypes, setItemTypes] = useState([])
  const [selectedTypeId, setSelectedTypeId] = useState(null)
  const [items, setItems] = useState([])
  const [itemCounts, setItemCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)

  // Add/edit type form: null = hidden, {} = add mode, {id,...} = edit mode
  const [typeForm, setTypeForm] = useState(null)
  const [typeFormData, setTypeFormData] = useState({ name: '', description: '' })
  const [typeFormError, setTypeFormError] = useState('')

  // Add/edit item form: null = hidden, {} = add mode, {id,...} = edit mode
  const [itemForm, setItemForm] = useState(null)
  const [itemFormData, setItemFormData] = useState({ name: '', unit: '', description: '', is_active: true })
  const [itemFormError, setItemFormError] = useState('')

  // Confirm modal
  const [confirmModal, setConfirmModal] = useState(null)

  // Saving states
  const [saving, setSaving] = useState(false)
  const [deactivateMsg, setDeactivateMsg] = useState('')

  // ── Load item types + counts ──────────────────────────────────────────────

  const loadTypes = useCallback(async (keepSelection = false) => {
    setLoading(true)
    const { data: types } = await supabase
      .from('item_types')
      .select('id, name, description, created_at')
      .order('name')

    const { data: countRows } = await supabase
      .from('items')
      .select('item_type_id')

    const counts = {}
    ;(countRows || []).forEach(r => {
      counts[r.item_type_id] = (counts[r.item_type_id] || 0) + 1
    })

    setItemTypes(types || [])
    setItemCounts(counts)

    if (!keepSelection) {
      const first = types?.[0]?.id ?? null
      setSelectedTypeId(prev => {
        const nextId = prev !== null && (types || []).some(t => t.id === prev) ? prev : first
        return nextId
      })
    }

    setLoading(false)
  }, [])

  // ── Load items for selected type ──────────────────────────────────────────

  const loadItems = useCallback(async (typeId) => {
    if (!typeId) { setItems([]); return }
    setItemsLoading(true)
    const { data } = await supabase
      .from('items')
      .select('id, item_type_id, name, unit, description, is_active, created_at')
      .eq('item_type_id', typeId)
      .order('name')
    // Sort: active first, then inactive
    const sorted = (data || []).sort((a, b) => {
      if (a.is_active === b.is_active) return a.name.localeCompare(b.name)
      return a.is_active ? -1 : 1
    })
    setItems(sorted)
    setItemsLoading(false)
  }, [])

  useEffect(() => { loadTypes() }, [loadTypes])

  useEffect(() => {
    if (selectedTypeId) loadItems(selectedTypeId)
    else setItems([])
  }, [selectedTypeId, loadItems])

  // ── Type form helpers ─────────────────────────────────────────────────────

  function openAddType() {
    setTypeForm({ mode: 'add' })
    setTypeFormData({ name: '', description: '' })
    setTypeFormError('')
  }

  function openEditType(type, e) {
    e.stopPropagation()
    setTypeForm({ mode: 'edit', id: type.id })
    setTypeFormData({ name: type.name, description: type.description || '' })
    setTypeFormError('')
  }

  function cancelTypeForm() {
    setTypeForm(null)
    setTypeFormError('')
  }

  async function handleSaveType(e) {
    e.preventDefault()
    setTypeFormError('')
    if (!typeFormData.name.trim()) {
      setTypeFormError('Type name is required.')
      return
    }
    setSaving(true)
    const payload = {
      name: typeFormData.name.trim(),
      description: typeFormData.description.trim() || null,
    }
    let error
    if (typeForm.mode === 'edit') {
      ;({ error } = await supabase.from('item_types').update(payload).eq('id', typeForm.id))
    } else {
      ;({ error } = await supabase.from('item_types').insert(payload))
    }
    setSaving(false)
    if (error) {
      setTypeFormError(error.message)
      return
    }
    setTypeForm(null)
    await loadTypes(true)
  }

  // ── Delete type logic ─────────────────────────────────────────────────────

  async function handleDeleteType(type, e) {
    e.stopPropagation()
    const count = itemCounts[type.id] || 0

    if (count > 0) {
      setConfirmModal({
        title: 'Delete Item Type',
        message: `This type has ${count} item${count !== 1 ? 's' : ''}. Deleting it will deactivate all associated items. Existing procurement records will not be affected.`,
        confirmLabel: 'Delete Anyway',
        destructive: true,
        onConfirm: async () => {
          setConfirmModal(null)
          // Deactivate all items of this type
          await supabase.from('items').update({ is_active: false }).eq('item_type_id', type.id)
          // Delete the type
          await supabase.from('item_types').delete().eq('id', type.id)
          setSelectedTypeId(prev => (prev === type.id ? null : prev))
          await loadTypes(false)
        },
      })
    } else {
      setConfirmModal({
        title: 'Delete Item Type',
        message: 'Delete this item type? This action cannot be undone.',
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: async () => {
          setConfirmModal(null)
          await supabase.from('item_types').delete().eq('id', type.id)
          setSelectedTypeId(prev => (prev === type.id ? null : prev))
          await loadTypes(false)
        },
      })
    }
  }

  // ── Item form helpers ─────────────────────────────────────────────────────

  function openAddItem() {
    setItemForm({ mode: 'add' })
    setItemFormData({ name: '', unit: '', description: '', is_active: true })
    setItemFormError('')
    setDeactivateMsg('')
  }

  function openEditItem(item, e) {
    e.stopPropagation()
    setItemForm({ mode: 'edit', id: item.id })
    setItemFormData({
      name: item.name,
      unit: item.unit,
      description: item.description || '',
      is_active: item.is_active,
    })
    setItemFormError('')
    setDeactivateMsg('')
  }

  function cancelItemForm() {
    setItemForm(null)
    setItemFormError('')
  }

  async function handleSaveItem(e) {
    e.preventDefault()
    setItemFormError('')
    if (!itemFormData.name.trim()) {
      setItemFormError('Item name is required.')
      return
    }
    if (!itemFormData.unit.trim()) {
      setItemFormError('Unit is required.')
      return
    }
    setSaving(true)
    const payload = {
      name: itemFormData.name.trim(),
      unit: itemFormData.unit.trim(),
      description: itemFormData.description.trim() || null,
      is_active: itemFormData.is_active,
    }
    let error
    if (itemForm.mode === 'edit') {
      ;({ error } = await supabase.from('items').update(payload).eq('id', itemForm.id))
    } else {
      ;({ error } = await supabase.from('items').insert({ ...payload, item_type_id: selectedTypeId }))
    }
    setSaving(false)
    if (error) {
      setItemFormError(error.message)
      return
    }
    setItemForm(null)
    await Promise.all([loadItems(selectedTypeId), loadTypes(true)])
  }

  // ── Inline active toggle for items ────────────────────────────────────────

  async function handleToggleItemActive(item) {
    await supabase.from('items').update({ is_active: !item.is_active }).eq('id', item.id)
    await Promise.all([loadItems(selectedTypeId), loadTypes(true)])
  }

  // ── Delete item logic ─────────────────────────────────────────────────────

  async function handleDeleteItem(item, e) {
    e.stopPropagation()
    setDeactivateMsg('')

    // Check if used in procurement or distributions
    const [{ count: procCount }, { count: distCount }] = await Promise.all([
      supabase.from('procurement').select('id', { count: 'exact', head: true }).eq('item_id', item.id),
      supabase.from('distributions').select('id', { count: 'exact', head: true }).eq('item_id', item.id),
    ])

    const isUsed = (procCount || 0) > 0 || (distCount || 0) > 0

    if (isUsed) {
      setConfirmModal({
        title: 'Cannot Delete Item',
        message: 'This item has existing records (procurement or distributions). It will be deactivated instead of deleted. Continue?',
        confirmLabel: 'Deactivate',
        destructive: false,
        onConfirm: async () => {
          setConfirmModal(null)
          await supabase.from('items').update({ is_active: false }).eq('id', item.id)
          setDeactivateMsg('This item has existing records. It has been deactivated instead of deleted.')
          await Promise.all([loadItems(selectedTypeId), loadTypes(true)])
        },
      })
    } else {
      setConfirmModal({
        title: 'Delete Item',
        message: `Delete "${item.name}"? This action cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: async () => {
          setConfirmModal(null)
          await supabase.from('items').delete().eq('id', item.id)
          await Promise.all([loadItems(selectedTypeId), loadTypes(true)])
        },
      })
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedType = itemTypes.find(t => t.id === selectedTypeId) ?? null
  const activeItems = items.filter(i => i.is_active)
  const inactiveItems = items.filter(i => !i.is_active)

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Item Catalog</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage item types and items for procurement &amp; distributions
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-9 w-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr', alignItems: 'start' }}>
          {/* Two-panel grid on large screens */}
          <div
            className="grid gap-5"
            style={{ gridTemplateColumns: 'minmax(0,280px) minmax(0,1fr)' }}
          >
            {/* ── LEFT PANEL: Item Types ────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Item Types</h2>
                <button
                  onClick={openAddType}
                  disabled={typeForm !== null}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
                  style={{ backgroundColor: '#f59e0b' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#d97706' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f59e0b' }}
                >
                  <span className="text-sm leading-none">+</span> Add Type
                </button>
              </div>

              {/* Add type inline form */}
              {typeForm?.mode === 'add' && (
                <div className="px-4 py-3 border-b border-amber-100" style={{ backgroundColor: '#fffbeb' }}>
                  <TypeForm
                    formData={typeFormData}
                    setFormData={setTypeFormData}
                    error={typeFormError}
                    saving={saving}
                    onSave={handleSaveType}
                    onCancel={cancelTypeForm}
                    isEdit={false}
                  />
                </div>
              )}

              {/* Types list */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {itemTypes.length === 0 && typeForm?.mode !== 'add' ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 px-4 text-center">
                    <p className="text-sm font-medium">No item types yet.</p>
                    <p className="text-xs mt-1">Add one to get started.</p>
                  </div>
                ) : (
                  itemTypes.map(type => {
                    const isSelected = type.id === selectedTypeId
                    const count = itemCounts[type.id] || 0
                    const isEditing = typeForm?.mode === 'edit' && typeForm.id === type.id

                    return (
                      <div key={type.id}>
                        {isEditing ? (
                          <div
                            className="px-4 py-3"
                            style={{ backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b' }}
                          >
                            <TypeForm
                              formData={typeFormData}
                              setFormData={setTypeFormData}
                              error={typeFormError}
                              saving={saving}
                              onSave={handleSaveType}
                              onCancel={cancelTypeForm}
                              isEdit={true}
                            />
                          </div>
                        ) : (
                          <div
                            className="flex items-start gap-2 px-4 py-3 cursor-pointer transition hover:bg-amber-50/60"
                            style={
                              isSelected
                                ? { backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b' }
                                : { borderLeft: '4px solid transparent' }
                            }
                            onClick={() => {
                              setSelectedTypeId(type.id)
                              setItemForm(null)
                              setDeactivateMsg('')
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{type.name}</p>
                              {type.description && (
                                <p className="text-xs text-gray-500 mt-0.5 truncate">{type.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-medium text-gray-500"
                                style={{ backgroundColor: '#f3f4f6' }}
                              >
                                {count}
                              </span>
                              <button
                                onClick={e => openEditType(type, e)}
                                className="p-1 rounded hover:bg-amber-100 text-gray-400 hover:text-amber-600 transition text-sm leading-none"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={e => handleDeleteType(type, e)}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition text-sm leading-none"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL: Items ────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              {!selectedType ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <p className="text-sm">← Select a type to view items</p>
                </div>
              ) : (
                <>
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Items under{' '}
                      <span className="text-amber-600">{selectedType.name}</span>
                    </h2>
                    <button
                      onClick={openAddItem}
                      disabled={itemForm !== null}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
                      style={{ backgroundColor: '#059669' }}
                      onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#047857' }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#059669' }}
                    >
                      <span className="text-sm leading-none">+</span> Add Item
                    </button>
                  </div>

                  {/* Deactivate message */}
                  {deactivateMsg && (
                    <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
                      <span>⚠️</span>
                      <span>{deactivateMsg}</span>
                      <button
                        onClick={() => setDeactivateMsg('')}
                        className="ml-auto text-amber-500 hover:text-amber-700 leading-none"
                      >
                        &times;
                      </button>
                    </div>
                  )}

                  {/* Add item inline form */}
                  {itemForm?.mode === 'add' && (
                    <div className="px-5 py-4 border-b border-emerald-100" style={{ backgroundColor: '#f0fdf4' }}>
                      <ItemForm
                        formData={itemFormData}
                        setFormData={setItemFormData}
                        error={itemFormError}
                        saving={saving}
                        onSave={handleSaveItem}
                        onCancel={cancelItemForm}
                        isEdit={false}
                      />
                    </div>
                  )}

                  {/* Items list */}
                  {itemsLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="h-7 w-7 rounded-full border-4 border-emerald-400 border-t-transparent animate-spin" />
                    </div>
                  ) : items.length === 0 && itemForm?.mode !== 'add' ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <p className="text-sm font-medium">No items yet.</p>
                      <p className="text-xs mt-1">Click "Add Item" to get started.</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                      {/* Active items */}
                      {activeItems.map(item => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          itemForm={itemForm}
                          itemFormData={itemFormData}
                          setItemFormData={setItemFormData}
                          itemFormError={itemFormError}
                          saving={saving}
                          onEdit={openEditItem}
                          onDelete={handleDeleteItem}
                          onToggleActive={handleToggleItemActive}
                          onSave={handleSaveItem}
                          onCancel={cancelItemForm}
                        />
                      ))}
                      {/* Inactive items */}
                      {inactiveItems.length > 0 && (
                        <>
                          {activeItems.length > 0 && (
                            <div className="px-5 py-2 bg-gray-50 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Inactive</p>
                            </div>
                          )}
                          {inactiveItems.map(item => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              itemForm={itemForm}
                              itemFormData={itemFormData}
                              setItemFormData={setItemFormData}
                              itemFormError={itemFormError}
                              saving={saving}
                              onEdit={openEditItem}
                              onDelete={handleDeleteItem}
                              onToggleActive={handleToggleItemActive}
                              onSave={handleSaveItem}
                              onCancel={cancelItemForm}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
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

// ─── TypeForm (reused for add / edit) ────────────────────────────────────────

function TypeForm({ formData, setFormData, error, saving, onSave, onCancel, isEdit }) {
  return (
    <form onSubmit={onSave} className="space-y-2">
      <input
        autoFocus
        required
        type="text"
        placeholder="Type name *"
        value={formData.name}
        onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <input
        type="text"
        placeholder="Optional description"
        value={formData.description}
        onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">{error}</p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
          style={{ backgroundColor: '#f59e0b' }}
        >
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  itemForm,
  itemFormData,
  setItemFormData,
  itemFormError,
  saving,
  onEdit,
  onDelete,
  onToggleActive,
  onSave,
  onCancel,
}) {
  const isEditing = itemForm?.mode === 'edit' && itemForm.id === item.id

  if (isEditing) {
    return (
      <div className="px-5 py-4 border-b border-emerald-100" style={{ backgroundColor: '#f0fdf4' }}>
        <ItemForm
          formData={itemFormData}
          setFormData={setItemFormData}
          error={itemFormError}
          saving={saving}
          onSave={onSave}
          onCancel={onCancel}
          isEdit={true}
        />
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-3 px-5 py-3 transition hover:bg-gray-50/80"
      style={!item.is_active ? { opacity: 0.6 } : {}}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold text-gray-800${!item.is_active ? ' italic' : ''}`}>
            {item.name}
          </p>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium text-gray-500"
            style={{ backgroundColor: '#f3f4f6' }}
          >
            {item.unit}
          </span>
          {!item.is_active && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}
            >
              Inactive
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.description}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        {/* Active toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">{item.is_active ? 'Active' : 'Inactive'}</span>
          <Toggle checked={item.is_active} onChange={() => onToggleActive(item)} />
        </div>
        {/* Edit */}
        <button
          onClick={e => onEdit(item, e)}
          className="p-1 rounded hover:bg-amber-100 text-gray-400 hover:text-amber-600 transition text-sm leading-none"
          title="Edit"
        >
          ✏️
        </button>
        {/* Delete */}
        <button
          onClick={e => onDelete(item, e)}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition text-sm leading-none"
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}

// ─── ItemForm (reused for add / edit) ────────────────────────────────────────

const UNIT_SUGGESTIONS = ['Bags', 'Vials', 'Bottles', 'Chicks', 'KG', 'Litres', 'Tablets']

function ItemForm({ formData, setFormData, error, saving, onSave, onCancel, isEdit }) {
  return (
    <form onSubmit={onSave} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          required
          type="text"
          placeholder="Item name *"
          value={formData.name}
          onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
          className="col-span-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <div className="col-span-2 sm:col-span-1">
          <input
            required
            type="text"
            placeholder="Unit *"
            list="unit-suggestions"
            value={formData.unit}
            onChange={e => setFormData(prev => ({ ...prev, unit: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <input
          type="text"
          placeholder="Description (optional)"
          value={formData.description}
          onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="col-span-2 sm:col-span-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2 pt-1">
        <Toggle
          checked={formData.is_active}
          onChange={val => setFormData(prev => ({ ...prev, is_active: val }))}
        />
        <span className="text-sm text-gray-600">{formData.is_active ? 'Active' : 'Inactive'}</span>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-white transition disabled:opacity-60"
          style={{ backgroundColor: '#059669' }}
        >
          {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-gray-300 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
