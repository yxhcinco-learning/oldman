/** Keep useful product messages, never render native paths or protocol diagnostics. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (!message || message.length > 240 || !/[\u3400-\u9fff]/u.test(message)
    || /(?:wxfile|https?|file):\/\/|[a-z]:[\\/]|(?:\/|\\)(?:usr|data|tmp|home|var)\b|\b(?:errMsg|errno|stack|ZodError|ENOENT|EACCES)\b|\w+(?:Sync)?:fail|[{}\[\]]/i.test(message)) return fallback;
  return message;
}
