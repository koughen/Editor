use std::{
    cell::RefCell,
    collections::HashMap,
    hash::{Hash, Hasher},
};

use bytemuck::{Pod, Zeroable};
use gpu::{FULLSCREEN_SHADER_SOURCE, GpuContext};
use thiserror::Error;
use wgpu::util::DeviceExt;

use crate::{EffectPass, UniformValue};

const COLOR_GRADE_SHADER_ID: &str = "color-grade";
const COLOR_GRADE_SHADER_SOURCE: &str = include_str!("shaders/color_grade.wgsl");

const GAUSSIAN_BLUR_SHADER_ID: &str = "gaussian-blur";
const GAUSSIAN_BLUR_SHADER_SOURCE: &str = include_str!("shaders/gaussian_blur.wgsl");

pub struct ApplyEffectsOptions<'a> {
    pub source: &'a wgpu::Texture,
    pub width: u32,
    pub height: u32,
    pub passes: &'a [EffectPass],
}

pub struct EffectPipeline {
    uniform_bind_group_layout: wgpu::BindGroupLayout,
    pipelines: HashMap<String, wgpu::RenderPipeline>,
    lut_layout: wgpu::BindGroupLayout,
    lut_cache: RefCell<HashMap<u64, wgpu::BindGroup>>,
}

#[derive(Debug, Error)]
pub enum EffectsError {
    #[error("At least one effect pass is required")]
    MissingEffectPasses,
    #[error("Unknown effect shader '{shader}'")]
    UnknownEffectShader { shader: String },
    #[error("Missing uniform '{uniform}' for shader '{shader}'")]
    MissingUniform { shader: String, uniform: String },
    #[error("Uniform '{uniform}' for shader '{shader}' must be a number")]
    InvalidNumberUniform { shader: String, uniform: String },
    #[error(
        "Uniform '{uniform}' for shader '{shader}' must be a vector of length {expected_length}"
    )]
    InvalidVectorUniform {
        shader: String,
        uniform: String,
        expected_length: usize,
    },
    #[error("Shader '{shader}' does not support uniform '{uniform}'")]
    UnsupportedUniform { shader: String, uniform: String },
}

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct EffectUniformBuffer {
    resolution: [f32; 2],
    direction: [f32; 2],
    scalars: [f32; 4],
    grade: [[f32; 4]; 6],
    advanced: crate::color_grade::AdvancedGrade,
}

