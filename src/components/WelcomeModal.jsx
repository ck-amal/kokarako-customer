import { useNavigate } from 'react-router-dom'
import { useOnboarding, ONBOARDING_STEPS } from '../contexts/OnboardingContext'
import { useAuth } from '../contexts/AuthContext'

export default function WelcomeModal() {
  const { tourActive, welcomeSeen, setWelcomeSeen, finishOnboarding, currentStep } = useOnboarding()
  const { organization } = useAuth()
  const navigate = useNavigate()

  if (!tourActive || welcomeSeen) return null

  function handleStart() {
    setWelcomeSeen()
    if (currentStep) navigate(currentStep.route)
  }

  function handleSkip() {
    setWelcomeSeen()
    finishOnboarding()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Top banner */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-400 px-8 py-8 text-center">
          <div className="text-5xl mb-3">🐔</div>
          <h1 className="text-2xl font-bold text-white">
            Welcome to Kokarako{organization?.name ? `, ${organization.name}` : ''}!
          </h1>
          <p className="text-amber-100 text-sm mt-2">
            Let's get your farm set up in a few quick steps.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          <p className="text-sm text-gray-600 mb-5 text-center">
            We'll guide you through <span className="font-semibold text-gray-800">{ONBOARDING_STEPS.length} steps</span> to
            get your farm fully configured — from item catalog to sales and reports.
          </p>

          {/* Step preview grid */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {ONBOARDING_STEPS.slice(0, 6).map(step => (
              <div key={step.id} className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                <span className="text-base leading-none">{step.icon}</span>
                <span className="text-xs font-medium text-gray-700">{step.title}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center mb-5">
            + {ONBOARDING_STEPS.length - 6} more — batches, sales &amp; reports
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleStart}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 py-3 text-sm font-bold text-white transition"
            >
              Start Tour →
            </button>
            <button
              onClick={handleSkip}
              className="w-full rounded-xl py-2.5 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              I already know the app — skip tour
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
