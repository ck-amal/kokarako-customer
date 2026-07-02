import { useNavigate, useLocation } from 'react-router-dom'
import { useOnboarding, ONBOARDING_STEPS } from '../contexts/OnboardingContext'

export default function TourGuide() {
  const { tourActive, welcomeSeen, currentStep, finishOnboarding } = useOnboarding()
  const navigate = useNavigate()
  const location = useLocation()

  if (!tourActive || !welcomeSeen || !currentStep) return null

  const tabOk         = !currentStep.tabParam || new URLSearchParams(location.search).get('tab') === currentStep.tabParam
  const onCorrectPage = location.pathname.startsWith(currentStep.route) && tabOk
  if (onCorrectPage) return null // spotlight handles it

  const stepIndex   = ONBOARDING_STEPS.indexOf(currentStep)
  const targetRoute = currentStep.tabParam ? `${currentStep.route}?tab=${currentStep.tabParam}` : currentStep.route

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-white rounded-2xl shadow-xl border border-amber-200 pl-4 pr-2 py-2.5 max-w-sm w-full">
      <span className="text-xl shrink-0">{currentStep.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </p>
        <p className="text-sm font-bold text-gray-800 truncate">{currentStep.title}</p>
      </div>
      <button
        onClick={() => navigate(targetRoute)}
        className="shrink-0 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2 text-sm font-bold text-white transition"
      >
        Go →
      </button>
      <button
        onClick={finishOnboarding}
        className="shrink-0 text-gray-300 hover:text-gray-500 px-1 text-lg leading-none transition"
        title="Exit tour"
      >
        ✕
      </button>
    </div>
  )
}
