---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/Cargo.lock"
---
# Rust Testing

> This file extends [common/quality-and-security.md#testing-requirements](../common/quality-and-security.md#testing-requirements) with Rust specific content.

## Framework

Use the built-in `#[cfg(test)]` module with `#[test]` attributes.

## Test Organization

- Unit tests: inline `mod tests` at the bottom of each module
- Integration tests: `tests/` directory at crate root
- Doc tests: `///` examples that double as tests

## Running Tests

```bash
cargo test
```

## Coverage

```bash
cargo tarpaulin --out html
```

## Property-Based Testing

Use `proptest` or `quickcheck` for exhaustive input validation:

```rust
proptest! {
    #[test]
    fn parse_roundtrip(s in "\\PC*") {
        // property assertions
    }
}
```

## Assertions

Prefer `assert_eq!` and `assert_ne!` over raw `assert!` for clear diff output.
