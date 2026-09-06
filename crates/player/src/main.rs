//! Generic native player for file-native AI Game Studio project packages.

#![forbid(unsafe_code)]
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod audio_inspection;
mod audio_master;

use std::{
    borrow::Cow,
    collections::{BTreeMap, BTreeSet},
    env, fs,
    mem::size_of,
    path::{Path, PathBuf},
    process::ExitCode,
    sync::Arc,
    time::{Duration, Instant},
};

use ai_game_script_host::{ProjectScriptHost, ScriptHostLimits};
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Quat, Vec3};
use image::{ImageBuffer, Rgba, RgbaImage};
use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wgpu::util::DeviceExt;
use winit::{
    application::ApplicationHandler,
    dpi::{LogicalSize, PhysicalSize},
    event::{ElementState, MouseButton, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop, OwnedDisplayHandle},
    keyboard::{KeyCode, PhysicalKey},
    window::{Window, WindowId},
};

const TICK_INTERVAL: Duration = Duration::from_micros(16_667);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerPackage {
    schema_version: String,
    kind: String,
    project: PlayerProject,
    #[serde(default)]
    entry_scene: Option<String>,
    scene: Value,
    #[serde(default)]
    scenes: BTreeMap<String, Value>,
    #[serde(default)]
    prefabs: BTreeMap<String, Value>,
    runtime: PlayerRuntime,
    #[serde(default)]
    input_actions: Vec<InputAction>,
    #[serde(default)]
    audio_buses: Vec<AudioBusConfig>,
    #[serde(default)]
    assets: Vec<Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerProject {
    id: String,
    name: String,
    version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlayerRuntime {
    tick_rate: u32,
    manifest: Value,
    modules: Value,
    memory_bytes: usize,
    stack_bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputAction {
    id: String,
    #[serde(default)]
    keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioBusConfig {
    id: String,
    volume: f32,
    muted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyReport {
    ok: bool,
    kind: &'static str,
    project_id: String,
    project_name: String,
    package_version: String,
    scene_space: String,
    object_count: usize,
    module_count: usize,
    ticks_executed: u64,
    script_status: String,
    projection_protocol: String,
    projected_drawable_count: usize,
    validated_image_count: usize,
    validated_mesh_count: usize,
    validated_audio_count: usize,
    renderer: &'static str,
    external_dependencies: Vec<&'static str>,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct GpuPrimitive {
    position: [f32; 2],
    size: [f32; 2],
    layer: f32,
    color: [f32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct GpuSprite {
    position: [f32; 2],
    size: [f32; 2],
    layer: f32,
    rotation: f32,
    tint: [f32; 4],
    pivot: [f32; 2],
    uv_origin: [f32; 2],
    uv_size: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct Vertex3D {
    position: [f32; 3],
    normal: [f32; 3],
    uv: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct GpuMesh3D {
    model: [[f32; 4]; 4],
    color: [f32; 4],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct Scene3DUniform {
    view_projection: [[f32; 4]; 4],
    light_direction: [f32; 4],
    light_color: [f32; 4],
    ambient_and_intensity: [f32; 4],
}

#[derive(Debug, Clone)]
struct SpriteDraw {
    gpu: GpuSprite,
    project_path: String,
    cache_key: String,
    filter: wgpu::FilterMode,
    atlas_region: Option<[f32; 4]>,
    screen_space: bool,
}

#[derive(Debug, Clone)]
struct MeshDraw {
    gpu: GpuMesh3D,
    project_path: Option<String>,
    cache_key: String,
    texture_project_path: Option<String>,
    texture_cache_key: Option<String>,
}

#[derive(Debug, Clone)]
enum RenderItem {
    Primitive(GpuPrimitive),
    UiPrimitive(GpuPrimitive),
    Sprite(SpriteDraw),
    Mesh3D(MeshDraw),
}

impl RenderItem {
    fn layer(&self) -> f32 {
        match self {
            Self::Primitive(value) => value.layer,
            Self::UiPrimitive(value) => value.layer,
            Self::Sprite(value) => value.gpu.layer,
            Self::Mesh3D(_) => -1_000.0,
        }
    }
}

#[derive(Debug)]
struct TextureBinding {
    _texture: wgpu::Texture,
    bind_group: wgpu::BindGroup,
    dimensions: [u32; 2],
}

#[derive(Debug)]
struct MeshBinding {
    buffer: wgpu::Buffer,
    vertex_count: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct CameraUniform {
    origin: [f32; 2],
    extent: [f32; 2],
}

#[derive(Debug)]
struct Renderer {
    instance: wgpu::Instance,
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    sprite_pipeline: wgpu::RenderPipeline,
    mesh_pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    mesh_vertex_buffer: wgpu::Buffer,
    mesh_vertex_count: u32,
    camera_buffer: wgpu::Buffer,
    _ui_camera_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    ui_bind_group: wgpu::BindGroup,
    sprite_bind_group_layout: wgpu::BindGroupLayout,
    scene3d_buffer: wgpu::Buffer,
    scene3d_bind_group: wgpu::BindGroup,
    depth_texture: wgpu::Texture,
    depth_view: wgpu::TextureView,
    texture_cache: BTreeMap<String, TextureBinding>,
    mesh_cache: BTreeMap<String, MeshBinding>,
    white_texture: TextureBinding,
}

fn cube_vertices() -> Vec<Vertex3D> {
    let faces = [
        (
            [0.0, 0.0, 1.0],
            [
                [-0.5, -0.5, 0.5],
                [0.5, -0.5, 0.5],
                [0.5, 0.5, 0.5],
                [-0.5, 0.5, 0.5],
            ],
        ),
        (
            [0.0, 0.0, -1.0],
            [
                [0.5, -0.5, -0.5],
                [-0.5, -0.5, -0.5],
                [-0.5, 0.5, -0.5],
                [0.5, 0.5, -0.5],
            ],
        ),
        (
            [1.0, 0.0, 0.0],
            [
                [0.5, -0.5, 0.5],
                [0.5, -0.5, -0.5],
                [0.5, 0.5, -0.5],
                [0.5, 0.5, 0.5],
            ],
        ),
        (
            [-1.0, 0.0, 0.0],
            [
                [-0.5, -0.5, -0.5],
                [-0.5, -0.5, 0.5],
                [-0.5, 0.5, 0.5],
                [-0.5, 0.5, -0.5],
            ],
        ),
        (
            [0.0, 1.0, 0.0],
            [
                [-0.5, 0.5, 0.5],
                [0.5, 0.5, 0.5],
                [0.5, 0.5, -0.5],
                [-0.5, 0.5, -0.5],
            ],
        ),
        (
            [0.0, -1.0, 0.0],
            [
                [-0.5, -0.5, -0.5],
                [0.5, -0.5, -0.5],
                [0.5, -0.5, 0.5],
                [-0.5, -0.5, 0.5],
            ],
        ),
    ];
    let mut vertices = Vec::with_capacity(36);
    for (normal, corners) in faces {
        let uv = [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]];
        for index in [0, 1, 2, 0, 2, 3] {
            vertices.push(Vertex3D {
                position: corners[index],
                normal,
                uv: uv[index],
            });
        }
    }
    vertices
}

fn parse_obj_mesh(source: &str) -> Result<Vec<Vertex3D>, String> {
    #[derive(Clone, Copy)]
    struct Reference {
        position: usize,
        texcoord: Option<usize>,
        normal: Option<usize>,
    }
    fn index(value: &str, count: usize) -> Result<usize, String> {
        let raw = value
            .parse::<isize>()
            .map_err(|_| format!("invalid OBJ index {value}"))?;
        let resolved = if raw < 0 {
            count as isize + raw
        } else {
            raw - 1
        };
        usize::try_from(resolved)
            .ok()
            .filter(|candidate| *candidate < count)
            .ok_or_else(|| format!("OBJ index {value} is out of range"))
    }
    let mut positions = Vec::<[f32; 3]>::new();
    let mut normals = Vec::<[f32; 3]>::new();
    let mut texcoords = Vec::<[f32; 2]>::new();
    let mut faces = Vec::<Vec<Reference>>::new();
    for line in source.lines().map(str::trim) {
        if let Some(values) = line.strip_prefix("v ") {
            let values = values
                .split_whitespace()
                .map(str::parse::<f32>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "OBJ contains an invalid position".to_owned())?;
            if values.len() < 3 {
                return Err("OBJ position requires three numbers".to_owned());
            }
            positions.push([values[0], values[1], values[2]]);
        } else if let Some(values) = line.strip_prefix("vn ") {
            let values = values
                .split_whitespace()
                .map(str::parse::<f32>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "OBJ contains an invalid normal".to_owned())?;
            if values.len() < 3 {
                return Err("OBJ normal requires three numbers".to_owned());
            }
            normals.push([values[0], values[1], values[2]]);
        } else if let Some(values) = line.strip_prefix("vt ") {
            let values = values
                .split_whitespace()
                .map(str::parse::<f32>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| "OBJ contains an invalid texture coordinate".to_owned())?;
            if values.len() < 2 {
                return Err("OBJ texture coordinate requires two numbers".to_owned());
            }
            texcoords.push([values[0], 1.0 - values[1]]);
        } else if let Some(values) = line.strip_prefix("f ") {
            let mut face = Vec::new();
            for value in values.split_whitespace() {
                let parts = value.split('/').collect::<Vec<_>>();
                face.push(Reference {
                    position: index(parts[0], positions.len())?,
                    texcoord: parts
                        .get(1)
                        .filter(|entry| !entry.is_empty())
                        .map(|entry| index(entry, texcoords.len()))
                        .transpose()?,
                    normal: parts
                        .get(2)
                        .filter(|entry| !entry.is_empty())
                        .map(|entry| index(entry, normals.len()))
                        .transpose()?,
                });
            }
            if face.len() >= 3 {
                faces.push(face);
            }
        }
    }
    let mut vertices = Vec::new();
    for face in faces {
        for triangle in (1..face.len() - 1).map(|index| [face[0], face[index], face[index + 1]]) {
            let a = Vec3::from_array(positions[triangle[0].position]);
            let b = Vec3::from_array(positions[triangle[1].position]);
            let c = Vec3::from_array(positions[triangle[2].position]);
            let face_normal = (b - a).cross(c - a).normalize_or(Vec3::Y).to_array();
            for reference in triangle {
                vertices.push(Vertex3D {
                    position: positions[reference.position],
                    normal: reference.normal.map_or(face_normal, |value| normals[value]),
                    uv: reference
                        .texcoord
                        .map_or([0.0, 0.0], |value| texcoords[value]),
                });
            }
        }
    }
    if vertices.is_empty() {
        return Err("imported OBJ has no triangulatable faces".to_owned());
    }
    Ok(vertices)
}

fn create_depth_target(
    device: &wgpu::Device,
    config: &wgpu::SurfaceConfiguration,
) -> (wgpu::Texture, wgpu::TextureView) {
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("generic-player-depth"),
        size: wgpu::Extent3d {
            width: config.width.max(1),
            height: config.height.max(1),
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    });
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    (texture, view)
}

fn painter_depth_state() -> wgpu::DepthStencilState {
    // 2D/UI shares the 3D depth attachment but keeps authored painter order.
    wgpu::DepthStencilState {
        format: wgpu::TextureFormat::Depth32Float,
        depth_write_enabled: Some(false),
        depth_compare: Some(wgpu::CompareFunction::Always),
        stencil: wgpu::StencilState::default(),
        bias: wgpu::DepthBiasState::default(),
    }
}

fn sprite_uv_region(region: [f32; 4], dimensions: [u32; 2]) -> [f32; 4] {
    if region.iter().all(|value| (0.0..=1.0).contains(value)) {
        return region;
    }
    [
        region[0] / dimensions[0].max(1) as f32,
        region[1] / dimensions[1].max(1) as f32,
        region[2] / dimensions[0].max(1) as f32,
        region[3] / dimensions[1].max(1) as f32,
    ]
}

fn create_white_texture(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    layout: &wgpu::BindGroupLayout,
) -> TextureBinding {
    let size = wgpu::Extent3d {
        width: 1,
        height: 1,
        depth_or_array_layers: 1,
    };
    let texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("generic-player-white-material"),
        size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    queue.write_texture(
        texture.as_image_copy(),
        &[255, 255, 255, 255],
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(4),
            rows_per_image: Some(1),
        },
        size,
    );
    let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
    let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
        label: Some("generic-player-white-material"),
        mag_filter: wgpu::FilterMode::Linear,
        min_filter: wgpu::FilterMode::Linear,
        address_mode_u: wgpu::AddressMode::Repeat,
        address_mode_v: wgpu::AddressMode::Repeat,
        ..Default::default()
    });
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("generic-player-white-material"),
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: wgpu::BindingResource::TextureView(&view),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::Sampler(&sampler),
            },
        ],
    });
    TextureBinding {
        _texture: texture,
        bind_group,
        dimensions: [1, 1],
    }
}

fn default_scene3d_uniform() -> Scene3DUniform {
    Scene3DUniform {
        view_projection: Mat4::IDENTITY.to_cols_array_2d(),
        light_direction: [0.35, -1.0, 0.25, 0.0],
        light_color: [1.0, 1.0, 1.0, 1.0],
        ambient_and_intensity: [0.22, 0.9, 0.0, 0.0],
    }
}

impl Renderer {
    #[allow(clippy::too_many_lines)]
    async fn new(
        display: OwnedDisplayHandle,
        window: Arc<Window>,
        capture_surface: bool,
    ) -> Result<Self, String> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_with_display_handle(
            Box::new(display),
        ));
        let surface = instance
            .create_surface(window.clone())
            .map_err(|error| format!("surface creation failed: {error}"))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| format!("adapter request failed: {error}"))?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| format!("device request failed: {error}"))?;
        let size = window.inner_size();
        let mut config = surface
            .get_default_config(&adapter, size.width.max(1), size.height.max(1))
            .ok_or_else(|| "surface has no supported configuration".to_owned())?;
        if capture_surface {
            if !surface
                .get_capabilities(&adapter)
                .usages
                .contains(wgpu::TextureUsages::COPY_SRC)
                || !matches!(
                    config.format,
                    wgpu::TextureFormat::Bgra8Unorm
                        | wgpu::TextureFormat::Bgra8UnormSrgb
                        | wgpu::TextureFormat::Rgba8Unorm
                        | wgpu::TextureFormat::Rgba8UnormSrgb
                )
            {
                return Err("surface does not support bounded RGBA/BGRA readback".to_owned());
            }
            config.usage |= wgpu::TextureUsages::COPY_SRC;
        }
        surface.configure(&device, &config);
        let vertices = [
            Vertex {
                position: [0.0, 0.0],
            },
            Vertex {
                position: [1.0, 0.0],
            },
            Vertex {
                position: [1.0, 1.0],
            },
            Vertex {
                position: [0.0, 0.0],
            },
            Vertex {
                position: [1.0, 1.0],
            },
            Vertex {
                position: [0.0, 1.0],
            },
        ];
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("generic-player-quad"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let mesh_vertices = cube_vertices();
        let mesh_vertex_count = u32::try_from(mesh_vertices.len())
            .map_err(|_| "3D mesh vertex count exceeds u32".to_owned())?;
        let mesh_vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("generic-player-cube-mesh"),
            contents: bytemuck::cast_slice(&mesh_vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("generic-player-camera"),
            contents: bytemuck::bytes_of(&CameraUniform {
                origin: [0.0, 0.0],
                extent: [32.0, 18.0],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let ui_camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("generic-player-ui-camera"),
            contents: bytemuck::bytes_of(&CameraUniform {
                origin: [0.0, 0.0],
                extent: [1280.0, 720.0],
            }),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("generic-player-bind-group-layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("generic-player-bind-group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: camera_buffer.as_entire_binding(),
            }],
        });
        let ui_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("generic-player-ui-bind-group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: ui_camera_buffer.as_entire_binding(),
            }],
        });
        let scene3d_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("generic-player-scene3d"),
            contents: bytemuck::bytes_of(&default_scene3d_uniform()),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let scene3d_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("generic-player-scene3d-layout"),
                entries: &[wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                }],
            });
        let scene3d_bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("generic-player-scene3d-bind-group"),
            layout: &scene3d_bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: scene3d_buffer.as_entire_binding(),
            }],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("generic-player-shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("player.wgsl"))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("generic-player-pipeline-layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("generic-player-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<Vertex>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![0 => Float32x2],
                    }),
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<GpuPrimitive>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &wgpu::vertex_attr_array![1 => Float32x2, 2 => Float32x2, 3 => Float32, 4 => Float32x4],
                    }),
                ],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(painter_depth_state()),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        let sprite_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("generic-player-sprite-layout"),
                entries: &[
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: true },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                        count: None,
                    },
                ],
            });
        let sprite_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("generic-player-sprite-shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("player-sprite.wgsl"))),
        });
        let sprite_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("generic-player-sprite-pipeline-layout"),
                bind_group_layouts: &[Some(&bind_group_layout), Some(&sprite_bind_group_layout)],
                immediate_size: 0,
            });
        let sprite_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("generic-player-sprite-pipeline"),
            layout: Some(&sprite_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &sprite_shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<Vertex>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![0 => Float32x2],
                    }),
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<GpuSprite>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &wgpu::vertex_attr_array![
                            1 => Float32x2,
                            2 => Float32x2,
                            3 => Float32,
                            4 => Float32,
                            5 => Float32x4,
                            6 => Float32x2,
                            7 => Float32x2,
                            8 => Float32x2
                        ],
                    }),
                ],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &sprite_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: Some(painter_depth_state()),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        let mesh_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("generic-player-mesh3d-shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("player-mesh3d.wgsl"))),
        });
        let mesh_pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("generic-player-mesh3d-pipeline-layout"),
            bind_group_layouts: &[
                Some(&scene3d_bind_group_layout),
                Some(&sprite_bind_group_layout),
            ],
            immediate_size: 0,
        });
        let mesh_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("generic-player-mesh3d-pipeline"),
            layout: Some(&mesh_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &mesh_shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<Vertex3D>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![
                            0 => Float32x3,
                            1 => Float32x3,
                            7 => Float32x2
                        ],
                    }),
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<GpuMesh3D>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &wgpu::vertex_attr_array![
                            2 => Float32x4,
                            3 => Float32x4,
                            4 => Float32x4,
                            5 => Float32x4,
                            6 => Float32x4
                        ],
                    }),
                ],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &mesh_shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                ..Default::default()
            },
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });
        let (depth_texture, depth_view) = create_depth_target(&device, &config);
        let white_texture = create_white_texture(&device, &queue, &sprite_bind_group_layout);
        Ok(Self {
            instance,
            window,
            surface,
            device,
            queue,
            config,
            pipeline,
            sprite_pipeline,
            mesh_pipeline,
            vertex_buffer,
            mesh_vertex_buffer,
            mesh_vertex_count,
            camera_buffer,
            _ui_camera_buffer: ui_camera_buffer,
            bind_group,
            ui_bind_group,
            sprite_bind_group_layout,
            scene3d_buffer,
            scene3d_bind_group,
            depth_texture,
            depth_view,
            texture_cache: BTreeMap::new(),
            mesh_cache: BTreeMap::new(),
            white_texture,
        })
    }

    fn resize(&mut self, size: PhysicalSize<u32>) {
        if size.width == 0 || size.height == 0 {
            return;
        }
        self.config.width = size.width;
        self.config.height = size.height;
        self.surface.configure(&self.device, &self.config);
        (self.depth_texture, self.depth_view) = create_depth_target(&self.device, &self.config);
    }

    fn load_texture(
        &mut self,
        cache_key: &str,
        project_path: &str,
        filter: wgpu::FilterMode,
        asset_root: &Path,
    ) -> Result<(), String> {
        if self.texture_cache.contains_key(cache_key) {
            return Ok(());
        }
        let candidate = asset_root.join(project_path);
        let canonical_root = asset_root
            .canonicalize()
            .map_err(|error| format!("asset root is unavailable: {error}"))?;
        let canonical_path = candidate.canonicalize().map_err(|error| {
            format!(
                "sprite asset {} is unavailable: {error}",
                candidate.display()
            )
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(format!("sprite asset escapes package root: {project_path}"));
        }
        let source = fs::read(&canonical_path).map_err(|error| {
            format!(
                "failed to read sprite {}: {error}",
                canonical_path.display()
            )
        })?;
        let (decoded, dimensions) = decode_sprite_image(&source, &canonical_path)?;
        if dimensions[0] == 0 || dimensions[1] == 0 {
            return Err(format!("sprite has zero dimensions: {project_path}"));
        }
        let size = wgpu::Extent3d {
            width: dimensions[0],
            height: dimensions[1],
            depth_or_array_layers: 1,
        };
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some(cache_key),
            size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        self.queue.write_texture(
            texture.as_image_copy(),
            &decoded,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(4 * dimensions[0]),
                rows_per_image: Some(dimensions[1]),
            },
            size,
        );
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = self.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some(cache_key),
            mag_filter: filter,
            min_filter: filter,
            mipmap_filter: if filter == wgpu::FilterMode::Nearest {
                wgpu::MipmapFilterMode::Nearest
            } else {
                wgpu::MipmapFilterMode::Linear
            },
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            ..Default::default()
        });
        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some(cache_key),
            layout: &self.sprite_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        self.texture_cache.insert(
            cache_key.to_owned(),
            TextureBinding {
                _texture: texture,
                bind_group,
                dimensions,
            },
        );
        Ok(())
    }

    fn load_mesh(
        &mut self,
        cache_key: &str,
        project_path: &str,
        asset_root: &Path,
    ) -> Result<(), String> {
        if self.mesh_cache.contains_key(cache_key) {
            return Ok(());
        }
        let canonical_root = asset_root
            .canonicalize()
            .map_err(|error| format!("asset root is unavailable: {error}"))?;
        let candidate = asset_root.join(project_path);
        let canonical_path = candidate.canonicalize().map_err(|error| {
            format!("mesh asset {} is unavailable: {error}", candidate.display())
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(format!("mesh asset escapes package root: {project_path}"));
        }
        if canonical_path.extension().and_then(std::ffi::OsStr::to_str) != Some("obj") {
            return Err(format!("unsupported static mesh format: {project_path}"));
        }
        let source = fs::read_to_string(&canonical_path).map_err(|error| {
            format!("failed to read mesh {}: {error}", canonical_path.display())
        })?;
        let vertices = parse_obj_mesh(&source)?;
        let vertex_count = u32::try_from(vertices.len())
            .map_err(|_| format!("mesh vertex count exceeds u32: {project_path}"))?;
        let buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("generic-player-imported-mesh"),
                contents: bytemuck::cast_slice(&vertices),
                usage: wgpu::BufferUsages::VERTEX,
            });
        self.mesh_cache.insert(
            cache_key.to_owned(),
            MeshBinding {
                buffer,
                vertex_count,
            },
        );
        Ok(())
    }

    fn render(
        &mut self,
        items: &[RenderItem],
        camera: CameraUniform,
        scene3d: Scene3DUniform,
        asset_root: &Path,
        capture_path: Option<&Path>,
    ) -> Result<bool, String> {
        self.queue
            .write_buffer(&self.camera_buffer, 0, bytemuck::bytes_of(&camera));
        self.queue
            .write_buffer(&self.scene3d_buffer, 0, bytemuck::bytes_of(&scene3d));
        let active_textures = items
            .iter()
            .filter_map(|item| match item {
                RenderItem::Sprite(sprite) => Some(sprite.cache_key.clone()),
                RenderItem::Mesh3D(mesh) => mesh.texture_cache_key.clone(),
                RenderItem::Primitive(_) | RenderItem::UiPrimitive(_) => None,
            })
            .collect::<BTreeSet<_>>();
        self.texture_cache
            .retain(|cache_key, _| active_textures.contains(cache_key));
        for item in items {
            if let RenderItem::Sprite(sprite) = item {
                self.load_texture(
                    &sprite.cache_key,
                    &sprite.project_path,
                    sprite.filter,
                    asset_root,
                )?;
            }
            if let RenderItem::Mesh3D(mesh) = item
                && let Some(project_path) = &mesh.project_path
            {
                self.load_mesh(&mesh.cache_key, project_path, asset_root)?;
            }
            if let RenderItem::Mesh3D(mesh) = item
                && let (Some(cache_key), Some(project_path)) =
                    (&mesh.texture_cache_key, &mesh.texture_project_path)
            {
                self.load_texture(
                    cache_key,
                    project_path,
                    wgpu::FilterMode::Linear,
                    asset_root,
                )?;
            }
        }
        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) => frame,
            wgpu::CurrentSurfaceTexture::Suboptimal(frame) => {
                drop(frame);
                self.surface.configure(&self.device, &self.config);
                return Ok(false);
            }
            wgpu::CurrentSurfaceTexture::Occluded | wgpu::CurrentSurfaceTexture::Timeout => {
                return Ok(false);
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                self.surface.configure(&self.device, &self.config);
                return Ok(false);
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                self.surface = self
                    .instance
                    .create_surface(self.window.clone())
                    .map_err(|error| format!("surface recreation failed: {error}"))?;
                self.surface.configure(&self.device, &self.config);
                return Ok(false);
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err("surface validation failed".to_owned());
            }
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("generic-player-encoder"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("generic-player-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.018,
                            g: 0.027,
                            b: 0.045,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Store,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            for item in items {
                match item {
                    RenderItem::Primitive(primitive) => {
                        let instance_buffer =
                            self.device
                                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                    label: Some("generic-player-primitive"),
                                    contents: bytemuck::bytes_of(primitive),
                                    usage: wgpu::BufferUsages::VERTEX,
                                });
                        pass.set_pipeline(&self.pipeline);
                        pass.set_bind_group(0, &self.bind_group, &[]);
                        pass.set_vertex_buffer(1, instance_buffer.slice(..));
                        pass.draw(0..6, 0..1);
                    }
                    RenderItem::UiPrimitive(primitive) => {
                        let instance_buffer =
                            self.device
                                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                    label: Some("generic-player-ui-primitive"),
                                    contents: bytemuck::bytes_of(primitive),
                                    usage: wgpu::BufferUsages::VERTEX,
                                });
                        pass.set_pipeline(&self.pipeline);
                        pass.set_bind_group(0, &self.ui_bind_group, &[]);
                        pass.set_vertex_buffer(1, instance_buffer.slice(..));
                        pass.draw(0..6, 0..1);
                    }
                    RenderItem::Sprite(sprite) => {
                        let mut gpu = sprite.gpu;
                        let binding =
                            self.texture_cache.get(&sprite.cache_key).ok_or_else(|| {
                                format!("sprite texture cache missed {}", sprite.cache_key)
                            })?;
                        if let Some(region) = sprite.atlas_region {
                            let uv = sprite_uv_region(region, binding.dimensions);
                            gpu.uv_origin = [uv[0], uv[1]];
                            gpu.uv_size = [uv[2], uv[3]];
                        }
                        let instance_buffer =
                            self.device
                                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                    label: Some("generic-player-sprite"),
                                    contents: bytemuck::bytes_of(&gpu),
                                    usage: wgpu::BufferUsages::VERTEX,
                                });
                        pass.set_pipeline(&self.sprite_pipeline);
                        pass.set_bind_group(
                            0,
                            if sprite.screen_space {
                                &self.ui_bind_group
                            } else {
                                &self.bind_group
                            },
                            &[],
                        );
                        pass.set_bind_group(1, &binding.bind_group, &[]);
                        pass.set_vertex_buffer(1, instance_buffer.slice(..));
                        pass.draw(0..6, 0..1);
                    }
                    RenderItem::Mesh3D(mesh) => {
                        let instance_buffer =
                            self.device
                                .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                                    label: Some("generic-player-mesh3d-instance"),
                                    contents: bytemuck::bytes_of(&mesh.gpu),
                                    usage: wgpu::BufferUsages::VERTEX,
                                });
                        pass.set_pipeline(&self.mesh_pipeline);
                        pass.set_bind_group(0, &self.scene3d_bind_group, &[]);
                        let texture = mesh
                            .texture_cache_key
                            .as_ref()
                            .and_then(|key| self.texture_cache.get(key))
                            .unwrap_or(&self.white_texture);
                        pass.set_bind_group(1, &texture.bind_group, &[]);
                        let imported = mesh
                            .project_path
                            .as_ref()
                            .and_then(|_| self.mesh_cache.get(&mesh.cache_key));
                        pass.set_vertex_buffer(
                            0,
                            imported.map_or_else(
                                || self.mesh_vertex_buffer.slice(..),
                                |value| value.buffer.slice(..),
                            ),
                        );
                        pass.set_vertex_buffer(1, instance_buffer.slice(..));
                        pass.draw(
                            0..imported.map_or(self.mesh_vertex_count, |value| value.vertex_count),
                            0..1,
                        );
                        pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
                    }
                }
            }
        }
        let readback = capture_path.map(|_| {
            let row_bytes = (self.config.width * 4).div_ceil(256) * 256;
            let buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("player-window-smoke-readback"),
                size: u64::from(row_bytes) * u64::from(self.config.height),
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            });
            encoder.copy_texture_to_buffer(
                frame.texture.as_image_copy(),
                wgpu::TexelCopyBufferInfo {
                    buffer: &buffer,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(row_bytes),
                        rows_per_image: None,
                    },
                },
                wgpu::Extent3d {
                    width: self.config.width,
                    height: self.config.height,
                    depth_or_array_layers: 1,
                },
            );
            (buffer, row_bytes)
        });
        self.queue.submit(Some(encoder.finish()));
        if let (Some(path), Some((buffer, row_bytes))) = (capture_path, readback) {
            let (sender, receiver) = std::sync::mpsc::channel();
            buffer
                .slice(..)
                .map_async(wgpu::MapMode::Read, move |result| {
                    let _ = sender.send(result);
                });
            self.device
                .poll(wgpu::PollType::wait_indefinitely())
                .map_err(|error| error.to_string())?;
            receiver
                .recv_timeout(Duration::from_secs(5))
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())?;
            let mapped = buffer
                .slice(..)
                .get_mapped_range()
                .map_err(|error| error.to_string())?;
            let mut pixels =
                Vec::with_capacity((self.config.width * self.config.height * 4) as usize);
            for row in mapped.chunks_exact(row_bytes as usize) {
                pixels.extend_from_slice(&row[..(self.config.width * 4) as usize]);
            }
            if matches!(
                self.config.format,
                wgpu::TextureFormat::Bgra8Unorm | wgpu::TextureFormat::Bgra8UnormSrgb
            ) {
                for pixel in pixels.chunks_exact_mut(4) {
                    pixel.swap(0, 2);
                }
            }
            drop(mapped);
            buffer.unmap();
            let frame_image: RgbaImage =
                ImageBuffer::from_raw(self.config.width, self.config.height, pixels)
                    .ok_or_else(|| "invalid GPU readback dimensions".to_owned())?;
            frame_image
                .save(path)
                .map_err(|error| format!("GPU frame capture failed: {error}"))?;
        }
        self.window.pre_present_notify();
        self.queue.present(frame);
        Ok(true)
    }
}

