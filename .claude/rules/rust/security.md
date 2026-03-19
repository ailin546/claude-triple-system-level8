---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/Cargo.lock"
---
# Rust Security

> This file extends [common/security.md](../common/security.md) with Rust specific content.

## Secret Management

```rust
let api_key = std::env::var("API_KEY")
    .expect("API_KEY must be set");
```

## Security Scanning

- Use **cargo-audit** for known vulnerabilities:
  ```bash
  cargo audit
  ```
- Use **cargo-deny** for license and advisory checks:
  ```bash
  cargo deny check
  ```

## Unsafe Code

- Minimize `unsafe` blocks — document every safety invariant
- Prefer safe abstractions from `std` or well-audited crates
- Run `cargo miri test` to detect undefined behavior in unsafe code

## Input Validation

- Validate all external input at crate boundaries
- Use `TryFrom` / `FromStr` for type-safe parsing
- Never trust deserialized data — validate after `serde` decoding

## Dependency Hygiene

- Pin dependency versions in `Cargo.toml`
- Review new dependencies before adding (`cargo-crev`)
- Prefer crates with active maintenance and security track record
