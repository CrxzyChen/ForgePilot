import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generationToolAdapterReady } from '../studio/electron/renderer/generation-tool-readiness.ts';

const repository = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(repository, path), 'utf8');

const css = read('studio/electron/renderer/styles.css');
const tokenDocument = JSON.parse(
  read('studio/electron/renderer/studio-ui.tokens.json'),
) as {
  schemaVersion: string;
  id: string;
  name: string;
  scope: string;
  colors: Record<string, string>;
  typography: {
    productFont: string;
    compactControlMinPx: number;
    compactControlMaxPx: number;
  };
  geometry: {
    titlebarHeightPx: number;
    activityBarWidthPx: number;
    splitterHitTargetPx: number;
  };
  policy: {
    darkOnly: boolean;
    nativeControlAppearance: boolean;
    gameUiIsProjectSpecific: boolean;
  };
};
const agentContract = read('AGENTS.md');
const designSystem = read('docs/design/STUDIO-UI-SYSTEM.md');
const skill = read('.agents/skills/maintain-studio-ui/SKILL.md');
const qualityGate = read('studio/electron/main.ts');
const workbench = read('studio/electron/renderer/Workbench.tsx');
const rendererHtml = read('studio/electron/renderer/index.html');
assert(
  rendererHtml.includes("media-src 'self' data:;"),
  'Reviewed local audio previews must be playable',
);
assert(
  rendererHtml.includes("connect-src 'none';"),
  'Preview playback must not enable renderer networking',
);
assert(
  !/media-src[^;]*(?:https?:|\*)/u.test(rendererHtml),
  'Remote media stays blocked',
);

const expectedTokens = {
  '--bg': '#090b10',
  '--surface': '#0d1118',
  '--surface-2': '#111721',
  '--surface-3': '#151c27',
  '--line': 'rgba(255, 255, 255, 0.075)',
  '--line-strong': 'rgba(255, 255, 255, 0.13)',
  '--text': '#c9d1d9',
  '--muted': '#728091',
  '--faint': '#465361',
  '--accent': '#49cddd',
  '--accent-soft': 'rgba(73, 205, 221, 0.1)',
  '--green': '#64d98b',
  '--warning': '#e7b85d',
  '--danger': '#f0737e',
} as const;

assert.equal(tokenDocument.schemaVersion, '1.0.0');
assert.equal(tokenDocument.id, 'studio-ui:midnight-workshop');
assert.equal(tokenDocument.name, 'Midnight Workshop');
assert.equal(tokenDocument.scope, 'studio-shell');
assert.deepEqual(tokenDocument.colors, expectedTokens);
assert.equal(tokenDocument.typography.compactControlMinPx, 9);
assert.equal(tokenDocument.typography.compactControlMaxPx, 10);
assert.equal(tokenDocument.geometry.titlebarHeightPx, 38);
assert.equal(tokenDocument.geometry.activityBarWidthPx, 44);
assert.equal(tokenDocument.geometry.splitterHitTargetPx, 8);
assert.deepEqual(tokenDocument.policy, {
  darkOnly: true,
  nativeControlAppearance: false,
  gameUiIsProjectSpecific: true,
});

for (const [token, value] of Object.entries(tokenDocument.colors)) {
  assert(
    css.includes(`${token}: ${value};`),
    `Midnight Workshop token drifted: ${token} must remain ${value}`,
  );
}

for (const selector of [
  '.studio-titlebar',
  '.workbench-titlebar',
  '.activity-bar',
  '.left-dock',
  '.document-area',
  '.right-dock',
  '.bottom-dock',
  '.right-switcher',
  '.main-menu-popup',
  '.source-control-tool',
  '.copilot-content',
]) {
  assert(
    css.includes(selector),
    `Missing canonical Studio surface: ${selector}`,
  );
}