struct PlayerApp {
    package: PlayerPackage,
    asset_root: PathBuf,
    scene: Value,
    active_scene: String,
    tick: u64,
    started: bool,
    renderer: Option<Renderer>,
    window: Option<Arc<Window>>,
    last_tick: Instant,
    pending_inputs: Vec<Value>,
    active_inputs: BTreeMap<String, f64>,
    script_host: Option<ProjectScriptHost>,
    random_state: u64,
    pending_events: Vec<Value>,
    pending_lifecycle: Vec<Value>,
    physics_contacts: Vec<Value>,
    render_snapshot: Option<Value>,
    audio: Option<AudioRuntime>,
    cursor_position: [f64; 2],
    pointer_action: Option<String>,
    smoke_frames: Option<u32>,
    frames_presented: u32,
    window_started_at: Instant,
    fatal_error: Option<String>,
    smoke_capture: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy)]
struct AudioBusState {
    volume: f32,
    muted: bool,
}

struct AudioInstance {
    bus_id: String,
    base_volume: f32,
    sink: Sink,
}

struct AudioRuntime {
    _stream: OutputStream,
    instances: BTreeMap<String, AudioInstance>,
    buses: BTreeMap<String, AudioBusState>,
}

impl AudioRuntime {
    fn new(configured_buses: &[AudioBusConfig]) -> Result<Self, String> {
        let mut stream = OutputStreamBuilder::open_default_stream()
            .map_err(|error| format!("default audio device is unavailable: {error}"))?;
        stream.log_on_drop(false);
        let mut buses = BTreeMap::from([(
            "audio:bus/master".to_owned(),
            AudioBusState {
                volume: 1.0,
                muted: false,
            },
        )]);
        for bus in configured_buses {
            buses.insert(
                bus.id.clone(),
                AudioBusState {
                    volume: bus.volume.clamp(0.0, 1.0),
                    muted: bus.muted,
                },
            );
        }
        Ok(Self {
            _stream: stream,
            instances: BTreeMap::new(),
            buses,
        })
    }