impl EffectPipeline {
    pub fn new(context: &GpuContext) -> Self {
        let uniform_bind_group_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("effects-uniform-bind-group-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    }],
                });
        let vertex_shader_module =
            context
                .device()
                .create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some("effects-fullscreen-shader"),
                    source: wgpu::ShaderSource::Wgsl(FULLSCREEN_SHADER_SOURCE.into()),
                });
        let lut_layout =
            context
                .device()
                .create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                    label: Some("color-lut-layout"),
                    entries: &[wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: false },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    }],
                });
        let pipeline_layout =
            context
                .device()
                .create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                    label: Some("effects-pipeline-layout"),
                    bind_group_layouts: &[
                        Some(context.texture_sampler_bind_group_layout()),
                        Some(&uniform_bind_group_layout),
                        Some(&lut_layout),
                    ],
                    immediate_size: 0,
                });
        let mut pipelines = HashMap::new();
        for (shader_id, source) in [
            (GAUSSIAN_BLUR_SHADER_ID, GAUSSIAN_BLUR_SHADER_SOURCE),
            (COLOR_GRADE_SHADER_ID, COLOR_GRADE_SHADER_SOURCE),
            ("creative", include_str!("shaders/creative.wgsl")),
            ("clip-transition", include_str!("shaders/transition.wgsl")),
        ] {
            let shader_module =
                context
                    .device()
                    .create_shader_module(wgpu::ShaderModuleDescriptor {
                        label: Some(shader_id),
                        source: wgpu::ShaderSource::Wgsl(source.into()),
                    });
            let pipeline =
                context
                    .device()
                    .create_render_pipeline(&wgpu::RenderPipelineDescriptor {
                        label: Some(shader_id),
                        layout: Some(&pipeline_layout),
                        vertex: wgpu::VertexState {
                            module: &vertex_shader_module,
                            entry_point: Some("vertex_main"),
                            buffers: &[wgpu::VertexBufferLayout {
                                array_stride: std::mem::size_of::<[f32; 2]>() as u64,
                                step_mode: wgpu::VertexStepMode::Vertex,
                                attributes: &[wgpu::VertexAttribute {
                                    format: wgpu::VertexFormat::Float32x2,
                                    offset: 0,
                                    shader_location: 0,
                                }],
                            }],
                            compilation_options: wgpu::PipelineCompilationOptions::default(),
                        },
                        fragment: Some(wgpu::FragmentState {
                            module: &shader_module,
                            entry_point: Some("fragment_main"),
                            targets: &[Some(wgpu::ColorTargetState {
                                format: context.texture_format(),
                                blend: None,
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
            pipelines.insert(shader_id.to_string(), pipeline);
        }

        Self {
            uniform_bind_group_layout,
            pipelines,
            lut_layout,
            lut_cache: RefCell::new(HashMap::new()),
        }
    }

    fn lut_group(&self, context: &GpuContext, pass: &EffectPass) -> wgpu::BindGroup {
        let lut = crate::color_grade::lut_data(pass);
        let size = lut.map_or(0, |(size, _)| size);
        let data = lut.map(|(_, data)| data);
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        size.hash(&mut hash);
        if let Some(data) = data {
            for value in data {
                value.to_bits().hash(&mut hash);
            }
        }
        let key = hash.finish();
        if let Some(group) = self.lut_cache.borrow().get(&key) {
            return group.clone();
        }
        let (width, height, pixels) = if let Some(data) = data {
            // Pack into a compact atlas (maximum 585 x 470 for a 65-point cube)
            // instead of a 4225-pixel row, which exceeds some WebGL limits.
            let width = size * (size as f32).sqrt().ceil() as u32;
            let height = size.pow(3).div_ceil(width);
            let mut pixels = data
                .chunks_exact(3)
                .flat_map(|p| [p[0], p[1], p[2], 1.0])
                .collect::<Vec<_>>();
            pixels.resize((width * height * 4) as usize, 0.0);
            (width, height, pixels)
        } else {
            (1, 1, vec![0.0, 0.0, 0.0, 1.0])
        };
        let texture = context.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("color-lut"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba32Float,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        context.queue().write_texture(
            texture.as_image_copy(),
            bytemuck::cast_slice(&pixels),
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(width * 16),
                rows_per_image: Some(height),
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        let view = texture.create_view(&Default::default());
        let group = context
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("color-lut-bind-group"),
                layout: &self.lut_layout,
                entries: &[wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                }],
            });
        let mut cache = self.lut_cache.borrow_mut();
        if cache.len() >= 8 {
            cache.clear();
        }
        cache.insert(key, group.clone());
        group
    }

    pub fn apply(
        &self,
        context: &GpuContext,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut encoder =
            context
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("effects-command-encoder"),
                });
        let output = self.apply_with_encoder(
            context,
            &mut encoder,
            ApplyEffectsOptions {
                source,
                width,
                height,
                passes,
            },
        )?;
        context.queue().submit([encoder.finish()]);
        Ok(output)
    }

    pub fn apply_with_encoder(
        &self,
        context: &GpuContext,
        encoder: &mut wgpu::CommandEncoder,
        ApplyEffectsOptions {
            source,
            width,
            height,
            passes,
        }: ApplyEffectsOptions<'_>,
    ) -> Result<wgpu::Texture, EffectsError> {
        let mut current_texture: Option<wgpu::Texture> = None;

        for pass in passes {
            let input_texture = current_texture.as_ref().unwrap_or(source);
            let output_texture =
                context.create_render_texture(width, height, "effects-pass-output");
            let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());
            let texture_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-texture-bind-group"),
                        layout: context.texture_sampler_bind_group_layout(),
                        entries: &[
                            wgpu::BindGroupEntry {
                                binding: 0,
                                resource: wgpu::BindingResource::TextureView(&input_view),
                            },
                            wgpu::BindGroupEntry {
                                binding: 1,
                                resource: wgpu::BindingResource::Sampler(context.linear_sampler()),
                            },
                        ],
                    });
            let uniform_buffer =
                context
                    .device()
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("effects-uniform-buffer"),
                        contents: bytemuck::bytes_of(&pack_effect_uniforms(pass, width, height)?),
                        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
                    });
            let uniform_bind_group =
                context
                    .device()
                    .create_bind_group(&wgpu::BindGroupDescriptor {
                        label: Some("effects-uniform-bind-group"),
                        layout: &self.uniform_bind_group_layout,
                        entries: &[wgpu::BindGroupEntry {
                            binding: 0,
                            resource: uniform_buffer.as_entire_binding(),
                        }],
                    });
            let pipeline = self.pipelines.get(&pass.shader).ok_or_else(|| {
                EffectsError::UnknownEffectShader {
                    shader: pass.shader.clone(),
                }
            })?;

            let lut_group = self.lut_group(context, pass);
            {
                let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                    label: Some("effects-render-pass"),
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                        view: &output_view,
                        resolve_target: None,
                        depth_slice: None,
                        ops: wgpu::Operations {
                            load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                            store: wgpu::StoreOp::Store,
                        },
                    })],
                    depth_stencil_attachment: None,
                    occlusion_query_set: None,
                    timestamp_writes: None,
                    multiview_mask: None,
                });
                render_pass.set_pipeline(pipeline);
                render_pass.set_vertex_buffer(0, context.fullscreen_quad().slice(..));
                render_pass.set_bind_group(0, &texture_bind_group, &[]);
                render_pass.set_bind_group(1, &uniform_bind_group, &[]);
                render_pass.set_bind_group(2, &lut_group, &[]);
                render_pass.draw(0..6, 0..1);
            }

            current_texture = Some(output_texture);
        }

        current_texture.ok_or(EffectsError::MissingEffectPasses)
    }
}

