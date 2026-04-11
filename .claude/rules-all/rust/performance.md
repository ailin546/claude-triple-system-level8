---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/Cargo.lock"
---
# Rust Performance

> This file extends [common/infrastructure.md#performance-optimization](../common/infrastructure.md#performance-optimization) with Rust specific content.

## Profiling

- Use `cargo flamegraph` for CPU profiling
- Use `cargo bench` with Criterion for micro-benchmarks:
  ```bash
  cargo bench
  ```

## Zero-Cost Abstractions

- Prefer iterators over manual loops — they optimize equally well
- Use `&str` over `String` in function arguments when ownership isn't needed
- Prefer stack allocation (`[T; N]`) over heap (`Vec<T>`) for fixed-size data

## Async Runtime

- Use `tokio` for async I/O workloads
- Avoid blocking calls inside async contexts — use `spawn_blocking`
- Keep async tasks small to avoid large future sizes

## Compilation

- Use `--release` for performance measurements:
  ```bash
  cargo build --release
  ```
- Enable LTO in `Cargo.toml` for production builds:
  ```toml
  [profile.release]
  lto = true
  ```

## Common Pitfalls

- Avoid unnecessary allocations (clone, to_string, collect)
- Use `Cow<'_, str>` when a function may or may not need ownership
- Prefer `Vec::with_capacity` when size is known ahead of time