    fn effective_volume(&self, bus_id: &str, base_volume: f32) -> f32 {
        let bus = self.buses.get(bus_id).copied().unwrap_or(AudioBusState {
            volume: 1.0,
            muted: false,
        });
        if bus.muted {
            0.0
        } else {
            base_volume.clamp(0.0, 1.0) * bus.volume.clamp(0.0, 1.0)
        }
    }

    fn refresh_bus(&mut self, bus_id: &str) {
        let bus = self.buses.get(bus_id).copied().unwrap_or(AudioBusState {
            volume: 1.0,
            muted: false,
        });
        for instance in self
            .instances
            .values_mut()
            .filter(|instance| instance.bus_id == bus_id)
        {
            let volume = if bus.muted {
                0.0
            } else {
                instance.base_volume.clamp(0.0, 1.0) * bus.volume.clamp(0.0, 1.0)
            };
            instance.sink.set_volume(volume);
        }
    }

    fn handle(&mut self, events: &[Value], asset_root: &Path) -> Result<(), String> {
        self.instances.retain(|_, instance| !instance.sink.empty());
        for event in events {
            let payload = event
                .get("payload")
                .ok_or_else(|| "audio event omitted payload".to_owned())?;
            let action = payload
                .get("action")
                .and_then(Value::as_str)
                .ok_or_else(|| "audio event omitted action".to_owned())?;
            let bus_id = payload
                .get("busId")
                .and_then(Value::as_str)
                .unwrap_or("audio:bus/master");
            match action {
                "play" => {
                    let instance_id = payload
                        .get("instanceId")
                        .and_then(Value::as_str)
                        .ok_or_else(|| "audio play event omitted instanceId".to_owned())?;
                    let project_path = payload
                        .pointer("/clip/projectPath")
                        .and_then(Value::as_str)
                        .ok_or_else(|| "audio play event omitted clip.projectPath".to_owned())?;
                    let candidate = asset_root.join(project_path);
                    let canonical_root = asset_root
                        .canonicalize()
                        .map_err(|error| format!("asset root is unavailable: {error}"))?;
                    let canonical_path = candidate.canonicalize().map_err(|error| {
                        format!("audio clip {} is unavailable: {error}", candidate.display())
                    })?;
                    if !canonical_path.starts_with(canonical_root) {
                        return Err(format!("audio clip escapes package root: {project_path}"));
                    }
                    let source = fs::File::open(&canonical_path).map_err(|error| {
                        format!("failed to open audio {}: {error}", canonical_path.display())
                    })?;
                    let decoder = Decoder::try_from(source).map_err(|error| {
                        format!(
                            "failed to decode audio {}: {error}",
                            canonical_path.display()
                        )
                    })?;
                    let sink = Sink::connect_new(self._stream.mixer());
                    if payload.get("loop").and_then(Value::as_bool) == Some(true) {
                        sink.append(decoder.repeat_infinite());
                    } else {
                        sink.append(decoder);
                    }
                    let base_volume =
                        payload.get("volume").and_then(Value::as_f64).unwrap_or(1.0) as f32;
                    sink.set_volume(self.effective_volume(bus_id, base_volume));
                    if let Some(previous) = self.instances.insert(
                        instance_id.to_owned(),
                        AudioInstance {
                            bus_id: bus_id.to_owned(),
                            base_volume,
                            sink,
                        },
                    ) {
                        previous.sink.stop();
                    }
                }
                "stop" => {
                    if let Some(instance_id) = payload.get("instanceId").and_then(Value::as_str)
                        && let Some(instance) = self.instances.remove(instance_id)
                    {
                        instance.sink.stop();
                    }
                }
                "pause" => {
                    if let Some(instance) = payload
                        .get("instanceId")
                        .and_then(Value::as_str)
                        .and_then(|id| self.instances.get(id))
                    {
                        instance.sink.pause();
                    }
                }
                "resume" => {
                    if let Some(instance) = payload
                        .get("instanceId")
                        .and_then(Value::as_str)
                        .and_then(|id| self.instances.get(id))
                    {
                        instance.sink.play();
                    }
                }
                "set-volume" => {
                    let state = self
                        .buses
                        .entry(bus_id.to_owned())
                        .or_insert(AudioBusState {
                            volume: 1.0,
                            muted: false,
                        });
                    state.volume =
                        payload.get("volume").and_then(Value::as_f64).unwrap_or(1.0) as f32;
                    self.refresh_bus(bus_id);
                }
                "set-muted" => {
                    let state = self
                        .buses
                        .entry(bus_id.to_owned())
                        .or_insert(AudioBusState {
                            volume: 1.0,
                            muted: false,
                        });
                    state.muted = payload.get("muted").and_then(Value::as_bool) == Some(true);
                    self.refresh_bus(bus_id);
                }
                other => return Err(format!("unsupported audio action: {other}")),
            }
        }
        Ok(())
    }
}

impl PlayerApp {
    fn new(package: PlayerPackage, asset_root: PathBuf) -> Self {
        let active_scene = package
            .entry_scene
            .clone()
            .unwrap_or_else(|| "scene:active".to_owned());
        Self {
            scene: package.scene.clone(),
            active_scene,
            tick: 0,
            started: false,
            package,
            asset_root,
            renderer: None,
            window: None,
            last_tick: Instant::now(),
            pending_inputs: Vec::new(),
            active_inputs: BTreeMap::new(),
            script_host: None,
            random_state: 20_260_902,
            pending_events: Vec::new(),
            pending_lifecycle: Vec::new(),
            physics_contacts: Vec::new(),
            render_snapshot: None,
            audio: None,
            cursor_position: [0.0, 0.0],
            pointer_action: None,
            smoke_frames: None,
            frames_presented: 0,
            window_started_at: Instant::now(),
            fatal_error: None,
            smoke_capture: None,
        }
    }

    fn action_for_key(&self, key: KeyCode) -> Option<String> {
        let physical = match key {
            KeyCode::ArrowUp => "ArrowUp",
            KeyCode::ArrowDown => "ArrowDown",
            KeyCode::ArrowLeft => "ArrowLeft",
            KeyCode::ArrowRight => "ArrowRight",
            KeyCode::KeyW => "KeyW",
            KeyCode::KeyA => "KeyA",
            KeyCode::KeyS => "KeyS",
            KeyCode::KeyD => "KeyD",
            KeyCode::KeyB => "KeyB",
            KeyCode::KeyC => "KeyC",
            KeyCode::KeyE => "KeyE",
            KeyCode::KeyF => "KeyF",
            KeyCode::KeyG => "KeyG",
            KeyCode::KeyH => "KeyH",
            KeyCode::KeyI => "KeyI",
            KeyCode::KeyJ => "KeyJ",
            KeyCode::KeyK => "KeyK",
            KeyCode::KeyL => "KeyL",
            KeyCode::KeyM => "KeyM",
            KeyCode::KeyN => "KeyN",
            KeyCode::KeyO => "KeyO",
            KeyCode::KeyP => "KeyP",
            KeyCode::KeyQ => "KeyQ",
            KeyCode::KeyR => "KeyR",
            KeyCode::KeyT => "KeyT",
            KeyCode::KeyU => "KeyU",
            KeyCode::KeyV => "KeyV",
            KeyCode::KeyX => "KeyX",
            KeyCode::KeyY => "KeyY",
            KeyCode::KeyZ => "KeyZ",
            KeyCode::Digit0 => "Digit0",
            KeyCode::Digit1 => "Digit1",
            KeyCode::Digit2 => "Digit2",
            KeyCode::Digit3 => "Digit3",
            KeyCode::Digit4 => "Digit4",
            KeyCode::Digit5 => "Digit5",
            KeyCode::Digit6 => "Digit6",
            KeyCode::Digit7 => "Digit7",
            KeyCode::Digit8 => "Digit8",
            KeyCode::Digit9 => "Digit9",
            KeyCode::BracketLeft => "BracketLeft",
            KeyCode::BracketRight => "BracketRight",
            KeyCode::Tab => "Tab",
            KeyCode::Backspace => "Backspace",
            KeyCode::ShiftLeft => "ShiftLeft",
            KeyCode::ShiftRight => "ShiftRight",
            KeyCode::ControlLeft => "ControlLeft",
            KeyCode::ControlRight => "ControlRight",
            KeyCode::AltLeft => "AltLeft",
            KeyCode::AltRight => "AltRight",
            KeyCode::Minus => "Minus",
            KeyCode::Equal => "Equal",
            KeyCode::Enter => "Enter",
            KeyCode::Space => "Space",
            KeyCode::Escape => "Escape",
            _ => return None,
        };
        self.package
            .input_actions
            .iter()
            .find(|action| action.keys.iter().any(|candidate| candidate == physical))
            .map(|action| action.id.clone())
            .or_else(|| Some(format!("input:{physical}")))
    }

    fn action_for_pointer(&self, binding: &str) -> String {
        self.package
            .input_actions
            .iter()
            .find(|action| action.keys.iter().any(|candidate| candidate == binding))
            .map_or_else(|| format!("input:{binding}"), |action| action.id.clone())
    }

