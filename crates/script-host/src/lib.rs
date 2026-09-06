//! Sandboxed JavaScript execution boundary for compiled project TypeScript.
//!
//! Project TypeScript is compiled to JavaScript before it crosses this crate's
//! boundary. `QuickJS` starts without filesystem, process, network, clock, or
//! host-random APIs. The host injects one deterministic behavior API and moves
//! authoritative state across the boundary as validated JSON values.

use std::cell::RefCell;
use std::fmt::{Display, Formatter};
use std::rc::Rc;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};

use rquickjs::{Context, Runtime, function::Func};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const PROJECT_EXECUTION_TIMEOUT: Duration = Duration::from_secs(25);
const PROJECT_SNAPSHOT_BYTES_LIMIT: usize = 64 * 1024 * 1024;

const HOST_PRELUDE: &str = r#"
(() => {
  "use strict";
  let behavior = null;

  Object.defineProperty(globalThis, "defineBehavior", {
    configurable: false,
    writable: false,
    value(specification) {
      if (behavior !== null) throw new Error("defineBehavior may be called only once");
      if (specification === null || typeof specification !== "object") {
        throw new TypeError("defineBehavior expects an object");
      }
      behavior = specification;
    },
  });

  Object.defineProperty(Math, "random", {
    configurable: false,
    writable: false,
    value() { throw new Error("Math.random is unavailable; use context.randomU32()"); },
  });
  Object.defineProperty(globalThis, "Date", {
    configurable: false,
    writable: false,
    value: undefined,
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: false,
    writable: false,
    value: undefined,
  });

  Object.defineProperty(globalThis, "__aigameStep", {
    configurable: false,
    writable: false,
    value(input) {
      if (behavior === null) throw new Error("project script did not call defineBehavior");
      const outputEvents = [];
      let randomState = (Number(input.seed) ^ Number(input.tick)) >>> 0;
      const state = JSON.parse(JSON.stringify(input.state));
      const context = Object.freeze({
        tick: Number(input.tick),
        seed: Number(input.seed),
        state,
        emit(type, payload = {}) {
          if (typeof type !== "string" || type.length === 0) {
            throw new TypeError("event type must be a non-empty string");
          }
          outputEvents.push({ type, payload: JSON.parse(JSON.stringify(payload)) });
        },
        randomU32() {
          randomState = (randomState + 0x6D2B79F5) >>> 0;
          let value = randomState;
          value = Math.imul(value ^ (value >>> 15), value | 1);
          value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
          return (value ^ (value >>> 14)) >>> 0;
        },
      });

      if (typeof behavior.onFixedUpdate === "function") {
        behavior.onFixedUpdate(context);
      }
      if (typeof behavior.onEvent === "function") {
        for (const event of input.events) behavior.onEvent(event, context);
      }
      return { state, events: outputEvents };
    },
  });
})();
"#;

