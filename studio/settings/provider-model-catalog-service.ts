import { ProjectError } from '../project/project-types.ts';
import type { ResolvedCredentialProfile } from './credential-vault-service.ts';

export type ProviderModelCapability =
  | 'image'
  | 'video'
  | 'soundEffect'
  | 'music'
  | 'speechRecognition'
  | 'speechGeneration'
  | 'text'
  | 'threeD'
  | 'unknown';

export type ProviderModelDescriptor = {
  id: string;
  label: string;
  author: string;
  capabilities: ProviderModelCapability[];
};

export type ProviderModelCatalog = {
  providerId: string;
  credentialId: string;
  fetchedAt: string;
  source: 'provider-api';
  models: ProviderModelDescriptor[];
};

export type ProviderModelCatalogServiceOptions = {
  fetchImpl?: typeof fetch;
  resolveCredential(id: string): ResolvedCredentialProfile;
};

export class ProviderModelCatalogService {
  readonly #fetch: typeof fetch;
  readonly #resolveCredential: (id: string) => ResolvedCredentialProfile;
  readonly #cache = new Map<string, ProviderModelCatalog>();

  constructor(options: ProviderModelCatalogServiceOptions) {
    this.#fetch =
      options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.#resolveCredential = (id) => options.resolveCredential(id);
  }

  async discover(input: {
    providerId: string;
    credentialId: string;
    refresh?: boolean;
  }): Promise<ProviderModelCatalog> {
    const providerId = input.providerId.trim();
    const credentialId = input.credentialId.trim();
    if (!providerId || !credentialId) {
      throw new ProjectError(
        'MODEL_CATALOG_INPUT_INVALID',
        '读取模型前需要选择供应商和凭证。',
      );
    }
    const cacheKey = `${providerId}:${credentialId}`;
    const cached = this.#cache.get(cacheKey);
    if (cached && !input.refresh) return structuredClone(cached);

    const credential = this.#resolveCredential(credentialId);
    if (credential.provider !== providerId) {
      throw new ProjectError(
        'MODEL_CATALOG_CREDENTIAL_MISMATCH',
        `凭证 ${credential.label} 不属于供应商 ${providerId}。`,
      );
    }
    const apiKey = credential.secrets.apiKey;
    if (!apiKey) {
      throw new ProjectError(
        'MODEL_CATALOG_SECRET_MISSING',
        `凭证 ${credential.label} 未配置 API Key。`,
      );
    }

    let models: ProviderModelDescriptor[];
    if (providerId === 'openai') {
      models = await this.#discoverOpenAi(credential, apiKey);
    } else if (providerId === 'aliyun-bailian') {
      models = await this.#discoverBailian(credential, apiKey);
    } else if (providerId === 'elevenlabs') {
      models = await this.#discoverElevenLabs(credential, apiKey);
    } else {
      throw new ProjectError(
        'MODEL_CATALOG_PROVIDER_UNSUPPORTED',
        `供应商 ${providerId} 尚未实现模型目录适配器。`,
      );
    }

    const catalog: ProviderModelCatalog = {
      providerId,
      credentialId,
      fetchedAt: new Date().toISOString(),
      source: 'provider-api',
      models: [
        ...new Map(models.map((model) => [model.id, model])).values(),
      ].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
    };
    this.#cache.set(cacheKey, catalog);
    return structuredClone(catalog);
  }

