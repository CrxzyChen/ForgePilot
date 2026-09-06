struct Camera {
  origin: vec2<f32>,
  extent: vec2<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexInput {
  @location(0) position: vec2<f32>,
  @location(1) instance_position: vec2<f32>,
  @location(2) instance_size: vec2<f32>,
  @location(3) layer: f32,
  @location(4) color: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) color: vec4<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let world = input.instance_position + input.position * input.instance_size;
  let normalized = (world - camera.origin) / camera.extent;
  let depth = clamp(0.99 - (input.layer + 100.0) / 1000.0, 0.0, 0.99);
  var output: VertexOutput;
  output.clip_position = vec4<f32>(normalized.x * 2.0 - 1.0, normalized.y * 2.0 - 1.0, depth, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