assert(css.includes('color-scheme: dark;'), 'Studio must remain dark-first');
assert(
  /font-family:\s*Inter,\s*["']Segoe UI["'],\s*sans-serif;/u.test(css),
  'Studio product typography drifted',
);
assert(
  css.includes('transform: translateX(-50%);'),
  'Right splitter axis must remain centered on the dock boundary',
);
assert(
  !/background(?:-color)?\s*:\s*(?:white|#fff(?:fff)?)\s*;/iu.test(css),
  'Studio CSS contains a prohibited light application surface',
);
assert(
  agentContract.includes('.agents/skills/maintain-studio-ui/SKILL.md') &&
    agentContract.includes('docs/design/STUDIO-UI-SYSTEM.md'),
  'Root AGENTS.md must route Studio UI work through the design contract',
);
assert(
  designSystem.includes('Midnight Workshop') &&
    designSystem.includes('npm run check:p15:quality'),
  'Design-system authority or real-renderer gate is missing',
);
assert(
  !skill.includes('[TODO'),
  'Studio UI Skill still contains scaffold TODOs',
);
assert(
  skill.includes('Do not use this skill to impose') &&
    skill.includes('npm run check:studio-ui-contract'),
  'Studio UI Skill must preserve the game-UI boundary and executable gate',
);
assert(
  qualityGate.includes('controlSurfacePresentation') &&
    qualityGate.includes('rightPanelDividerContained'),
  'P15 must retain real-renderer style and geometry assertions',
);
assert(
  workbench.includes('credential-provider-fields') &&
    workbench.includes('generation-tool-row'),
  'AI Tools must expose provider-specific credential forms and generation routes',
);
for (const capability of [
  '图片生成',
  '视频生成',
  '音乐生成',
  '语音识别',
  '语音生成',
]) {
  assert(
    workbench.includes(capability),
    `AI Tools is missing the ${capability} capability row`,
  );
}
assert(
  workbench.includes('generation-tool-provider') &&
    workbench.includes('generation-tool-credential') &&
    workbench.includes('generation-tool-model') &&
    workbench.includes('刷新模型'),
  'Generation tools must independently select provider, credential, and provider-discovered model',
);
assert(
  workbench.includes('来源：供应商接口') &&
    workbench.includes('手动模型 ID') &&
    workbench.includes('data-model-source={modelSource}'),
  'Remote model controls must expose whether the visible choice came from the provider API or manual input',
);
assert(
  !workbench.includes('list={dataListId}') &&
    !workbench.includes('id="asset-generation-models"'),
  'Provider API models must use an explicit select and must not be mixed with manual IDs through a datalist',
);
assert(
  workbench.includes('credentials.discoverModels') &&
    workbench.includes('credential.provider === providerId'),
  'Generation models must be discovered through a matching provider credential',
);
assert(
  workbench.includes('job.progress.message') &&
    workbench.includes('job.idempotencyKey') &&
    workbench.includes('assetJobs.reconcile') &&
    css.includes('.asset-job-card progress'),
  'Media jobs must expose durable progress, idempotency, ambiguous-timeout reconciliation, and themed progress UI',
);
assert(
  workbench.includes('copilot-completion-run') &&
    workbench.includes('completionRun.budget.committed') &&
    workbench.includes('completionRun.checkpoint.sequence') &&
    css.includes('.copilot-completion-run'),
  'Copilot Goal cards must expose durable recovery status, budget, and checkpoint identity in the approved shell grammar',
);
assert(
  !workbench.includes('provider-connection-card'),
  'Provider connection settings must not be duplicated outside credential management',
);
assert.equal(
  generationToolAdapterReady({
    toolId: 'image',
    providerId: 'openai',
    modelId: 'chatgpt-image-latest',
    hasStaticModelKind: false,
  }),
  true,
  'Provider-discovered OpenAI image models must report their real executable adapter',
);
assert.equal(
  generationToolAdapterReady({
    toolId: 'speechGeneration',
    providerId: 'aliyun-bailian',
    modelId: 'qwen-audio-3.0-tts-flash',
    hasStaticModelKind: false,
  }),
  true,
);
assert.equal(
  generationToolAdapterReady({
    toolId: 'video',
    providerId: 'aliyun-bailian',
    modelId: 'emoji-v1',
    hasStaticModelKind: false,
  }),
  false,
  'Route-only capabilities must not claim an execution adapter',
);

console.log(
  JSON.stringify(
    {
      gate: 'Studio UI design contract',
      designLanguage: 'Midnight Workshop',
      tokenSchemaVersion: tokenDocument.schemaVersion,
      tokens: Object.keys(tokenDocument.colors).length,
      canonicalSurfaces: 11,
      darkOnly: true,
      gameUiIsProjectSpecific: true,
      realRendererGate: 'check:p15:quality',
      result: 'passed',
    },
    null,
    2,
  ),
);