const PROJECT_HOST_PRELUDE: &str = r#"
(() => {
  "use strict";
  const NativeFunction = Function;
  const recordSnapshot = globalThis.__aigameRecordSnapshot;
  delete globalThis.__aigameRecordSnapshot;
  let modules = Object.create(null);
  let activeRun = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const normalizeNumbers = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      const rounded = Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
      return Object.is(rounded, -0) ? 0 : rounded;
    }
    if (Array.isArray(value)) return value.map(normalizeNumbers);
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) value[key] = normalizeNumbers(value[key]);
    }
    return value;
  };
  const freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  const sdk = Object.freeze({
    defineBehavior(specification) { return specification; },
    defineSystem(specification) { return specification; },
  });

  function requireSdk(name) {
    if (name !== "@aigame/sdk") throw new Error(`module '${name}' is unavailable in the project sandbox`);
    return sdk;
  }

  function loadModules(compiledModules) {
    modules = Object.create(null);
    for (const compiled of compiledModules) {
      if (modules[compiled.id]) throw new Error(`duplicate project module '${compiled.id}'`);
      const module = { exports: {} };
      const factory = new NativeFunction(
        "module",
        "exports",
        "require",
        `${compiled.code}\n//# sourceURL=${compiled.source}`,
      );
      factory(module, module.exports, requireSdk);
      modules[compiled.id] = Object.freeze({
        id: compiled.id,
        kind: compiled.kind,
        source: compiled.source,
        exports: module.exports,
      });
    }
  }

  function componentOfType(object, type) {
    return object && object.components.find((component) => component.type === type && component.enabled !== false);
  }

  function linearColor(value, fallback = [0.55, 0.65, 0.72, 1]) {
    if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)) return fallback;
    const alpha = value.length === 9 ? Number.parseInt(value.slice(7, 9), 16) / 255 : 1;
    return [
      Number.parseInt(value.slice(1, 3), 16) / 255,
      Number.parseInt(value.slice(3, 5), 16) / 255,
      Number.parseInt(value.slice(5, 7), 16) / 255,
      alpha,
    ];
  }

  function transform2d(object) {
    const data = componentOfType(object, "core:transform2d")?.data || componentOfType(object, "core:transform")?.data || {};
    return normalizeNumbers({
      position: [Number(data.position?.x || 0), Number(data.position?.y || 0)],
      rotation: Number(data.rotation || 0),
      scale: [Number(data.scale?.x ?? 1), Number(data.scale?.y ?? 1)],
    });
  }

  function uiTransform2d(object) {
    const data = componentOfType(object, "core:ui-transform")?.data || {};
    return normalizeNumbers({
      position: [Number(data.anchor?.x ?? 0.5) * 1280, (1 - Number(data.anchor?.y ?? 0.5)) * 720],
      rotation: Number(data.rotation || 0),
      scale: [1, 1],
    });
  }

  function quaternionFromEuler(rotation) {
    const x = Number(rotation?.x || 0) * Math.PI / 360;
    const y = Number(rotation?.y || 0) * Math.PI / 360;
    const z = Number(rotation?.z || 0) * Math.PI / 360;
    const sx = Math.sin(x), cx = Math.cos(x);
    const sy = Math.sin(y), cy = Math.cos(y);
    const sz = Math.sin(z), cz = Math.cos(z);
    return [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    ];
  }

  function transform3d(object) {
    const data = componentOfType(object, "core:transform3d")?.data || {};
    return {
      position: [Number(data.position?.x || 0), Number(data.position?.y || 0), Number(data.position?.z || 0)],
      rotation: quaternionFromEuler(data.rotation),
      scale: [Number(data.scale?.x ?? 1), Number(data.scale?.y ?? 1), Number(data.scale?.z ?? 1)],
    };
  }

  function multiplyQuaternion(left, right) {
    const [ax, ay, az, aw] = left;
    const [bx, by, bz, bw] = right;
    const value = [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
    const length = Math.hypot(...value) || 1;
    return value.map((entry) => entry / length);
  }

  function rotateVector3(value, rotation) {
    const [x, y, z, w] = rotation;
    const [vx, vy, vz] = value;
    const ix = w * vx + y * vz - z * vy;
    const iy = w * vy + z * vx - x * vz;
    const iz = w * vz + x * vy - y * vx;
    const iw = -x * vx - y * vy - z * vz;
    return [
      ix * w + iw * -x + iy * -z - iz * -y,
      iy * w + iw * -y + iz * -x - ix * -z,
      iz * w + iw * -z + ix * -y - iy * -x,
    ];
  }

  function projectScene(scene, activeScene, tick, request) {
    const cameras = [];
    const drawables = [];
    const lights = [];
    const resources = [];
    const assetReference = (value, kind) => {
      const asset = (request.assets || []).find((candidate) => candidate.id === value || candidate.path === value);
      if (!asset) return undefined;
      const reference = {
        id: asset.id,
        kind,
        sourceHash: asset.sha256,
        derivedHash: asset.derivedHash || asset.sha256,
        projectPath: asset.path,
        variant: asset.variant || "default",
      };
      if (!resources.some((candidate) => candidate.id === reference.id)) resources.push(reference);
      return reference;
    };
    const atlasRegion = (value) => {
      if (Array.isArray(value) && value.length === 4) return value.map(Number);
      if (typeof value !== "string" || !value.trim()) return undefined;
      const region = value.split(",").map((entry) => Number(entry.trim()));
      return region.length === 4 && region.every(Number.isFinite) ? region : undefined;
    };
    const objects = [...(scene.objects || [])].sort((left, right) => Number(left.order || 0) - Number(right.order || 0) || left.id.localeCompare(right.id));
    const objectsById = new Map(objects.map((object) => [object.id, object]));
    const worldTransforms = new Map();
    const worldTransform3d = (object, ancestry = new Set()) => {
      if (worldTransforms.has(object.id)) return worldTransforms.get(object.id);
      const local = transform3d(object);
      if (!object.parentId || ancestry.has(object.id) || !objectsById.has(object.parentId)) {
        worldTransforms.set(object.id, local);
        return local;
      }
      const parent = objectsById.get(object.parentId);
      const parentWorld = worldTransform3d(parent, new Set([...ancestry, object.id]));
      const scaled = local.position.map((entry, index) => entry * parentWorld.scale[index]);
      const rotated = rotateVector3(scaled, parentWorld.rotation);
      const world = normalizeNumbers({
        position: parentWorld.position.map((entry, index) => entry + rotated[index]),
        rotation: multiplyQuaternion(parentWorld.rotation, local.rotation),
        scale: local.scale.map((entry, index) => entry * parentWorld.scale[index]),
      });
      worldTransforms.set(object.id, world);
      return world;
    };
    for (const object of objects) {
      if (object.enabled === false) continue;
      const camera2d = componentOfType(object, "render:camera2d");
      const camera3d = componentOfType(object, "render:camera3d");
      if (camera2d) cameras.push({
        id: camera2d.id,
        space: "2d",
        primary: camera2d.data.primary !== false,
        transform2d: transform2d(object),
        orthographicHeight: 18 / Number(camera2d.data.zoom || 1),
        clearColor: linearColor(camera2d.data.clearColor, [0.03, 0.05, 0.075, 1]),
      });
      if (camera3d) cameras.push({
        id: camera3d.id,
        space: "3d",
        primary: camera3d.data.primary !== false,
        transform3d: worldTransform3d(object),
        verticalFovRadians: Number(camera3d.data.fieldOfView || 60) * Math.PI / 180,
        near: Number(camera3d.data.near || 0.1),
        far: Number(camera3d.data.far || 1000),
        clearColor: linearColor(camera3d.data.clearColor, [0.03, 0.05, 0.075, 1]),
      });
      const shape = componentOfType(object, "render:shape2d");
      const sprite = componentOfType(object, "render:sprite2d");
      const text = componentOfType(object, "render:text2d");
      const mesh = componentOfType(object, "render:mesh3d");
      const material = componentOfType(object, "render:material");
      const uiTransform = componentOfType(object, "core:ui-transform");
      const uiText = componentOfType(object, "ui:text");
      const uiImage = componentOfType(object, "ui:image");
      const uiButton = componentOfType(object, "ui:button");
      if (shape) drawables.push({
        id: shape.id,
        objectId: object.id,
        space: scene.space === "ui" ? "ui" : "2d",
        primitive: "shape2d",
        visible: object.visible !== false,
        layer: Number(shape.data.layer ?? object.order ?? 0),
        transform2d: transform2d(object),
        tint: linearColor(shape.data.color),
        size: [Number(shape.data.size?.x || 1), Number(shape.data.size?.y || 1)],
      });
      if (sprite) drawables.push({
        id: sprite.id,
        objectId: object.id,
        space: scene.space === "ui" ? "ui" : "2d",
        primitive: "sprite2d",
        visible: object.visible !== false,
        layer: Number(sprite.data.layer ?? object.order ?? 0),
        transform2d: transform2d(object),
        asset: assetReference(sprite.data.texture, "image"),
        tint: linearColor(sprite.data.tint, [1, 1, 1, 1]),
        size: [Number(sprite.data.size?.x || 1), Number(sprite.data.size?.y || 1)],
        pivot: [Number(sprite.data.pivot?.x ?? 0.5), Number(sprite.data.pivot?.y ?? 0.5)],
        filter: sprite.data.filter === "nearest" ? "nearest" : "linear",
        atlasRegion: atlasRegion(sprite.data.atlasRegion),
      });
      if (text) drawables.push({
        id: text.id,
        objectId: object.id,
        space: scene.space === "ui" ? "ui" : "2d",
        primitive: scene.space === "ui" ? "ui-text" : "text2d",
        visible: object.visible !== false,
        layer: Number(text.data.layer ?? object.order ?? 0),
        transform2d: transform2d(object),
        tint: linearColor(text.data.color, [1, 1, 1, 1]),
        text: String(text.data.text || ""),
        size: [Number(text.data.fontSize || 1), Number(text.data.fontSize || 1)],
      });
      if (uiTransform && uiText) drawables.push({
        id: uiText.id,
        objectId: object.id,
        space: "ui",
        primitive: "ui-text",
        visible: object.visible !== false,
        layer: 10000 + Number(object.order || 0),
        transform2d: uiTransform2d(object),
        tint: linearColor(uiText.data.color, [1, 1, 1, 1]),
        text: String(uiText.data.text || ""),
        size: [Number(uiText.data.fontSize || 24), Number(uiText.data.fontSize || 24)],
        pivot: [0.5, 0.5],
      });
      if (uiTransform && uiImage) drawables.push({
        id: uiImage.id,
        objectId: object.id,
        space: "ui",
        primitive: "ui-image",
        visible: object.visible !== false,
        layer: 10000 + Number(object.order || 0),
        transform2d: uiTransform2d(object),
        asset: assetReference(uiImage.data.texture, "image"),
        tint: linearColor(uiImage.data.tint, [1, 1, 1, 1]),
        size: [Number(uiTransform.data.size?.x || 100), Number(uiTransform.data.size?.y || 40)],
        pivot: [0.5, 0.5],
        filter: uiImage.data.filter === "nearest" ? "nearest" : "linear",
        atlasRegion: atlasRegion(uiImage.data.atlasRegion),
      });
      if (uiTransform && uiButton && uiButton.data.disabled !== true) {
        const action = typeof uiButton.data.action === "string" && uiButton.data.action ? uiButton.data.action : "ui-action";
        const baseLayer = 10000 + Number(object.order || 0);
        drawables.push({
          id: `${uiButton.id}/background`,
          objectId: object.id,
          space: "ui",
          primitive: "shape2d",
          visible: object.visible !== false,
          layer: baseLayer,
          transform2d: uiTransform2d(object),
          tint: linearColor(uiButton.data.backgroundColor, [0.08, 0.2, 0.3, 1]),
          size: [Number(uiTransform.data.size?.x || 180), Number(uiTransform.data.size?.y || 48)],
          pivot: [0.5, 0.5],
          inputAction: action,
        });
        drawables.push({
          id: `${uiButton.id}/label`,
          objectId: object.id,
          space: "ui",
          primitive: "ui-text",
          visible: object.visible !== false,
          layer: baseLayer + 0.001,
          transform2d: uiTransform2d(object),
          tint: linearColor(uiButton.data.textColor, [1, 1, 1, 1]),
          text: String(uiButton.data.label || "Button"),
          size: [Number(uiButton.data.fontSize || 24), Number(uiButton.data.fontSize || 24)],
          pivot: [0.5, 0.5],
          inputAction: action,
        });
      }
      if (mesh) drawables.push({
        id: mesh.id,
        objectId: object.id,
        space: "3d",
        primitive: "mesh3d",
        visible: object.visible !== false,
        layer: Number(mesh.data.layer ?? object.order ?? 0),
        transform3d: worldTransform3d(object),
        asset: assetReference(mesh.data.mesh, "mesh"),
        texture: assetReference(material?.data?.texture, "image"),
        tint: linearColor(material?.data?.color),
      });
      const light = componentOfType(object, "render:directional-light");
      if (light) {
        const world = worldTransform3d(object);
        lights.push({
        id: light.id,
        objectId: object.id,
        kind: "directional",
        color: linearColor(light.data.color, [1, 1, 1, 1]),
        intensity: Number(light.data.intensity ?? 1),
        direction: rotateVector3([0, -1, -0.35], world.rotation),
      });
      }
    }
    return normalizeNumbers({
      protocolVersion: "3.0.0-preview.1",
      kind: "render.snapshot",
      sessionId: String(request.sessionId || "session:standalone"),
      generation: Number(request.generation || 1),
      sequence: Number(request.sequence || 0),
      tick,
      payload: {
        activeSceneId: String(scene.id || activeScene || "scene:active"),
        cameras,
        drawables,
        lights,
        resources,
      },
    });
  }

  function locationFrom(error, source) {
    const message = String(error && error.message ? error.message : error);
    const rawStack = String(error && error.stack ? error.stack : error);
    const stack = rawStack.includes(message) ? rawStack : `${message}\n${rawStack}`;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = stack.match(new RegExp(`${escaped}:(\\d+):(\\d+)`)) || stack.match(/<input>:(\d+):(\d+)/);
    return { stack, line: match ? Number(match[1]) : 1, column: match ? Number(match[2]) : 1 };
  }

  function runProject(request) {
    loadModules(request.modules || []);
    globalThis.Function = undefined;
    globalThis.eval = undefined;
    let scene = clone(request.scene);
    let activeScene = String(request.activeScene || scene.id || "scene:active");
    const sceneLibrary = Object.entries(request.scenes || {})
      .map(([path, document]) => ({ path, document: clone(document) }))
      .sort((left, right) => left.path.localeCompare(right.path));
    const prefabLibrary = Object.entries(request.prefabs || {})
      .map(([path, document]) => ({ path, document: clone(document) }))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!sceneLibrary.some((entry) => entry.path === activeScene)) {
      sceneLibrary.push({ path: activeScene, document: clone(scene) });
    }
    scene.objects.sort((left, right) => left.id.localeCompare(right.id));
    const manifest = request.manifest;
    const deltaSeconds = 1 / Number(request.tickRate || 60);
    const timeline = [];
    const systemTrace = [];
    const diagnostics = [];
    const snapshots = [];
    const watchValues = [];
    const limits = manifest.budgets || {};
    const maxEvents = Number(limits.eventsPerTick || 4096);
    const maxOperations = Number(limits.instructionsPerTick || 1000000);
    let operationCount = 0;
    let eventCount = 0;
    let emittedIndex = 0;
    let randomState = Number(request.randomState ?? request.seed ?? 0) >>> 0;
    let pendingEvents = clone(request.pendingEvents || []);
    let previousPhysicsContacts = clone(request.physicsContacts || []);
    let physicsEvents = [];
    let audioEvents = [];
    let audioTickSequence = 0;
    let deferredEvents = [];
    let delivering = false;
    let failed = false;
    let pausedAt = null;
    let currentTick = 0;
    let currentPhase = "engine:pre-update";
    // Systems after post-update can queue work for the next Tick. The host
    // request boundary must not discard that ordered semantic queue.
    let pendingLifecycle = clone(request.pendingLifecycle || []);

    const objectById = (id) => scene.objects.find((object) => object.id === id);
    const componentOf = (object, type) => object && object.components.find((component) => component.type === type && component.enabled !== false);
    let scriptBindings = [];
    function physicsStep() {
      const bodies = scene.objects
        .filter((object) => object.enabled !== false)
        .map((object) => {
          const is3d = Boolean(componentOf(object, "physics:collider3d"));
          const space = is3d ? "3d" : "2d";
          const transform = componentOf(object, is3d ? "core:transform3d" : "core:transform2d");
          const collider = componentOf(object, is3d ? "physics:collider3d" : "physics:collider2d");
          if (!transform || !collider) return null;
          const rigidbody = componentOf(object, is3d ? "physics:rigidbody3d" : "physics:rigidbody2d");
          const shape = componentOf(object, "render:shape2d");
          const bodyType = String(rigidbody?.data?.bodyType || "static");
          if (rigidbody && bodyType === "dynamic") {
            const velocity = rigidbody.data.velocity || { x: 0, y: 0, z: 0 };
            if (is3d) {
              velocity.y = Number(velocity.y || 0) - 9.81 * Number(rigidbody.data.gravityScale || 0) * deltaSeconds;
            }
            const damping = Math.max(0, Number(rigidbody.data.linearDamping || 0));
            const factor = Math.max(0, 1 - damping * deltaSeconds);
            transform.data.position.x += Number(velocity.x || 0) * deltaSeconds;
            transform.data.position.y += Number(velocity.y || 0) * deltaSeconds;
            if (is3d) transform.data.position.z += Number(velocity.z || 0) * deltaSeconds;
            rigidbody.data.velocity = {
              x: Number(velocity.x || 0) * factor,
              y: Number(velocity.y || 0) * factor,
              ...(is3d ? { z: Number(velocity.z || 0) * factor } : {}),
            };
          }
          const dimensions = is3d ? 3 : 2;
          const axes = is3d ? ["x", "y", "z"] : ["x", "y"];
          const sourceSize = collider.data.size || shape?.data?.size || { x: 1, y: 1, z: 1 };
          const offset = collider.data.offset || { x: 0, y: 0, z: 0 };
          const scale = transform.data.scale || { x: 1, y: 1, z: 1 };
          return {
            object,
            transform,
            collider,
            rigidbody,
            bodyType,
            space,
            dimensions,
            axes,
            center: axes.map((axis) => Number(transform.data.position?.[axis] || 0) + Number(offset[axis] || 0)),
            half: axes.map((axis) => Math.abs(Number(sourceSize[axis] || 1) * Number(scale[axis] ?? 1)) / 2),
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.collider.id.localeCompare(right.collider.id));
      const current = [];
      for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < bodies.length; rightIndex += 1) {
          const left = bodies[leftIndex];
          const right = bodies[rightIndex];
          if (left.space !== right.space) continue;
          const deltas = left.axes.map((_, index) => right.center[index] - left.center[index]);
          const overlaps = left.axes.map((_, index) => left.half[index] + right.half[index] - Math.abs(deltas[index]));
          if (overlaps.some((overlap) => overlap <= 0)) continue;
          let axisIndex = 0;
          for (let index = 1; index < overlaps.length; index += 1) {
            if (overlaps[index] < overlaps[axisIndex]) axisIndex = index;
          }
          const normal = Array.from({ length: left.dimensions }, () => 0);
          normal[axisIndex] = deltas[axisIndex] < 0 ? -1 : 1;
          const penetration = overlaps[axisIndex];
          const sensor = left.collider.data.isTrigger === true || right.collider.data.isTrigger === true;
          const key = `${left.collider.id}|${right.collider.id}`;
          const contact = {
            key,
            space: left.space,
            objectA: left.object.id,
            colliderA: left.collider.id,
            objectB: right.object.id,
            colliderB: right.collider.id,
            sensor,
            normal,
            contacts: [left.axes.map((_, index) => (left.center[index] + right.center[index]) / 2)],
            impulse: 0,
          };
          current.push(contact);
          if (!sensor) {
            const leftDynamic = left.bodyType === "dynamic";
            const rightDynamic = right.bodyType === "dynamic";
            const leftShare = leftDynamic ? (rightDynamic ? 0.5 : 1) : 0;
            const rightShare = rightDynamic ? (leftDynamic ? 0.5 : 1) : 0;
            const axis = left.axes[axisIndex];
            left.transform.data.position[axis] -= normal[axisIndex] * penetration * leftShare;
            right.transform.data.position[axis] += normal[axisIndex] * penetration * rightShare;
            for (const body of [left, right]) {
              if (!body.rigidbody || body.bodyType !== "dynamic") continue;
              const velocity = body.rigidbody.data.velocity || { x: 0, y: 0, z: 0 };
              velocity[axis] = 0;
              body.rigidbody.data.velocity = velocity;
            }
          }
        }
      }
      const prior = new Map(previousPhysicsContacts.map((contact) => [contact.key, contact]));
      const active = new Map(current.map((contact) => [contact.key, contact]));
      for (const contact of current) {
        physicsEvents.push({
          ...clone(contact),
          phase: prior.has(contact.key) ? "stay" : "enter",
          tick: currentTick,
        });
      }
      for (const [key, contact] of prior) {
        if (active.has(key)) continue;
        physicsEvents.push({ ...clone(contact), phase: "exit", tick: currentTick });
      }
      previousPhysicsContacts = current;
    }
    function bindingsFrom(objects) {
      return objects
        .flatMap((object) => object.components
          .filter((component) => component.type === "core:script" && component.enabled !== false && component.data.enabled !== false)
          .map((component) => {
            const declaration = (manifest.modules || []).find((candidate) => candidate.source === component.data.path && candidate.kind === "behavior");
            return declaration && modules[declaration.id]
              ? { object, component, declaration, module: modules[declaration.id], specification: modules[declaration.id].exports.default || modules[declaration.id].exports }
              : null;
          }))
        .filter(Boolean)
        .sort((left, right) => left.object.id.localeCompare(right.object.id) || left.declaration.id.localeCompare(right.declaration.id));
    }
    function refreshScriptBindings() {
      scene.objects.sort((left, right) => left.id.localeCompare(right.id));
      scriptBindings = bindingsFrom(scene.objects.filter((object) => object.enabled !== false));
    }
    refreshScriptBindings();
    const systems = (manifest.systems || []).map((system) => {
      const module = modules[system.module];
      const specification = module && (system.export === "default" ? module.exports.default : module.exports[system.export]);
      if (!module || !specification) throw new Error(`System '${system.id}' export '${system.export}' is unavailable`);
      return { ...system, source: module.source, specification };
    }).sort((left, right) => {
      const leftPhase = manifest.schedule.indexOf(left.phase);
      const rightPhase = manifest.schedule.indexOf(right.phase);
      return leftPhase - rightPhase || left.order - right.order || left.id.localeCompare(right.id);
    });

    function budget() {
      operationCount += 1;
      if (operationCount > maxOperations) throw Object.assign(new Error("script operation budget exceeded"), { code: "SCRIPT_CPU_BUDGET" });
    }
    function emit(type, payload, producer) {
      budget();
      if (typeof type !== "string" || type.length === 0) throw new TypeError("Event type must be a non-empty string");
      eventCount += 1;
      if (eventCount > maxEvents) throw Object.assign(new Error("Event volume budget exceeded"), { code: "SCRIPT_EVENT_BUDGET" });
      const event = freeze({ type, payload: clone(payload ?? {}), producer, index: emittedIndex++ });
      (delivering ? deferredEvents : pendingEvents).push(event);
      timeline.push({ tick: currentTick, phase: currentPhase, kind: "event:emit", type, payload: clone(event.payload), ...producer });
    }
    function runtimeAssetReference(value, kind) {
      const asset = (request.assets || []).find((candidate) => candidate.id === value || candidate.path === value);
      if (!asset || asset.status !== "ready") {
        throw Object.assign(new Error(`Runtime ${kind} asset '${String(value)}' is unavailable`), { code: "RUNTIME_RESOURCE_REFERENCE_MISSING" });
      }
      const actualKind = String(asset.kind || "");
      const mime = String(asset.mime || "");
      if (kind === "audio" && actualKind !== "audio" && !mime.startsWith("audio/")) {
        throw Object.assign(new Error(`Runtime asset '${String(value)}' is not audio`), { code: "RUNTIME_RESOURCE_KIND_INVALID" });
      }
      return {
        id: String(asset.id),
        kind,
        sourceHash: String(asset.sha256),
        derivedHash: String(asset.derivedHash || asset.sha256),
        projectPath: String(asset.path),
        variant: String(asset.variant || "default"),
      };
    }
    function emitAudio(action, payload, meta) {
      budget();
      const eventIndex = audioTickSequence++;
      const event = normalizeNumbers({
        protocolVersion: "3.0.0-preview.1",
        kind: "audio.event",
        sessionId: String(request.sessionId || "session:standalone"),
        generation: Number(request.generation || 1),
        sequence: Number(request.sequence || 0) + eventIndex,
        tick: currentTick,
        payload: {
          eventId: `audio:event/${currentTick}/${eventIndex}`,
          action,
          ...clone(payload),
        },
      });
      audioEvents.push(event);
      timeline.push({ tick: currentTick, phase: currentPhase, kind: "audio:event", action, eventId: event.payload.eventId, ...meta });
      return event.payload.instanceId || event.payload.eventId;
    }
    function randomU32() {
      budget();
      randomState = (randomState + 0x6D2B79F5) >>> 0;
      let value = randomState;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return (value ^ (value >>> 14)) >>> 0;
    }
    function query(types) {
      budget();
      return scene.objects
        .filter((object) => object.enabled !== false && types.every((type) => Boolean(componentOf(object, type))))
        .map((object) => object.id);
    }
    function lifecycle(kind, payload) {
      budget();
      pendingLifecycle.push({ kind, payload: clone(payload) });
      timeline.push({ tick: currentTick, phase: currentPhase, kind: `lifecycle:${kind}:queued`, ...clone(payload) });
    }
    function normalizeRuntimeObject(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("spawn expects an object document");
      if (typeof value.id !== "string" || !/^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_./-]*$/.test(value.id)) {
        throw new TypeError("spawn object.id must be a stable semantic ID");
      }
      if (!Array.isArray(value.components)) throw new TypeError("spawn object.components must be an array");
      if (objectById(value.id) || pendingLifecycle.some((entry) => entry.kind === "spawn" && entry.payload.object.id === value.id)) {
        throw new Error(`Object '${value.id}' already exists`);
      }
      const object = clone(value);
      object.name = typeof object.name === "string" && object.name ? object.name : object.id;
      object.enabled = object.enabled !== false;
      object.visible = object.visible !== false;
      object.locked = object.locked === true;
      object.parentId = typeof object.parentId === "string" ? object.parentId : null;
      object.order = Number.isInteger(object.order) ? object.order : scene.objects.length;
      for (const component of object.components) {
        if (!component || typeof component !== "object" || typeof component.id !== "string" || typeof component.type !== "string" || !component.data || typeof component.data !== "object") {
          throw new TypeError(`spawn object '${object.id}' contains an invalid Component`);
        }
        component.enabled = component.enabled !== false;
      }
      return object;
    }
    function bindingsFor(objectIds, includeDisabled = false) {
      const wanted = new Set(objectIds);
      const available = includeDisabled
        ? bindingsFrom(scene.objects.filter((object) => wanted.has(object.id)))
        : scriptBindings;
      return available.filter((binding) => wanted.has(binding.object.id));
    }
    function invokeBindings(bindings, hook) {
      for (const binding of bindings) {
        invoke(binding.specification, hook, {
          moduleId: binding.declaration.id,
          objectId: binding.object.id,
          source: binding.module.source,
        }, (context) => [context]);
        if (failed || pausedAt) return;
      }
    }
    function descendantsOf(objectId) {
      const collected = new Set([objectId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const object of scene.objects) {
          if (object.parentId && collected.has(object.parentId) && !collected.has(object.id)) {
            collected.add(object.id);
            changed = true;
          }
        }
      }
      return [...collected].sort();
    }
    function sceneOverrides(options) {
      const invalid = (message) => Object.assign(new TypeError(message), { code: "SCRIPT_SCENE_OVERRIDE_INVALID" });
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw invalid("loadScene options must be an object");
      }
      const overrides = options.componentOverrides === undefined ? [] : options.componentOverrides;
      if (!Array.isArray(overrides)) throw invalid("loadScene componentOverrides must be an array");
      const targets = new Set();
      for (const patch of overrides) {
        budget();
        if (!patch || typeof patch !== "object" || Array.isArray(patch) ||
            typeof patch.objectId !== "string" || !patch.objectId ||
            typeof patch.componentId !== "string" || !patch.componentId ||
            !patch.data || typeof patch.data !== "object" || Array.isArray(patch.data)) {
          throw invalid("Each Scene override requires objectId, componentId and a data object");
        }
        const target = JSON.stringify([patch.objectId, patch.componentId]);
        if (targets.has(target)) throw invalid(`Duplicate Scene override '${patch.objectId}' / '${patch.componentId}'`);
        targets.add(target);
      }
      return clone(overrides);
    }
    function applyLifecycle() {
      let index = 0;
      while (index < pendingLifecycle.length && !failed && !pausedAt) {
        const entry = pendingLifecycle[index++];
        const payload = entry.payload;
        if (entry.kind === "spawn") {
          scene.objects.push(payload.object);
          refreshScriptBindings();
          const created = bindingsFor([payload.object.id]);
          invokeBindings(created, "onStart");
          if (payload.object.enabled !== false) invokeBindings(created, "onEnable");
        } else if (entry.kind === "destroy") {
          const objectIds = descendantsOf(payload.objectId);
          invokeBindings(bindingsFor(objectIds, true), "onDestroy");
          const removing = new Set(objectIds);
          scene.objects = scene.objects.filter((object) => !removing.has(object.id));
          refreshScriptBindings();
        } else if (entry.kind === "enabled") {
          const object = objectById(payload.objectId);
          if (!object || object.enabled === payload.enabled) continue;
          if (!payload.enabled) invokeBindings(bindingsFor([object.id]), "onDisable");
          object.enabled = payload.enabled;
          refreshScriptBindings();
          if (payload.enabled) invokeBindings(bindingsFor([object.id]), "onEnable");
        } else if (entry.kind === "visible") {
          const object = objectById(payload.objectId);
          if (!object) throw new Error(`Object '${payload.objectId}' is unavailable`);
          object.visible = payload.visible;
        } else if (entry.kind === "load-scene") {
          const found = sceneLibrary.find((candidate) => candidate.path === payload.scene || candidate.document.id === payload.scene);
          if (!found) throw Object.assign(new Error(`Scene '${payload.scene}' is unavailable`), { code: "SCRIPT_SCENE_NOT_FOUND" });
          const destination = clone(found.document);
          for (const patch of payload.componentOverrides || []) {
            const object = destination.objects.find((candidate) => candidate.id === patch.objectId);
            const component = object?.components.find((candidate) => candidate.id === patch.componentId);
            if (!component) throw Object.assign(new Error(`Scene '${payload.scene}' override target '${patch.objectId}' / '${patch.componentId}' is unavailable`), { code: "SCRIPT_SCENE_OVERRIDE_TARGET_NOT_FOUND" });
            component.data = { ...component.data, ...clone(patch.data) };
          }
          // Scene replacement destroys the outgoing world, including disabled
          // objects. Release its behavior-owned resources before the new world
          // starts; same-Scene restart follows the identical lifecycle path.
          invokeBindings(bindingsFor(scene.objects.map((object) => object.id), true), "onDestroy");
          if (failed || pausedAt) break;
          scene = destination;
          activeScene = found.path;
          refreshScriptBindings();
          invokeBindings(scriptBindings, "onStart");
          invokeBindings(scriptBindings, "onEnable");
        }
        timeline.push({ tick: currentTick, phase: currentPhase, kind: `lifecycle:${entry.kind}:applied`, ...clone(payload), activeScene });
      }
      pendingLifecycle = [];
    }
    function prefabIdSuffix(value) {
      const tail = String(value || "object").split("/").filter(Boolean).pop() || "object";
      return tail.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "object";
    }
    function instantiatePrefab(prefabReference, options) {
      if (typeof prefabReference !== "string" || !prefabReference) {
        throw new TypeError("spawnPrefab expects a Prefab path or semantic ID");
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new TypeError("spawnPrefab options must be an object");
      }
      if (typeof options.objectId !== "string" || !options.objectId) {
        throw new TypeError("spawnPrefab options.objectId must be a stable semantic ID");
      }
      const found = prefabLibrary.find((candidate) =>
        candidate.path === prefabReference || candidate.document.id === prefabReference,
      );
      if (!found) {
        throw Object.assign(new Error(`Prefab '${prefabReference}' is unavailable`), {
          code: "SCRIPT_PREFAB_NOT_FOUND",
        });
      }
      const sourceObjects = Array.isArray(found.document.objects) ? found.document.objects : [];
      const rootIds = Array.isArray(found.document.rootObjectIds)
        ? found.document.rootObjectIds
        : [];
      if (sourceObjects.length === 0 || rootIds.length === 0) {
        throw Object.assign(new Error(`Prefab '${prefabReference}' has no root object`), {
          code: "SCRIPT_PREFAB_INVALID",
        });
      }
      const rootSourceId = rootIds[0];
      const ids = new Map();
      for (const source of sourceObjects) {
        const targetId = source.id === rootSourceId
          ? options.objectId
          : `${options.objectId}/${prefabIdSuffix(source.id)}`;
        if ([...ids.values()].includes(targetId)) {
          throw Object.assign(new Error(`Prefab '${prefabReference}' creates duplicate object ID '${targetId}'`), {
            code: "SCRIPT_PREFAB_ID_COLLISION",
          });
        }
        ids.set(source.id, targetId);
      }
      const componentOverrides = options.componentOverrides &&
        typeof options.componentOverrides === "object" &&
        !Array.isArray(options.componentOverrides)
        ? options.componentOverrides
        : {};
      const instantiated = sourceObjects.map((source) => {
        const object = clone(source);
        object.id = ids.get(source.id);
        object.prefab = found.path;
        object.parentId = ids.get(source.parentId) ||
          (source.id === rootSourceId && typeof options.parentId === "string"
            ? options.parentId
            : null);
        if (source.id === rootSourceId) {
          if (typeof options.name === "string" && options.name) object.name = options.name;
          if (Number.isInteger(options.order)) object.order = options.order;
        }
        object.components = (source.components || []).map((sourceComponent, index) => {
          const component = clone(sourceComponent);
          const suffix = prefabIdSuffix(sourceComponent.id || `${sourceComponent.type}-${index + 1}`);
          component.id = `${object.id}/${suffix}`;
          const override = componentOverrides[sourceComponent.type];
          if (override && typeof override === "object" && !Array.isArray(override)) {
            component.data = { ...component.data, ...clone(override) };
          }
          if (
            source.id === rootSourceId &&
            component.type === "core:transform2d" &&
            options.position &&
            typeof options.position === "object" &&
            !Array.isArray(options.position)
          ) {
            component.data = { ...component.data, position: clone(options.position) };
          }
          return component;
        });
        return normalizeRuntimeObject(object);
      });
      return { rootId: ids.get(rootSourceId), objects: instantiated };
    }
    function authoritativeContext(meta) {
      return Object.freeze({
        tick: currentTick,
        deltaSeconds,
        objectId: meta.objectId || null,
        get(first, second) {
          budget();
          const entity = second === undefined ? meta.objectId : first;
          const type = second === undefined ? first : second;
          const component = componentOf(objectById(entity), type);
          return component ? freeze(clone(component.data)) : undefined;
        },
        set(first, second, third) {
          budget();
          const entity = third === undefined ? meta.objectId : first;
          const type = third === undefined ? first : second;
          const value = third === undefined ? second : third;
          const component = componentOf(objectById(entity), type);
          if (!component) throw new Error(`Component '${type}' is unavailable on '${entity}'`);
          component.data = clone(value);
        },
        query(types) { return freeze(query(types)); },
        emit(type, payload) { emit(type, payload, meta); },
        spawn(object) {
          const normalized = normalizeRuntimeObject(object);
          lifecycle("spawn", { object: normalized });
          return normalized.id;
        },
        spawnPrefab(prefabReference, options) {
          const instantiated = instantiatePrefab(prefabReference, options);
          for (const object of instantiated.objects) lifecycle("spawn", { object });
          return instantiated.rootId;
        },
        destroy(objectId = meta.objectId) {
          if (typeof objectId !== "string" || !objectById(objectId)) throw new Error(`Object '${String(objectId)}' is unavailable`);
          lifecycle("destroy", { objectId });
        },
        setEnabled(objectId, enabled) {
          if (typeof objectId !== "string" || !objectById(objectId)) throw new Error(`Object '${String(objectId)}' is unavailable`);
          if (typeof enabled !== "boolean") throw new TypeError("setEnabled expects a boolean");
          lifecycle("enabled", { objectId, enabled });
        },
        setVisible(objectId, visible) {
          if (typeof objectId !== "string" || !objectById(objectId)) throw new Error(`Object '${String(objectId)}' is unavailable`);
          if (typeof visible !== "boolean") throw new TypeError("setVisible expects a boolean");
          lifecycle("visible", { objectId, visible });
        },
        loadScene(sceneId, options = {}) {
          if (typeof sceneId !== "string" || !sceneId) throw new TypeError("loadScene expects a Scene path or semantic ID");
          const componentOverrides = sceneOverrides(options);
          lifecycle("load-scene", { scene: sceneId, ...(componentOverrides.length ? { componentOverrides } : {}) });
        },
        playAudio(clip, options = {}) {
          if (typeof clip !== "string" || !clip) throw new TypeError("playAudio expects an audio asset ID or project path");
          if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("playAudio options must be an object");
          const instanceId = typeof options.instanceId === "string" && options.instanceId
            ? options.instanceId
            : `audio:instance/${currentTick}/${audioEvents.length}`;
          return emitAudio("play", {
            busId: typeof options.busId === "string" && options.busId ? options.busId : "audio:bus/master",
            clip: runtimeAssetReference(clip, "audio"),
            instanceId,
            volume: Math.max(0, Math.min(1, Number(options.volume ?? 1))),
            loop: options.loop === true,
          }, meta);
        },
        stopAudio(instanceId, busId = "audio:bus/master") {
          if (typeof instanceId !== "string" || !instanceId) throw new TypeError("stopAudio expects an instance ID");
          if (typeof busId !== "string" || !busId) throw new TypeError("stopAudio expects a bus ID");
          emitAudio("stop", { busId, instanceId }, meta);
        },
        pauseAudio(instanceId, busId = "audio:bus/master") {
          if (typeof instanceId !== "string" || !instanceId) throw new TypeError("pauseAudio expects an instance ID");
          if (typeof busId !== "string" || !busId) throw new TypeError("pauseAudio expects a bus ID");
          emitAudio("pause", { busId, instanceId }, meta);
        },
        resumeAudio(instanceId, busId = "audio:bus/master") {
          if (typeof instanceId !== "string" || !instanceId) throw new TypeError("resumeAudio expects an instance ID");
          if (typeof busId !== "string" || !busId) throw new TypeError("resumeAudio expects a bus ID");
          emitAudio("resume", { busId, instanceId }, meta);
        },
        setAudioBus(busId, settings = {}) {
          if (typeof busId !== "string" || !busId) throw new TypeError("setAudioBus expects a bus ID");
          if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new TypeError("setAudioBus settings must be an object");
          if (settings.volume !== undefined) emitAudio("set-volume", {
            busId,
            volume: Math.max(0, Math.min(1, Number(settings.volume))),
          }, meta);
          if (settings.muted !== undefined) emitAudio("set-muted", {
            busId,
            muted: settings.muted === true,
          }, meta);
        },
        randomU32,
      });
    }
    function presentationContext(meta) {
      return Object.freeze({
        tick: currentTick,
        alpha: 1,
        deltaSeconds,
        objectId: meta.objectId || null,
        get(first, second) {
          const entity = second === undefined ? meta.objectId : first;
          const type = second === undefined ? first : second;
          const component = componentOf(objectById(entity), type);
          return component ? freeze(clone(component.data)) : undefined;
        },
        query(types) { return freeze(query(types)); },
        set() { throw Object.assign(new Error("onFrame cannot mutate authoritative state"), { code: "SCRIPT_PRESENTATION_MUTATION" }); },
        emit() { throw Object.assign(new Error("onFrame cannot emit authoritative Events"), { code: "SCRIPT_PRESENTATION_MUTATION" }); },
      });
    }
    function breakpointFor(meta, hook) {
      return (request.breakpoints || []).find((entry) =>
        entry.enabled !== false &&
        (!entry.moduleId || entry.moduleId === meta.moduleId) &&
        (!entry.objectId || entry.objectId === meta.objectId) &&
        (!entry.systemId || entry.systemId === meta.systemId) &&
        (!entry.hook || entry.hook === hook));
    }
    function invoke(specification, hook, meta, args, readOnly = false) {
      const callback = specification && specification[hook];
      if (typeof callback !== "function" || failed || pausedAt) return;
      const breakpoint = breakpointFor(meta, hook);
      if (breakpoint) {
        const activeObject = meta.objectId ? objectById(meta.objectId) : null;
        pausedAt = {
          tick: currentTick,
          phase: currentPhase,
          hook,
          file: meta.source,
          line: breakpoint.line || 1,
          column: breakpoint.column || 1,
          ...meta,
          callStack: [{ name: hook, file: meta.source, line: breakpoint.line || 1, column: breakpoint.column || 1 }],
          scopes: {
            runtime: { tick: currentTick, phase: currentPhase, deltaSeconds },
            binding: { moduleId: meta.moduleId || null, objectId: meta.objectId || null, systemId: meta.systemId || null },
            object: activeObject ? clone(activeObject) : null,
          },
        };
        timeline.push({ tick: currentTick, phase: currentPhase, kind: "debug:breakpoint", hook, ...meta });
        return;
      }
      const context = readOnly ? presentationContext(meta) : authoritativeContext(meta);
      try {
        budget();
        callback(...args(context));
        timeline.push({ tick: currentTick, phase: currentPhase, kind: "script:hook", hook, ...meta });
      } catch (error) {
        const location = locationFrom(error, meta.source);
        diagnostics.push({
          code: error && error.code ? String(error.code) : "SCRIPT_RUNTIME_ERROR",
          severity: "error",
          message: String(error && error.message ? error.message : error),
          tick: currentTick,
          phase: currentPhase,
          systemId: meta.systemId || null,
          objectId: meta.objectId || null,
          moduleId: meta.moduleId || null,
          file: meta.source,
          line: location.line,
          column: location.column,
          stack: location.stack,
          state: clone(scene),
        });
        failed = true;
      }
    }
    function behaviorHook(hook, argumentFactory, readOnly = false) {
      for (const binding of scriptBindings) {
        invoke(binding.specification, hook, {
          moduleId: binding.declaration.id,
          objectId: binding.object.id,
          source: binding.module.source,
        }, argumentFactory || ((context) => [context]), readOnly);
        if (failed || pausedAt) return;
      }
    }
    function systemHook(system, hook, argumentFactory) {
      const ids = query(system.query || []);
      const startedOperations = operationCount;
      invoke(system.specification, hook, {
        moduleId: system.module,
        systemId: system.id,
        objectId: ids[0] || null,
        source: system.source,
      }, argumentFactory || ((context) => [Object.freeze({ ...context, objects: freeze(ids) })]));
      systemTrace.push({
        tick: currentTick,
        phase: currentPhase,
        systemId: system.id,
        moduleId: system.module,
        objects: ids,
        operations: operationCount - startedOperations,
        status: failed ? "failed" : pausedAt ? "paused" : "completed",
      });
    }
    function readWatch(path) {
      const parts = String(path).replace(/^\$\.?/, "").split(".").filter(Boolean);
      let value = scene;
      for (const part of parts) {
        if (value === null || value === undefined) return undefined;
        value = Array.isArray(value) && /^\d+$/.test(part) ? value[Number(part)] : value[part];
      }
      return value === undefined ? undefined : clone(value);
    }

    try {
      const startTick = Number(request.startTick || 0);
      if (!Array.isArray(pendingLifecycle) || pendingLifecycle.some((entry) =>
          !entry || !["spawn", "destroy", "enabled", "visible", "load-scene"].includes(entry.kind) ||
          !entry.payload || typeof entry.payload !== "object" || Array.isArray(entry.payload))) {
        const error = new Error("Invalid pending lifecycle continuation queue");
        error.code = "SCRIPT_LIFECYCLE_CONTINUATION_INVALID";
        throw error;
      }
      const endTick = startTick + Number(request.ticks || 1);
      for (currentTick = startTick; currentTick < endTick; currentTick += 1) {
        operationCount = 0;
        eventCount = 0;
        emittedIndex = 0;
        audioTickSequence = 0;
        for (const phase of manifest.schedule) {
          currentPhase = phase;
          timeline.push({ tick: currentTick, phase, kind: "phase:start" });
          if (phase === "engine:input") {
            for (const input of (request.inputs || []).filter((entry) => entry.tick === currentTick)) {
              behaviorHook("onInput", (context) => [input.action, input.value, context]);
            }
            for (const command of (request.commands || []).filter((entry) => entry.tick === currentTick)) {
              const immutable = freeze(clone({ type: command.type, payload: command.payload || {} }));
              timeline.push({ tick: currentTick, phase, kind: "command", type: immutable.type, payload: clone(immutable.payload) });
              behaviorHook("onCommand", (context) => [immutable, context]);
              for (const system of systems) systemHook(system, "onCommand", (context) => [immutable, Object.freeze({ ...context, objects: freeze(query(system.query || [])) })]);
            }
          }
          if (phase === "engine:pre-update" && currentTick === startTick && request.started !== true) {
            behaviorHook("onStart");
            behaviorHook("onEnable");
          }
          if (phase === "engine:fixed-update") behaviorHook("onFixedUpdate");
          for (const system of systems.filter((candidate) => candidate.phase === phase)) systemHook(system, "onFixedUpdate");
          if (phase === "engine:physics") physicsStep();
          if (phase === "engine:collision-events") {
            for (const collision of physicsEvents.filter((entry) => entry.tick === currentTick)) {
              const hook = collision.phase === "exit" ? "onCollisionExit" : collision.phase === "stay" ? "onCollisionStay" : "onCollisionEnter";
              timeline.push({ tick: currentTick, phase, kind: "physics:event", ...clone(collision) });
              for (const binding of scriptBindings.filter((candidate) => candidate.object.id === collision.objectA)) {
                invoke(binding.specification, hook, { moduleId: binding.declaration.id, objectId: binding.object.id, source: binding.module.source }, (context) => [collision.objectB, context, freeze(clone(collision))]);
              }
              for (const binding of scriptBindings.filter((candidate) => candidate.object.id === collision.objectB)) {
                const inverse = freeze({ ...clone(collision), objectA: collision.objectB, colliderA: collision.colliderB, objectB: collision.objectA, colliderB: collision.colliderA, normal: [-collision.normal[0], -collision.normal[1]] });
                invoke(binding.specification, hook, { moduleId: binding.declaration.id, objectId: binding.object.id, source: binding.module.source }, (context) => [collision.objectA, context, inverse]);
              }
            }
          }
          if (phase === "engine:gameplay-events") {
            const delivery = pendingEvents.sort((left, right) =>
              String(left.producer.systemId || "").localeCompare(String(right.producer.systemId || "")) ||
              String(left.producer.objectId || "").localeCompare(String(right.producer.objectId || "")) ||
              left.index - right.index);
            pendingEvents = [];
            delivering = true;
            for (const event of delivery) {
              timeline.push({
                tick: currentTick,
                phase,
                kind: "event:deliver",
                type: event.type,
                payload: clone(event.payload),
                producer: clone(event.producer),
                consumers: [
                  ...scriptBindings.map((binding) => ({ moduleId: binding.declaration.id, objectId: binding.object.id })),
                  ...systems.map((system) => ({ moduleId: system.module, systemId: system.id })),
                ],
              });
              behaviorHook("onEvent", (context) => [freeze(clone({ type: event.type, payload: event.payload })), context]);
              for (const system of systems) systemHook(system, "onEvent", (context) => [freeze(clone({ type: event.type, payload: event.payload })), Object.freeze({ ...context, objects: freeze(query(system.query || [])) })]);
            }
            delivering = false;
          }
          if (phase === "engine:post-update") {
            for (const control of (request.controls || []).filter((entry) => entry.tick === currentTick)) {
              if (control.action === "destroy") lifecycle("destroy", { objectId: control.objectId });
              else lifecycle("enabled", { objectId: control.objectId, enabled: false });
            }
            applyLifecycle();
          }
          if (phase === "engine:snapshot") {
            scene = normalizeNumbers(scene);
            // History is a bounded host-owned observation artifact, not live
            // gameplay heap. The private sink is removed from the global object
            // before any project module loads; it cannot perform external I/O.
            if (!recordSnapshot(JSON.stringify({ tick: currentTick, activeScene, scene }))) {
              const error = new Error("Snapshot history exceeds the 64 MiB debug artifact limit; use a shorter checkpoint or a persistent session.");
              error.code = "SCRIPT_SNAPSHOT_BUDGET_EXCEEDED";
              throw error;
            }
            snapshots.push({ tick: currentTick, activeScene });
            for (const path of request.watches || []) watchValues.push({ tick: currentTick, path, value: readWatch(path) });
          }
          if (phase === "engine:presentation") behaviorHook("onFrame", (context) => [context], true);
          timeline.push({ tick: currentTick, phase, kind: "phase:end" });
          if (failed || pausedAt) break;
        }
        pendingEvents.push(...deferredEvents);
        deferredEvents = [];
        if (failed || pausedAt) break;
      }
    } catch (error) {
      const source = "scripts/runtime.json";
      const location = locationFrom(error, source);
      diagnostics.push({
        code: error && error.code ? String(error.code) : "SCRIPT_RUNTIME_ERROR",
        severity: "error",
        message: String(error && error.message ? error.message : error),
        tick: currentTick,
        phase: currentPhase,
        systemId: null,
        objectId: null,
        moduleId: null,
        file: source,
        line: location.line,
        column: location.column,
        stack: location.stack,
        state: clone(scene),
      });
      failed = true;
    }
    activeRun = {
      status: failed ? "failed" : pausedAt ? "paused" : "completed",
      tick: currentTick,
      seed: Number(request.seed || 0),
      activeScene,
      scene,
      timeline,
      systemTrace,
      diagnostics,
      snapshots,
      watches: watchValues,
      pausedAt,
      randomState,
      pendingEvents: clone(pendingEvents),
      pendingLifecycle: clone(pendingLifecycle),
      physicsContacts: clone(previousPhysicsContacts),
      physicsEvents: clone(physicsEvents),
      audioEvents: clone(audioEvents),
      renderSnapshot: projectScene(
        scene,
        activeScene,
        snapshots.length ? snapshots[snapshots.length - 1].tick : currentTick,
        request,
      ),
      budgets: { operations: operationCount, events: eventCount },
    };
    return activeRun;
  }

  Object.defineProperty(globalThis, "Date", { configurable: false, writable: false, value: undefined });
  Object.defineProperty(globalThis, "fetch", { configurable: false, writable: false, value: undefined });
  Object.defineProperty(globalThis, "process", { configurable: false, writable: false, value: undefined });
  Object.defineProperty(globalThis, "require", { configurable: false, writable: false, value: undefined });
  Object.defineProperty(Math, "random", {
    configurable: false,
    writable: false,
    value() { throw new Error("Math.random is unavailable; use context.randomU32()"); },
  });
  Object.defineProperty(globalThis, "__aigameRunProject", { configurable: false, writable: false, value: runProject });
})();
"#;

