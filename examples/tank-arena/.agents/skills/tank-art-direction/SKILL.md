---
name: tank-art-direction
description: Create or review Tank Arena gameplay art, UI and feedback in the Neon Bastion top-down visual language; do not apply it to Studio chrome.
---

# Tank Arena — Neon Bastion art direction v1

Use this Skill for every generated, imported or reviewed Tank Arena visual.
Read `assets/briefs/tank-completion-v1.json` before generation and keep each
resource mapped to its stable asset and gameplay role.

## Visual grammar

- Use a strict orthographic top-down view with no horizon and no perspective
  tilt. Tanks point toward the top of the asset at zero rotation.
- Build readable silhouettes at 48–72 gameplay pixels: broad tracked hull,
  centered turret, short barrel, two-value material separation and a 2–3 pixel
  dark outline at gameplay scale.
- Palette: midnight navy `#07121d`, slate `#102836`, teal `#176779`, player cyan
  `#72ffe1`, enemy coral `#ff6474`, shell amber `#fff0a8`, success green
  `#52d69b`, and cold white `#f3fbff`.
- Materials are compact painted metal, rubber tracks and restrained emissive
  strips. Use crisp shapes, sparse wear and subtle contact shading; avoid noisy
  photoreal texture.
- Transparency: world sprites and effects use genuine transparent backgrounds
  with clean alpha, centered content and generous edge padding. Ground and wall
  tiles fill the canvas and have seamless or tile-safe edges.
- UI panels use dark translucent technical plates, one-pixel cyan keylines,
  clipped corners and restrained scan-line detail. Keep text out of generated
  images; runtime text remains authoritative and localizable.

## Asset rules

- Keep player, enemy, projectile, solid wall, destructible wall, command base,
  ground, impact, explosion and UI panel as distinct asset identities even when
  generated in one coordinated batch.
- Prefer one neutral source plus runtime tint only when silhouette and semantic
  role remain unambiguous. Player and enemy use distinct silhouettes, not only
  color changes.
- Use nearest filtering for compact world sprites and linear filtering for UI
  panels/effects. Do not bake shadows that imply a perspective inconsistent
  with the top-down camera.
- Atlas regions, if introduced, must be integer pixel rectangles and retain a
  separate manifest identity for each gameplay role.

## Review and prohibited styles

Reject a candidate when its top-down direction is ambiguous, alpha is opaque,
the barrel or tracks disappear at gameplay size, tile seams are obvious, UI
contains generated text, or contrast fails against both navy and slate.

Do not introduce logos, trademarks, flags, realistic military insignia,
photoreal gore, camouflage that erases silhouettes, isometric perspective,
unbounded bloom, embedded text, watermarks or a new palette.

Import only a human-selected candidate through the reviewed ChangeSet workflow.
After import, capture menu/play/pause/win/lose observations and compare the same
input log in Studio and Player.