    fn step(&mut self) -> Result<(), String> {
        let runtime = &self.package.runtime;
        let frame_inputs =
            collect_frame_inputs(&mut self.pending_inputs, &self.active_inputs, self.tick);
        let request = json!({
            "scene": self.scene,
            "scenes": self.package.scenes,
            "prefabs": self.package.prefabs,
            "activeScene": self.active_scene,
            "manifest": runtime.manifest,
            "modules": runtime.modules,
            "assets": self.package.assets,
            "tickRate": runtime.tick_rate,
            "ticks": 1,
            "startTick": self.tick,
            "started": self.started,
            "seed": 20_260_902,
            "randomState": self.random_state,
            "pendingEvents": self.pending_events,
            "pendingLifecycle": self.pending_lifecycle,
            "physicsContacts": self.physics_contacts,
            "sessionId": "session:standalone-player",
            "generation": 1,
            "sequence": self.tick,
            "commands": [],
            "inputs": frame_inputs,
            "controls": [],
            "breakpoints": [],
            "watches": [],
        });
        if self.script_host.is_none() {
            self.script_host = Some(
                ProjectScriptHost::new(ScriptHostLimits {
                    memory_bytes: runtime.memory_bytes,
                    stack_bytes: runtime.stack_bytes,
                })
                .map_err(|error| error.to_string())?,
            );
        }
        let result = self
            .script_host
            .as_ref()
            .ok_or_else(|| "script host was not initialized".to_owned())?
            .run(&request)
            .map_err(|error| error.to_string())?;
        if result.get("status").and_then(Value::as_str) != Some("completed") {
            return Err(format!(
                "runtime Tick {} did not complete: {}",
                self.tick,
                result.get("diagnostics").unwrap_or(&Value::Null)
            ));
        }
        self.scene = result
            .get("scene")
            .cloned()
            .ok_or_else(|| "script result omitted scene".to_owned())?;
        if let Some(active_scene) = result.get("activeScene").and_then(Value::as_str) {
            active_scene.clone_into(&mut self.active_scene);
        }
        self.tick = result
            .get("tick")
            .and_then(Value::as_u64)
            .unwrap_or(self.tick.saturating_add(1));
        self.random_state = result
            .get("randomState")
            .and_then(Value::as_u64)
            .unwrap_or(self.random_state);
        self.pending_events = result
            .get("pendingEvents")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        self.physics_contacts = result
            .get("physicsContacts")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        self.pending_lifecycle = result
            .get("pendingLifecycle")
            .and_then(Value::as_array)
            .cloned()
            .ok_or_else(|| "script result omitted pendingLifecycle".to_owned())?;
        self.render_snapshot = result.get("renderSnapshot").cloned();
        let audio_events = result
            .get("audioEvents")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if !audio_events.is_empty() {
            if self.audio.is_none() {
                self.audio = Some(AudioRuntime::new(&self.package.audio_buses)?);
            }
            self.audio
                .as_mut()
                .ok_or_else(|| "audio runtime was not initialized".to_owned())?
                .handle(&audio_events, &self.asset_root)?;
        }
        self.started = true;
        Ok(())
    }
}

impl ApplicationHandler for PlayerApp {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_some() {
            return;
        }
        let attributes = Window::default_attributes()
            .with_title(self.package.project.name.clone())
            .with_inner_size(LogicalSize::new(1280.0, 720.0))
            .with_min_inner_size(LogicalSize::new(640.0, 360.0));
        let window = match event_loop.create_window(attributes) {
            Ok(window) => Arc::new(window),
            Err(error) => {
                self.fatal_error = Some(format!("window creation failed: {error}"));
                event_loop.exit();
                return;
            }
        };
        match pollster::block_on(Renderer::new(
            event_loop.owned_display_handle(),
            window.clone(),
            self.smoke_capture.is_some(),
        )) {
            Ok(renderer) => {
                self.renderer = Some(renderer);
                self.window = Some(window);
            }
            Err(error) => {
                self.fatal_error = Some(error);
                event_loop.exit();
            }
        }
    }

    fn window_event(
        &mut self,
        event_loop: &ActiveEventLoop,
        _window_id: WindowId,
        event: WindowEvent,
    ) {
        match event {
            WindowEvent::CloseRequested => event_loop.exit(),
            WindowEvent::Resized(size) => {
                if let Some(renderer) = &mut self.renderer {
                    renderer.resize(size);
                }
            }
            WindowEvent::KeyboardInput { event, .. } => {
                let PhysicalKey::Code(key) = event.physical_key else {
                    return;
                };
                if key == KeyCode::KeyQ
                    && event.state == ElementState::Pressed
                    && !self
                        .package
                        .input_actions
                        .iter()
                        .any(|action| action.keys.iter().any(|binding| binding == "KeyQ"))
                {
                    event_loop.exit();
                    return;
                }
                let Some(action) = self.action_for_key(key) else {
                    return;
                };
                match event.state {
                    ElementState::Pressed if !event.repeat => {
                        self.active_inputs.insert(action.clone(), 1.0);
                        self.pending_inputs.push(json!({
                            "tick": self.tick,
                            "action": action,
                            "value": 1.0
                        }));
                    }
                    ElementState::Released => {
                        self.active_inputs.remove(&action);
                        self.pending_inputs.push(json!({
                            "tick": self.tick,
                            "action": action,
                            "value": 0.0
                        }));
                    }
                    _ => {}
                }
            }
            WindowEvent::CursorMoved { position, .. } => {
                self.cursor_position = [position.x, position.y];
            }
            WindowEvent::MouseInput {
                state,
                button: MouseButton::Left,
                ..
            } => {
                let action = if state == ElementState::Pressed {
                    self.render_snapshot
                        .as_ref()
                        .and_then(|snapshot| {
                            let size = self
                                .window
                                .as_ref()
                                .map_or(PhysicalSize::new(1280, 720), |window| window.inner_size());
                            snapshot_ui_action(snapshot, self.cursor_position, size)
                        })
                        .or_else(|| Some(self.action_for_pointer("Mouse0")))
                } else {
                    self.pointer_action.take()
                };
                if let Some(action) = action {
                    let value = if state == ElementState::Pressed {
                        self.pointer_action = Some(action.clone());
                        1.0
                    } else {
                        0.0
                    };
                    self.pending_inputs.push(json!({
                        "tick": self.tick,
                        "action": action,
                        "value": value
                    }));
                }
            }
            WindowEvent::RedrawRequested => {
                let items = self.render_snapshot.as_ref().map_or_else(
                    || {
                        scene_primitives(&self.scene)
                            .into_iter()
                            .map(RenderItem::Primitive)
                            .collect()
                    },
                    snapshot_render_items,
                );
                if let Some(renderer) = &mut self.renderer {
                    let camera = self.render_snapshot.as_ref().map_or_else(
                        || scene_camera(&self.scene, renderer.config.width, renderer.config.height),
                        |snapshot| {
                            snapshot_camera(snapshot, renderer.config.width, renderer.config.height)
                        },
                    );
                    let scene3d = self.render_snapshot.as_ref().map_or_else(
                        default_scene3d_uniform,
                        |snapshot| {
                            snapshot_scene3d(
                                snapshot,
                                renderer.config.width,
                                renderer.config.height,
                            )
                        },
                    );
                    let capture = (self.started
                        && self
                            .smoke_frames
                            .is_some_and(|limit| self.frames_presented + 1 >= limit))
                    .then_some(self.smoke_capture.as_deref())
                    .flatten();
                    match renderer.render(&items, camera, scene3d, &self.asset_root, capture) {
                        Ok(true) if self.started => {
                            self.frames_presented = self.frames_presented.saturating_add(1);
                            if self
                                .smoke_frames
                                .is_some_and(|limit| self.frames_presented >= limit)
                            {
                                event_loop.exit();
                            }
                        }
                        Ok(_) => {}
                        Err(error) => {
                            self.fatal_error = Some(error);
                            event_loop.exit();
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        if self.smoke_frames.is_some() && self.window_started_at.elapsed() > Duration::from_secs(30)
        {
            self.fatal_error =
                Some("window smoke timed out before presenting required frames".to_owned());
            event_loop.exit();
            return;
        }
        let interval =
            Duration::from_secs_f64(1.0 / f64::from(self.package.runtime.tick_rate.clamp(1, 240)));
        if self.last_tick.elapsed() >= interval.max(TICK_INTERVAL) {
            if let Err(error) = self.step() {
                self.fatal_error = Some(format!("script runtime failed: {error}"));
                event_loop.exit();
                return;
            }
            self.last_tick = Instant::now();
            if let Some(window) = &self.window {
                window.request_redraw();
            }
        }
    }
}

fn collect_frame_inputs(
    pending_inputs: &mut Vec<Value>,
    active_inputs: &BTreeMap<String, f64>,
    tick: u64,
) -> Vec<Value> {
    let mut frame_inputs = pending_inputs
        .drain(..)
        .map(|mut input| {
            input["tick"] = json!(tick);
            input
        })
        .collect::<Vec<_>>();
    let changed_actions = frame_inputs
        .iter()
        .filter_map(|input| input.get("action").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<BTreeSet<_>>();
    frame_inputs.extend(
        active_inputs
            .iter()
            .filter(|(action, _)| !changed_actions.contains(action.as_str()))
            .map(|(action, value)| {
                json!({
                    "tick": tick,
                    "action": action,
                    "value": value
                })
            }),
    );
    frame_inputs
}

fn snapshot_ui_action(
    snapshot: &Value,
    cursor: [f64; 2],
    viewport: PhysicalSize<u32>,
) -> Option<String> {
    let logical = [
        cursor[0] * 1280.0 / f64::from(viewport.width.max(1)),
        720.0 - cursor[1] * 720.0 / f64::from(viewport.height.max(1)),
    ];
    let mut candidates = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)?
        .iter()
        .filter(|drawable| {
            drawable.get("space").and_then(Value::as_str) == Some("ui")
                && drawable.get("visible").and_then(Value::as_bool) != Some(false)
                && drawable
                    .get("inputAction")
                    .and_then(Value::as_str)
                    .is_some()
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .get("layer")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .total_cmp(&left.get("layer").and_then(Value::as_f64).unwrap_or(0.0))
    });
    candidates.into_iter().find_map(|drawable| {
        let position = snapshot_vector2(drawable.pointer("/transform2d/position"), [0.0, 0.0]);
        let size = snapshot_vector2(drawable.get("size"), [1.0, 1.0]);
        let pivot = snapshot_vector2(drawable.get("pivot"), [0.5, 0.5]);
        let left = f64::from(position[0] - size[0] * pivot[0]);
        let bottom = f64::from(position[1] - size[1] * pivot[1]);
        let right = left + f64::from(size[0]);
        let top = bottom + f64::from(size[1]);
        (logical[0] >= left && logical[0] <= right && logical[1] >= bottom && logical[1] <= top)
            .then(|| {
                drawable
                    .get("inputAction")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned()
            })
    })
}

fn component<'a>(object: &'a Value, component_type: &str) -> Option<&'a Value> {
    object
        .get("components")?
        .as_array()?
        .iter()
        .find(|candidate| candidate.get("type").and_then(Value::as_str) == Some(component_type))
        .and_then(|candidate| candidate.get("data"))
}

#[allow(clippy::cast_possible_truncation)]
fn number(value: Option<&Value>, fallback: f32) -> f32 {
    value
        .and_then(Value::as_f64)
        .map_or(fallback, |value| value as f32)
}

fn vector2(value: Option<&Value>, fallback: [f32; 2]) -> [f32; 2] {
    let Some(value) = value else { return fallback };
    [
        number(value.get("x"), fallback[0]),
        number(value.get("y"), fallback[1]),
    ]
}

fn color(value: Option<&str>) -> [f32; 4] {
    let source = value.unwrap_or("#49cddd").trim_start_matches('#');
    if source.len() != 6 && source.len() != 8 {
        return [0.286, 0.804, 0.867, 1.0];
    }
    let byte = |index| u8::from_str_radix(&source[index..index + 2], 16).unwrap_or(128);
    [
        f32::from(byte(0)) / 255.0,
        f32::from(byte(2)) / 255.0,
        f32::from(byte(4)) / 255.0,
        if source.len() == 8 {
            f32::from(byte(6)) / 255.0
        } else {
            1.0
        },
    ]
}

fn glyph_rows(character: char) -> [u8; 7] {
    match character.to_ascii_uppercase() {
        'A' => [14, 17, 17, 31, 17, 17, 17],
        'B' => [30, 17, 17, 30, 17, 17, 30],
        'C' => [14, 17, 16, 16, 16, 17, 14],
        'D' => [30, 17, 17, 17, 17, 17, 30],
        'E' => [31, 16, 16, 30, 16, 16, 31],
        'F' => [31, 16, 16, 30, 16, 16, 16],
        'G' => [14, 17, 16, 23, 17, 17, 15],
        'H' => [17, 17, 17, 31, 17, 17, 17],
        'I' => [14, 4, 4, 4, 4, 4, 14],
        'J' => [7, 2, 2, 2, 18, 18, 12],
        'K' => [17, 18, 20, 24, 20, 18, 17],
        'L' => [16, 16, 16, 16, 16, 16, 31],
        'M' => [17, 27, 21, 21, 17, 17, 17],
        'N' => [17, 25, 21, 19, 17, 17, 17],
        'O' => [14, 17, 17, 17, 17, 17, 14],
        'P' => [30, 17, 17, 30, 16, 16, 16],
        'Q' => [14, 17, 17, 17, 21, 18, 13],
        'R' => [30, 17, 17, 30, 20, 18, 17],
        'S' => [15, 16, 16, 14, 1, 1, 30],
        'T' => [31, 4, 4, 4, 4, 4, 4],
        'U' => [17, 17, 17, 17, 17, 17, 14],
        'V' => [17, 17, 17, 17, 17, 10, 4],
        'W' => [17, 17, 17, 21, 21, 21, 10],
        'X' => [17, 17, 10, 4, 10, 17, 17],
        'Y' => [17, 17, 10, 4, 4, 4, 4],
        'Z' => [31, 1, 2, 4, 8, 16, 31],
        '0' => [14, 17, 19, 21, 25, 17, 14],
        '1' => [4, 12, 4, 4, 4, 4, 14],
        '2' => [14, 17, 1, 2, 4, 8, 31],
        '3' => [30, 1, 1, 14, 1, 1, 30],
        '4' => [2, 6, 10, 18, 31, 2, 2],
        '5' => [31, 16, 16, 30, 1, 1, 30],
        '6' => [14, 16, 16, 30, 17, 17, 14],
        '7' => [31, 1, 2, 4, 8, 8, 8],
        '8' => [14, 17, 17, 14, 17, 17, 14],
        '9' => [14, 17, 17, 15, 1, 1, 14],
        ':' => [0, 4, 4, 0, 4, 4, 0],
        '-' => [0, 0, 0, 31, 0, 0, 0],
        '.' => [0, 0, 0, 0, 0, 12, 12],
        '!' => [4, 4, 4, 4, 4, 0, 4],
        '/' => [1, 2, 2, 4, 8, 8, 16],
        '%' => [24, 25, 2, 4, 8, 19, 3],
        '[' => [14, 8, 8, 8, 8, 8, 14],
        ']' => [14, 2, 2, 2, 2, 2, 14],
        ' ' => [0; 7],
        _ => [14, 17, 1, 2, 4, 0, 4],
    }
}

fn push_bitmap_text(
    result: &mut Vec<GpuPrimitive>,
    text: &str,
    position: [f32; 2],
    font_size: f32,
    text_color: [f32; 4],
    align: &str,
    layer: f32,
) {
    let cell = font_size.abs().max(0.1) / 7.0;
    for (line_index, line) in text.lines().enumerate() {
        let width = line.chars().count() as f32 * cell * 6.0 - cell;
        let origin_x = match align {
            "center" => position[0] - width / 2.0,
            "right" => position[0] - width,
            _ => position[0],
        };
        let origin_y = position[1] + font_size.abs() / 2.0 - cell - line_index as f32 * cell * 9.0;
        for (character_index, character) in line.chars().enumerate() {
            for (row, bits) in glyph_rows(character).iter().enumerate() {
                for column in 0..5_u8 {
                    if bits & (1 << (4 - column)) == 0 {
                        continue;
                    }
                    result.push(GpuPrimitive {
                        position: [
                            origin_x
                                + character_index as f32 * cell * 6.0
                                + f32::from(column) * cell,
                            origin_y - row as f32 * cell,
                        ],
                        size: [cell * 0.86, cell * 0.86],
                        layer,
                        color: text_color,
                    });
                }
            }
        }
    }
}

fn snapshot_color(value: Option<&Value>) -> [f32; 4] {
    let Some(items) = value.and_then(Value::as_array) else {
        return [0.55, 0.65, 0.72, 1.0];
    };
    let mut output = [0.55, 0.65, 0.72, 1.0];
    for (index, channel) in items.iter().take(4).enumerate() {
        output[index] = channel.as_f64().unwrap_or(f64::from(output[index])) as f32;
    }
    output
}

fn snapshot_vector2(value: Option<&Value>, fallback: [f32; 2]) -> [f32; 2] {
    let Some(items) = value.and_then(Value::as_array) else {
        return fallback;
    };
    [
        items
            .first()
            .and_then(Value::as_f64)
            .map_or(fallback[0], |value| value as f32),
        items
            .get(1)
            .and_then(Value::as_f64)
            .map_or(fallback[1], |value| value as f32),
    ]
}

fn snapshot_vector3(value: Option<&Value>, fallback: [f32; 3]) -> [f32; 3] {
    let Some(items) = value.and_then(Value::as_array) else {
        return fallback;
    };
    [
        items
            .first()
            .and_then(Value::as_f64)
            .map_or(fallback[0], |value| value as f32),
        items
            .get(1)
            .and_then(Value::as_f64)
            .map_or(fallback[1], |value| value as f32),
        items
            .get(2)
            .and_then(Value::as_f64)
            .map_or(fallback[2], |value| value as f32),
    ]
}

fn snapshot_quaternion(value: Option<&Value>) -> Quat {
    let Some(items) = value.and_then(Value::as_array) else {
        return Quat::IDENTITY;
    };
    let quaternion = Quat::from_xyzw(
        items.first().and_then(Value::as_f64).unwrap_or(0.0) as f32,
        items.get(1).and_then(Value::as_f64).unwrap_or(0.0) as f32,
        items.get(2).and_then(Value::as_f64).unwrap_or(0.0) as f32,
        items.get(3).and_then(Value::as_f64).unwrap_or(1.0) as f32,
    );
    if quaternion.is_finite() && quaternion.length_squared() > f32::EPSILON {
        quaternion.normalize()
    } else {
        Quat::IDENTITY
    }
}

fn snapshot_camera(snapshot: &Value, viewport_width: u32, viewport_height: u32) -> CameraUniform {
    let cameras = snapshot
        .pointer("/payload/cameras")
        .and_then(Value::as_array);
    let camera = cameras.and_then(|items| {
        items
            .iter()
            .find(|item| item.get("primary").and_then(Value::as_bool) == Some(true))
            .or_else(|| items.first())
    });
    let center = snapshot_vector2(
        camera.and_then(|value| value.pointer("/transform2d/position")),
        [16.0, 9.0],
    );
    let height = camera
        .and_then(|value| value.get("orthographicHeight"))
        .and_then(Value::as_f64)
        .map_or(18.0, |value| value as f32)
        .abs()
        .max(0.01);
    let viewport_aspect = viewport_width.max(1) as f32 / viewport_height.max(1) as f32;
    let width = height * viewport_aspect;
    CameraUniform {
        origin: [center[0] - width / 2.0, center[1] - height / 2.0],
        extent: [width, height],
    }
}

fn snapshot_scene3d(snapshot: &Value, viewport_width: u32, viewport_height: u32) -> Scene3DUniform {
    let camera = snapshot
        .pointer("/payload/cameras")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| {
                    item.get("space").and_then(Value::as_str) == Some("3d")
                        && item.get("primary").and_then(Value::as_bool) == Some(true)
                })
                .or_else(|| {
                    items
                        .iter()
                        .find(|item| item.get("space").and_then(Value::as_str) == Some("3d"))
                })
        });
    let position = snapshot_vector3(
        camera.and_then(|value| value.pointer("/transform3d/position")),
        [0.0, 6.0, 12.0],
    );
    let rotation =
        snapshot_quaternion(camera.and_then(|value| value.pointer("/transform3d/rotation")));
    let eye = Vec3::from_array(position);
    let direction = rotation * Vec3::NEG_Z;
    let up = rotation * Vec3::Y;
    let view = glam::camera::rh::view::look_to_mat4(eye, direction, up);
    let fov = camera
        .and_then(|value| value.get("verticalFovRadians"))
        .and_then(Value::as_f64)
        .unwrap_or(std::f64::consts::FRAC_PI_3) as f32;
    let near = camera
        .and_then(|value| value.get("near"))
        .and_then(Value::as_f64)
        .unwrap_or(0.1) as f32;
    let far = camera
        .and_then(|value| value.get("far"))
        .and_then(Value::as_f64)
        .unwrap_or(1_000.0) as f32;
    let aspect = viewport_width.max(1) as f32 / viewport_height.max(1) as f32;
    let projection = glam::camera::rh::proj::directx::perspective(fov, aspect, near, far);
    let light = snapshot
        .pointer("/payload/lights")
        .and_then(Value::as_array)
        .and_then(|items| items.first());
    let direction = Vec3::from_array(snapshot_vector3(
        light.and_then(|value| value.get("direction")),
        [0.35, -1.0, 0.25],
    ))
    .normalize_or(Vec3::new(0.35, -1.0, 0.25).normalize());
    let color = snapshot_color(light.and_then(|value| value.get("color")));
    let intensity = light
        .and_then(|value| value.get("intensity"))
        .and_then(Value::as_f64)
        .unwrap_or(1.0) as f32;
    Scene3DUniform {
        view_projection: (projection * view).to_cols_array_2d(),
        light_direction: [direction.x, direction.y, direction.z, 0.0],
        light_color: color,
        ambient_and_intensity: [0.22, intensity.max(0.0), 0.0, 0.0],
    }
}

