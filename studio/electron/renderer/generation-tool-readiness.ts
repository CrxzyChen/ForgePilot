export type GenerationToolCapability =
  | 'image'
  | 'video'
  | 'soundEffect'
  | 'music'
  | 'speechRecognition'
  | 'speechGeneration';

export function generationToolAdapterReady(input: {
  toolId: GenerationToolCapability;
  providerId: string;
  modelId: string;
  hasStaticModelKind: boolean;
}): boolean {
  if (!input.modelId.trim()) return false;
  if (input.hasStaticModelKind) return true;
  if (
    input.toolId === 'image' &&
    ['openai', 'aliyun-bailian'].includes(input.providerId)
  ) {
    return true;
  }
  if (
    ['soundEffect', 'music'].includes(input.toolId) &&
    input.providerId === 'elevenlabs'
  ) {
    return true;
  }
  return (
    input.toolId === 'speechGeneration' && input.providerId === 'aliyun-bailian'
  );
}
