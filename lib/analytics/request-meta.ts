export interface RequestMeta {
  city: string | null;
  country: string | null;
  device: string;
  ip: string | null;
  region: string | null;
  userAgent: string;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function describeDevice(userAgent: string): string {
  const os = /Android/i.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
    : /Tizen|Web0S|webOS|SMART-TV|SmartTV|AFT|CrKey|BRAVIA/i.test(userAgent) ? 'TV'
    : /Mac OS X/i.test(userAgent) ? 'macOS'
    : /Windows/i.test(userAgent) ? 'Windows'
    : /Linux/i.test(userAgent) ? 'Linux'
    : 'Unknown';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Other';
  return `${browser} · ${os}`;
}

export function getRequestMeta(headers: Headers): RequestMeta {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = headers.get('user-agent') ?? '';
  const country = headers.get('x-vercel-ip-country')?.toUpperCase() ?? null;
  return {
    city: decode(headers.get('x-vercel-ip-city')),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    device: describeDevice(userAgent),
    ip: forwarded || headers.get('x-real-ip') || null,
    region: decode(headers.get('x-vercel-ip-country-region')),
    userAgent: userAgent.slice(0, 400),
  };
}

export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🏳️';
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}