fn snapshot_primitives(snapshot: &Value) -> Vec<GpuPrimitive> {
    let mut result = Vec::new();
    let Some(drawables) = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)
    else {
        return result;
    };
    for drawable in drawables {
        if drawable.get("visible").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        if drawable.get("space").and_then(Value::as_str) == Some("ui") {
            continue;
        }
        let layer = drawable.get("layer").and_then(Value::as_f64).unwrap_or(0.0) as f32;
        let tint = snapshot_color(drawable.get("tint"));
        if drawable.get("space").and_then(Value::as_str) == Some("3d") {
            continue;
        }
        let position = snapshot_vector2(drawable.pointer("/transform2d/position"), [0.0, 0.0]);
        let scale = snapshot_vector2(drawable.pointer("/transform2d/scale"), [1.0, 1.0]);
        let size = snapshot_vector2(drawable.get("size"), [1.0, 1.0]);
        let actual = [size[0] * scale[0].abs(), size[1] * scale[1].abs()];
        match drawable.get("primitive").and_then(Value::as_str) {
            Some("text2d" | "ui-text") => push_bitmap_text(
                &mut result,
                drawable.get("text").and_then(Value::as_str).unwrap_or(""),
                position,
                size[0].abs().max(0.1),
                tint,
                "center",
                layer,
            ),
            Some("sprite2d" | "ui-image") => {}
            _ => result.push(GpuPrimitive {
                position: [position[0] - actual[0] / 2.0, position[1] - actual[1] / 2.0],
                size: actual,
                layer,
                color: tint,
            }),
        }
    }
    result.sort_by(|left, right| left.layer.total_cmp(&right.layer));
    result
}

fn snapshot_render_items(snapshot: &Value) -> Vec<RenderItem> {
    let mut result = snapshot_primitives(snapshot)
        .into_iter()
        .map(RenderItem::Primitive)
        .collect::<Vec<_>>();
    let Some(drawables) = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)
    else {
        return result;
    };
    for drawable in drawables {
        if drawable.get("visible").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        if drawable.get("primitive").and_then(Value::as_str) == Some("mesh3d") {
            let position = Vec3::from_array(snapshot_vector3(
                drawable.pointer("/transform3d/position"),
                [0.0, 0.0, 0.0],
            ));
            let rotation = snapshot_quaternion(drawable.pointer("/transform3d/rotation"));
            let scale = Vec3::from_array(snapshot_vector3(
                drawable.pointer("/transform3d/scale"),
                [1.0, 1.0, 1.0],
            ));
            let project_path = drawable
                .pointer("/asset/projectPath")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let cache_key = drawable
                .pointer("/asset/derivedHash")
                .or_else(|| drawable.pointer("/asset/sourceHash"))
                .and_then(Value::as_str)
                .map_or_else(
                    || {
                        project_path
                            .clone()
                            .unwrap_or_else(|| "primitive:cube".to_owned())
                    },
                    str::to_owned,
                );
            let texture_project_path = drawable
                .pointer("/texture/projectPath")
                .and_then(Value::as_str)
                .map(str::to_owned);
            let texture_cache_key = drawable
                .pointer("/texture/derivedHash")
                .or_else(|| drawable.pointer("/texture/sourceHash"))
                .and_then(Value::as_str)
                .map(str::to_owned)
                .or_else(|| texture_project_path.clone());
            result.push(RenderItem::Mesh3D(MeshDraw {
                gpu: GpuMesh3D {
                    model: Mat4::from_scale_rotation_translation(scale, rotation, position)
                        .to_cols_array_2d(),
                    color: snapshot_color(drawable.get("tint")),
                },
                project_path,
                cache_key,
                texture_project_path,
                texture_cache_key,
            }));
            continue;
        }
        let screen_space = drawable.get("space").and_then(Value::as_str) == Some("ui");
        if screen_space
            && !matches!(
                drawable.get("primitive").and_then(Value::as_str),
                Some("sprite2d" | "ui-image")
            )
        {
            let position =
                snapshot_vector2(drawable.pointer("/transform2d/position"), [640.0, 360.0]);
            let scale = snapshot_vector2(drawable.pointer("/transform2d/scale"), [1.0, 1.0]);
            let size = snapshot_vector2(drawable.get("size"), [100.0, 40.0]);
            let tint = snapshot_color(drawable.get("tint"));
            let layer = drawable
                .get("layer")
                .and_then(Value::as_f64)
                .unwrap_or(10_000.0) as f32;
            if drawable.get("primitive").and_then(Value::as_str) == Some("ui-text") {
                let mut glyphs = Vec::new();
                push_bitmap_text(
                    &mut glyphs,
                    drawable.get("text").and_then(Value::as_str).unwrap_or(""),
                    position,
                    size[0].abs().max(8.0),
                    tint,
                    "center",
                    layer,
                );
                result.extend(glyphs.into_iter().map(RenderItem::UiPrimitive));
            } else {
                let actual = [size[0] * scale[0].abs(), size[1] * scale[1].abs()];
                result.push(RenderItem::UiPrimitive(GpuPrimitive {
                    position: [position[0] - actual[0] / 2.0, position[1] - actual[1] / 2.0],
                    size: actual,
                    layer,
                    color: tint,
                }));
            }
            continue;
        }
        if !matches!(
            drawable.get("primitive").and_then(Value::as_str),
            Some("sprite2d" | "ui-image")
        ) {
            continue;
        }
        let Some(asset) = drawable.get("asset") else {
            continue;
        };
        let Some(project_path) = asset.get("projectPath").and_then(Value::as_str) else {
            continue;
        };
        let cache_identity = asset
            .get("derivedHash")
            .or_else(|| asset.get("sourceHash"))
            .and_then(Value::as_str)
            .unwrap_or(project_path);
        let filter = if drawable.get("filter").and_then(Value::as_str) == Some("nearest") {
            wgpu::FilterMode::Nearest
        } else {
            wgpu::FilterMode::Linear
        };
        let position = snapshot_vector2(drawable.pointer("/transform2d/position"), [0.0, 0.0]);
        let scale = snapshot_vector2(drawable.pointer("/transform2d/scale"), [1.0, 1.0]);
        let size = snapshot_vector2(drawable.get("size"), [1.0, 1.0]);
        let pivot = snapshot_vector2(drawable.get("pivot"), [0.5, 0.5]);
        let atlas_region = drawable
            .get("atlasRegion")
            .and_then(Value::as_array)
            .filter(|values| values.len() == 4)
            .map(|values| {
                [
                    values[0].as_f64().unwrap_or(0.0) as f32,
                    values[1].as_f64().unwrap_or(0.0) as f32,
                    values[2].as_f64().unwrap_or(0.0) as f32,
                    values[3].as_f64().unwrap_or(0.0) as f32,
                ]
            });
        result.push(RenderItem::Sprite(SpriteDraw {
            gpu: GpuSprite {
                position,
                size: [size[0] * scale[0].abs(), size[1] * scale[1].abs()],
                layer: drawable.get("layer").and_then(Value::as_f64).unwrap_or(0.0) as f32,
                rotation: drawable
                    .pointer("/transform2d/rotation")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0) as f32
                    * std::f32::consts::PI
                    / 180.0,
                tint: snapshot_color(drawable.get("tint")),
                pivot,
                uv_origin: [0.0, 0.0],
                uv_size: [1.0, 1.0],
            },
            project_path: project_path.to_owned(),
            cache_key: format!("{cache_identity}:{filter:?}"),
            filter,
            atlas_region,
            screen_space,
        }));
    }
    result.sort_by(|left, right| left.layer().total_cmp(&right.layer()));
    result
}