/// Limits applied before project code is evaluated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScriptHostLimits {
    /// Maximum `QuickJS` heap in bytes.
    pub memory_bytes: usize,
    /// Maximum `QuickJS` stack in bytes.
    pub stack_bytes: usize,
}

impl Default for ScriptHostLimits {
    fn default() -> Self {
        Self {
            memory_bytes: 16 * 1024 * 1024,
            stack_bytes: 512 * 1024,
        }
    }
}

/// One immutable input batch for an authoritative fixed Tick.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptStepInput {
    /// Fixed simulation Tick.
    pub tick: u64,
    /// Project-owned deterministic seed.
    pub seed: u64,
    /// JSON state owned by the behavior instance.
    pub state: Value,
    /// Events queued for ordered delivery on this Tick.
    #[serde(default)]
    pub events: Vec<ScriptEvent>,
}

/// A typed project event crossing the script-host boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScriptEvent {
    /// Namespaced event type.
    #[serde(rename = "type")]
    pub event_type: String,
    /// JSON payload validated by the project event schema at the caller.
    #[serde(default)]
    pub payload: Value,
}

/// State and newly emitted events returned by one script step.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScriptStepOutput {
    /// Updated behavior state.
    pub state: Value,
    /// Events emitted in exact call order.
    pub events: Vec<ScriptEvent>,
}

