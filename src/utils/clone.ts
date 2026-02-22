/**
 * Deep clone that preserves function references.
 * JSON.parse/stringify would discard functions (e.g. crossRules.check / validate),
 * so we walk the object tree manually and keep functions as-is.
 */
export function deepClone<T>(x: T): T {
  if (x === null || x === undefined) return x
  if (typeof x === 'function') return x
  if (Array.isArray(x)) return x.map((item) => deepClone(item)) as unknown as T
  if (typeof x === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(x as Record<string, unknown>)) {
      result[key] = deepClone((x as Record<string, unknown>)[key])
    }
    return result as T
  }
  return x
}

/**
 * Plain data deep clone via structuredClone.
 * Use this when the object contains only serializable data (no functions).
 */
export function cloneData<T>(x: T): T {
  return structuredClone(x)
}