fn scene_camera(scene: &Value, viewport_width: u32, viewport_height: u32) -> CameraUniform {
    let mut center = [0.0, 0.0];
    let mut zoom = 1.0;
    if let Some(objects) = scene.get("objects").and_then(Value::as_array)
        && let Some(camera_object) = objects.iter().find(|object| {
            component(object, "render:camera2d")
                .and_then(|camera| camera.get("primary"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
    {
        let transform = component(camera_object, "core:transform2d");
        center = vector2(transform.and_then(|value| value.get("position")), center);
        zoom = number(
            component(camera_object, "render:camera2d").and_then(|value| value.get("zoom")),
            zoom,
        )
        .abs()
        .max(0.01);
    }
    let viewport_aspect = viewport_width.max(1) as f32 / viewport_height.max(1) as f32;
    let design_aspect = 32.0 / 18.0;
    let mut extent = [32.0 / zoom, 18.0 / zoom];
    if viewport_aspect > design_aspect {
        extent[0] = extent[1] * viewport_aspect;
    } else {
        extent[1] = extent[0] / viewport_aspect;
    }
    CameraUniform {
        origin: [center[0] - extent[0] / 2.0, center[1] - extent[1] / 2.0],
        extent,
    }
}

fn scene_primitives(scene: &Value) -> Vec<GpuPrimitive> {
    let mut result = Vec::new();
    let space = scene.get("space").and_then(Value::as_str).unwrap_or("2d");
    let Some(objects) = scene.get("objects").and_then(Value::as_array) else {
        return result;
    };
    for (index, object) in objects.iter().enumerate() {
        if object.get("enabled").and_then(Value::as_bool) == Some(false)
            || object.get("visible").and_then(Value::as_bool) == Some(false)
        {
            continue;
        }
        if space == "3d" {
            // The production 3D path is the versioned RenderSnapshot consumed by
            // the perspective/depth mesh pipeline. Never draw the old isometric
            // rectangle approximation while the first runtime snapshot is pending.
            continue;
        }
        {
            let transform = component(object, "core:transform2d");
            let position = vector2(
                transform.and_then(|value| value.get("position")),
                [0.0, 0.0],
            );
            let scale = vector2(transform.and_then(|value| value.get("scale")), [1.0, 1.0]);
            let stable_layer = f32::from(u16::try_from(index).unwrap_or(u16::MAX)) * 0.01;
            if let Some(shape) = component(object, "render:shape2d") {
                let size = vector2(shape.get("size"), [1.0, 1.0]);
                let actual = [size[0] * scale[0].abs(), size[1] * scale[1].abs()];
                result.push(GpuPrimitive {
                    position: [position[0] - actual[0] / 2.0, position[1] - actual[1] / 2.0],
                    size: actual,
                    layer: stable_layer,
                    color: color(shape.get("color").and_then(Value::as_str)),
                });
            }
            if let Some(text) = component(object, "render:text2d") {
                push_bitmap_text(
                    &mut result,
                    text.get("text").and_then(Value::as_str).unwrap_or("TEXT"),
                    position,
                    number(text.get("fontSize"), 1.0) * scale[1].abs(),
                    color(text.get("color").and_then(Value::as_str)),
                    text.get("align").and_then(Value::as_str).unwrap_or("left"),
                    stable_layer + 0.001,
                );
            }
            if let Some(text) = component(object, "ui:text") {
                let ui_transform = component(object, "core:ui-transform");
                let anchor = vector2(
                    ui_transform.and_then(|value| value.get("anchor")),
                    [0.5, 0.5],
                );
                push_bitmap_text(
                    &mut result,
                    text.get("text").and_then(Value::as_str).unwrap_or("TEXT"),
                    [anchor[0] * 32.0 - 16.0, (1.0 - anchor[1]) * 18.0 - 9.0],
                    number(text.get("fontSize"), 24.0) / 40.0,
                    color(text.get("color").and_then(Value::as_str)),
                    text.get("align").and_then(Value::as_str).unwrap_or("left"),
                    stable_layer + 50.0,
                );
            }
        }
    }
    result.sort_by(|left, right| left.layer.total_cmp(&right.layer));
    result
}

fn package_path(explicit: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = explicit {
        return Ok(path.to_path_buf());
    }
    env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .map(|directory| directory.join("game/player-package.json"))
        .ok_or_else(|| "player executable has no parent directory".to_owned())
}

fn load_package(path: &Path) -> Result<PlayerPackage, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let package: PlayerPackage = serde_json::from_str(&source)
        .map_err(|error| format!("invalid player package: {error}"))?;
    if package.schema_version != "1.0.0"
        || package.kind != "ai-game-studio/player-package"
        || package.project.id.is_empty()
        || package.project.name.is_empty()
        || !matches!(
            package.scene.get("space").and_then(Value::as_str),
            Some("2d" | "3d" | "ui" | "mixed")
        )
        || !package.scene.get("objects").is_some_and(Value::is_array)
    {
        return Err("unsupported or incomplete player package".to_owned());
    }
    Ok(package)
}

fn decode_sprite_image(source: &[u8], path: &Path) -> Result<(Vec<u8>, [u32; 2]), String> {
    let is_svg = path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("svg"))
        || source
            .iter()
            .copied()
            .skip_while(u8::is_ascii_whitespace)
            .take(4)
            .eq(b"<svg".iter().copied());
    if is_svg {
        let options = resvg::usvg::Options {
            resources_dir: path.parent().map(Path::to_path_buf),
            ..resvg::usvg::Options::default()
        };
        let tree = resvg::usvg::Tree::from_data(source, &options)
            .map_err(|error| format!("failed to parse SVG sprite {}: {error}", path.display()))?;
        let size = tree.size().to_int_size();
        let mut pixmap = resvg::tiny_skia::Pixmap::new(size.width(), size.height())
            .ok_or_else(|| format!("SVG sprite has invalid dimensions: {}", path.display()))?;
        resvg::render(
            &tree,
            resvg::tiny_skia::Transform::default(),
            &mut pixmap.as_mut(),
        );
        return Ok((pixmap.data().to_vec(), [pixmap.width(), pixmap.height()]));
    }
    let decoded = image::load_from_memory(source)
        .map_err(|error| format!("failed to decode sprite {}: {error}", path.display()))?
        .to_rgba8();
    let dimensions = [decoded.width(), decoded.height()];
    Ok((decoded.into_raw(), dimensions))
}

fn validate_snapshot_images(snapshot: &Value, asset_root: &Path) -> Result<usize, String> {
    let canonical_root = asset_root
        .canonicalize()
        .map_err(|error| format!("asset root is unavailable: {error}"))?;
    let paths = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|drawable| {
            let image_asset = matches!(
                drawable.get("primitive").and_then(Value::as_str),
                Some("sprite2d" | "ui-image")
            )
            .then(|| {
                drawable
                    .pointer("/asset/projectPath")
                    .and_then(Value::as_str)
            })
            .flatten();
            [
                image_asset,
                drawable
                    .pointer("/texture/projectPath")
                    .and_then(Value::as_str),
            ]
            .into_iter()
            .flatten()
        })
        .collect::<BTreeSet<_>>();
    for project_path in &paths {
        let candidate = asset_root.join(project_path);
        let canonical_path = candidate.canonicalize().map_err(|error| {
            format!(
                "sprite asset {} is unavailable: {error}",
                candidate.display()
            )
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(format!("sprite asset escapes package root: {project_path}"));
        }
        let source = fs::read(&canonical_path).map_err(|error| {
            format!(
                "failed to read sprite {}: {error}",
                canonical_path.display()
            )
        })?;
        decode_sprite_image(&source, &canonical_path)?;
    }
    Ok(paths.len())
}

fn validate_snapshot_meshes(snapshot: &Value, asset_root: &Path) -> Result<usize, String> {
    let canonical_root = asset_root
        .canonicalize()
        .map_err(|error| format!("asset root is unavailable: {error}"))?;
    let paths = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|drawable| {
            drawable
                .pointer("/asset/projectPath")
                .and_then(Value::as_str)
        })
        .filter(|path| path.to_ascii_lowercase().ends_with(".obj"))
        .collect::<BTreeSet<_>>();
    for project_path in &paths {
        let candidate = asset_root.join(project_path);
        let canonical_path = candidate.canonicalize().map_err(|error| {
            format!("mesh asset {} is unavailable: {error}", candidate.display())
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(format!("mesh asset escapes package root: {project_path}"));
        }
        let source = fs::read_to_string(&canonical_path).map_err(|error| {
            format!("failed to read mesh {}: {error}", canonical_path.display())
        })?;
        parse_obj_mesh(&source)?;
    }
    Ok(paths.len())
}

fn validate_audio_events(events: Option<&Value>, asset_root: &Path) -> Result<usize, String> {
    let canonical_root = asset_root
        .canonicalize()
        .map_err(|error| format!("asset root is unavailable: {error}"))?;
    let paths = events
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|event| {
            event
                .pointer("/payload/clip/projectPath")
                .and_then(Value::as_str)
        })
        .collect::<BTreeSet<_>>();
    for project_path in &paths {
        let candidate = asset_root.join(project_path);
        let canonical_path = candidate.canonicalize().map_err(|error| {
            format!("audio clip {} is unavailable: {error}", candidate.display())
        })?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err(format!("audio clip escapes package root: {project_path}"));
        }
        let source = fs::File::open(&canonical_path).map_err(|error| {
            format!("failed to open audio {}: {error}", canonical_path.display())
        })?;
        Decoder::try_from(source).map_err(|error| {
            format!(
                "failed to decode audio {}: {error}",
                canonical_path.display()
            )
        })?;
    }
    Ok(paths.len())
}

fn argument_value(arguments: &[std::ffi::OsString], name: &str) -> Option<PathBuf> {
    arguments
        .windows(2)
        .find(|pair| pair[0] == name)
        .map(|pair| PathBuf::from(&pair[1]))
}

fn argument_u32(arguments: &[std::ffi::OsString], name: &str, fallback: u32) -> u32 {
    argument_value(arguments, name)
        .and_then(|value| value.to_string_lossy().parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(fallback)
}

fn rgba8(color: [f32; 4]) -> [u8; 4] {
    color.map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8)
}

fn blend_pixel(target: &mut RgbaImage, x: i32, y: i32, source: [u8; 4]) {
    let Ok(x) = u32::try_from(x) else { return };
    let Ok(y) = u32::try_from(y) else { return };
    if x >= target.width() || y >= target.height() {
        return;
    }
    let destination = target.get_pixel(x, y).0;
    let source_alpha = f32::from(source[3]) / 255.0;
    let destination_alpha = f32::from(destination[3]) / 255.0;
    let output_alpha = source_alpha + destination_alpha * (1.0 - source_alpha);
    if output_alpha <= f32::EPSILON {
        target.put_pixel(x, y, Rgba([0, 0, 0, 0]));
        return;
    }
    let mut output = [0_u8; 4];
    for channel in 0..3 {
        let value = (f32::from(source[channel]) * source_alpha
            + f32::from(destination[channel]) * destination_alpha * (1.0 - source_alpha))
            / output_alpha;
        output[channel] = value.clamp(0.0, 255.0).round() as u8;
    }
    output[3] = (output_alpha * 255.0).round() as u8;
    target.put_pixel(x, y, Rgba(output));
}

fn logical_rect_to_pixels(
    position: [f32; 2],
    size: [f32; 2],
    screen_space: bool,
    camera: CameraUniform,
    viewport: [u32; 2],
) -> [f32; 4] {
    let [logical_width, logical_height] = if screen_space {
        [1280.0, 720.0]
    } else {
        camera.extent
    };
    let origin = if screen_space {
        [0.0, 0.0]
    } else {
        camera.origin
    };
    let scale_x = viewport[0] as f32 / logical_width.max(0.001);
    let scale_y = viewport[1] as f32 / logical_height.max(0.001);
    let left = (position[0] - origin[0]) * scale_x;
    let top = viewport[1] as f32 - (position[1] + size[1] - origin[1]) * scale_y;
    [left, top, size[0] * scale_x, size[1] * scale_y]
}

fn draw_filled_rect(target: &mut RgbaImage, bounds: [f32; 4], color: [u8; 4]) {
    let left = bounds[0].floor() as i32;
    let top = bounds[1].floor() as i32;
    let right = (bounds[0] + bounds[2]).ceil() as i32;
    let bottom = (bounds[1] + bounds[3]).ceil() as i32;
    for y in top..bottom {
        for x in left..right {
            blend_pixel(target, x, y, color);
        }
    }
}

fn draw_fallback(target: &mut RgbaImage, bounds: [f32; 4]) {
    let left = bounds[0].floor() as i32;
    let top = bounds[1].floor() as i32;
    let right = (bounds[0] + bounds[2]).ceil() as i32;
    let bottom = (bounds[1] + bounds[3]).ceil() as i32;
    let color = [255, 79, 113, 255];
    for x in left..right {
        blend_pixel(target, x, top, color);
        blend_pixel(target, x, bottom - 1, color);
    }
    for y in top..bottom {
        blend_pixel(target, left, y, color);
        blend_pixel(target, right - 1, y, color);
    }
    let diagonal = (right - left).min(bottom - top).max(0);
    for offset in 0..diagonal {
        blend_pixel(target, left + offset, top + offset, color);
        blend_pixel(target, right - 1 - offset, top + offset, color);
    }
}

