import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { RuntimeObservationService } from '../studio/runtime/runtime-observation-service.ts';
import { projectSceneToRenderSnapshot } from '../studio/runtime/runtime-projection.ts';
import type { SceneDocument } from '../studio/workspace/scene-authoring-service.ts';

const repository = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'aigame-ui-text-bounds-'));
const service = new RuntimeObservationService({
  projectRoot: temporary,
  playerExecutablePath: join(
    repository,
    'target',
    'debug',
    'ai-game-player.exe',
  ),
});
const cases = [
  {
    name: 'long-line',
    text: 'START GAME',
    anchor: { x: 0.98, y: 0.5 },
    fontSize: 28,
    clipped: true,
  },
  {
    name: 'multiline-bottom',
    text: 'ONE\nTWO\nTHREE',
    anchor: { x: 0.5, y: 0.965 },
    fontSize: 22,
    clipped: true,
  },
  {
    name: 'safe-multiline',
    text: 'ALPHA\r\nBETA\n',
    anchor: { x: 0.5, y: 0.4 },
    fontSize: 28,
    clipped: false,
  },
  {
    name: 'button-label',
    text: 'CLICK TO PLAY',
    anchor: { x: 0.92, y: 0.25 },
    fontSize: 28,
    clipped: true,
    button: true,
  },
  {
    name: 'hidden-label',
    text: 'START GAME',
    anchor: { x: 0.98, y: 0.5 },
    fontSize: 28,
    clipped: false,
    hidden: true,
  },
  {
    name: 'empty-label',
    text: '',
    anchor: { x: 0.5, y: 0.5 },
    fontSize: 28,
    clipped: false,
  },
  {
    name: 'minimum-size',
    text: 'WWW',
    anchor: { x: 0.5, y: 0.5 },
    fontSize: 2,
    clipped: false,
  },
];

try {
  const evidence = [];
  for (const viewport of [
    [1280, 720],
    [960, 540],
  ] as const) {
    for (const item of cases) {
      const objectId = `bounds:object/${item.name}`;
      const scene: SceneDocument = {
        schemaVersion: '2.0.0-alpha.1',
        id: 'bounds:scene/ui',
        name: 'UI text bounds',
        space: 'ui',
        objects: [
          {
            id: objectId,
            name: item.name,
            enabled: true,
            visible: !item.hidden,
            parentId: null,
            order: 0,
            components: [
              {
                id: `${objectId}/transform`,
                type: 'core:ui-transform',
                enabled: true,
                data: { anchor: item.anchor, size: { x: 80, y: 30 } },
              },
              {
                id: `${objectId}/text`,
                type: item.button ? 'ui:button' : 'ui:text',
                enabled: true,
                data: item.button
                  ? {
                      label: item.text,
                      action: 'primary-action',
                      fontSize: item.fontSize,
                      textColor: '#ffffff',
                      backgroundColor: '#00000000',
                      disabled: false,
                    }
                  : {
                      text: item.text,
                      fontSize: item.fontSize,
                      color: '#ffffff',
                      align: 'center',
                    },
              },
            ],
          },
        ],
      };
      const observation = service.capture({
        source: 'studio',
        checkpointId: item.name,
        scene,
        viewport,
        snapshot: projectSceneToRenderSnapshot({ scene }),
      });
      // This fixture projects only one label, after its optional button background.
      const label = observation.ui
        .filter((entry) => entry.objectId === objectId)
        .at(-1);
      assert(label, `missing observed text ${item.name}`);
      assert.equal(
        label.overflow,
        item.clipped,
        `${item.name} at ${viewport.join('x')}: text clipping must describe the whole label`,
      );
      assert.equal(
        observation.diagnostics.some(
          (entry) => entry.code === 'RUNTIME_UI_BOUNDS_OVERFLOW',
        ),
        item.clipped,
      );
      const scale = viewport[0] / 1280;
      if (item.name === 'safe-multiline') {
        assert(
          Math.abs(label.bounds[2] - 116 * scale) < 0.002,
          'five glyphs, 6-cell advance and 5-cell width',
        );
        assert(
          Math.abs(label.bounds[3] - 64 * scale) < 0.002,
          'two lines, no extra line from final newline',
        );
      }
      if (item.name === 'empty-label')
        assert.deepEqual(label.bounds.slice(2), [0, 0]);
      if (item.name === 'minimum-size')
        assert(Math.abs(label.bounds[3] - 8 * scale) < 0.002);
      const png = readFileSync(join(temporary, observation.frameArtifact.path));
      assert.equal(png.readUInt32BE(16), viewport[0]);
      assert.equal(png.readUInt32BE(20), viewport[1]);
      assert.deepEqual(
        service.read(observation.observationId).ui,
        observation.ui,
      );
      evidence.push({
        name: item.name,
        viewport,
        bounds: label.bounds,
        overflow: label.overflow,
        frameSha256: observation.frameArtifact.sha256,
      });
    }
  }
  console.log(
    JSON.stringify({
      gate: 'P30 rendered UI text bounds',
      evidence,
      result: 'passed',
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
