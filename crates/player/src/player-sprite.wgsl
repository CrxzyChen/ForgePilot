struct Camera {
  origin: vec2<f32>,
  extent: vec2<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var sprite_texture: texture_2d<f32>;
@group(1) @binding(1) var sprite_sampler: sampler;

struct VertexInput {
  @location(0) vertex: vec2<f32>,
  @location(1) position: vec2<f32>,
  @location(2) size: vec2<f32>,
  @location(3) layer: f32,
  @location(4) rotation: f32,
  @location(5) tint: vec4<f32>,
  @location(6) pivot: vec2<f32>,
  @location(7) uv_origin: vec2<f32>,
  @location(8) uv_size: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) tint: vec4<f32>,
  @location(1) uv: vec2<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  // Authored pivots and texture rows are top-origin; the render plane is Y-up.
  let local = (input.vertex - vec2<f32>(input.pivot.x, 1.0 - input.pivot.y)) * input.size;
  let cosine = cos(input.rotation);
  let sine = sin(input.rotation);
  let rotated = vec2<f32>(
    local.x * cosine - local.y * sine,
    local.x * sine + local.y * cosine,
  );
  let world = input.position + rotated;
  let normalized = (world - camera.origin) / camera.extent;
  let depth = clamp(0.99 - (input.layer + 100.0) / 1000.0, 0.0, 0.99);
  var output: VertexOutput;
  output.clip_position = vec4<f32>(normalized.x * 2.0 - 1.0, normalized.y * 2.0 - 1.0, depth, 1.0);
  output.tint = input.tint;
  output.uv = input.uv_origin + vec2<f32>(input.vertex.x, 1.0 - input.vertex.y) * input.uv_size;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(sprite_texture, sprite_sampler, input.uv) * input.tint;
}
