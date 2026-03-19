---
paths:
  - "**/*.rs"
  - "**/Cargo.toml"
  - "**/Cargo.lock"
---
# Rust Patterns

> This file extends [common/patterns.md](../common/patterns.md) with Rust specific content.

## Builder Pattern

```rust
pub struct ServerBuilder {
    port: u16,
    host: String,
}

impl ServerBuilder {
    pub fn new() -> Self {
        Self { port: 8080, host: "127.0.0.1".into() }
    }

    pub fn port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }

    pub fn build(self) -> Server {
        Server { port: self.port, host: self.host }
    }
}
```

## Newtype Pattern

Enforce type safety at zero runtime cost:

```rust
pub struct UserId(pub u64);
pub struct OrderId(pub u64);
// Compiler prevents mixing UserId and OrderId
```

## Error Enum Pattern

Define domain-specific errors with `thiserror`:

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}
```

## Trait Objects vs Generics

- Use generics (`impl Trait`) for static dispatch — zero-cost
- Use trait objects (`dyn Trait`) when you need heterogeneous collections
- Default to generics; switch to trait objects when needed

## Dependency Injection

Use trait bounds on constructors:

```rust
pub fn new_service<R: UserRepository>(repo: R) -> UserService<R> {
    UserService { repo }
}
```
