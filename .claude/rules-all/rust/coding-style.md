---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/Cargo.lock"
---
# Rust Coding Style

> This file extends [common/quality-and-security.md#coding-style](../common/quality-and-security.md#coding-style) with Rust specific content.

## Formatting

- **rustfmt** is mandatory — enforced by post-edit-format hook
- Use `edition = "2021"` or later in `Cargo.toml`

## Ownership & Borrowing

- Prefer borrowing (`&T`, `&mut T`) over cloning
- Use `Clone` only when ownership transfer is genuinely needed
- Avoid `Rc`/`Arc` unless shared ownership is required by design

## Error Handling

Use `Result<T, E>` with the `?` operator — never `unwrap()` in library code:

```rust
fn read_config(path: &Path) -> Result<Config, ConfigError> {
    let content = fs::read_to_string(path)?;
    let config: Config = toml::from_str(&content)?;
    Ok(config)
}
```

## Naming Conventions

- Types: `PascalCase`
- Functions/methods: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- Modules: `snake_case`
- Lifetimes: short lowercase (`'a`, `'b`)

## Design Principles

- Prefer composition over inheritance (traits + generics)
- Use newtypes to enforce type safety (`struct UserId(u64)`)
- Keep `unsafe` blocks minimal and well-documented
- Prefer `impl Trait` in argument position for flexibility

## Reference

See skill: `rust-patterns` (when available) for comprehensive Rust idioms.
