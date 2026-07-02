import { useNavigate } from 'react-router-dom'
import { useOnboarding } from '../contexts/OnboardingContext'

export default function GetStartedChecklist() {
  const navigate = useNavigate()
  const {
    steps,
    completedIds,
    tourActive,
    welcomeSeen,
    checklistOpen,
    setChecklistOpen,
    finishOnboarding,
  } = useOnboarding()

  // Only show after welcome modal is dismissed and tour is running
  if (!tourActive || !welcomeSeen) return null

  const doneCount = completedIds.size
  const total     = steps.length
  const pct       = Math.round((doneCount / total) * 100)

  // ── Minimised pill ───────────────────────────────────────────────────────
  if (!checklistOpen) {
    return (
      <button
        onClick={() => setChecklistOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-amber-500 hover:bg-amber-600 shadow-lg px-4 py-2.5 text-sm font-semibold text-white transition"
      >
        <span>🚀</span>
        <span>Getting Started</span>
        <span className="ml-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">
          {doneCount}/{total}
        </span>
      </button>
    )
  }

  // ── Expanded panel ───────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl bg-white shadow-2xl border border-gray-100 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">🚀 Getting Started</p>
          <p className="text-xs text-amber-100 mt-0.5">{doneCount} of {total} steps complete</p>
        </div>
        <button
          onClick={() => setChecklistOpen(false)}
          className="p-1 rounded-lg hover:bg-white/20 transition text-white/80 hover:text-white"
          title="Minimise"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-amber-100">
        <div
          className="h-full bg-amber-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step list */}
      <div className="overflow-y-auto max-h-[360px] divide-y divide-gray-50">
        {steps.map((step, i) => {
          const done = completedIds.has(step.id)
          return (
            <button
              key={step.id}
              onClick={() => navigate(step.tabParam ? `${step.route}?tab=${step.tabParam}` : step.route)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition
                ${done ? 'opacity-60' : 'hover:bg-amber-50'}`}
            >
              {/* Status indicator */}
              <div className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold
                ${done
                  ? 'bg-green-100 text-green-600'
                  : 'bg-amber-100 text-amber-700'
                }`}
              >
                {done ? '✓' : i + 1}
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {step.icon} {step.title}
                </p>
                {!done && (
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug line-clamp-2">
                    {step.desc}
                  </p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-400">{pct}% complete</p>
        <button
          onClick={finishOnboarding}
          className="text-xs text-gray-400 hover:text-gray-600 transition underline underline-offset-2"
        >
          Dismiss tour
        </button>
      </div>

    </div>
  )
}
