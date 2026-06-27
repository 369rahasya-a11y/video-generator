const ZODIAC: Record<string, { symbol: string; display: string }> = {
  aries: { symbol: "\u2648", display: "Aries" },
  taurus: { symbol: "\u2649", display: "Taurus" },
  gemini: { symbol: "\u264A", display: "Gemini" },
  cancer: { symbol: "\u264B", display: "Cancer" },
  leo: { symbol: "\u264C", display: "Leo" },
  virgo: { symbol: "\u264D", display: "Virgo" },
  libra: { symbol: "\u264E", display: "Libra" },
  scorpio: { symbol: "\u264F", display: "Scorpio" },
  sagittarius: { symbol: "\u2650", display: "Sagittarius" },
  capricorn: { symbol: "\u2651", display: "Capricorn" },
  aquarius: { symbol: "\u2652", display: "Aquarius" },
  pisces: { symbol: "\u2653", display: "Pisces" },
};

export function getZodiacInfo(sign: string): { symbol: string; display: string } {
  const key = sign.trim().toLowerCase();
  return ZODIAC[key] ?? { symbol: "\u2727", display: capitalize(sign) };
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function capitalizeMood(mood: string): string {
  return capitalize(mood);
}
