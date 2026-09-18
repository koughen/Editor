fn main() {
    println!("cargo:rerun-if-changed=native/AudioUnitHost.swift");
    println!("cargo:rerun-if-env-changed=MACOSX_DEPLOYMENT_TARGET");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
            Ok("aarch64") => "arm64",
            Ok("x86_64") => "x86_64",
            other => panic!("Unsupported Audio Unit host architecture: {other:?}"),
        };
        let deployment_target =
            std::env::var("MACOSX_DEPLOYMENT_TARGET").unwrap_or_else(|_| "11.0".into());
        let target = format!("{arch}-apple-macos{deployment_target}");
        let output =
            std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("AudioUnitHost");
        let status = std::process::Command::new("xcrun")
            .args(["swiftc", "-O", "-target", &target, "native/AudioUnitHost.swift", "-o"])
            .arg(output)
            .status()
            .expect("Swift compiler is required for Audio Unit support");
        assert!(status.success(), "Could not compile Audio Unit host");
    }
    tauri_build::build()
}
