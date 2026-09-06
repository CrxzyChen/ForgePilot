import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ProjectError } from '../project/project-types.ts';
import { inspectAudioCandidate } from './audio-candidate-inspection.ts';

export type AudioMasterSpec = {
  startMs: number;
  endMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
};

export function audioMasterSpec(value: unknown): AudioMasterSpec {
  const fail = () => {
    throw new ProjectError(
      'ASSET_AUDIO_MASTER_SPEC_INVALID',
      '音频加工需要 startMs/endMs、fadeInMs/fadeOutMs、gainDb：区间须在源内且不超过 60 秒，淡入淡出各不超过 500ms，增益为 -48–48dB，造成削波时拒绝输出。',
    );
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const s = value as Record<string, unknown>;
  if (
    Object.keys(s).length !== 5 ||
    !['startMs', 'endMs', 'fadeInMs', 'fadeOutMs'].every((k) =>
      Number.isInteger(s[k]),
    ) ||
    typeof s.gainDb !== 'number' ||
    !Number.isFinite(s.gainDb)
  )
    return fail();
  const spec: AudioMasterSpec = {
    startMs: Number(s.startMs),
    endMs: Number(s.endMs),
    fadeInMs: Number(s.fadeInMs),
    fadeOutMs: Number(s.fadeOutMs),
    gainDb: s.gainDb,
  };
  if (
    spec.startMs < 0 ||
    spec.endMs <= spec.startMs ||
    spec.endMs > 600_000 ||
    spec.endMs - spec.startMs > 60_000 ||
    spec.fadeInMs < 0 ||
    spec.fadeOutMs < 0 ||
    spec.fadeInMs > 500 ||
    spec.fadeOutMs > 500 ||
    spec.fadeInMs + spec.fadeOutMs > spec.endMs - spec.startMs ||
    spec.gainDb < -48 ||
    spec.gainDb > 48
  )
    return fail();
  return spec;
}

export function masterAudioCandidate(
  bytes: Buffer,
  spec: AudioMasterSpec,
  executable: string,
) {
  const checked = audioMasterSpec(spec);
  if (!bytes.length || bytes.length > 25 * 1024 * 1024)
    throw new ProjectError(
      'ASSET_AUDIO_SIZE_INVALID',
      '音频候选超出解码预算。',
    );
  if (!existsSync(executable))
    throw new ProjectError(
      'ASSET_AUDIO_MASTER_UNAVAILABLE',
      '请更新包含音频加工工具的完整 Studio 安装。',
    );
  const result = spawnSync(
    executable,
    ['--master-audio-stdin', JSON.stringify(checked)],
    {
      input: bytes,
      windowsHide: true,
      timeout: 25_000,
      maxBuffer: 12 * 1024 * 1024,
      env: {
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        NODE_ENV: 'production',
      },
    },
  );
  if (result.error || result.status !== 0) {
    const reason =
      result.stderr?.toString().match(/AUDIO_[A-Z_]+/u)?.[0] ??
      'AUDIO_MASTER_FAILED';
    throw new ProjectError(
      `ASSET_${reason}`,
      '无法加工音频：检查区间、降低增益或更新 Studio；未选择或导入任何资源。',
    );
  }
  const output = result.stdout;
  const media = inspectAudioCandidate(output, 'audio/wav', executable);
  if (
    media.codec !== 'pcm_s16le' ||
    media.sampleRateHz !== 48_000 ||
    media.durationMs !== checked.endMs - checked.startMs
  )
    throw new ProjectError(
      'ASSET_AUDIO_MASTER_INVALID',
      '加工结果不符合实测 48kHz PCM16 WAV 合同。',
    );
  return { bytes: output, media };
}
