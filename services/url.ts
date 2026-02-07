export function coerceUrlString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';

  if (typeof value === 'object') {
    const maybe: any = value;
    if (typeof maybe.href === 'string') return maybe.href;
    if (typeof maybe.url === 'string') return maybe.url;
    if (typeof maybe.toString === 'function') {
      try {
        const text = maybe.toString();
        if (typeof text === 'string' && text !== '[object Object]') return text;
      } catch {
        // ignore
      }
    }
  }

  try {
    const text = String(value);
    return text === '[object Object]' ? '' : text;
  } catch {
    return '';
  }
}