fn pack_effect_uniforms(
    pass: &EffectPass,
    width: u32,
    height: u32,
) -> Result<EffectUniformBuffer, EffectsError> {
    let shader = pass.shader.as_str();
    if shader == "creative" || shader == "clip-transition" {
        let n = |key, default, min, max| crate::color_grade::number(pass, key, default, min, max);
        let (direction, scalars) = if shader == "creative" {
            (
                [0.0; 2],
                [
                    n("mode", 1.0, 1.0, 8.0),
                    n("amount", 0.5, 0.0, 120.0),
                    n("detail", 1.0, 0.0, 100.0),
                    n("mix", 1.0, 0.0, 1.0),
                ],
            )
        } else {
            (
                [n("time", 0.0, 0.0, 1e9), n("duration", 1.0, 0.0001, 1e9)],
                [
                    n("inMode", 0.0, 0.0, 7.0),
                    n("inDuration", 0.5, 0.0, 30.0),
                    n("outMode", 0.0, 0.0, 7.0),
                    n("outDuration", 0.5, 0.0, 30.0),
                ],
            )
        };
        return Ok(EffectUniformBuffer {
            resolution: [width as f32, height as f32],
            direction,
            scalars,
            grade: [[0.0; 4]; 6],
            advanced: crate::color_grade::AdvancedGrade::zeroed(),
        });
    }
    if shader == COLOR_GRADE_SHADER_ID {
        let read = |key: &str, default: f32, min: f32, max: f32| -> Result<f32, EffectsError> {
            let value = if pass.uniforms.contains_key(key) {
                read_number_uniform(pass, key)?
            } else {
                default
            };
            Ok(if value.is_finite() {
                value.clamp(min, max)
            } else {
                default
            })
        };
        let mut grade = [[0.0; 4]; 6];
        for (index, wheel) in ["lift", "gamma", "gain", "offset"].iter().enumerate() {
            grade[index] = [
                read(&format!("{wheel}X"), 0.0, -1.0, 1.0)?,
                read(&format!("{wheel}Y"), 0.0, -1.0, 1.0)?,
                read(wheel, 0.0, -1.0, 1.0)?,
                0.0,
            ];
        }
        grade[4] = [
            read("exposure", 0.0, -4.0, 4.0)?,
            read("contrast", 1.0, 0.0, 2.0)?,
            read("saturation", 1.0, 0.0, 2.0)?,
            read("temperature", 0.0, -1.0, 1.0)?,
        ];
        grade[5] = [
            read("tint", 0.0, -1.0, 1.0)?,
            read("pivot", 0.18, 0.01, 1.0)?,
            read("shadows", 0.0, -1.0, 1.0)?,
            read("highlights", 0.0, -1.0, 1.0)?,
        ];
        return Ok(EffectUniformBuffer {
            resolution: [width as f32, height as f32],
            direction: [0.0; 2],
            scalars: [0.0; 4],
            grade,
            advanced: crate::color_grade::pack(pass),
        });
    }
    if shader != GAUSSIAN_BLUR_SHADER_ID {
        return Err(EffectsError::UnknownEffectShader {
            shader: shader.to_string(),
        });
    }
    let sigma = read_number_uniform(pass, "u_sigma")?;
    let step = read_number_uniform(pass, "u_step")?;
    let direction = read_vec2_uniform(pass, "u_direction")?;

    for uniform in pass.uniforms.keys() {
        if uniform == "u_sigma" || uniform == "u_step" || uniform == "u_direction" {
            continue;
        }
        return Err(EffectsError::UnsupportedUniform {
            shader: shader.to_string(),
            uniform: uniform.clone(),
        });
    }

    Ok(EffectUniformBuffer {
        resolution: [width as f32, height as f32],
        direction,
        scalars: [sigma, step, 0.0, 0.0],
        grade: [[0.0; 4]; 6],
        advanced: crate::color_grade::AdvancedGrade::zeroed(),
    })
}

