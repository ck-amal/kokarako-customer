import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

// ─── Tour steps (ordered) ─────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [
  {
    id:       'profile_language',
    title:    'Language Settings',
    desc:     'Switch between English and Malayalam. Your language preference is saved per account and applies everywhere in the app.',
    icon:     '🌐',
    route:    '/settings/profile',
    tabParam: 'profile',
    isInfo:   true,
  },
  {
    id:       'profile_appearance',
    title:    'Theme & Appearance',
    desc:     'Choose light mode, dark mode, or follow your device settings. Try switching it now!',
    icon:     '🌙',
    route:    '/settings/profile',
    tabParam: 'profile',
    isInfo:   true,
  },
  {
    id:       'profile_org',
    title:    'Organisation Details',
    desc:     'Update your business name, phone, and address here. These details appear on reports.',
    icon:     '🏢',
    route:    '/settings/profile',
    tabParam: 'org',
    isInfo:   true,
  },
  {
    id:       'profile_plan',
    title:    'Plan & Subscription',
    desc:     'See your current plan limits and upgrade at any time. Click "Change plan" to explore available plans.',
    icon:     '💳',
    route:    '/settings/profile',
    tabParam: 'org',
    isInfo:   true,
  },
  {
    id:       'team',
    title:    'Invite Your Team',
    desc:     'Add farm supervisors, accountants, or managers. Each member gets their own login with role-based access.',
    icon:     '👥',
    route:    '/settings/profile',
    tabParam: 'team',
  },
  {
    id:    'catalog',
    title: 'Add Item Catalog',
    desc:  'Set up the items you buy and use — feed types, medicines, equipment. This powers procurement and stock tracking.',
    icon:  '📋',
    route: '/settings/catalog',
  },
  {
    id:    'fee_config',
    title: 'Configure Growing Fee',
    desc:  'Define the per-bird fee rates for each batch type. This is used to calculate what your farm earns.',
    icon:  '🔧',
    route: '/settings/growing-fee',
  },
  {
    id:    'vendors',
    title: 'Add a Vendor',
    desc:  'Vendors are the buyers who purchase birds from you. Add at least one before recording a sale.',
    icon:  '🤝',
    route: '/vendors',
  },
  {
    id:    'suppliers',
    title: 'Add a Supplier',
    desc:  'Suppliers are the companies or people you buy feed, chicks, and medicines from.',
    icon:  '🏭',
    route: '/suppliers',
  },
  {
    id:    'procurement',
    title: 'Create a Procurement',
    desc:  'Record your first purchase — chicks, feed, or medicine. This automatically updates your stock.',
    icon:  '🛒',
    route: '/procurement',
  },
  {
    id:    'stock',
    title: 'Check Your Stock',
    desc:  'See live inventory levels for all items. Stock updates automatically from procurement and distributions.',
    icon:  '📦',
    route: '/stock',
  },
  {
    id:    'farm',
    title: 'Add a Farm',
    desc:  'Create your first farm. Each farm can have multiple batches running in it.',
    icon:  '🏡',
    route: '/farms',
  },
  {
    id:    'batch',
    title: 'Add a Batch',
    desc:  'A batch tracks one flock of chicks from placement to sale. Add your first batch to get started.',
    icon:  '🐣',
    route: '/batches',
  },
  {
    id:    'distribution',
    title: 'Distribute Feed & Medicine',
    desc:  'Record daily feed and medicine usage against a batch. This is used for FCR and cost calculations.',
    icon:  '🌾',
    route: '/batches',
  },
  {
    id:    'sale',
    title: 'Record a Sale',
    desc:  'Record a sale when birds are sold from a batch. You can sell in multiple lots.',
    icon:  '💰',
    route: '/sales',
  },
  {
    id:    'fcr',
    title: 'View FCR Report',
    desc:  'The Feed Conversion Ratio report shows how efficiently your farm converts feed to bird weight.',
    icon:  '📈',
    route: '/reports/fcr',
  },
  {
    id:    'growing_fee',
    title: 'View Growing Fee',
    desc:  'See the growing fee earned per batch based on bird weight and the fee rates you configured.',
    icon:  '🌿',
    route: '/growing-fees',
  },
]

// ─── Context ──────────────────────────────────────────────────────────────────

const OnboardingContext = createContext(null)

function lsKey(orgId, suffix) {
  return `onboarding_${suffix}_${orgId}`
}