/// Structured script-host failure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptHostError {
    /// Stable machine-readable category.
    pub code: String,
    /// Human-readable `QuickJS` or JSON diagnostic.
    pub message: String,
}

impl Display for ScriptHostError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for ScriptHostError {}

/// Isolated runtime for one compiled project behavior bundle.
pub struct ScriptHost {
    runtime: Runtime,
    context: Context,
}

/// Sandboxed host for a complete project Scene and its compiled TypeScript
/// behavior/System modules.
pub struct ProjectScriptHost {
    runtime: Runtime,
    context: Context,
    snapshot_history: Rc<RefCell<SnapshotHistory>>,
}

#[derive(Default)]
struct SnapshotHistory {
    encoded: Vec<String>,
    bytes: usize,
}

impl SnapshotHistory {
    fn record(&mut self, encoded: String) -> bool {
        if encoded.len() > PROJECT_SNAPSHOT_BYTES_LIMIT.saturating_sub(self.bytes) {
            return false;
        }
        self.bytes += encoded.len();
        self.encoded.push(encoded);
        true
    }
}

impl std::fmt::Debug for ProjectScriptHost {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProjectScriptHost")
            .field("memory_used_bytes", &self.memory_used_bytes())
            .finish_non_exhaustive()
    }
}

impl ProjectScriptHost {
    /// Creates the bounded project runtime. Compiled modules are supplied in
    /// the run request so their source identity remains available to debug
    /// records.
    ///
    /// # Errors
    ///
    /// Returns a structured diagnostic when `QuickJS` cannot initialize the
    /// versioned runtime prelude.
    pub fn new(limits: ScriptHostLimits) -> Result<Self, ScriptHostError> {
        let runtime = Runtime::new().map_err(|error| host_error("script.runtime", error))?;
        runtime.set_memory_limit(limits.memory_bytes);
        runtime.set_max_stack_size(limits.stack_bytes);
        let context =
            Context::full(&runtime).map_err(|error| host_error("script.context", error))?;
        let snapshot_history = Rc::new(RefCell::new(SnapshotHistory::default()));
        let snapshot_sink = Rc::clone(&snapshot_history);
        context.with(|context| {
            context
                .globals()
                .set(
                    "__aigameRecordSnapshot",
                    Func::from(move |encoded: String| snapshot_sink.borrow_mut().record(encoded)),
                )
                .map_err(|error| host_error("script.snapshot.initialize", error))?;
            context
                .eval::<(), _>(PROJECT_HOST_PRELUDE)
                .map_err(|error| host_error("script.prelude", error))
        })?;
        Ok(Self {
            runtime,
            context,
            snapshot_history,
        })
    }

