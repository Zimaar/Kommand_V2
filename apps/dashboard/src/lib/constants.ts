const serverApiUrl =
  process.env.INTERNAL_API_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3000"
    : process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000");

// Browser calls stay same-origin so the dashboard can proxy them to the API.
export const API_URL = typeof window === "undefined" ? serverApiUrl : "";

export const COUNTRY_CODES = [
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+1", label: "🇺🇸 +1" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+61", label: "🇦🇺 +61" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+65", label: "🇸🇬 +65" },
  { code: "+966", label: "🇸🇦 +966" },
  { code: "+49", label: "🇩🇪 +49" },
  { code: "+33", label: "🇫🇷 +33" },
  { code: "+86", label: "🇨🇳 +86" },
  { code: "+81", label: "🇯🇵 +81" },
  { code: "+82", label: "🇰🇷 +82" },
  { code: "+55", label: "🇧🇷 +55" },
  { code: "+52", label: "🇲🇽 +52" },
  { code: "+27", label: "🇿🇦 +27" },
];

export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern — UTC−5" },
  { value: "America/Chicago", label: "Central — UTC−6" },
  { value: "America/Denver", label: "Mountain — UTC−7" },
  { value: "America/Los_Angeles", label: "Pacific — UTC−8" },
  { value: "America/Sao_Paulo", label: "São Paulo — UTC−3" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London — UTC+0" },
  { value: "Europe/Paris", label: "Paris — UTC+1" },
  { value: "Europe/Moscow", label: "Moscow — UTC+3" },
  { value: "Asia/Dubai", label: "Dubai — UTC+4" },
  { value: "Asia/Kolkata", label: "Mumbai — UTC+5:30" },
  { value: "Asia/Dhaka", label: "Dhaka — UTC+6" },
  { value: "Asia/Bangkok", label: "Bangkok — UTC+7" },
  { value: "Asia/Singapore", label: "Singapore — UTC+8" },
  { value: "Asia/Tokyo", label: "Tokyo — UTC+9" },
  { value: "Australia/Sydney", label: "Sydney — UTC+11" },
];

export const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "AED", label: "AED — UAE Dirham" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "SGD", label: "SGD — Singapore Dollar" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "JPY", label: "JPY — Japanese Yen" },
];