export function OnboardingProvider({ children }) {
  const { organization, isOwner, refreshOrg } = useAuth()
  const navigate = useNavigate()
  const orgId = organization?.id

  const isOnboardingDone = Boolean(organization?.onboarding_completed_at)

  // Only owners go through the tour; skip entirely if already done
  const tourActive = isOwner && !isOnboardingDone && Boolean(orgId)

  // ── localStorage-backed state ─────────────────────────────────────────────

  const [completedIds, setCompletedIds] = useState(() => {
    if (!orgId) return new Set()
    try {
      const raw = localStorage.getItem(lsKey(orgId, 'steps'))
      return new Set(raw ? JSON.parse(raw) : [])
    } catch { return new Set() }
  })

  const [welcomeSeen, setWelcomeSeenState] = useState(() => {
    if (!orgId) return false
    return localStorage.getItem(lsKey(orgId, 'welcome')) === 'seen'
  })

  const [checklistOpen, setChecklistOpenState] = useState(() => {
    if (!orgId) return false
    // Default open after welcome is seen, unless user explicitly closed it
    const v = localStorage.getItem(lsKey(orgId, 'checklist'))
    return v !== 'closed'
  })

  // Re-init when org changes (e.g. after setup)
  useEffect(() => {
    if (!orgId) return
    try {
      const raw = localStorage.getItem(lsKey(orgId, 'steps'))
      setCompletedIds(new Set(raw ? JSON.parse(raw) : []))
    } catch { setCompletedIds(new Set()) }
    setWelcomeSeenState(localStorage.getItem(lsKey(orgId, 'welcome')) === 'seen')
    const cv = localStorage.getItem(lsKey(orgId, 'checklist'))
    setChecklistOpenState(cv !== 'closed')
  }, [orgId])

  // ── Actions ───────────────────────────────────────────────────────────────

  const markComplete = useCallback((stepId) => {
    if (!orgId || isOnboardingDone) return
    setCompletedIds(prev => {
      if (prev.has(stepId)) return prev
      const next = new Set(prev)
      next.add(stepId)
      localStorage.setItem(lsKey(orgId, 'steps'), JSON.stringify([...next]))
      return next
    })
  }, [orgId, isOnboardingDone])

  const setWelcomeSeen = useCallback(() => {
    if (!orgId) return
    localStorage.setItem(lsKey(orgId, 'welcome'), 'seen')
    setWelcomeSeenState(true)
    // Open checklist when tour starts
    localStorage.setItem(lsKey(orgId, 'checklist'), 'open')
    setChecklistOpenState(true)
  }, [orgId])

  const setChecklistOpen = useCallback((val) => {
    if (!orgId) return
    localStorage.setItem(lsKey(orgId, 'checklist'), val ? 'open' : 'closed')
    setChecklistOpenState(val)
  }, [orgId])

  const finishOnboarding = useCallback(async () => {
    if (!orgId) return
    await supabase.from('organizations').update({
      onboarding_completed_at: new Date().toISOString(),
    }).eq('id', orgId)
    await refreshOrg()
    // Clean up localStorage
    localStorage.removeItem(lsKey(orgId, 'steps'))
    localStorage.removeItem(lsKey(orgId, 'welcome'))
    localStorage.removeItem(lsKey(orgId, 'checklist'))
  }, [orgId, refreshOrg])

  // "Add more?" pending state — set by stepDone(), cleared by addMore() or confirmAdvance()
  const [pendingStepId, setPendingStepId] = useState(null)

  // Called by pages after a successful save — marks step done and navigates to next
  const advanceStep = useCallback((stepId) => {
    if (!orgId || !tourActive) return
    const idx = ONBOARDING_STEPS.findIndex(s => s.id === stepId)
    if (idx === -1) return
    setCompletedIds(prev => {
      if (prev.has(stepId)) return prev
      const next = new Set(prev)
      next.add(stepId)
      localStorage.setItem(lsKey(orgId, 'steps'), JSON.stringify([...next]))
      return next
    })
    const nextStep = ONBOARDING_STEPS[idx + 1]
    const nextRoute = nextStep
      ? (nextStep.tabParam ? `${nextStep.route}?tab=${nextStep.tabParam}` : nextStep.route)
      : null
    setTimeout(() => {
      if (nextRoute) navigate(nextRoute)
    }, 450)
  }, [orgId, tourActive, navigate])

  // Called by pages after a successful save — shows "Need to add more?" prompt first
  const stepDone = useCallback((stepId) => {
    if (!orgId || !tourActive) return
    if (ONBOARDING_STEPS.findIndex(s => s.id === stepId) === -1) return
    setPendingStepId(stepId)
  }, [orgId, tourActive])

  // User chose "Yes, add more" — just dismiss the prompt, spotlight stays on same button
  const addMore = useCallback(() => {
    setPendingStepId(null)
  }, [])

  // User chose "No, move on" — actually advance to next step
  const confirmAdvance = useCallback(() => {
    if (!pendingStepId) return
    const id = pendingStepId
    setPendingStepId(null)
    advanceStep(id)
  }, [pendingStepId, advanceStep])

  // Auto-finish when all steps are done
  useEffect(() => {
    if (!tourActive) return
    if (completedIds.size >= ONBOARDING_STEPS.length) {
      finishOnboarding()
    }
  }, [completedIds, tourActive, finishOnboarding])

  const currentStep = ONBOARDING_STEPS.find(s => !completedIds.has(s.id)) ?? null

  const value = {
    steps: ONBOARDING_STEPS,
    completedIds,
    currentStep,
    markComplete,
    advanceStep,
    stepDone,
    addMore,
    confirmAdvance,
    pendingStepId,
    isOnboardingDone,
    tourActive,
    welcomeSeen,
    setWelcomeSeen,
    checklistOpen,
    setChecklistOpen,
    finishOnboarding,
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used inside <OnboardingProvider>')
  return ctx
}