  async #discoverOpenAi(
    credential: ResolvedCredentialProfile,
    apiKey: string,
  ): Promise<ProviderModelDescriptor[]> {
    const baseUrl = (
      credential.configuration.baseUrl || 'https://api.openai.com/v1'
    ).replace(/\/+$/u, '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };
    if (credential.configuration.organization) {
      headers['OpenAI-Organization'] = credential.configuration.organization;
    }
    if (credential.configuration.project) {
      headers['OpenAI-Project'] = credential.configuration.project;
    }
    const response = await this.#fetch(`${baseUrl}/models`, { headers });
    const rawBody = await this.#json(response, 'OpenAI');
    const body = isRecord(rawBody) ? rawBody : {};
    const data = Array.isArray(body.data) ? body.data : [];
    return data.flatMap((item) => {
      if (!isRecord(item) || typeof item.id !== 'string') return [];
      return [
        {
          id: item.id,
          label: item.id,
          author: typeof item.owned_by === 'string' ? item.owned_by : 'OpenAI',
          capabilities: inferOpenAiCapabilities(item.id),
        },
      ];
    });
  }

  async #discoverBailian(
    credential: ResolvedCredentialProfile,
    apiKey: string,
  ): Promise<ProviderModelDescriptor[]> {
    const baseUrl = bailianApiHost(credential.configuration).replace(
      /\/+$/u,
      '',
    );
    const models: ProviderModelDescriptor[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (models.length < total && page <= 20) {
      const url = new URL(`${baseUrl}/api/v1/models`);
      url.searchParams.set('language', 'zh-CN');
      url.searchParams.set('page_no', String(page));
      url.searchParams.set('page_size', '100');
      const response = await this.#fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });
      const rawBody = await this.#json(response, '阿里云百炼');
      const body = isRecord(rawBody) ? rawBody : {};
      const output = isRecord(body.output) ? body.output : {};
      const children = Array.isArray(output.models) ? output.models : [];
      total = typeof output.total === 'number' ? output.total : children.length;
      for (const item of children) {
        if (!isRecord(item) || typeof item.model !== 'string') continue;
        const codes = Array.isArray(item.capabilities)
          ? item.capabilities.filter(
              (capability): capability is string =>
                typeof capability === 'string',
            )
          : [];
        models.push({
          id: item.model,
          label:
            typeof item.name === 'string' && item.name.trim()
              ? item.name
              : item.model,
          author:
            typeof item.provider === 'string'
              ? item.provider
              : 'aliyun-bailian',
          capabilities: bailianCapabilities(codes, item.model),
        });
      }
      if (children.length === 0) break;
      page += 1;
    }
    return models;
  }

  async #discoverElevenLabs(
    credential: ResolvedCredentialProfile,
    apiKey: string,
  ): Promise<ProviderModelDescriptor[]> {
    const baseUrl = (
      credential.configuration.baseUrl || 'https://api.elevenlabs.io/v1'
    ).replace(/\/+$/u, '');
    const response = await this.#fetch(`${baseUrl}/models`, {
      headers: {
        'xi-api-key': apiKey,
        Accept: 'application/json',
      },
    });
    const body = await this.#json(response, 'ElevenLabs');
    const items = Array.isArray(body) ? body : [];
    const models: ProviderModelDescriptor[] = items.flatMap((item) => {
      if (!isRecord(item) || typeof item.model_id !== 'string') return [];
      const capabilities: ProviderModelCapability[] = [];
      if (item.can_do_text_to_speech === true) {
        capabilities.push('speechGeneration');
      }
      if (/sound/iu.test(item.model_id)) capabilities.push('soundEffect');
      if (/music/iu.test(item.model_id)) capabilities.push('music');
      return [
        {
          id: item.model_id,
          label:
            typeof item.name === 'string' && item.name.trim()
              ? item.name
              : item.model_id,
          author: 'ElevenLabs',
          capabilities: capabilities.length > 0 ? capabilities : ['unknown'],
        },
      ];
    });
    if (!models.some((model) => model.id === 'eleven_text_to_sound_v2')) {
      models.push({
        id: 'eleven_text_to_sound_v2',
        label: 'ElevenLabs Text to Sound v2',
        author: 'ElevenLabs',
        capabilities: ['soundEffect'],
      });
    }
    if (!models.some((model) => model.id === 'music_v2')) {
      models.push({
        id: 'music_v2',
        label: 'Eleven Music v2',
        author: 'ElevenLabs',
        capabilities: ['music'],
      });
    }
    return models;
  }

  async #json(response: Response, providerLabel: string): Promise<unknown> {
    const text = await response.text();
    let body: unknown = {};
    try {
      const value = JSON.parse(text) as unknown;
      body = value;
    } catch {
      // The status and a short response excerpt below are more actionable.
    }
    if (!response.ok) {
      const detail =
        isRecord(body) && typeof body.message === 'string'
          ? body.message
          : text.slice(0, 240) || `HTTP ${response.status}`;
      throw new ProjectError(
        'MODEL_CATALOG_REQUEST_FAILED',
        `${providerLabel} 模型目录读取失败：${detail}`,
      );
    }
    return body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function bailianApiHost(configuration: Record<string, string>): string {
  if (configuration.apiHost) {
    return configuration.apiHost
      .replace(/\/+$/u, '')
      .replace(/\/api\/v1$/u, '');
  }
  const region = configuration.region || 'cn-beijing';
  const workspaceId = configuration.workspaceId;
  if (workspaceId) {
    return `https://${workspaceId}.${region}.maas.aliyuncs.com`;
  }
  const dashscopeHosts: Record<string, string> = {
    'cn-beijing': 'https://dashscope.aliyuncs.com',
    'ap-southeast-1': 'https://dashscope-intl.aliyuncs.com',
    'cn-hongkong': 'https://cn-hongkong.dashscope.aliyuncs.com',
    'us-east-1': 'https://dashscope-us.aliyuncs.com',
  };
  const host = dashscopeHosts[region];
  if (!host) {
    throw new ProjectError(
      'MODEL_CATALOG_WORKSPACE_REQUIRED',
      `${region} 需要在凭证中填写业务空间 ID 或 API Host。`,
    );
  }
  return host;
}

function bailianCapabilities(
  codes: string[],
  modelId: string,
): ProviderModelCapability[] {
  const capabilities = new Set<ProviderModelCapability>();
  for (const code of codes) {
    if (code === 'IG') capabilities.add('image');
    else if (code === 'VG') capabilities.add('video');
    else if (code === 'ASR' || code === 'Realtime-ASR')
      capabilities.add('speechRecognition');
    else if (code === 'TTS' || code === 'Realtime-Text-to-Speech')
      capabilities.add('speechGeneration');
    else if (code === 'TG') capabilities.add('text');
    else if (code === '3D-generation') capabilities.add('threeD');
  }
  if (/sound[-_]?effect|sfx/iu.test(modelId)) capabilities.add('soundEffect');
  if (/music|audio[-_]?gen|song/iu.test(modelId)) capabilities.add('music');
  return capabilities.size > 0 ? [...capabilities] : ['unknown'];
}

function inferOpenAiCapabilities(modelId: string): ProviderModelCapability[] {
  const id = modelId.toLowerCase();
  if (/gpt-image|dall-e/u.test(id)) return ['image'];
  if (/sora/u.test(id)) return ['video'];
  if (/transcri|whisper/u.test(id)) return ['speechRecognition'];
  if (/tts/u.test(id)) return ['speechGeneration'];
  if (/sound[-_]?effect|sfx/u.test(id)) return ['soundEffect'];
  if (/music|audio[-_]?gen|song/u.test(id)) return ['music'];
  return ['text'];
}
