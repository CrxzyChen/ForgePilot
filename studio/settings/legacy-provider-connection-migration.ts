import { CREDENTIAL_PROVIDER_DEFINITIONS } from './credential-provider-definitions.ts';
import { CredentialVaultService } from './credential-vault-service.ts';
import { StudioSettingsService } from './studio-settings-service.ts';

export type LegacyProviderConnectionMigration = {
  migratedCredentialIds: string[];
  preservedProviderIds: string[];
  removedLegacyKeys: string[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function migrateLegacyProviderConnections(
  settings: StudioSettingsService,
  vault: CredentialVaultService,
): LegacyProviderConnectionMigration {
  const values = settings.get('ai-tools').values;
  const connections = record(values.providerConnections) ?? {};
  const credentialSummaries = vault.list();
  const remainingConnections: Record<string, unknown> = {};
  const migratedCredentialIds: string[] = [];
  const preservedProviderIds: string[] = [];

  for (const [providerId, rawValue] of Object.entries(connections)) {
    const connection = record(rawValue);
    if (!connection) {
      remainingConnections[providerId] = rawValue;
      preservedProviderIds.push(providerId);
      continue;
    }
    const credentialRef =
      typeof connection.credentialRef === 'string'
        ? connection.credentialRef
        : typeof values.providerCredentialRef === 'string'
          ? values.providerCredentialRef
          : '';
    const credential = credentialSummaries.find(
      (candidate) =>
        candidate.id === credentialRef && candidate.provider === providerId,
    );
    const definition = CREDENTIAL_PROVIDER_DEFINITIONS.find(
      (candidate) => candidate.id === providerId,
    );
    if (!credential || !definition) {
      remainingConnections[providerId] = rawValue;
      preservedProviderIds.push(providerId);
      continue;
    }
    const configuration = Object.fromEntries(
      definition.fields
        .filter((field) => !field.secret)
        .flatMap((field) => {
          const value = connection[field.id];
          return typeof value === 'string' && value.trim()
            ? [[field.id, value.trim()] as const]
            : [];
        }),
    );
    vault.mergeConfiguration(credential.id, providerId, configuration);
    migratedCredentialIds.push(credential.id);
  }

  const cleanup: Record<string, unknown> = {
    activeProviderId: undefined,
    providers: undefined,
    credentialRefs: undefined,
  };
  const removedLegacyKeys = ['activeProviderId', 'providers', 'credentialRefs'];
  if (Object.keys(remainingConnections).length === 0) {
    cleanup.providerConnections = undefined;
    cleanup.providerCredentialRef = undefined;
    removedLegacyKeys.push('providerConnections', 'providerCredentialRef');
  } else {
    cleanup.providerConnections = remainingConnections;
  }
  if (
    'activeProviderId' in values ||
    'providerConnections' in values ||
    'providerCredentialRef' in values ||
    'providers' in values ||
    'credentialRefs' in values
  ) {
    settings.update('ai-tools', cleanup);
  }

  return {
    migratedCredentialIds,
    preservedProviderIds,
    removedLegacyKeys,
  };
}
