import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useOnboarding, ONBOARDING_STEPS } from '../contexts/OnboardingContext'

// Steps that complete just by visiting the page — no specific button needed
const VISIT_ONLY = new Set(['stock', 'fcr', 'growing_fee'])

function RepeatPrompt({ stepTitle, onMore, onContinue }) {
  return (
    <div style={{ position: 'fixed', zIndex: 9999, inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-green-200 overflow-hidden w-80">
        <div className="bg-green-500 px-5 py-3 flex items-center gap-2">
          <span className="text-xl">✅</span>
          <p className="text-sm font-bold text-white">Nice work!</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-gray-700 font-medium mb-1">You added a <span className="font-bold text-gray-900">{stepTitle.replace(/^(Add a?|Configure)\s*/i, '')}</span>.</p>
          <p className="text-sm text-gray-500 mb-5">Need to add more?</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={onMore}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold py-2.5 transition"
            >
              ➕ Yes, add more
            </button>
            <button
              onClick={onContinue}
              className="w-full rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-medium py-2.5 transition"
            >
              No, continue to next step →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const PAD       = 10  // px padding around the spotlight target
const TOOLTIP_W = 300 // tooltip width in px

export default function TourSpotlight() {
  const { tourActive, welcomeSeen, currentStep, markComplete, advanceStep, stepDone, addMore, confirmAdvance, pendingStepId, finishOnboarding } = useOnboarding()
  const location = useLocation()

  const [rect,          setRect]          = useState(null)
  const [buttonClicked, setButtonClicked] = useState(false)

  const stepIndex     = currentStep ? ONBOARDING_STEPS.indexOf(currentStep) : -1
  const isVisitOnly   = currentStep ? VISIT_ONLY.has(currentStep.id) : false
  const tabOk         = !currentStep?.tabParam || new URLSearchParams(location.search).get('tab') === currentStep.tabParam
  const onCorrectPage = currentStep ? location.pathname.startsWith(currentStep.route) && tabOk : false

  // Auto-complete visit-only steps 800 ms after landing
  useEffect(() => {
    if (!tourActive || !onCorrectPage || !isVisitOnly || !currentStep) return
    const t = setTimeout(() => markComplete(currentStep.id), 800)
    return () => clearTimeout(t)
  }, [currentStep?.id, onCorrectPage, isVisitOnly, tourActive])

  // Reset buttonClicked whenever step changes
  useEffect(() => { setButtonClicked(false) }, [currentStep?.id])

  // Find + measure the [data-tour] element
  const measure = useCallback(() => {
    if (!tourActive || !currentStep || !onCorrectPage || isVisitOnly) {
      setRect(null)
      return
    }
    const el = document.querySelector(`[data-tour="${currentStep.id}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    setRect({ left: r.left, top: r.top, w: r.width, h: r.height })
  }, [tourActive, currentStep?.id, onCorrectPage, isVisitOnly])

  // Re-measure on route change; retry for async renders
  useEffect(() => {
    setRect(null)
    const timers = [0, 150, 400, 800].map(d => setTimeout(measure, d))
    return () => timers.forEach(clearTimeout)
  }, [measure, location.pathname])

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  // Listen for click on the spotlit element — when clicked, lift the dark overlay
  // so inline forms (not modals) become visible beneath it
  useEffect(() => {
    if (!currentStep || !rect) return
    const el = document.querySelector(`[data-tour="${currentStep.id}"]`)
    if (!el) return
    const handler = () => setButtonClicked(true)
    el.addEventListener('click', handler)
    return () => el.removeEventListener('click', handler)
  }, [currentStep?.id, rect])

  // "Need to add more?" prompt — shown after a save, before advancing
  const showRepeatPrompt = pendingStepId && pendingStepId === currentStep?.id

  if (!tourActive || !welcomeSeen || !currentStep || !onCorrectPage || isVisitOnly || !rect) {
    // Still show the repeat prompt even if rect not ready
    if (showRepeatPrompt) return <RepeatPrompt stepTitle={currentStep.title} onMore={() => { addMore(); setButtonClicked(false) }} onContinue={confirmAdvance} />
    return null
  }

  if (showRepeatPrompt) {
    return <RepeatPrompt stepTitle={currentStep.title} onMore={() => { addMore(); setButtonClicked(false) }} onContinue={confirmAdvance} />
  }

  // Spotlight geometry
  const sL  = rect.left - PAD
  const sT  = rect.top  - PAD
  const sW  = rect.w    + PAD * 2
  const sH  = rect.h    + PAD * 2
  const sCX = sL + sW / 2

  // Tooltip position: above element when in lower screen half, else below
  const above    = rect.top > window.innerHeight / 2
  const tLeft    = Math.max(12, Math.min(sCX - TOOLTIP_W / 2, window.innerWidth - TOOLTIP_W - 12))
  const arrowOff = Math.max(16, Math.min(sCX - tLeft - 8, TOOLTIP_W - 32))

  const tooltipStyle = {
    position: 'fixed',
    zIndex: 46,
    left: tLeft,
    width: TOOLTIP_W,
    ...(above
      ? { bottom: window.innerHeight - sT + 14 }
      : { top: sT + sH + 14 }),
  }

  return (
    <>
      {/* Dark overlay — hidden once button is clicked so inline forms show through */}
      {!buttonClicked && (
        <>
          <div
            style={{
              position: 'fixed', zIndex: 45, pointerEvents: 'none',
              left: sL, top: sT, width: sW, height: sH,
              borderRadius: 10,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.68)',
              border: '2px solid rgba(251,191,36,0.8)',
              transition: 'left .2s,top .2s,width .2s,height .2s',
            }}
          />
          <div
            style={{
              position: 'fixed', zIndex: 44, pointerEvents: 'none',
              left: sL - 6, top: sT - 6, width: sW + 12, height: sH + 12,
              borderRadius: 14,
              border: '2px solid rgba(251,191,36,0.4)',
              animation: 'tourPulse 1.8s ease-in-out infinite',
            }}
          />
          {/* Arrow */}
          <div style={{
            position: 'fixed', zIndex: 47, pointerEvents: 'none',
            left: tLeft + arrowOff,
            ...(above
              ? { bottom: window.innerHeight - sT + 2 }
              : { top: sT + sH + 2 }),
          }}>
            {above
              ? <div style={{ width:0,height:0,borderLeft:'10px solid transparent',borderRight:'10px solid transparent',borderTop:'12px solid #f59e0b' }} />
              : <div style={{ width:0,height:0,borderLeft:'10px solid transparent',borderRight:'10px solid transparent',borderBottom:'12px solid #f59e0b' }} />
            }
          </div>
        </>
      )}

      {/* When button clicked: small pill at bottom-right so it doesn't block the inline form */}
      {buttonClicked ? (
        <div style={{ position: 'fixed', zIndex: 46, bottom: 28, right: 24 }}
          className="flex items-center gap-2 rounded-2xl bg-white shadow-2xl border border-green-200 px-4 py-3">
          <span className="text-base">{currentStep.isInfo ? '✅' : '📝'}</span>
          <div>
            <p className="text-xs font-bold text-green-700 leading-tight">
              {currentStep.isInfo ? 'Take a look, then click Next' : 'Fill in the form and save to continue'}
            </p>
            <p className="text-xs text-gray-400">Step {stepIndex + 1} / {ONBOARDING_STEPS.length} — {currentStep.title}</p>
          </div>
          <button
            onClick={() => advanceStep(currentStep.id)}
            className="ml-2 text-xs font-semibold text-amber-600 hover:text-amber-800 border border-amber-200 bg-amber-50 rounded-lg px-2 py-1 transition"
          >
            {currentStep.isInfo ? 'Next →' : 'Skip →'}
          </button>
        </div>
      ) : (
        /* Normal tooltip over the spotlit element */
        <div style={tooltipStyle} className="rounded-2xl bg-white shadow-2xl overflow-hidden border border-amber-200">

          <div className="flex items-center justify-between bg-amber-500 px-4 py-2.5">
            <span className="text-xs font-bold text-white/80 uppercase tracking-wide">
              Step {stepIndex + 1} / {ONBOARDING_STEPS.length}
            </span>
            <button onClick={finishOnboarding} className="text-white/60 hover:text-white text-xs transition">
              ✕ Exit tour
            </button>
          </div>

          <div className="px-4 pt-3 pb-4">
            <p className="text-sm font-bold text-gray-800 mb-1">{currentStep.icon} {currentStep.title}</p>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">{currentStep.desc}</p>

            <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
              <span className="text-sm animate-bounce">👆</span>
              <p className="text-xs font-semibold text-amber-700">
                {currentStep.isInfo ? 'Click the highlighted section to continue' : 'Click the highlighted button to continue'}
              </p>
            </div>

            <button
              onClick={() => advanceStep(currentStep.id)}
              className="w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition"
            >
              {currentStep.isInfo ? 'Next →' : 'Skip this step →'}
            </button>
          </div>

        </div>
      )}

      <style>{`
        @keyframes tourPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 0.2; transform: scale(1.04); }
        }
      `}</style>
    </>
  )
}