fn draw_snapshot_sprite(
    target: &mut RgbaImage,
    sprite: &SpriteDraw,
    asset_root: &Path,
    camera: CameraUniform,
    viewport: [u32; 2],
) {
    let logical_extent = if sprite.screen_space {
        [1280.0, 720.0]
    } else {
        camera.extent
    };
    let logical_origin = if sprite.screen_space {
        [0.0, 0.0]
    } else {
        camera.origin
    };
    let scale_x = viewport[0] as f32 / logical_extent[0].max(0.001);
    let scale_y = viewport[1] as f32 / logical_extent[1].max(0.001);
    let center = [
        (sprite.gpu.position[0] - logical_origin[0]) * scale_x,
        viewport[1] as f32 - (sprite.gpu.position[1] - logical_origin[1]) * scale_y,
    ];
    let size = [
        sprite.gpu.size[0].abs() * scale_x,
        sprite.gpu.size[1].abs() * scale_y,
    ];
    let radius = (size[0].hypot(size[1]) / 2.0).ceil();
    let fallback_bounds = [
        center[0] - size[0] * sprite.gpu.pivot[0],
        center[1] - size[1] * sprite.gpu.pivot[1],
        size[0],
        size[1],
    ];
    let path = asset_root.join(&sprite.project_path);
    let decoded = fs::read(&path)
        .ok()
        .and_then(|source| decode_sprite_image(&source, &path).ok());
    let Some((pixels, dimensions)) = decoded else {
        draw_fallback(target, fallback_bounds);
        return;
    };
    let [source_width, source_height] = dimensions;
    let region =
        sprite
            .atlas_region
            .unwrap_or([0.0, 0.0, source_width as f32, source_height as f32]);
    let normalized = region.iter().all(|value| (0.0..=1.0).contains(value));
    let crop = if normalized {
        [
            region[0] * source_width as f32,
            region[1] * source_height as f32,
            region[2] * source_width as f32,
            region[3] * source_height as f32,
        ]
    } else {
        region
    };
    let cosine = sprite.gpu.rotation.cos();
    let rotation_sin = sprite.gpu.rotation.sin();
    let tint = sprite.gpu.tint;
    let left = (center[0] - radius).floor() as i32;
    let right = (center[0] + radius).ceil() as i32;
    let top = (center[1] - radius).floor() as i32;
    let bottom = (center[1] + radius).ceil() as i32;
    for y in top..bottom {
        for x in left..right {
            let dx = x as f32 + 0.5 - center[0];
            let dy = y as f32 + 0.5 - center[1];
            let local_x = cosine * dx - rotation_sin * dy;
            let local_y = rotation_sin * dx + cosine * dy;
            let u = (local_x + size[0] * sprite.gpu.pivot[0]) / size[0].max(0.001);
            let v = (local_y + size[1] * sprite.gpu.pivot[1]) / size[1].max(0.001);
            if !(0.0..1.0).contains(&u) || !(0.0..1.0).contains(&v) {
                continue;
            }
            let source_x = (crop[0] + u * crop[2])
                .floor()
                .clamp(0.0, source_width.saturating_sub(1) as f32)
                as u32;
            let source_y = (crop[1] + v * crop[3])
                .floor()
                .clamp(0.0, source_height.saturating_sub(1) as f32)
                as u32;
            let index = ((source_y * source_width + source_x) * 4) as usize;
            if index + 3 >= pixels.len() {
                continue;
            }
            let source = [
                (f32::from(pixels[index]) * tint[0]).round() as u8,
                (f32::from(pixels[index + 1]) * tint[1]).round() as u8,
                (f32::from(pixels[index + 2]) * tint[2]).round() as u8,
                (f32::from(pixels[index + 3]) * tint[3]).round() as u8,
            ];
            blend_pixel(target, x, y, source);
        }
    }
}

fn render_snapshot_png(
    snapshot: &Value,
    asset_root: &Path,
    output: &Path,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let camera = snapshot_camera(snapshot, width, height);
    let clear = snapshot
        .pointer("/payload/cameras")
        .and_then(Value::as_array)
        .and_then(|items| {
            items
                .iter()
                .find(|item| item.get("primary").and_then(Value::as_bool) == Some(true))
                .or_else(|| items.first())
        })
        .map_or([0.03, 0.05, 0.075, 1.0], |value| {
            snapshot_color(value.get("clearColor"))
        });
    let mut target: RgbaImage = ImageBuffer::from_pixel(width, height, Rgba(rgba8(clear)));
    for item in snapshot_render_items(snapshot) {
        match item {
            RenderItem::Primitive(primitive) => draw_filled_rect(
                &mut target,
                logical_rect_to_pixels(
                    primitive.position,
                    primitive.size,
                    false,
                    camera,
                    [width, height],
                ),
                rgba8(primitive.color),
            ),
            RenderItem::UiPrimitive(primitive) => draw_filled_rect(
                &mut target,
                logical_rect_to_pixels(
                    primitive.position,
                    primitive.size,
                    true,
                    camera,
                    [width, height],
                ),
                rgba8(primitive.color),
            ),
            RenderItem::Sprite(sprite) => {
                draw_snapshot_sprite(&mut target, &sprite, asset_root, camera, [width, height]);
            }
            RenderItem::Mesh3D(_) => {}
        }
    }
    if let Some(drawables) = snapshot
        .pointer("/payload/drawables")
        .and_then(Value::as_array)
    {
        for drawable in drawables {
            if drawable.get("visible").and_then(Value::as_bool) == Some(false)
                || !matches!(
                    drawable.get("primitive").and_then(Value::as_str),
                    Some("sprite2d" | "ui-image")
                )
                || drawable.pointer("/asset/projectPath").is_some()
            {
                continue;
            }
            let position = snapshot_vector2(drawable.pointer("/transform2d/position"), [0.0, 0.0]);
            let scale = snapshot_vector2(drawable.pointer("/transform2d/scale"), [1.0, 1.0]);
            let size = snapshot_vector2(drawable.get("size"), [1.0, 1.0]);
            let pivot = snapshot_vector2(drawable.get("pivot"), [0.5, 0.5]);
            let screen_space = drawable.get("space").and_then(Value::as_str) == Some("ui");
            let logical_size = [size[0] * scale[0].abs(), size[1] * scale[1].abs()];
            let logical_position = [
                position[0] - logical_size[0] * pivot[0],
                position[1] - logical_size[1] * (1.0 - pivot[1]),
            ];
            draw_fallback(
                &mut target,
                logical_rect_to_pixels(
                    logical_position,
                    logical_size,
                    screen_space,
                    camera,
                    [width, height],
                ),
            );
        }
    }
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create frame directory: {error}"))?;
    }
    target
        .save(output)
        .map_err(|error| format!("failed to save runtime observation frame: {error}"))
}

