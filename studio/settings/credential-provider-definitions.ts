export type CredentialProviderField = {
  id: string;
  label: string;
  kind: 'text' | 'url' | 'password' | 'select';
  secret: boolean;
  required: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
};

export type CredentialProviderDefinition = {
  id: string;
  label: string;
  description: string;
  fields: CredentialProviderField[];
};

export const CREDENTIAL_PROVIDER_DEFINITIONS: CredentialProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'OpenAI 官方 API；支持自定义兼容端点。',
    fields: [
      {
        id: 'apiKey',
        label: 'API Key',
        kind: 'password',
        secret: true,
        required: true,
        placeholder: 'sk-…',
      },
      {
        id: 'baseUrl',
        label: 'Base URL',
        kind: 'url',
        secret: false,
        required: true,
        defaultValue: 'https://api.openai.com/v1',
      },
      {
        id: 'organization',
        label: 'Organization（可选）',
        kind: 'text',
        secret: false,
        required: false,
        placeholder: 'org-…',
      },
      {
        id: 'project',
        label: 'Project（可选）',
        kind: 'text',
        secret: false,
        required: false,
        placeholder: 'proj_…',
      },
    ],
  },
  {
    id: 'aliyun-bailian',
    label: '阿里云百炼',
    description: 'DashScope / 业务空间 API；模型目录按地域和凭证读取。',
    fields: [
      {
        id: 'apiKey',
        label: 'API Key',
        kind: 'password',
        secret: true,
        required: true,
        placeholder: 'sk-…',
      },
      {
        id: 'region',
        label: '地域',
        kind: 'select',
        secret: false,
        required: true,
        defaultValue: 'cn-beijing',
        options: [
          { value: 'cn-beijing', label: '华北 2（北京）' },
          { value: 'ap-southeast-1', label: '新加坡' },
          { value: 'cn-hongkong', label: '中国香港' },
          { value: 'ap-northeast-1', label: '日本（东京）' },
          { value: 'eu-central-1', label: '德国（法兰克福）' },
          { value: 'us-east-1', label: '美国（弗吉尼亚）' },
        ],
      },
      {
        id: 'workspaceId',
        label: '业务空间 ID（可选）',
        kind: 'text',
        secret: false,
        required: false,
        placeholder: 'llm-…',
      },
      {
        id: 'apiHost',
        label: 'API Host（可选）',
        kind: 'url',
        secret: false,
        required: false,
        placeholder: '留空时按地域自动选择',
      },
    ],
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    description: 'ElevenLabs 官方 API；用于游戏音效、音乐和语音模型。',
    fields: [
      {
        id: 'apiKey',
        label: 'API Key',
        kind: 'password',
        secret: true,
        required: true,
        placeholder: 'sk_…',
      },
      {
        id: 'baseUrl',
        label: 'Base URL',
        kind: 'url',
        secret: false,
        required: true,
        defaultValue: 'https://api.elevenlabs.io/v1',
      },
    ],
  },
];

export function credentialProviderDefinition(
  providerId: string,
): CredentialProviderDefinition | undefined {
  return CREDENTIAL_PROVIDER_DEFINITIONS.find(
    (provider) => provider.id === providerId,
  );
}
