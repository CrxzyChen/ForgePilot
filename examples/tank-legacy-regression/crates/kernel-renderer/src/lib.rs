//! Read-only 2D projection and rendering for deterministic kernel snapshots.

#![forbid(unsafe_code)]

use std::{borrow::Cow, fmt, sync::Arc};

use ai_game_kernel_core::runtime::RuntimeSnapshot;
use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;
use winit::{dpi::PhysicalSize, event_loop::OwnedDisplayHandle, window::Window};

const ATLAS_COLORS: [[u8; 4]; 11] = [
    [77, 226, 197, 255],
    [238, 83, 83, 255],
    [191, 101, 68, 255],
    [142, 151, 166, 255],
    [62, 132, 204, 255],
    [67, 141, 89, 255],
    [246, 184, 88, 255],
    [169, 104, 255, 255],
    [235, 196, 92, 255],
    [117, 151, 255, 255],
    [255, 255, 255, 48],
];
const ATLAS_WIDTH: u32 = 11;

/// Stable logical reference into the MVP palette atlas.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct AssetHandle(pub u32);

impl AssetHandle {
    /// Player tank or player-controlled unit sprite.
    pub const PLAYER: Self = Self(0);
    /// Enemy tank sprite.
    pub const ENEMY_TANK: Self = Self(1);
    /// Destructible brick terrain.
    pub const BRICK: Self = Self(2);
    /// Indestructible steel terrain.
    pub const STEEL: Self = Self(3);
    /// Water terrain.
    pub const WATER: Self = Self(4);
    /// Foliage terrain.
    pub const FOLIAGE: Self = Self(5);
    /// Player base objective.
    pub const BASE: Self = Self(6);
    /// Wave-spawn marker.
    pub const SPAWNER: Self = Self(7);
    /// Strategic site sprite.
    pub const SITE: Self = Self(8);
    /// Other positioned entity sprite.
    pub const ENTITY: Self = Self(9);
    /// Translucent debug-cell sprite.
    pub const DEBUG: Self = Self(10);
}

/// Orthographic camera expressed entirely in world units.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct OrthoCamera {
    /// Top-left world-space origin.
    pub origin: [f32; 2],
    /// Visible world-space extent.
    pub extent: [f32; 2],
}

impl OrthoCamera {
    /// Camera covering the MVP map coordinate system.
    pub const MVP: Self = Self {
        origin: [0.0, 0.0],
        extent: [32.0, 18.0],
    };

    /// Converts physical screen coordinates into world coordinates.
    #[must_use]
    #[allow(
        clippy::cast_precision_loss,
        reason = "physical viewport dimensions are intentionally projected to GPU f32 space"
    )]
    pub fn screen_to_world(self, screen: [f32; 2], viewport: [u32; 2]) -> [f32; 2] {
        let width = viewport[0].max(1) as f32;
        let height = viewport[1].max(1) as f32;
        [
            self.origin[0] + screen[0] / width * self.extent[0],
            self.origin[1] + screen[1] / height * self.extent[1],
        ]
    }
}

/// One logical sprite. Stable IDs remain available for picking and diagnostics.
#[derive(Debug, Clone, PartialEq)]
pub struct SpriteInstance {
    /// Source entity ID or a deterministic debug-derived ID.
    pub entity_id: String,
    /// Top-left position in tile coordinates.
    pub position: [f32; 2],
    /// Size in tile coordinates.
    pub size: [f32; 2],
    /// Explicit draw layer. Lower values render first.
    pub layer: i32,
    /// Stable atlas reference; never a backend texture handle.
    pub asset: AssetHandle,
}

/// Immutable visual projection built from a canonical simulation snapshot.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderScene {
    /// Camera used for rendering and picking.
    pub camera: OrthoCamera,
    /// Sprites sorted by `(layer, entity_id, asset)`.
    pub sprites: Vec<SpriteInstance>,
}