fn verify(package: &PlayerPackage, asset_root: &Path) -> Result<VerifyReport, String> {
    let modules = package.runtime.modules.as_array().map_or(0, Vec::len);
    let mut script_status = "not-run".to_owned();
    let ticks;
    let mut projection_protocol = "unavailable".to_owned();
    let projected_drawable_count;
    let request = json!({
            "scene": package.scene,
            "scenes": package.scenes,
            "prefabs": package.prefabs,
            "activeScene": package.entry_scene,
            "manifest": package.runtime.manifest,
            "modules": package.runtime.modules,
            "assets": package.assets,
            "tickRate": package.runtime.tick_rate,
            "ticks": 3,
            "seed": 20_260_902,
            "commands": [], "inputs": [], "physicsContacts": [], "controls": [],
            "breakpoints": [], "watches": []
    });
    let host = ProjectScriptHost::new(ScriptHostLimits {
        memory_bytes: package.runtime.memory_bytes,
        stack_bytes: package.runtime.stack_bytes,
    })
    .map_err(|error| error.to_string())?;
    let result = host.run(&request).map_err(|error| error.to_string())?;
    result
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .clone_into(&mut script_status);
    ticks = result.get("tick").and_then(Value::as_u64).unwrap_or(0);
    result
        .pointer("/renderSnapshot/protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or("unavailable")
        .clone_into(&mut projection_protocol);
    projected_drawable_count = result
        .pointer("/renderSnapshot/payload/drawables")
        .and_then(Value::as_array)
        .map_or(0, Vec::len);
    let validated_image_count = result.get("renderSnapshot").map_or(Ok(0), |snapshot| {
        validate_snapshot_images(snapshot, asset_root)
    })?;
    let validated_mesh_count = result.get("renderSnapshot").map_or(Ok(0), |snapshot| {
        validate_snapshot_meshes(snapshot, asset_root)
    })?;
    let validated_audio_count = validate_audio_events(result.get("audioEvents"), asset_root)?;
    Ok(VerifyReport {
        ok: true,
        kind: "ai-game-player/verify",
        project_id: package.project.id.clone(),
        project_name: package.project.name.clone(),
        package_version: package.project.version.clone(),
        scene_space: package
            .scene
            .get("space")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned(),
        object_count: package
            .scene
            .get("objects")
            .and_then(Value::as_array)
            .map_or(0, Vec::len),
        module_count: modules,
        ticks_executed: ticks,
        script_status,
        projection_protocol,
        projected_drawable_count,
        validated_image_count,
        validated_mesh_count,
        validated_audio_count,
        renderer: "wgpu-runtime-render-snapshot",
        external_dependencies: Vec::new(),
    })
}

fn observe_runtime(package: &PlayerPackage, overrides: Option<&Value>) -> Result<Value, String> {
    let mut request = json!({
        "scene": package.scene,
        "scenes": package.scenes,
        "prefabs": package.prefabs,
        "activeScene": package.entry_scene,
        "manifest": package.runtime.manifest,
        "modules": package.runtime.modules,
        "assets": package.assets,
        "tickRate": package.runtime.tick_rate,
        "ticks": 1,
        "seed": 20_260_902,
        "startTick": 0,
        "started": false,
        "sessionId": "session:player_observation",
        "generation": 1,
        "sequence": 1,
        "commands": [],
        "inputs": [],
        "physicsContacts": [],
        "controls": [],
        "breakpoints": [],
        "watches": []
    });
    if let (Some(target), Some(source)) = (
        request.as_object_mut(),
        overrides.and_then(Value::as_object),
    ) {
        if let Some(scene_path) = source.get("scene").and_then(Value::as_str) {
            let authored = package
                .scenes
                .get(scene_path)
                .ok_or_else(|| format!("observation scene is not packaged: {scene_path}"))?;
            target.insert("scene".to_owned(), authored.clone());
            target.insert("activeScene".to_owned(), json!(scene_path));
        }
        // Private observation transport: the supervisor carries forward only
        // the preceding independent Player result, never a Studio world.
        if let Some(continuation) = source.get("continuation").and_then(Value::as_object) {
            for key in [
                "scene",
                "activeScene",
                "startTick",
                "started",
                "randomState",
                "pendingEvents",
                "pendingLifecycle",
                "physicsContacts",
            ] {
                let value = continuation
                    .get(key)
                    .ok_or_else(|| format!("incomplete Player continuation: {key}"))?;
                target.insert(key.to_owned(), value.clone());
            }
        }
        for key in [
            "ticks",
            "seed",
            "startTick",
            "started",
            "randomState",
            "pendingEvents",
            "pendingLifecycle",
            "sessionId",
            "generation",
            "sequence",
            "commands",
            "inputs",
            "physicsContacts",
            "controls",
            "breakpoints",
            "watches",
        ] {
            if let Some(value) = source.get(key) {
                target.insert(key.to_owned(), value.clone());
            }
        }
    }
    let host = ProjectScriptHost::new(ScriptHostLimits {
        memory_bytes: package.runtime.memory_bytes,
        stack_bytes: package.runtime.stack_bytes,
    })
    .map_err(|error| error.to_string())?;
    host.run(&request).map_err(|error| error.to_string())
}

fn run() -> Result<(), String> {
    let arguments = env::args_os().skip(1).collect::<Vec<_>>();
    if let Some(spec) = argument_value(&arguments, "--master-audio-stdin") {
        use std::io::{Read, Write};
        let spec: audio_master::AudioMasterSpec =
            serde_json::from_str(spec.to_str().ok_or("AUDIO_MASTER_SPEC_INVALID")?)
                .map_err(|_| "AUDIO_MASTER_SPEC_INVALID")?;
        let mut bytes = Vec::new();
        std::io::stdin()
            .take((audio_inspection::MAX_INPUT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "AUDIO_INPUT_FAILED")?;
        let wav = audio_master::master_audio(bytes, &spec)?;
        std::io::stdout()
            .write_all(&wav)
            .map_err(|_| "AUDIO_OUTPUT_FAILED")?;
        return Ok(());
    }
    if arguments
        .iter()
        .any(|argument| argument == "--inspect-audio-stdin")
    {
        use std::io::Read;
        let mut bytes = Vec::new();
        std::io::stdin()
            .take((audio_inspection::MAX_INPUT_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| "AUDIO_INPUT_FAILED")?;
        let inspection = audio_inspection::inspect_audio(bytes)?;
        println!(
            "{}",
            serde_json::to_string(&inspection).map_err(|error| error.to_string())?
        );
        return Ok(());
    }
    if let Some(snapshot_path) = argument_value(&arguments, "--render-snapshot") {
        let asset_root = argument_value(&arguments, "--asset-root")
            .ok_or_else(|| "--render-snapshot requires --asset-root".to_owned())?;
        let output = argument_value(&arguments, "--output")
            .ok_or_else(|| "--render-snapshot requires --output".to_owned())?;
        let snapshot: Value = serde_json::from_slice(
            &fs::read(&snapshot_path)
                .map_err(|error| format!("failed to read snapshot: {error}"))?,
        )
        .map_err(|error| format!("failed to parse snapshot: {error}"))?;
        render_snapshot_png(
            &snapshot,
            &asset_root,
            &output,
            argument_u32(&arguments, "--width", 1280),
            argument_u32(&arguments, "--height", 720),
        )?;
        return Ok(());
    }
    let verify_only = arguments.iter().any(|argument| argument == "--verify");
    let explicit = argument_value(&arguments, "--package");
    let path = package_path(explicit.as_deref())?;
    let package = load_package(&path)?;
    if let Some(output) = argument_value(&arguments, "--observe-runtime") {
        let overrides = argument_value(&arguments, "--request")
            .map(|request_path| {
                serde_json::from_slice::<Value>(
                    &fs::read(request_path)
                        .map_err(|error| format!("failed to read observation request: {error}"))?,
                )
                .map_err(|error| format!("failed to parse observation request: {error}"))
            })
            .transpose()?;
        let result = observe_runtime(&package, overrides.as_ref())?;
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create observation output: {error}"))?;
        }
        fs::write(
            output,
            serde_json::to_vec_pretty(&result).map_err(|error| error.to_string())?,
        )
        .map_err(|error| format!("failed to write observation output: {error}"))?;
        return Ok(());
    }
    if verify_only {
        println!(
            "{}",
            serde_json::to_string(&verify(
                &package,
                path.parent()
                    .ok_or_else(|| "player package has no asset root".to_owned())?,
            )?)
            .map_err(|error| error.to_string())?
        );
        return Ok(());
    }
    let event_loop = EventLoop::new().map_err(|error| error.to_string())?;
    event_loop.set_control_flow(ControlFlow::Poll);
    let asset_root = path
        .parent()
        .ok_or_else(|| "player package has no asset root".to_owned())?
        .to_path_buf();
    let mut app = PlayerApp::new(package, asset_root);
    if let Some(index) = arguments.iter().position(|argument| argument == "--smoke") {
        app.smoke_frames = Some(
            arguments
                .get(index + 1)
                .and_then(|value| value.to_str()?.parse::<u32>().ok())
                .filter(|value| (1..=120).contains(value))
                .ok_or_else(|| "--smoke requires a frame count from 1 to 120".to_owned())?,
        );
    }
    app.smoke_capture = argument_value(&arguments, "--smoke-capture");
    if app.smoke_capture.is_some() && app.smoke_frames.is_none() {
        return Err("--smoke-capture requires bounded --smoke".to_owned());
    }
    event_loop
        .run_app(&mut app)
        .map_err(|error| error.to_string())?;
    if let Some(error) = app.fatal_error {
        return Err(error);
    }
    if let Some(required) = app.smoke_frames {
        if app.frames_presented < required {
            return Err("window closed before completing smoke frames".to_owned());
        }
        println!(
            "{}",
            json!({
                "ok":true, "kind":"ai-game-player/window-smoke",
                "projectId":app.package.project.id, "framesPresented":app.frames_presented,
            "ticksExecuted":app.tick, "renderer":"wgpu-surface",
            "capturedGpuFrame":app.smoke_capture.is_some(),
                "drawableCount":app.render_snapshot.as_ref()
                    .and_then(|value|value.pointer("/payload/drawables"))
                    .and_then(Value::as_array).map_or(0, Vec::len)
            })
        );
    }
    Ok(())
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("[player] {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_mp3_sound_effect_decodes_without_audio_device() {
        let hex = include_str!("../tests/fixtures/tone.mp3.hex")
            .split_whitespace()
            .collect::<String>();
        let bytes = (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect::<Vec<_>>();
        let decoder = Decoder::try_from(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(decoder.sample_rate(), 44_100);
        assert_eq!(decoder.channels(), 1);
        let samples = decoder.collect::<Vec<_>>();
        assert!(samples.len() >= 4_410);
        assert!(samples.iter().any(|sample| sample.abs() > 0.1));
    }

    #[test]
    fn player_step_preserves_late_lifecycle_without_a_window() {
        let package: PlayerPackage = serde_json::from_value(json!({
            "schemaVersion": "1.0.0", "kind": "ai-game-studio/player-package",
            "project": {"id":"test:lifecycle", "name":"Lifecycle", "version":"1"},
            "scene": {"id":"test:scene", "space":"2d", "objects":[
                {"id":"test:overlay", "visible":false, "components":[]}
            ]},
            "runtime": {"tickRate":60,
                "modules":[{"id":"test:module", "kind":"system", "source":"scripts/probe.ts",
                    "code":"module.exports.probe = { onFixedUpdate(ctx) { if(ctx.tick === 0) ctx.setVisible('test:overlay', true); } };"}],
                "manifest":{"systems":[{"id":"test:system", "module":"test:module", "export":"probe", "phase":"engine:presentation", "order":0, "query":[]}],
                    "schedule":["engine:post-update", "engine:snapshot", "engine:presentation"], "budgets":{}},
                "memoryBytes":67_108_864, "stackBytes":1_048_576}
        })).unwrap();
        let mut app = PlayerApp::new(package, PathBuf::new());
        app.step().unwrap();
        assert_eq!(app.tick, 1);
        assert_eq!(app.scene["objects"][0]["visible"], false);
        assert_eq!(app.pending_lifecycle.len(), 1);
        app.step().unwrap();
        assert_eq!(app.tick, 2);
        assert_eq!(app.scene["objects"][0]["visible"], true);
        assert!(app.pending_lifecycle.is_empty());
        let first = observe_runtime(&app.package, None).unwrap();
        let mut continuation = json!({"ticks":1, "continuation":{
            "scene":first["scene"], "activeScene":first["activeScene"],
            "startTick":first["tick"], "started":true,
            "randomState":first["randomState"], "pendingEvents":first["pendingEvents"],
            "pendingLifecycle":first["pendingLifecycle"], "physicsContacts":first["physicsContacts"]
        }});
        let second = observe_runtime(&app.package, Some(&continuation)).unwrap();
        assert_eq!(second["status"], "completed");
        assert_eq!(second["scene"], app.scene);
        continuation["continuation"]
            .as_object_mut()
            .unwrap()
            .remove("pendingLifecycle");
        assert!(
            observe_runtime(&app.package, Some(&continuation))
                .unwrap_err()
                .contains("pendingLifecycle"),
            "incomplete private continuation must fail instead of silently losing work"
        );
    }

    #[test]
    fn routes_native_game_ui_keys_through_authored_actions() {
        let bindings = [
            (KeyCode::KeyP, "KeyP", "toggle-pause"),
            (KeyCode::KeyH, "KeyH", "toggle-help"),
            (KeyCode::KeyO, "KeyO", "toggle-settings"),
            (KeyCode::KeyM, "KeyM", "toggle-mute"),
            (KeyCode::BracketLeft, "BracketLeft", "volume-down"),
            (KeyCode::BracketRight, "BracketRight", "volume-up"),
            (KeyCode::KeyQ, "KeyQ", "custom-ability"),
            (KeyCode::Digit2, "Digit2", "select-weapon"),
            (KeyCode::Escape, "Escape", "return-to-menu"),
        ];
        let package: PlayerPackage = serde_json::from_value(json!({
            "schemaVersion": "1.0.0",
            "kind": "ai-game-studio/player-package",
            "project": {"id":"test:keyboard", "name":"Keyboard", "version":"1"},
            "scene": {"space":"2d", "objects":[]},
            "runtime": {"tickRate":60, "manifest":{}, "modules":{},
                "memoryBytes":67_108_864, "stackBytes":1_048_576},
            "inputActions": bindings.iter().map(|(_, key, id)|
                json!({"id":id,"keys":[key]})).collect::<Vec<_>>()
        }))
        .expect("valid isolated keyboard package");
        let app = PlayerApp::new(package, PathBuf::new());
        for (key, _, action) in bindings {
            assert_eq!(app.action_for_key(key).as_deref(), Some(action), "{key:?}");
        }
    }

    #[test]
    fn painter_pipelines_match_depth_attachment_without_occluding_ui() {
        let state = painter_depth_state();
        assert_eq!(state.format, wgpu::TextureFormat::Depth32Float);
        assert_eq!(state.depth_write_enabled, Some(false));
        assert_eq!(state.depth_compare, Some(wgpu::CompareFunction::Always));
    }

    #[test]
    fn atlas_regions_keep_both_normalized_and_pixel_coordinates() {
        let normalized = sprite_uv_region([0.25, 0.5, 0.25, 0.5], [128, 256]);
        let pixels = sprite_uv_region([32.0, 128.0, 32.0, 128.0], [128, 256]);
        for (actual, expected) in normalized.into_iter().zip(pixels) {
            assert!((actual - expected).abs() < f32::EPSILON);
        }
    }

    #[test]
    fn audio_controls_render_percent_and_brackets_without_fallback() {
        let expected = [
            ('%', [24, 25, 2, 4, 8, 19, 3]),
            ('[', [14, 8, 8, 8, 8, 8, 14]),
            (']', [14, 2, 2, 2, 2, 2, 14]),
        ];
        for (character, rows) in expected {
            assert_eq!(glyph_rows(character), rows, "missing glyph: {character}");
            assert_ne!(glyph_rows(character), glyph_rows('?'));
            assert!(rows.iter().all(|row| *row < 32));
        }
    }

    #[test]
    fn projects_2d_components_without_game_specific_types() {
        let scene = json!({
          "space": "2d",
          "objects": [{
            "enabled": true,
            "components": [
              {"type":"core:transform2d","data":{"position":{"x":4,"y":5},"scale":{"x":1,"y":1}}},
              {"type":"render:shape2d","data":{"size":{"x":2,"y":3},"color":"#ff0000"}}
            ]
          }]
        });
        let primitives = scene_primitives(&scene);
        assert_eq!(primitives.len(), 1);
        assert!((primitives[0].size[0] - 2.0).abs() < f32::EPSILON);
        assert!((primitives[0].size[1] - 3.0).abs() < f32::EPSILON);
    }

    #[test]
    fn never_uses_the_legacy_isometric_fallback_for_3d() {
        let scene = json!({
          "space": "3d",
          "objects": [{
            "enabled": true,
            "components": [
              {"type":"core:transform3d","data":{"position":{"x":0,"y":0,"z":0},"scale":{"x":1,"y":1,"z":1}}},
              {"type":"render:mesh3d","data":{"primitive":"cube","material":""}},
              {"type":"render:material","data":{"color":"#00ff00","roughness":0.5}}
            ]
          }]
        });
        assert_eq!(scene_primitives(&scene).len(), 0);
    }

    #[test]
    fn projects_text2d_as_builtin_bitmap_primitives() {
        let scene = json!({
          "space": "2d",
          "objects": [{
            "enabled": true,
            "components": [
              {"type":"core:transform2d","data":{"position":{"x":4,"y":5},"scale":{"x":1,"y":1}}},
              {"type":"render:text2d","data":{"text":"SCORE 1","fontSize":1,"color":"#ffffff","align":"left"}}
            ]
          }]
        });
        let primitives = scene_primitives(&scene);
        assert!(primitives.len() > 20);
        assert!(primitives.iter().all(|primitive| primitive.color[3] > 0.0));
    }

    #[test]
    fn centers_the_default_2d_camera_and_preserves_viewport_aspect() {
        let scene = json!({
          "space": "2d",
          "objects": [{
            "components": [
              {"type":"core:transform2d","data":{"position":{"x":0,"y":0}}},
              {"type":"render:camera2d","data":{"zoom":1,"primary":true}}
            ]
          }]
        });
        let camera = scene_camera(&scene, 1280, 720);
        assert_eq!(camera.origin, [-16.0, -9.0]);
        assert_eq!(camera.extent, [32.0, 18.0]);

        let wide = scene_camera(&scene, 1920, 720);
        assert_eq!(wide.origin, [-24.0, -9.0]);
        assert_eq!(wide.extent, [48.0, 18.0]);
    }

    #[test]
    fn applies_primary_camera_position_and_zoom() {
        let scene = json!({
          "space": "2d",
          "objects": [{
            "components": [
              {"type":"core:transform2d","data":{"position":{"x":4,"y":-2}}},
              {"type":"render:camera2d","data":{"zoom":2,"primary":true}}
            ]
          }]
        });
        let camera = scene_camera(&scene, 1280, 720);
        assert_eq!(camera.origin, [-4.0, -6.5]);
        assert_eq!(camera.extent, [16.0, 9.0]);
    }

    #[test]
    fn preserves_press_and_release_between_fixed_ticks() {
        let mut pending = vec![
            json!({"tick":0,"action":"primary-action","value":1.0}),
            json!({"tick":0,"action":"primary-action","value":0.0}),
        ];
        let active = BTreeMap::new();
        let frame = collect_frame_inputs(&mut pending, &active, 9);
        assert_eq!(frame.len(), 2);
        assert_eq!(frame[0]["tick"], 9);
        assert_eq!(frame[0]["value"], 1.0);
        assert_eq!(frame[1]["value"], 0.0);
        assert!(pending.is_empty());
    }

    #[test]
    fn does_not_duplicate_a_newly_pressed_held_action() {
        let mut pending = vec![json!({
            "tick": 0,
            "action": "move-up",
            "value": 1.0
        })];
        let active = BTreeMap::from([("move-up".to_owned(), 1.0)]);
        let first = collect_frame_inputs(&mut pending, &active, 4);
        assert_eq!(first.len(), 1);
        assert_eq!(first[0]["tick"], 4);

        let held = collect_frame_inputs(&mut pending, &active, 5);
        assert_eq!(held.len(), 1);
        assert_eq!(held[0]["tick"], 5);
        assert_eq!(held[0]["action"], "move-up");
        assert_eq!(held[0]["value"], 1.0);
    }

    #[test]
    fn projects_sprite_snapshot_with_pivot_tint_filter_and_atlas() {
        let snapshot = json!({
          "payload": {"drawables": [{
            "primitive": "sprite2d",
            "visible": true,
            "layer": 7,
            "transform2d": {
              "position": [4, 5],
              "rotation": 90,
              "scale": [2, 3]
            },
            "size": [6, 8],
            "pivot": [0.25, 0.75],
            "tint": [0.2, 0.4, 0.6, 0.8],
            "filter": "nearest",
            "atlasRegion": [8, 16, 32, 24],
            "asset": {
              "projectPath": "assets/generated/sprite.png",
              "sourceHash": "0123456789abcdef"
            }
          }]}
        });
        let items = snapshot_render_items(&snapshot);
        assert_eq!(items.len(), 1);
        let RenderItem::Sprite(sprite) = &items[0] else {
            panic!("expected Sprite2D render item");
        };
        assert_eq!(sprite.gpu.position, [4.0, 5.0]);
        assert_eq!(sprite.gpu.size, [12.0, 24.0]);
        assert_eq!(sprite.gpu.pivot, [0.25, 0.75]);
        assert_eq!(sprite.gpu.tint, [0.2, 0.4, 0.6, 0.8]);
        assert!((sprite.gpu.rotation - std::f32::consts::FRAC_PI_2).abs() < f32::EPSILON);
        assert_eq!(sprite.filter, wgpu::FilterMode::Nearest);
        assert_eq!(sprite.atlas_region, Some([8.0, 16.0, 32.0, 24.0]));
    }

    #[test]
    fn resolves_topmost_ui_button_action_from_pointer_position() {
        let snapshot = json!({"payload":{"drawables":[
          {"space":"ui","visible":true,"layer":10000,"inputAction":"menu:start","transform2d":{"position":[640,360]},"size":[200,80],"pivot":[0.5,0.5]},
          {"space":"ui","visible":true,"layer":10001,"inputAction":"menu:confirm","transform2d":{"position":[640,360]},"size":[100,40],"pivot":[0.5,0.5]}
        ]}});
        assert_eq!(
            snapshot_ui_action(&snapshot, [640.0, 360.0], PhysicalSize::new(1280, 720)),
            Some("menu:confirm".to_owned())
        );
        assert_eq!(
            snapshot_ui_action(&snapshot, [20.0, 20.0], PhysicalSize::new(1280, 720)),
            None
        );
    }
}
