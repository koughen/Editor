//! Minimal raw ABI used in AudioWorkletGlobalScope; no JS/glue/string dependencies.
use audio::{dynamics::Dynamics, loudness::Loudness, CleanupSettings};
const BLOCK: usize = 4096;
pub struct Processor {
    dynamics: Dynamics,
    meter: Option<Loudness>,
    data: [f32; BLOCK * 3 + 32],
}
#[no_mangle]
pub extern "C" fn create(rate: u32, meter: u32) -> *mut Processor {
    Box::into_raw(Box::new(Processor {
        dynamics: Dynamics::new(rate as f64),
        meter: if meter == 1 {
            Some(Loudness::new(rate))
        } else {
            None
        },
        data: [0.; BLOCK * 3 + 32],
    }))
}
#[no_mangle]
pub unsafe extern "C" fn buffer(p: *mut Processor) -> *mut f32 {
    (*p).data.as_mut_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn configure(p: *mut Processor) {
    let p = &mut *p;
    let a = &p.data[BLOCK * 3..];
    p.dynamics.update(CleanupSettings {
        noise_enabled: a[0] > 0.,
        noise_floor: a[1] as f64,
        noise_reduction: a[2] as f64,
        gate_enabled: a[3] > 0.,
        gate_threshold: a[4] as f64,
        gate_ratio: a[5] as f64,
        gate_attack: a[6] as f64,
        gate_release: a[7] as f64,
        deess_enabled: a[8] > 0.,
        deess_frequency: a[9] as f64,
        deess_threshold: a[10] as f64,
        deess_amount: a[11] as f64,
        duck_enabled: a[12] > 0.,
        duck_threshold: a[13] as f64,
        duck_amount: a[14] as f64,
        duck_attack: a[15] as f64,
        duck_release: a[16] as f64,
    });
}
#[no_mangle]
pub unsafe extern "C" fn process(p: *mut Processor, count: usize) {
    let p = &mut *p;
    let n = count.min(BLOCK);
    let (l, rest) = p.data.split_at_mut(BLOCK);
    let (r, side) = rest.split_at_mut(BLOCK);
    if let Some(m) = &mut p.meter {
        m.add(&l[..n], &r[..n]);
    } else {
        p.dynamics.process(&mut l[..n], &mut r[..n], &side[..n]);
    }
}
#[no_mangle]
pub unsafe extern "C" fn reading(p: *mut Processor) {
    let p = &mut *p;
    let out = &mut p.data[BLOCK * 3..];
    if let Some(m) = &p.meter {
        let v = m.reading();
        for (i, value) in [
            v.integrated,
            v.momentary,
            v.short_term,
            v.range,
            v.true_peak,
            Some(v.seconds),
        ]
        .iter()
        .enumerate()
        {
            out[i] = value.unwrap_or(f64::NAN) as f32;
        }
    } else {
        out[0] = p.dynamics.reduction;
    }
}
#[no_mangle]
pub unsafe extern "C" fn destroy(p: *mut Processor) {
    drop(Box::from_raw(p));
}
