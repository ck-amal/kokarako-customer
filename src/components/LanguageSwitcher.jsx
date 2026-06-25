import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher({ compact = false }) {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.startsWith('ml') ? 'ml' : 'en';

  const change = (lang) => {
    if (lang === current) return;
    i18n.changeLanguage(lang);
    document.documentElement.setAttribute('lang', lang);
  };

  if (compact) {
    return (
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs font-medium">
        <button
          onClick={() => change('en')}
          className={`px-2 py-1 transition-colors ${
            current === 'en'
              ? 'bg-amber-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          EN
        </button>
        <button
          onClick={() => change('ml')}
          className={`px-2 py-1 transition-colors ${
            current === 'ml'
              ? 'bg-amber-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          മല
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-3">
        {t('settings.language')}
      </p>
      <p className="text-xs text-gray-500 mb-4">{t('settings.languageDescription')}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => change('en')}
          className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
            current === 'en'
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          <span className="text-2xl mb-1">🇬🇧</span>
          <span className="font-semibold text-sm">English</span>
          <span className="text-xs mt-0.5 opacity-70">English</span>
        </button>
        <button
          onClick={() => change('ml')}
          className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
            current === 'ml'
              ? 'border-amber-500 bg-amber-50 text-amber-700'
              : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
          }`}
        >
          <span className="text-2xl mb-1">🇮🇳</span>
          <span className="font-semibold text-sm">മലയാളം</span>
          <span className="text-xs mt-0.5 opacity-70">Malayalam</span>
        </button>
      </div>
    </div>
  );
}
