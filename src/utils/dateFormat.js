const malayalamMonths = [
  'ജനുവരി', 'ഫെബ്രുവരി', 'മാർച്ച്',
  'ഏപ്രിൽ', 'മേയ്', 'ജൂൺ',
  'ജൂലൈ', 'ഓഗസ്റ്റ്', 'സെപ്തംബർ',
  'ഒക്ടോബർ', 'നവംബർ', 'ഡിസംബർ',
];

const englishMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const formatDate = (date, language = 'en') => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = language === 'ml'
    ? malayalamMonths[d.getMonth()]
    : englishMonths[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

export const formatDateShort = (date, language = 'en') => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = language === 'ml'
    ? malayalamMonths[d.getMonth()]
    : englishMonths[d.getMonth()];
  return `${day} ${month}`;
};
