import { resolve } from 'node:path';

import type { AssetGenerationApprovalPolicy } from '../workspace/studio-asset-job-broker.ts';

type GenerationContext = {
  projectRoot: string | null;
  threadId: string | null;
  goalStatus: string | null;
  completionRunId?: string | null;
};

function normalizedRoot(path: string): string {
  const absolute = resolve(path);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

/** Only the OS-user settings service may supply values; never project documents. */
export function effectiveGenerationApproval(
  values: Record<string, unknown>,
  context: GenerationContext,
  now = Date.now(),
): AssetGenerationApprovalPolicy {
  const mode = ['always', 'budget', 'auto'].includes(
    String(values.generationApprovalMode),
  )
    ? (values.generationApprovalMode as AssetGenerationApprovalPolicy['mode'])
    : 'always';
  const limit = Number(values.generationAutoApproveMaxCny ?? 0);
  const fallback: AssetGenerationApprovalPolicy = {
    mode,
    autoApproveMaxCny: Number.isFinite(limit) ? Math.max(0, limit) : 0,
  };
  if (
    !context.projectRoot ||
    !context.threadId ||
    !context.completionRunId ||
    context.goalStatus !== 'active'
  )
    return fallback;
  const grants = Array.isArray(values.generationAuthorizations)
    ? values.generationAuthorizations
    : [];
  for (const raw of grants) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const grant = raw as Record<string, unknown>;
    if (
      typeof grant.id !== 'string' ||
      !/^generation-grant:[a-z0-9][a-z0-9_-]{0,95}$/u.test(grant.id) ||
      typeof grant.purpose !== 'string' ||
      !grant.purpose.trim() ||
      typeof grant.projectRoot !== 'string' ||
      !grant.projectRoot.trim() ||
      normalizedRoot(grant.projectRoot) !==
        normalizedRoot(context.projectRoot) ||
      grant.threadId !== context.threadId ||
      grant.allowUnknownCost !== true ||
      grant.revokedAt
    )
      continue;
    if (
      typeof grant.authorizedAt !== 'string' ||
      typeof grant.expiresAt !== 'string'
    )
      continue;
    const authorizedAt = Date.parse(grant.authorizedAt);
    const expiresAt = Date.parse(grant.expiresAt);
    if (
      !Number.isFinite(authorizedAt) ||
      !Number.isFinite(expiresAt) ||
      authorizedAt > now ||
      expiresAt <= now
    )
      continue;
    return {
      ...fallback,
      mode: 'auto',
      // Zero is the existing Completion Run convention for no spend ceiling.
      // Never present the unrelated global per-call threshold as a task budget.
      autoApproveMaxCny: 0,
      authorizationId: grant.id,
      completionRunId: context.completionRunId,
    };
  }
  return fallback;
}
