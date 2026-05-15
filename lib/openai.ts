/** Remove espaços e caracteres invisíveis colados ao copiar a chave */
export function normalizeOpenAiApiKey(key: unknown): string {
  return String(key ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

/** Chaves OpenAI: sk-..., sk-proj-..., etc. */
export function isOpenAiApiKey(key: unknown): boolean {
  const trimmed = normalizeOpenAiApiKey(key);
  if (trimmed.length < 20) return false;
  return /^sk-[a-zA-Z0-9_-]+$/.test(trimmed);
}
