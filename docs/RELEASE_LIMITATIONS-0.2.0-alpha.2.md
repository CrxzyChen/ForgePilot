# AI Game Studio 0.2.0 Alpha 2 limitations

This build is suitable for architecture validation and first-developer testing,
not production game shipping.

- Windows x64 is the only packaged Studio and player target.
- The 3D player uses a deterministic wgpu isometric primitive projection. It
  proves 3D Scene/Transform/Camera/Mesh/Material/Light data reaches a standalone
  native player, but it is not a full perspective, PBR, shadow, skeletal
  animation, or production physics renderer.
- 2D rendering supports basic shapes and a built-in deterministic bitmap font.
  Texture atlases, animation, audio, particles, rich layout, navigation,
  networking, mobile, Web, and console export remain outside this Alpha.
- Runtime Scene switching and explicit object spawn/destroy/enable/visibility
  are deterministic and file-addressed, but there is no general native physics
  solver or prefab pool in the independent player yet.
- The QuickJS host enforces a versioned API, deterministic scheduling, and
  budgets, but it is not a security boundary for executing untrusted hostile
  project code from unknown publishers.
- Engine-level third-party native capability loading is not available. Project
  Components, Systems, Commands, Events, and Skills are extensible without
  engine changes.
- Windows artifacts are portable directories/ZIPs and are not code-signed or
  shipped through an installer/updater service. SmartScreen reputation is not
  established.
- Asset-generation routing and secure provider references exist, but no
  provider is bundled and generation may incur external cost after explicit
  configuration.
- Automated installed-build and UI-operator checks pass. Independent Tank
  project completion is the active Alpha 2 acceptance workload; the dashboard
  remains in validation until its game and Release package evidence pass.
