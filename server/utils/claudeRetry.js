// server/utils/claudeRetry.js
// Wraps client.messages.create() with exponential-backoff retry for
// 529 (Anthropic overloaded) and 429 (rate-limit) responses.
// All other errors are re-thrown immediately.

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 3000;

async function claudeWithRetry(client, params, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      const status = err?.status || err?.statusCode;
      const retryable = status === 529 || status === 429;
      if (!retryable) throw err;

      lastErr = err;
      const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      const tag = label ? `[${label}] ` : '';
      console.warn(
        `${tag}Claude ${status} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${delayMs / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

module.exports = { claudeWithRetry };
