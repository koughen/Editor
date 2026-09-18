/// Display-referred scopes from the rendered viewer, sampled by the UI.
/// Returns a 256 x 128 RGBA image. Transparent pixels do not contribute.
pub fn color_scope(rgba: &[u8], width: usize, parade: bool) -> Vec<u8> {
    const W: usize = 256;
    const H: usize = 128;
    let mut density = vec![[0_u32; 3]; W * H];
    if width > 0 {
        for (i, pixel) in rgba.chunks_exact(4).enumerate() {
            if pixel[3] == 0 {
                continue;
            }
            let source_x = i % width;
            if parade {
                for channel in 0..3 {
                    let x = ((source_x * W / width) + channel * W) / 3;
                    let y = H - 1 - pixel[channel] as usize * (H - 1) / 255;
                    density[y * W + x][channel] += 1;
                }
            } else {
                let luma = (0.2126 * pixel[0] as f32
                    + 0.7152 * pixel[1] as f32
                    + 0.0722 * pixel[2] as f32)
                    .round() as usize;
                let x = source_x * W / width;
                let y = H - 1 - luma.min(255) * (H - 1) / 255;
                for channel in &mut density[y * W + x] {
                    *channel += 1;
                }
            }
        }
    }
    density
        .iter()
        .flat_map(|channels| {
            let rgb = channels.map(|n| {
                if n == 0 {
                    0
                } else {
                    (60.0 + (n as f32).sqrt() * 35.0).min(255.0) as u8
                }
            });
            [
                rgb[0],
                rgb[1],
                rgb[2],
                if channels.iter().any(|n| *n > 0) {
                    255
                } else {
                    0
                },
            ]
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waveform_places_black_at_bottom_and_white_at_top() {
        let pixels = color_scope(&[0, 0, 0, 255, 255, 255, 255, 255], 2, false);
        assert!(pixels[(127 * 256) * 4] > 0);
        assert!(pixels[128 * 4] > 0);
        assert_eq!(pixels[(64 * 256) * 4 + 3], 0);
    }
    #[test]
    fn transparent_and_empty_frames_have_no_signal() {
        assert!(color_scope(&[], 0, false).iter().all(|p| *p == 0));
        assert!(
            color_scope(&[255, 255, 255, 0], 1, true)
                .iter()
                .all(|p| *p == 0)
        );
    }
    #[test]
    fn parade_separates_rgb_channels() {
        let pixels = color_scope(&[255, 0, 0, 255], 1, true);
        assert!(pixels[0] > 0);
        assert_eq!(pixels[1], 0);
        assert!(pixels[(127 * 256 + 85) * 4 + 1] > 0);
        assert!(pixels[(127 * 256 + 170) * 4 + 2] > 0);
    }
    #[test]
    fn histogram_vectorscope_and_rgb_place_known_colors() {
        let gray = [128, 128, 128, 255];
        let histogram = color_scope_mode(&gray, 1, "histogram");
        assert!(histogram[(127 * 256 + 128) * 4] > 0);
        assert_eq!(histogram[(127 * 256 + 127) * 4 + 3], 0);
        let vector = color_scope_mode(&gray, 1, "vectorscope");
        assert!(vector[(64 * 256 + 128) * 4 + 3] > 0);
        let rgb = color_scope_mode(&[255, 0, 0, 255], 1, "rgb");
        assert!(rgb[0] > 0);
        assert!(rgb[127 * 256 * 4 + 1] > 0);
        for mode in ["histogram", "vectorscope", "rgb"] {
            assert!(
                color_scope_mode(&[255, 0, 0, 0], 1, mode)
                    .iter()
                    .all(|v| *v == 0)
            );
        }
    }
}

pub fn color_scope_mode(rgba: &[u8], width: usize, mode: &str) -> Vec<u8> {
    if mode == "waveform" || mode == "parade" {
        return color_scope(rgba, width, mode == "parade");
    }
    let mut out = vec![0u8; 256 * 128 * 4];
    if mode == "histogram" {
        let mut bins = [[0u32; 3]; 256];
        for pixel in rgba.chunks_exact(4).filter(|p| p[3] > 0) {
            for c in 0..3 {
                bins[pixel[c] as usize][c] += 1;
            }
        }
        let max = bins
            .iter()
            .flat_map(|b| b.iter())
            .copied()
            .max()
            .unwrap_or(1)
            .max(1) as f32;
        for (x, bin) in bins.iter().enumerate() {
            for c in 0..3 {
                let height = (bin[c] as f32 / max * 127.0).ceil() as usize;
                for y in (128 - height)..128 {
                    out[(y * 256 + x) * 4 + c] = 190;
                    out[(y * 256 + x) * 4 + 3] = 255;
                }
            }
        }
    } else {
        let mut density = vec![[0u32; 3]; 256 * 128];
        for (i, p) in rgba.chunks_exact(4).enumerate().filter(|(_, p)| p[3] > 0) {
            if mode == "vectorscope" {
                let r = p[0] as f32 / 255.0;
                let g = p[1] as f32 / 255.0;
                let b = p[2] as f32 / 255.0;
                let cb = -0.114572 * r - 0.385428 * g + 0.5 * b;
                let cr = 0.5 * r - 0.454153 * g - 0.045847 * b;
                let x = ((cb + 0.5) * 255.0).round().clamp(0.0, 255.0) as usize;
                let y = ((0.5 - cr) * 127.0).round().clamp(0.0, 127.0) as usize;
                for c in 0..3 {
                    density[y * 256 + x][c] += 1;
                }
            } else if width > 0 {
                for c in 0..3 {
                    let x = (i % width) * 256 / width;
                    let y = 127 - p[c] as usize * 127 / 255;
                    density[y * 256 + x][c] += 1;
                }
            }
        }
        for (i, channels) in density.iter().enumerate() {
            for c in 0..3 {
                if channels[c] > 0 {
                    out[i * 4 + c] = (60.0 + (channels[c] as f32).sqrt() * 35.0).min(255.0) as u8;
                    out[i * 4 + 3] = 255;
                }
            }
        }
    }
    out
}
