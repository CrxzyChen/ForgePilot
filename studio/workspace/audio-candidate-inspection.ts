import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ProjectError } from '../project/project-types.ts';

export function inspectAudioCandidateDetails(
  bytes: Buffer,
  mime: string,
  executable: string,
) {
  if (!bytes.length || bytes.length > 25 * 1024 * 1024)
    throw new ProjectError(
      'ASSET_AUDIO_SIZE_INVALID',
      '音频候选必须为 1 字节至 25 MiB。',
    );
  if (!existsSync(executable))
    throw new ProjectError(
      'ASSET_AUDIO_INSPECTOR_UNAVAILABLE',
      '缺少随 Studio 分发的音频检查器，请更新完整 Studio 安装。',
    );
  const result = spawnSync(executable, ['--inspect-audio-stdin'], {
    input: bytes,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 16 * 1024,
    // No credential, provider, project or parent-process environment is forwarded.
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      NODE_ENV: 'production',
    },
  });
  if (result.error || result.status !== 0)
    throw new ProjectError(
      'ASSET_AUDIO_DECODE_FAILED',
      '候选不能完整解码或超出检查预算；不会使用请求参数伪造音频信息。',
    );
  let decoded: Record<string, unknown>;
  try {
    decoded = JSON.parse(result.stdout);
  } catch {
    throw new ProjectError(
      'ASSET_AUDIO_INSPECTION_INVALID',
      '音频检查器返回无效结果。',
    );
  }
  if (
    !decoded ||
    decoded.kind !== 'audio' ||
    typeof decoded.codec !== 'string' ||
    !Number.isInteger(decoded.durationMs) ||
    Number(decoded.durationMs) <= 0 ||
    Number(decoded.durationMs) > 601_000 ||
    !Number.isInteger(decoded.sampleRateHz) ||
    Number(decoded.sampleRateHz) < 8_000 ||
    Number(decoded.sampleRateHz) > 192_000 ||
    ![1, 2].includes(Number(decoded.channels)) ||
    !Number.isInteger(decoded.decodedSamples) ||
    Number(decoded.decodedSamples) <= 0 ||
    typeof decoded.peak !== 'number' ||
    !Number.isFinite(decoded.peak) ||
    typeof decoded.rms !== 'number' ||
    !Number.isFinite(decoded.rms)
  )
    throw new ProjectError(
      'ASSET_AUDIO_INSPECTION_INVALID',
      '音频检查器返回了不支持的媒体数据。',
    );
  const codec = decoded.codec;
  const matches = /^audio\/(?:mpeg|mp3)$/iu.test(mime)
    ? codec === 'mp3'
    : /^audio\/(?:wav|x-wav|wave)$/iu.test(mime)
      ? codec.startsWith('pcm_')
      : mime === 'audio/ogg' && codec === 'vorbis';
  if (!matches)
    throw new ProjectError(
      'ASSET_AUDIO_MIME_MISMATCH',
      '音频内容与供应商声明的 MIME 类型不一致。',
    );
  return {
    kind: 'audio' as const,
    codec,
    durationMs: Number(decoded.durationMs),
    sampleRateHz: Number(decoded.sampleRateHz),
    channels: Number(decoded.channels),
    peak: decoded.peak,
    rms: decoded.rms,
    decodedSamples: Number(decoded.decodedSamples),
  };
}

export function inspectAudioCandidate(
  bytes: Buffer,
  mime: string,
  executable: string,
) {
  const {
    peak: _peak,
    rms: _rms,
    decodedSamples: _samples,
    ...media
  } = inspectAudioCandidateDetails(bytes, mime, executable);
  return media;
}
