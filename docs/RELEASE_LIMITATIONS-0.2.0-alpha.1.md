# AI Game Studio 0.2.0 Alpha limitations

This build is suitable for architecture validation and first-developer testing,
not production game shipping.

- Windows x64 is the only packaged Studio and player target.
- The 3D player uses a deterministic wgpu isometric primitive projection. It
  proves 3D Scene/Transform/Camera/Mesh/Material/Light data reaches a standalone
  native player, but it is not a full perspective, PBR, shadow, skeletal
  animation, or production physics renderer.
- 2D rendering supports basic shapes and the minimum camera/input path; atlas,
  animation, audio, particles, rich UI, navigation, networking, mobile, Web,
  and console export are outside this Alpha.
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
- Automated installed-build and UI-operator checks pass. The required
  independent, unassisted first-time human acceptance journey is still open;
  the dashboard must remain in validation until it is recorded.
