# P28 Round 05 contract evidence

- Date: 2026-09-05
- Gate: `npm run check:p28:round05`
- Result: Passed
- Scope: frozen authority/schema contract and truthful baseline
- Human result: Not started

## Verified artifacts

- `docs/rounds/ROUND-05-COPILOT-GAME-COMPLETION.md`
- `docs/rounds/ROUND-05-CHECKLIST.md`
- `docs/testing/ROUND-05-HUMAN-OBSERVATION.md`
- `docs/architecture/0024-round05-completion-authority.md`
- `docs/rounds/ROUND-05-GAP-MAP.md`
- `schemas/completion-run.schema.json`
- `schemas/media-generation-job.schema.json`
- `schemas/generated-asset-review.schema.json`
- `schemas/generated-resource-import.schema.json`
- `schemas/runtime-observation.schema.json`
- `lib/roadmap.ts` active Round 05 / P29 dashboard state
- `scripts/check-p28-round05-contracts.ts`

## Machine assertions

The gate verifies:

- P28-P33 exist in the specification, checklist, observation dashboard, and
  human-readable roadmap;
- the development contract contains one-high-level-goal, Engine MCP,
  ChangeSet, human candidate selection, transactional import, idempotency,
  runtime-frame evidence, sound-effect, standalone-package, and
  no-screen-coordinate requirements;
- the observation protocol distinguishes product direction, required human
  gates, clarification, coaching, and forbidden manual workaround;
- Journeys A-E and the initial open `R5-OBS-001` blocker exist;
- the observation panel cannot claim release eligibility before a qualifying
  participant run;
- the baseline implementation exposes `asset.generate`, policy evaluation,
  build, and release tools;
- the baseline production adapters are OpenAI image, Bailian image, and Bailian
  TTS, while the public MCP generation kinds remain `image` and `audio`;
- the current direct resource-import call remains detectable and the Round 05
  specification assigns transactional ChangeSet import to P29;
- the five versioned schemas parse, publish unique canonical IDs, and define
  stable Completion Run, explicit media capability, review, transactional
  import, and addressable observation identities and states;
- architecture decision 0024 keeps provider authorization, candidate review,
  and ChangeSet approval separate and defines restart/idempotency boundaries;
- all twelve audited starting gaps map to an owner phase, named failing probe,
  evidence file, and human Journey A-E outcome;
- `package.json` exposes the repeatable `check:p28:round05` command.

## Gate output

```json
{
  "gate": "P28 Round 05 completion contracts",
  "phases": ["P28", "P29", "P30", "P31", "P32", "P33"],
  "observedProductionAdapters": [
    "aliyun-bailian-image",
    "aliyun-bailian-tts",
    "openai-image"
  ],
  "baselineGenerationKinds": ["image", "audio"],
  "frozenSchemas": 5,
  "mappedGaps": 12,
  "dashboardTrack": "R5",
  "result": "passed"
}
```

## Explicit limitation

### Dashboard watch-scope follow-up (2026-09-05)

The retained dashboard dev server was watching generated Studio HTML and
rebuilding its CSS during engine changes. Its log recorded reloads inside
`artifacts/studio-windows`. Tailwind scanning is now explicitly limited to
`app`, `components`, `hooks` and `lib`, and Vite ignores engine source/output
trees. The source-contract regression failed before this change and passes
after it. The current local route responds with HTTP 200. Site tokens and
layout are unchanged; the production build passed after the watch-scope change
and again after the dashboard evidence update.

This uses Tailwind's documented
[explicit source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)
and Vite's documented
[watch exclusions](https://vite.dev/guide/troubleshooting).

The existing hosted project's lookup still returns `Sites project not found`;
no replacement Site or publication was created.

This evidence proves that the Round 05 control documents are complete enough to
start implementation and that the dashboard reports the audited starting
boundary. It does not prove production sound-effect/music generation,
candidate comparison, transactional import, visual inspection, resumable Goal
execution, completed Tank presentation, standalone release quality, or human
usability. Those remain unchecked P29-P33 outcomes.
