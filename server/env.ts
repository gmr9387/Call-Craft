// Reads a setting by its usual name, or the same name in lowercase
// (Vercel keeps names exactly as typed, so "anthropic_api_key" works too).
export function env(name: string): string | undefined {
  const value = process.env[name] ?? process.env[name.toLowerCase()];
  return value?.trim() || undefined;
}