fn read_number_uniform(pass: &EffectPass, uniform: &str) -> Result<f32, EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    match value {
        UniformValue::Number(value) => Ok(*value),
        UniformValue::Vector(_) => Err(EffectsError::InvalidNumberUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        }),
    }
}

fn read_vec2_uniform(pass: &EffectPass, uniform: &str) -> Result<[f32; 2], EffectsError> {
    let Some(value) = pass.uniforms.get(uniform) else {
        return Err(EffectsError::MissingUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
        });
    };
    let UniformValue::Vector(values) = value else {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    };
    if values.len() != 2 {
        return Err(EffectsError::InvalidVectorUniform {
            shader: pass.shader.clone(),
            uniform: uniform.to_string(),
            expected_length: 2,
        });
    }
    Ok([values[0], values[1]])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grade(params: &[(&str, f32)]) -> EffectPass {
        EffectPass {
            shader: COLOR_GRADE_SHADER_ID.into(),
            uniforms: params
                .iter()
                .map(|(key, value)| (key.to_string(), UniformValue::Number(*value)))
                .collect(),
        }
    }

    #[test]
    fn grade_defaults_and_invalid_values_are_safe() {
        let packed = pack_effect_uniforms(&grade(&[]), 1920, 1080).unwrap();
        assert_eq!(packed.grade[0], [0.0; 4]);
        assert_eq!(packed.grade[4], [0.0, 1.0, 1.0, 0.0]);
        assert_eq!(packed.grade[5], [0.0, 0.18, 0.0, 0.0]);
        let packed = pack_effect_uniforms(
            &grade(&[("exposure", 100.0), ("contrast", f32::NAN), ("pivot", -2.0)]),
            1,
            1,
        )
        .unwrap();
        assert_eq!(packed.grade[4][0], 4.0);
        assert_eq!(packed.grade[4][1], 1.0);
        assert_eq!(packed.grade[5][1], 0.01);
    }

    #[test]
    fn gpu_grade_preserves_identity_alpha_and_changes_pixels() {
        let context = pollster::block_on(GpuContext::new())
            .expect("A GPU is needed for the rendering regression test");
        let pipeline = EffectPipeline::new(&context);
        let input = [51_u8, 102, 153, 128];
        let render_passes = |passes: &[EffectPass]| -> Vec<u8> {
            let mut bytes = input;
            let bgra = context.texture_format() == wgpu::TextureFormat::Bgra8Unorm;
            if bgra {
                bytes.swap(0, 2);
            }
            let source = context.create_render_texture(1, 1, "test-source");
            context.queue().write_texture(
                source.as_image_copy(),
                &bytes,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(4),
                    rows_per_image: Some(1),
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
            let output = pipeline
                .apply(
                    &context,
                    ApplyEffectsOptions {
                        source: &source,
                        width: 1,
                        height: 1,
                        passes,
                    },
                )
                .unwrap();
            let readback = context.device().create_buffer(&wgpu::BufferDescriptor {
                label: Some("test-readback"),
                size: 256,
                usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                mapped_at_creation: false,
            });
            let mut encoder = context.device().create_command_encoder(&Default::default());
            encoder.copy_texture_to_buffer(
                output.as_image_copy(),
                wgpu::TexelCopyBufferInfo {
                    buffer: &readback,
                    layout: wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(256),
                        rows_per_image: Some(1),
                    },
                },
                wgpu::Extent3d {
                    width: 1,
                    height: 1,
                    depth_or_array_layers: 1,
                },
            );
            context.queue().submit([encoder.finish()]);
            let (tx, rx) = std::sync::mpsc::channel();
            readback
                .slice(..)
                .map_async(wgpu::MapMode::Read, move |result| {
                    tx.send(result).unwrap();
                });
            context
                .device()
                .poll(wgpu::PollType::wait_indefinitely())
                .unwrap();
            rx.recv().unwrap().unwrap();
            let mut pixels = readback.slice(..).get_mapped_range()[..4].to_vec();
            if bgra {
                pixels.swap(0, 2);
            }
            pixels
        };
        let render = |params: &[(&str, f32)]| render_passes(&[grade(params)]);
        let identity = render(&[]);
        for (actual, expected) in identity.iter().zip(input) {
            assert!((*actual as i32 - expected as i32).abs() <= 1);
        }
        let bright = render(&[("exposure", 1.0)]);
        assert!(bright[0] > identity[0] + 40);
        assert_eq!(bright[3], input[3]);
        let gray = render(&[("saturation", 0.0)]);
        assert!((gray[0] as i32 - gray[1] as i32).abs() <= 1);
        assert!((gray[1] as i32 - gray[2] as i32).abs() <= 1);
        let warm = render(&[("temperature", 1.0)]);
        assert!(warm[0] > identity[0]);
        assert!(warm[2] < identity[2]);
        for wheel in ["liftX", "gammaX", "gainX", "offsetX"] {
            let graded = render(&[(wheel, 0.5)]);
            assert!(graded[0] > identity[0], "{wheel} must raise red");
            assert!(graded[1] < identity[1], "{wheel} must lower green");
            assert_eq!(graded[3], input[3]);
        }
        // A zero node key, a rejected qualifier and a window outside the pixel
        // must all retain the node input (including its alpha).
        for params in [
            vec![("exposure", 1.0), ("keyGain", 0.0)],
            vec![
                ("exposure", 1.0),
                ("qualifierEnabled", 1.0),
                ("lumLow", 0.9),
            ],
            vec![
                ("exposure", 1.0),
                ("windowType", 1.0),
                ("windowX", 0.0),
                ("windowY", 0.0),
                ("windowWidth", 0.1),
                ("windowHeight", 0.1),
            ],
        ] {
            assert_eq!(render(&params), identity);
        }
        let keyed = render(&[("exposure", 1.0), ("keyGain", 0.5)]);
        assert!((keyed[0] as i32 - (identity[0] as i32 + bright[0] as i32) / 2).abs() <= 1);
        assert_eq!(
            render(&[("monitorMatte", 1.0), ("keyGain", 0.0)]),
            [0, 0, 0, 128]
        );
        assert_eq!(render(&[("monitorMatte", 1.0)]), [255, 255, 255, 128]);
        let inverted = render(&[
            ("exposure", 1.0),
            ("qualifierEnabled", 1.0),
            ("lumLow", 0.9),
            ("qualifierInvert", 1.0),
        ]);
        assert_eq!(inverted, bright);
        let swapped = render(&[
            ("mix00", 0.0),
            ("mix02", 1.0),
            ("mix20", 1.0),
            ("mix22", 0.0),
        ]);
        assert!((swapped[0] as i32 - input[2] as i32).abs() <= 1);
        assert!((swapped[2] as i32 - input[0] as i32).abs() <= 1);
        let mut curved = grade(&[]);
        curved.uniforms.insert(
            "curveR".into(),
            UniformValue::Vector(vec![0.0, 0.0, 1.0, 0.5]),
        );
        let curved = render_passes(&[curved]);
        assert!((curved[0] as i32 - 26).abs() <= 1);
        assert!((curved[1] as i32 - input[1] as i32).abs() <= 1);
        // Serial nodes must read the previous output, in order.
        let first = grade(&[("exposure", 1.0)]);
        let second = grade(&[("offset", 0.2)]);
        let forward = render_passes(&[first.clone(), second.clone()]);
        let reverse = render_passes(&[second, first]);
        assert!(reverse[0] > forward[0] + 10);
        // The edit page uses these exact shaders for both preview and export.
        let custom = |shader: &str, params: &[(&str, f32)]| {
            let mut pass = grade(params);
            pass.shader = shader.into();
            render_passes(&[pass])
        };
        for mode in 1..=8 {
            assert_eq!(
                custom("creative", &[("mode", mode as f32), ("mix", 0.0)]),
                identity
            );
        }
        let sepia = custom("creative", &[("mode", 6.0), ("amount", 1.0)]);
        assert!(sepia[0] > sepia[1] && sepia[1] > sepia[2]);
        assert_eq!(sepia[3], input[3]);
        let fade = custom(
            "clip-transition",
            &[
                ("inMode", 1.0),
                ("inDuration", 1.0),
                ("duration", 4.0),
                ("time", 0.5),
            ],
        );
        assert!((fade[3] as i32 - 64).abs() <= 1);
        assert_eq!(&fade[..3], &identity[..3]);
        assert_eq!(
            custom(
                "clip-transition",
                &[
                    ("inMode", 1.0),
                    ("inDuration", 1.0),
                    ("duration", 4.0),
                    ("time", 1.0)
                ]
            ),
            identity
        );
        let white = custom(
            "clip-transition",
            &[("inMode", 3.0), ("inDuration", 1.0), ("duration", 4.0)],
        );
        assert_eq!(white, [255, 255, 255, 128]);
        let exit = custom(
            "clip-transition",
            &[
                ("outMode", 1.0),
                ("outDuration", 1.0),
                ("duration", 4.0),
                ("time", 4.0),
            ],
        );
        assert_eq!(exit[3], 0);
        for mode in 4..=7 {
            assert_eq!(
                custom(
                    "clip-transition",
                    &[
                        ("inMode", mode as f32),
                        ("inDuration", 1.0),
                        ("duration", 4.0)
                    ]
                )[3],
                0
            );
            assert_eq!(
                custom(
                    "clip-transition",
                    &[
                        ("inMode", mode as f32),
                        ("inDuration", 1.0),
                        ("duration", 4.0),
                        ("time", 1.0)
                    ]
                ),
                identity
            );
        }
        // Exercise compact atlas addressing and all three interpolation axes,
        // including the largest supported table.
        for size in [2_u32, 65] {
            let mut lut = grade(&[("lutSize", size as f32)]);
            let mut data = vec![];
            for b in 0..size {
                for g in 0..size {
                    for r in 0..size {
                        data.extend([b as f32, g as f32, r as f32].map(|n| n / (size - 1) as f32));
                    }
                }
            }
            lut.uniforms
                .insert("lutData".into(), UniformValue::Vector(data));
            let output = render_passes(&[lut.clone()]);
            for (actual, expected) in output.iter().zip([153, 102, 51, 128]) {
                assert!(
                    (*actual as i32 - expected).abs() <= 1,
                    "LUT {size} output {output:?}"
                );
            }
            lut.uniforms
                .insert("lutMix".into(), UniformValue::Number(0.0));
            assert_eq!(render_passes(&[lut]), identity);
        }
        assert_eq!(
            render(&[("lutSize", 65.0)]),
            identity,
            "Missing LUT data must bypass safely"
        );
    }
}