impl RenderScene {
    /// Builds a render-only view. No renderer state can flow back into simulation.
    #[must_use]
    #[allow(
        clippy::cast_precision_loss,
        reason = "authoritative integer tile positions are intentionally projected to GPU f32 space"
    )]
    pub fn from_snapshot(snapshot: &RuntimeSnapshot, debug_overlay: bool) -> Self {
        let mut sprites = Vec::new();
        for entity in &snapshot.entities {
            let Some(position) = entity.position else {
                continue;
            };
            let entity_position = [position.x as f32, position.y as f32];
            if debug_overlay {
                sprites.push(SpriteInstance {
                    entity_id: format!("{}/debug-cell", entity.id),
                    position: [entity_position[0] - 0.08, entity_position[1] - 0.08],
                    size: [1.16, 1.16],
                    layer: -10,
                    asset: AssetHandle::DEBUG,
                });
            }
            let (layer, asset) = if entity.player_controlled {
                (20, AssetHandle::PLAYER)
            } else if entity.tank.is_some() {
                (20, AssetHandle::ENEMY_TANK)
            } else if let Some(terrain) = &entity.terrain {
                (
                    0,
                    match terrain.kind.as_str() {
                        "brick" => AssetHandle::BRICK,
                        "steel" => AssetHandle::STEEL,
                        "water" => AssetHandle::WATER,
                        "foliage" => AssetHandle::FOLIAGE,
                        _ => AssetHandle::ENTITY,
                    },
                )
            } else if entity.base.is_some() {
                (10, AssetHandle::BASE)
            } else if entity.wave_spawner.is_some() {
                (-1, AssetHandle::SPAWNER)
            } else if entity.capture_site.is_some() || entity.producer.is_some() {
                (10, AssetHandle::SITE)
            } else {
                (0, AssetHandle::ENTITY)
            };
            sprites.push(SpriteInstance {
                entity_id: entity.id.clone(),
                position: entity_position,
                size: [1.0, 1.0],
                layer,
                asset,
            });
        }
        sprites.sort_by(|left, right| {
            (left.layer, left.entity_id.as_str(), left.asset).cmp(&(
                right.layer,
                right.entity_id.as_str(),
                right.asset,
            ))
        });
        Self {
            camera: OrthoCamera::MVP,
            sprites,
        }
    }

    /// Returns the top-most entity under a world-space point.
    #[must_use]
    pub fn pick_entity(&self, world: [f32; 2]) -> Option<&str> {
        self.sprites.iter().rev().find_map(|sprite| {
            let inside = world[0] >= sprite.position[0]
                && world[0] <= sprite.position[0] + sprite.size[0]
                && world[1] >= sprite.position[1]
                && world[1] <= sprite.position[1] + sprite.size[1];
            (inside && sprite.asset != AssetHandle::DEBUG).then_some(sprite.entity_id.as_str())
        })
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct Vertex {
    position: [f32; 2],
    uv: [f32; 2],
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct GpuSprite {
    position: [f32; 2],
    size: [f32; 2],
    layer: f32,
    asset: u32,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct CameraUniform {
    origin: [f32; 2],
    extent: [f32; 2],
}

/// Result of one surface render attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderOutcome {
    /// A frame was submitted and presented.
    Presented,
    /// The surface was temporarily unavailable or reconfigured.
    Skipped,
}

/// Renderer initialization failure.
#[derive(Debug)]
pub struct RendererError(String);

impl fmt::Display for RendererError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for RendererError {}

/// Native wgpu sprite renderer. It owns no authoritative game state.
#[derive(Debug)]
pub struct Renderer {
    instance: wgpu::Instance,
    window: Arc<Window>,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    camera_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    adapter_name: String,
    backend: String,
}

impl Renderer {
    /// Initializes a native surface and the fixed sprite pipeline.
    ///
    /// # Errors
    ///
    /// Returns a compact diagnostic if no adapter, device, or surface is available.
    #[allow(
        clippy::too_many_lines,
        reason = "GPU initialization is one transactional construction of mutually dependent resources"
    )]
    pub async fn new(
        display: OwnedDisplayHandle,
        window: Arc<Window>,
    ) -> Result<Self, RendererError> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_with_display_handle(
            Box::new(display),
        ));
        let surface = instance
            .create_surface(window.clone())
            .map_err(|error| RendererError(format!("surface creation failed: {error}")))?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|error| RendererError(format!("adapter request failed: {error}")))?;
        let info = adapter.get_info();
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default())
            .await
            .map_err(|error| RendererError(format!("device request failed: {error}")))?;
        let size = window.inner_size();
        let config = surface
            .get_default_config(&adapter, size.width.max(1), size.height.max(1))
            .ok_or_else(|| RendererError("surface has no supported configuration".to_owned()))?;
        surface.configure(&device, &config);

        let vertices = [
            Vertex {
                position: [0.0, 0.0],
                uv: [0.0, 0.0],
            },
            Vertex {
                position: [1.0, 0.0],
                uv: [1.0, 0.0],
            },
            Vertex {
                position: [1.0, 1.0],
                uv: [1.0, 1.0],
            },
            Vertex {
                position: [0.0, 0.0],
                uv: [0.0, 0.0],
            },
            Vertex {
                position: [1.0, 1.0],
                uv: [1.0, 1.0],
            },
            Vertex {
                position: [0.0, 1.0],
                uv: [0.0, 1.0],
            },
        ];
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("sprite-vertices"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let camera = CameraUniform {
            origin: OrthoCamera::MVP.origin,
            extent: OrthoCamera::MVP.extent,
        };
        let camera_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("camera-uniform"),
            contents: bytemuck::bytes_of(&camera),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let atlas_bytes = ATLAS_COLORS.concat();
        let atlas = device.create_texture_with_data(
            &queue,
            &wgpu::TextureDescriptor {
                label: Some("mvp-palette-atlas"),
                size: wgpu::Extent3d {
                    width: ATLAS_WIDTH,
                    height: 1,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8UnormSrgb,
                usage: wgpu::TextureUsages::TEXTURE_BINDING,
                view_formats: &[],
            },
            wgpu::util::TextureDataOrder::LayerMajor,
            &atlas_bytes,
        );
        let atlas_view = atlas.create_view(&wgpu::TextureViewDescriptor::default());
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("palette-sampler"),
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("sprite-bind-group-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("sprite-bind-group"),
            layout: &bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: camera_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&atlas_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&sampler),
                },
            ],
        });
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("sprite-shader"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("sprite.wgsl"))),
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("sprite-pipeline-layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("sprite-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<Vertex>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Vertex,
                        attributes: &wgpu::vertex_attr_array![0 => Float32x2, 1 => Float32x2],
                    }),
                    Some(wgpu::VertexBufferLayout {
                        array_stride: size_of::<GpuSprite>() as wgpu::BufferAddress,
                        step_mode: wgpu::VertexStepMode::Instance,
                        attributes: &wgpu::vertex_attr_array![2 => Float32x2, 3 => Float32x2, 4 => Float32, 5 => Uint32],
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
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        Ok(Self {
            instance,
            window,
            surface,
            device,
            queue,
            config,
            pipeline,
            vertex_buffer,
            camera_buffer,
            bind_group,
            adapter_name: info.name,
            backend: format!("{:?}", info.backend),
        })
    }

    /// Human-readable adapter name selected by wgpu.
    #[must_use]
    pub fn adapter_name(&self) -> &str {
        &self.adapter_name
    }

    /// Portable backend selected on this machine.
    #[must_use]
    pub fn backend(&self) -> &str {
        &self.backend
    }

    /// Current physical viewport size.
    #[must_use]
    pub fn viewport(&self) -> [u32; 2] {
        [self.config.width, self.config.height]
    }

    /// Reconfigures the presentation surface after a window resize.
    pub fn resize(&mut self, size: PhysicalSize<u32>) {
        if size.width == 0 || size.height == 0 {
            return;
        }
        self.config.width = size.width;
        self.config.height = size.height;
        self.surface.configure(&self.device, &self.config);
    }

    /// Draws one immutable scene projection.
    ///
    /// # Errors
    ///
    /// Returns an error only for unrecoverable surface loss.
    #[allow(
        clippy::cast_precision_loss,
        reason = "small logical layer values are intentionally projected to GPU f32 depth"
    )]
    pub fn render(&mut self, scene: &RenderScene) -> Result<RenderOutcome, RendererError> {
        let camera = CameraUniform {
            origin: scene.camera.origin,
            extent: scene.camera.extent,
        };
        self.queue
            .write_buffer(&self.camera_buffer, 0, bytemuck::bytes_of(&camera));
        let gpu_sprites = scene
            .sprites
            .iter()
            .map(|sprite| GpuSprite {
                position: sprite.position,
                size: sprite.size,
                layer: sprite.layer as f32,
                asset: sprite.asset.0,
            })
            .collect::<Vec<_>>();
        let placeholder = GpuSprite::zeroed();
        let instance_data = if gpu_sprites.is_empty() {
            bytemuck::bytes_of(&placeholder)
        } else {
            bytemuck::cast_slice(&gpu_sprites)
        };
        let instance_buffer = self
            .device
            .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("sprite-instances"),
                contents: instance_data,
                usage: wgpu::BufferUsages::VERTEX,
            });

        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame) => frame,
            wgpu::CurrentSurfaceTexture::Suboptimal(frame) => {
                drop(frame);
                self.surface.configure(&self.device, &self.config);
                return Ok(RenderOutcome::Skipped);
            }
            wgpu::CurrentSurfaceTexture::Occluded | wgpu::CurrentSurfaceTexture::Timeout => {
                return Ok(RenderOutcome::Skipped);
            }
            wgpu::CurrentSurfaceTexture::Outdated => {
                self.surface.configure(&self.device, &self.config);
                return Ok(RenderOutcome::Skipped);
            }
            wgpu::CurrentSurfaceTexture::Lost => {
                self.surface =
                    self.instance
                        .create_surface(self.window.clone())
                        .map_err(|error| {
                            RendererError(format!("surface recreation failed: {error}"))
                        })?;
                self.surface.configure(&self.device, &self.config);
                return Ok(RenderOutcome::Skipped);
            }
            wgpu::CurrentSurfaceTexture::Validation => {
                return Err(RendererError("surface validation failed".to_owned()));
            }
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("sprite-encoder"),
            });
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("sprite-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.025,
                            g: 0.04,
                            b: 0.065,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            pass.set_vertex_buffer(1, instance_buffer.slice(..));
            let sprite_count = u32::try_from(gpu_sprites.len())
                .map_err(|_| RendererError("sprite batch exceeds u32 capacity".to_owned()))?;
            pass.draw(0..6, 0..sprite_count);
        }
        self.queue.submit(Some(encoder.finish()));
        self.window.pre_present_notify();
        self.queue.present(frame);
        Ok(RenderOutcome::Presented)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ai_game_kernel_core::{runtime::Simulation, validation::load_project};

    fn scene(debug: bool) -> RenderScene {
        let project = load_project(
            "examples/minimal.game.json",
            include_str!("../../../examples/minimal.game.json"),
        )
        .unwrap();
        let simulation = Simulation::from_project(&project, 42).unwrap();
        RenderScene::from_snapshot(&simulation.snapshot().unwrap(), debug)
    }

    #[test]
    fn projection_is_stably_sorted_and_pickable() {
        let scene = scene(false);
        assert_eq!(scene.sprites.len(), 2);
        assert!(
            scene
                .sprites
                .windows(2)
                .all(|pair| pair[0].layer <= pair[1].layer)
        );
        assert_eq!(scene.pick_entity([2.5, 9.5]), Some("demo:frontier/player"));
    }

    #[test]
    fn debug_overlay_never_becomes_pick_target() {
        let scene = scene(true);
        assert_eq!(scene.sprites.len(), 4);
        assert_eq!(
            scene.pick_entity([12.5, 6.5]),
            Some("demo:frontier/granary")
        );
    }

    #[test]
    fn screen_to_world_uses_camera_not_renderer_state() {
        let world = OrthoCamera::MVP.screen_to_world([320.0, 180.0], [640, 360]);
        assert!((world[0] - 16.0).abs() < f32::EPSILON);
        assert!((world[1] - 9.0).abs() < f32::EPSILON);
    }
}
