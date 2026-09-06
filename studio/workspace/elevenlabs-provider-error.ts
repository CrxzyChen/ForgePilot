import type { AssetJobFailure } from './studio-asset-job-broker.ts';

// Provider text is untrusted and may echo credentials. Only these finite codes
// can cross the broker boundary; messages, request IDs and unknown fields cannot.
const knownErrors = {
  quota_exceeded: 'quota',
  insufficient_credits: 'quota',
  payment_required: 'quota',
  invalid_api_key: 'credential',
  authentication_error: 'credential',
  insufficient_permissions: 'permission',
  authorization_error: 'permission',
  model_access_denied: 'model',
  model_not_found: 'model',
  max_character_limit_exceeded: 'parameter',
  bad_request: 'parameter',
  invalid_request: 'parameter',
  validation_error: 'parameter',
  too_many_concurrent_requests: 'rate',
  concurrent_limit_exceeded: 'rate',
  rate_limit_exceeded: 'rate',
  rate_limit_error: 'rate',
  system_busy: 'rate',
} as const;

type KnownCode = keyof typeof knownErrors;
const reasons: Record<
  (typeof knownErrors)[KnownCode],
  Omit<AssetJobFailure, 'retryAfterMs'>
> = {
  quota: {
    code: 'ASSET_PROVIDER_QUOTA_EXHAUSTED',
    category: 'quota',
    retryable: false,
    message:
      'Check provider account or credential credit limits before another request.',
  },
  credential: {
    code: 'ASSET_PROVIDER_CREDENTIAL_REJECTED',
    category: 'missing-credential',
    retryable: false,
    message:
      'Check the named credential in credential management; do not disclose its secret.',
  },
  permission: {
    code: 'ASSET_PROVIDER_PERMISSION_REJECTED',
    category: 'missing-credential',
    retryable: false,
    message:
      'The provider denied permission for this operation; check credential scope.',
  },
  model: {
    code: 'ASSET_PROVIDER_MODEL_REJECTED',
    category: 'unsupported-model',
    retryable: false,
    message: 'Check model availability and access for the selected credential.',
  },
  parameter: {
    code: 'ASSET_PROVIDER_PARAMETER_REJECTED',
    category: 'invalid-parameter',
    retryable: false,
    message:
      'Inspect the submitted prompt and parameters; unchanged retries are not allowed.',
  },
  rate: {
    code: 'ASSET_PROVIDER_RATE_LIMITED',
    category: 'rate-limit',
    retryable: false,
    message:
      'Wait for provider capacity or active requests before any permitted retry.',
  },
};

function knownCode(value: unknown): KnownCode | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const detail = (value as Record<string, unknown>).detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail))
    return null;
  const record = detail as Record<string, unknown>;
  // Modern code and legacy status take precedence over a broad error type.
  const code = record.code ?? record.status ?? record.type;
  return typeof code === 'string' && Object.hasOwn(knownErrors, code)
    ? (code as KnownCode)
    : null;
}

export async function readElevenLabsProviderFailure(
  response: Response,
): Promise<AssetJobFailure | null> {
  // Never reinterpret ambiguous timeouts or server failures as safe retries.
  if (![400, 401, 402, 403, 404, 422, 429].includes(response.status))
    return null;
  if (
    !/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/iu.test(
      response.headers.get('content-type') ?? '',
    )
  )
    return null;
  if (!response.body) return null;
  const limit = 16 * 1024;
  const reader = response.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let complete = false;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 1000);
  });
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (!part) return null;
      if (part.done) {
        complete = true;
        break;
      }
      size += part.value.byteLength;
      if (size > limit) return null;
      chunks.push(part.value);
    }
    const code = knownCode(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!code) return null;
    const reason = reasons[knownErrors[code]];
    return {
      ...reason,
      // Only HTTP 429 retains the existing retry allowance, not a body hint.
      retryable: knownErrors[code] === 'rate' && response.status === 429,
      message: `elevenlabs request failed with HTTP ${response.status} (${code}). ${reason.message}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* A cancelled read may still be settling. */
    }
  }
}
