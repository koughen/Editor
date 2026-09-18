/// Iridas .cube 3D lookup table, red channel varying fastest.
pub struct CubeLut {
    pub size: u32,
    pub domain_min: [f32; 3],
    pub domain_max: [f32; 3],
    pub values: Vec<f32>,
}
pub fn parse_cube(text: &str) -> Result<CubeLut, String> {
    let mut lut = CubeLut {
        size: 0,
        domain_min: [0.0; 3],
        domain_max: [1.0; 3],
        values: vec![],
    };
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() || line.starts_with("TITLE") {
            continue;
        }
        let parts: Vec<_> = line.split_whitespace().collect();
        match parts[0] {
            "LUT_1D_SIZE" => return Err("This importer supports 3D .cube LUTs, not 1D LUTs".into()),
            "LUT_3D_SIZE" => {
                lut.size = parts
                    .get(1)
                    .ok_or("Missing LUT size")?
                    .parse()
                    .map_err(|_| "Invalid LUT size")?;
                if !(2..=65).contains(&lut.size) {
                    return Err("LUT size must be between 2 and 65".into());
                }
            }
            "DOMAIN_MIN" | "DOMAIN_MAX" => {
                if parts.len() != 4 {
                    return Err("Invalid LUT domain".into());
                }
                let mut values = [0.0; 3];
                for i in 0..3 {
                    values[i] = parts[i + 1]
                        .parse::<f32>()
                        .map_err(|_| "Invalid domain number")?;
                    if !values[i].is_finite() {
                        return Err("Non-finite domain".into());
                    }
                }
                if parts[0] == "DOMAIN_MIN" {
                    lut.domain_min = values;
                } else {
                    lut.domain_max = values;
                }
            }
            _ => {
                if parts.len() != 3 {
                    return Err(format!("Invalid .cube row: {line}"));
                }
                for p in parts {
                    let n = p.parse::<f32>().map_err(|_| "Invalid LUT value")?;
                    if !n.is_finite() {
                        return Err("Non-finite LUT value".into());
                    }
                    lut.values.push(n);
                }
                if lut.values.len() > 65 * 65 * 65 * 3 {
                    return Err("LUT is too large".into());
                }
            }
        }
    }
    if lut.size < 2 || lut.values.len() != lut.size.pow(3) as usize * 3 {
        return Err("LUT data does not match LUT_3D_SIZE".into());
    }
    if (0..3).any(|i| lut.domain_max[i] <= lut.domain_min[i]) {
        return Err("LUT domain maximum must exceed its minimum".into());
    }
    Ok(lut)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_cube_files() {
        let mut text = String::from("TITLE \"Identity\"\nLUT_3D_SIZE 2\n");
        for b in 0..2 {
            for g in 0..2 {
                for r in 0..2 {
                    text.push_str(&format!("{r} {g} {b}\n"));
                }
            }
        }
        assert_eq!(parse_cube(&text).unwrap().values.len(), 24);
        assert!(parse_cube("LUT_3D_SIZE 65\n0 0 0").is_err());
        assert!(parse_cube("LUT_1D_SIZE 2").is_err());
    }
}
