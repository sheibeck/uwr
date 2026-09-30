// ============================================================================
// Anthropic model constants (pure module, no imports)
// ============================================================================
//
// This is the ONLY file allowed to contain a Claude model ID. Everything else
// imports CLAUDE_MODEL. The repository guard in model_literals.test.ts fails on
// any other model literal.
// ============================================================================

export const CLAUDE_MODEL = 'claude-sonnet-5-5' as const;
export const ANTHROPIC_VERSION = '2023-06-01' as const;
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages' as const;

/** Platform maximum for a single request timeout, in milliseconds. */
export const ANTHROPIC_MAX_TIMEOUT_MS = 180_000;