    /// Runs a deterministic project request and returns a JSON debug envelope.
    ///
    /// # Errors
    ///
    /// Returns a structured diagnostic when the request or response cannot be
    /// serialized, or when the sandbox itself rejects execution.
    pub fn run(&self, request: &Value) -> Result<Value, ScriptHostError> {
        *self.snapshot_history.borrow_mut() = SnapshotHistory::default();
        let input = serde_json::to_string(request)
            .map_err(|error| host_error("script.project.input.serialize", error))?;
        let expression = format!("JSON.stringify(globalThis.__aigameRunProject({input}))");
        let deadline = Instant::now() + PROJECT_EXECUTION_TIMEOUT;
        let interrupted = Arc::new(AtomicBool::new(false));
        let interrupt_marker = Arc::clone(&interrupted);
        self.runtime.set_interrupt_handler(Some(Box::new(move || {
            let expired = Instant::now() >= deadline;
            if expired {
                interrupt_marker.store(true, Ordering::Relaxed);
            }
            expired
        })));
        let evaluated = self
            .context
            .with(|context| context.eval::<String, _>(expression));
        self.runtime.set_interrupt_handler(None);
        // Detach even on evaluation failure, so a failed run cannot retain its
        // debug buffer until a later request happens to arrive.
        let history = std::mem::take(&mut *self.snapshot_history.borrow_mut());
        let output = evaluated.map_err(|error| {
            if interrupted.load(Ordering::Relaxed) {
                ScriptHostError {
                    code: "script.project.timeout".to_owned(),
                    message: format!(
                        "project script exceeded the {} second execution limit",
                        PROJECT_EXECUTION_TIMEOUT.as_secs()
                    ),
                }
            } else {
                host_error("script.project.execute", error)
            }
        })?;
        let mut result: Value = serde_json::from_str(&output)
            .map_err(|error| host_error("script.project.output.invalid", error))?;
        let snapshots: Result<Vec<Value>, _> = history
            .encoded
            .into_iter()
            .map(|encoded| serde_json::from_str(&encoded))
            .collect();
        result["snapshots"] = Value::Array(
            snapshots.map_err(|error| host_error("script.project.snapshot.invalid", error))?,
        );
        Ok(result)
    }

    /// Returns current interpreter heap use for profiler and budget evidence.
    #[must_use]
    pub fn memory_used_bytes(&self) -> usize {
        usize::try_from(self.runtime.memory_usage().memory_used_size).unwrap_or(0)
    }
}

impl std::fmt::Debug for ScriptHost {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ScriptHost")
            .field("memory_used_bytes", &self.memory_used_bytes())
            .finish_non_exhaustive()
    }
}

impl ScriptHost {
    /// Creates a bounded `QuickJS` runtime and evaluates one compiled project
    /// behavior bundle.
    ///
    /// # Errors
    ///
    /// Returns a structured diagnostic when the runtime cannot start or the
    /// bundle cannot be evaluated.
    pub fn new(
        compiled_javascript: &str,
        limits: ScriptHostLimits,
    ) -> Result<Self, ScriptHostError> {
        let runtime = Runtime::new().map_err(|error| host_error("script.runtime", error))?;
        runtime.set_memory_limit(limits.memory_bytes);
        runtime.set_max_stack_size(limits.stack_bytes);
        let context =
            Context::full(&runtime).map_err(|error| host_error("script.context", error))?;
        context.with(|context| {
            context
                .eval::<(), _>(HOST_PRELUDE)
                .map_err(|error| host_error("script.prelude", error))?;
            context
                .eval::<(), _>(compiled_javascript)
                .map_err(|error| host_error("script.compile", error))
        })?;
        Ok(Self { runtime, context })
    }

    /// Executes one fixed Tick and returns only JSON state and typed events.
    ///
    /// # Errors
    ///
    /// Returns a structured diagnostic when input serialization, project code,
    /// output serialization, or output validation fails.
    pub fn step(&self, input: &ScriptStepInput) -> Result<ScriptStepOutput, ScriptHostError> {
        let input = serde_json::to_string(input)
            .map_err(|error| host_error("script.input.serialize", error))?;
        let expression = format!("JSON.stringify(globalThis.__aigameStep({input}))");
        let output: String = self.context.with(|context| {
            context
                .eval(expression)
                .map_err(|error| host_error("script.execute", error))
        })?;
        serde_json::from_str(&output).map_err(|error| host_error("script.output.invalid", error))
    }

    /// Returns current interpreter heap statistics for diagnostics and budgets.
    #[must_use]
    pub fn memory_used_bytes(&self) -> usize {
        usize::try_from(self.runtime.memory_usage().memory_used_size).unwrap_or(0)
    }
}

fn host_error(code: &str, error: impl Display) -> ScriptHostError {
    ScriptHostError {
        code: code.to_owned(),
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::{
        PROJECT_SNAPSHOT_BYTES_LIMIT, ProjectScriptHost, ScriptEvent, ScriptHost, ScriptHostLimits,
        ScriptStepInput, SnapshotHistory,
    };

    #[test]
    fn scene_replacement_destroys_old_behaviors_before_starting_new_ones() {
        let host = ProjectScriptHost::new(ScriptHostLimits::default()).unwrap();
        let object = |id: &str, enabled: bool| {
            json!({
                "id":id,"enabled":enabled,"components":[{
                    "id":format!("{id}/script"),"type":"core:script",
                    "data":{"path":"scripts/music.ts"}
                }]
            })
        };
        let destination =
            json!({"id":"probe:destination","space":"2d","objects":[object("probe:new",true)]});
        let request = json!({
            "scene":{"id":"probe:source","space":"2d","objects":[object("probe:old",true),object("probe:disabled",false)]},
            "activeScene":"scenes/source.game.json","ticks":4,"seed":7,
            "scenes":{"scenes/destination.game.json":destination},
            "assets":[{"id":"probe:music","path":"assets/music.wav","kind":"audio","status":"ready","sha256":"probe-hash"}],
            "modules":[
                {"id":"probe:behavior","kind":"behavior","source":"scripts/music.ts","code":"module.exports.default = { onStart(ctx) { ctx.playAudio('probe:music', {instanceId:ctx.objectId,loop:true}); }, onDestroy(ctx) { ctx.stopAudio(ctx.objectId); } };"},
                {"id":"probe:system","kind":"system","source":"scripts/switch.ts","code":"module.exports.switcher = { onFixedUpdate(ctx) { if(ctx.tick===1 || ctx.tick===2) ctx.loadScene('scenes/destination.game.json'); } };"}
            ],
            "manifest":{
                "modules":[{"id":"probe:behavior","kind":"behavior","source":"scripts/music.ts"}],
                "systems":[{"id":"probe:switcher","module":"probe:system","export":"switcher","phase":"game:update","order":0,"query":[]}],
                "schedule":["engine:pre-update","game:update","engine:post-update","engine:snapshot"],"budgets":{}
            }
        });
        let continuous = host.run(&request).unwrap();
        assert_eq!(continuous["status"], "completed");
        let summarize = |events: &Value| {
            events
                .as_array()
                .unwrap()
                .iter()
                .map(|event| {
                    json!([
                        event["tick"],
                        event["payload"]["action"],
                        event["payload"]["instanceId"]
                    ])
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(
            summarize(&continuous["audioEvents"]),
            vec![
                json!([0, "play", "probe:old"]),
                json!([1, "stop", "probe:disabled"]),
                json!([1, "stop", "probe:old"]),
                json!([1, "play", "probe:new"]),
                json!([2, "stop", "probe:new"]),
                json!([2, "play", "probe:new"])
            ]
        );
        let mut single = request.clone();
        single["ticks"] = json!(1);
        let mut split_events = Vec::new();
        for _ in 0..4 {
            let result = host.run(&single).unwrap();
            assert_eq!(result["status"], "completed");
            split_events.extend(result["audioEvents"].as_array().unwrap().clone());
            for key in [
                "scene",
                "activeScene",
                "randomState",
                "pendingEvents",
                "pendingLifecycle",
                "physicsContacts",
            ] {
                single[key] = result[key].clone();
            }
            single["startTick"] = result["tick"].clone();
            single["started"] = json!(true);
        }
        assert_eq!(json!(split_events), continuous["audioEvents"]);
        // Validate the destination before invoking irreversible cleanup hooks.
        let mut invalid = request.clone();
        invalid["scenes"] = json!({});
        let result = host.run(&invalid).unwrap();
        assert_eq!(result["status"], "failed");
        assert_eq!(result["activeScene"], "scenes/source.game.json");
        assert_eq!(
            summarize(&result["audioEvents"]),
            vec![json!([0, "play", "probe:old"])]
        );
    }

    #[test]
    fn presentation_lifecycle_survives_single_tick_requests() {
        let host = ProjectScriptHost::new(ScriptHostLimits::default()).unwrap();
        let request = json!({
            "scene": { "id": "probe:scene", "space": "2d", "objects": [
                { "id": "probe:overlay", "visible": true, "components": [] },
                { "id": "probe:disabled", "enabled": true, "components": [] },
                { "id": "probe:removed", "components": [] }
            ] },
            "ticks": 3, "seed": 7,
            "modules": [{ "id": "probe:module", "kind": "system", "source": "scripts/probe.ts",
                "code": "module.exports.probe = { onFixedUpdate(context) { if (context.tick === 0) { context.setVisible('probe:overlay', false); context.setEnabled('probe:disabled', false); context.destroy('probe:removed'); context.spawn({ id: 'probe:created', components: [] }); } if (context.tick === 1) context.setVisible('probe:overlay', true); } };",
            }],
            "manifest": { "systems": [{ "id": "probe:system", "module": "probe:module", "export": "probe", "phase": "engine:presentation", "order": 0, "query": [] }],
                "schedule": ["engine:post-update", "engine:snapshot", "engine:presentation"], "budgets": {} },
        });
        let continuous = host.run(&request).unwrap();
        assert_eq!(continuous["status"], "completed");
        let mut single = request.clone();
        single["ticks"] = json!(1);
        let mut all_snapshots = Vec::new();
        for tick in 0..3 {
            let result = host.run(&single).unwrap();
            assert_eq!(result["status"], "completed");
            all_snapshots.extend(result["snapshots"].as_array().unwrap().clone());
            if tick == 0 {
                assert_eq!(result["pendingLifecycle"].as_array().map(Vec::len), Some(4));
                assert_eq!(
                    result["scene"]["objects"].as_array().unwrap().len(),
                    3,
                    "late lifecycle must retain existing next-post-update timing"
                );
            }
            for key in [
                "scene",
                "activeScene",
                "randomState",
                "pendingEvents",
                "pendingLifecycle",
                "physicsContacts",
            ] {
                single[key] = result[key].clone();
            }
            single["startTick"] = result["tick"].clone();
            single["started"] = json!(true);
            if tick == 2 {
                assert_eq!(result["scene"], continuous["scene"]);
                assert_eq!(result["pendingLifecycle"], continuous["pendingLifecycle"]);
            }
        }
        assert_eq!(json!(all_snapshots), continuous["snapshots"]);
        assert_eq!(continuous["scene"]["objects"][0]["id"], "probe:created");
        assert_eq!(continuous["scene"]["objects"][1]["enabled"], false);
        assert_eq!(continuous["scene"]["objects"][2]["visible"], true);
    }

    #[test]
    fn late_scene_switch_is_carried_and_invalid_queue_is_rejected() {
        let host = ProjectScriptHost::new(ScriptHostLimits::default()).unwrap();
        let destination = json!({"id":"probe:destination", "space":"2d", "objects":[]});
        let mut request = json!({
            "scene":{"id":"probe:source", "space":"2d", "objects":[]},
            "activeScene":"scenes/source.game.json",
            "scenes":{"scenes/destination.game.json":destination}, "ticks":1,
            "modules":[{"id":"probe:module", "kind":"system", "source":"scripts/probe.ts",
                "code":"module.exports.probe = { onFixedUpdate(ctx) { if(ctx.tick===0) ctx.loadScene('scenes/destination.game.json'); } };"}],
            "manifest":{"systems":[{"id":"probe:system", "module":"probe:module", "export":"probe", "phase":"engine:presentation", "order":0,"query":[]}],
                "schedule":["engine:post-update","engine:snapshot","engine:presentation"],"budgets":{}}
        });
        let first = host.run(&request).unwrap();
        assert_eq!(first["status"], "completed");
        request["scene"] = first["scene"].clone();
        request["pendingLifecycle"] = first["pendingLifecycle"].clone();
        request["started"] = json!(true);
        request["startTick"] = first["tick"].clone();
        let resumed = host.run(&request).unwrap();
        assert_eq!(resumed["status"], "completed");
        assert_eq!(resumed["scene"], destination);
        assert_eq!(resumed["activeScene"], "scenes/destination.game.json");
        for invalid in [
            json!({}),
            json!([{"kind":"unknown","payload":{}}]),
            json!([null]),
        ] {
            request["pendingLifecycle"] = invalid;
            let rejected = host.run(&request).unwrap();
            assert_eq!(rejected["status"], "failed");
            assert_eq!(
                rejected["diagnostics"][0]["code"],
                "SCRIPT_LIFECYCLE_CONTINUATION_INVALID"
            );
            assert_eq!(rejected["scene"], first["scene"]);
        }
    }

    #[test]
    fn snapshot_sink_budget_rejects_without_discarding_evidence() {
        let mut history = SnapshotHistory {
            encoded: vec!["prior".to_owned()],
            bytes: PROJECT_SNAPSHOT_BYTES_LIMIT - 3,
        };
        assert!(history.record("坦".to_owned()));
        assert_eq!(history.bytes, PROJECT_SNAPSHOT_BYTES_LIMIT);
        assert!(!history.record("x".to_owned()));
        assert_eq!(history.encoded, ["prior", "坦"]);
    }

    #[test]
    fn snapshot_sink_is_private_immutable_and_reset_between_runs() {
        let host = ProjectScriptHost::new(ScriptHostLimits::default()).unwrap();
        let request = json!({
            "scene": { "id": "probe:scene", "space": "2d", "objects": [{
                "id": "probe:object", "components": [{
                    "id": "probe:component", "type": "probe:state", "data": { "count": 0 },
                }],
            }] },
            "ticks": 3, "seed": 7,
            "modules": [{ "id": "probe:module", "kind": "system", "source": "scripts/probe.ts",
                "code": "module.exports.probe = { onFixedUpdate(context) { const id = context.objects[0]; const state = context.get(id, 'probe:state'); context.set(id, 'probe:state', { count: state.count + 1, sink: typeof globalThis.__aigameRecordSnapshot, localSink: typeof recordSnapshot }); } };",
            }],
            "manifest": { "systems": [{ "id": "probe:system", "module": "probe:module", "export": "probe", "phase": "game:update", "order": 0, "query": ["probe:state"] }],
                "schedule": ["game:update", "engine:snapshot"], "budgets": {} },
        });
        let first = host.run(&request).unwrap();
        assert_eq!(first["status"], "completed");
        for (tick, snapshot) in first["snapshots"].as_array().unwrap().iter().enumerate() {
            assert_eq!(
                snapshot["scene"]["objects"][0]["components"][0]["data"],
                json!({
                    "count": tick + 1, "sink": "undefined", "localSink": "undefined",
                })
            );
        }
        assert_eq!(host.snapshot_history.borrow().bytes, 0);
        assert_eq!(host.run(&request).unwrap(), first);
        let mut invalid = request.clone();
        invalid["modules"][0]["code"] = json!("throw new Error('probe failure');");
        assert!(host.run(&invalid).is_err());
        assert!(host.snapshot_history.borrow().encoded.is_empty());
        assert_eq!(host.run(&request).unwrap(), first);
    }

    #[test]
    fn complete_snapshot_history_fits_bounded_heap() {
        let objects: Vec<_> = (0..48)
            .map(|index| {
                let samples: Vec<_> = (0..8)
                    .map(|sample| {
                        json!({
                            "sample": sample,
                            "position": { "x": index, "y": sample },
                            "label": "snapshot \"quoted\" \\ slash\n坦克",
                        })
                    })
                    .collect();
                json!({
                    "id": format!("probe:object/{index:02}"),
                    "enabled": true,
                    "components": [{
                        "id": format!("probe:component/{index:02}"),
                        "type": "probe:state", "enabled": true,
                        "data": { "samples": samples },
                    }],
                })
            })
            .collect();
        let scene = json!({ "id": "probe:scene", "space": "2d", "objects": objects });
        let request = json!({
            "scene": scene, "activeScene": "scenes/probe.game.json",
            "ticks": 260, "seed": 7, "modules": [],
            "manifest": { "systems": [], "schedule": ["engine:snapshot"], "budgets": {} },
        });
        let host = ProjectScriptHost::new(ScriptHostLimits {
            memory_bytes: 32 * 1024 * 1024,
            ..ScriptHostLimits::default()
        })
        .unwrap();
        let result = host.run(&request).unwrap();
        assert_eq!(result["status"], "completed");
        assert_eq!(result["tick"], 260);
        assert_eq!(result["scene"], scene);
        let snapshots = result["snapshots"].as_array().unwrap();
        assert_eq!(
            snapshots.len(),
            260,
            "never sample or discard history to meet the budget"
        );
        for (tick, snapshot) in snapshots.iter().enumerate() {
            assert_eq!(snapshot["tick"], tick);
            assert_eq!(snapshot["activeScene"], "scenes/probe.game.json");
            assert_eq!(
                snapshot["scene"], scene,
                "snapshot JSON must remain an object with exact content"
            );
        }
    }

    const BEHAVIOR: &str = r#"
      defineBehavior({
        onFixedUpdate(context) {
          context.state.x += context.state.speed;
          context.state.randomSamples.push(context.randomU32());
          if (context.state.x >= 6 && !context.state.reached) {
            context.state.reached = true;
            context.emit("demo:threshold-reached", { x: context.state.x });
          }
        },
        onEvent(event, context) {
          if (event.type === "demo:boost") context.state.speed += event.payload.amount;
        },
      });
    "#;

    fn run_once() -> serde_json::Value {
        let host = ScriptHost::new(BEHAVIOR, ScriptHostLimits::default()).unwrap();
        let mut state = json!({ "x": 0, "speed": 1, "reached": false, "randomSamples": [] });
        let mut emitted = Vec::new();
        for tick in 0..5 {
            let input = ScriptStepInput {
                tick,
                seed: 7,
                state,
                events: if tick == 1 {
                    vec![ScriptEvent {
                        event_type: "demo:boost".to_owned(),
                        payload: json!({ "amount": 2 }),
                    }]
                } else {
                    Vec::new()
                },
            };
            let output = host.step(&input).unwrap();
            state = output.state;
            emitted.extend(output.events);
        }
        json!({ "state": state, "events": emitted })
    }

    #[test]
    fn custom_behavior_and_event_are_deterministic() {
        let expected = run_once();
        for _ in 0..100 {
            assert_eq!(run_once(), expected);
        }
        assert_eq!(expected["state"]["x"], 11);
        assert_eq!(expected["events"][0]["type"], "demo:threshold-reached");
    }

    #[test]
    fn ambient_clock_network_and_random_are_unavailable() {
        let source = r"
          defineBehavior({
            onFixedUpdate(context) {
              context.state.environment = {
                date: typeof Date,
                fetch: typeof fetch,
                process: typeof process,
                require: typeof require,
              };
              Math.random();
            },
          });
        ";
        let host = ScriptHost::new(source, ScriptHostLimits::default()).unwrap();
        let error = host
            .step(&ScriptStepInput {
                tick: 0,
                seed: 1,
                state: json!({}),
                events: Vec::new(),
            })
            .unwrap_err();
        assert_eq!(error.code, "script.execute");
        assert!(error.message.contains("Exception"));
    }
}
