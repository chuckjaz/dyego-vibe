# Dyego Programming Language

Dyego is a new programming language centered around mutable value semantics. In Dyego, whenever a value is assigned, passed as an argument, or returned, a copy of that value is made.

## Key Features

### Mutable Value Semantics
- **Deep Copying**: Assignment, argument passing, and returning values always create copies.
- **Declarations**:
  - `val`: Declares a variable holding a deeply immutable copy.
  - `var`: Declares a variable holding an independent, mutable copy.

### Type System
- **Value Types**: Defined using `value TypeName(valField: Type, var varField: Type) { ... }`.
  - `val` fields: Read-only, set during initialization.
  - `var` fields: Mutable, set during initialization and modifiable by mutating methods (if the instance is `var`).
- **Primitive Types**: Integers (`i8` - `i64`, `u8` - `u64`), Floats (`f32`, `f64`), `Boolean`, `Rune`, and `String` (immutable `u8[]`).
- **Arrays**: `Type[]` (e.g., `i32[]`). Mutability depends on the variable assignment (`val` vs `var`).
- **Generics & Inference**: Supports generic types (e.g., `value Box<T>`) and comprehensive type inference.
- **Union Types & Null**: `TypeA | TypeB`. `Type?` is shorthand for `Type | Null`. `Null` represents the absence of a value and implements the `Error` trait.

### Functions & Methods
- **Functions**: `fun name(params): ReturnType`. Parameters are implicitly `val`. Always return a copy.
- **Methods**:
  - **Non-Mutating**: `fun method()`. Callable on `val` and `var`. `this` is deeply immutable.
  - **Mutating**: `var fun method()`. Callable only on `var`. `this` is mutable. Implicitly returns the modified `this`.
- **Lambdas**: Supports `{ param -> expression }` and trailing lambda syntax.
- **Named Arguments**: Supported in function calls (`paramName = value`).

### Syntax & Operators
- **Operators**: Mirrors Kotlin's operators.
- **Equality**:
  - Structural equality via `==`.
  - No object identity comparison (`===`).
- **Assignment**: Evaluates to the *previous* value of the left-hand side variable.
- **Control Flow**: Standard `if`/`else` (expressions), `when`, `for`, `while`. Labeled `break` and `continue`.

### Error Handling
- **Errors as Values**: Errors implement the `Error` trait.
- **Union Returns**: Functions return unions of success types and error types (e.g., `User | NotFoundError`).
- **Operators**:
  - `?`: Propagate error (returns error immediately or evaluates to success value).
  - `?:`: Elvis operator (default value on error).
  - `?.`: Safe-call operator.

### Compilation & Target
- **Target**: Exclusively WebAssembly (WASM).
- **Output**: Single self-contained `.wasm` module.
- **Memory Management**: WASM GC for value types, Reference Counting for primitive arrays.

### Modules & Standard Library
- **Modules**: Rust-inspired module system using `use` and dot notation (`use my_lib.utils.func`).
- **I/O**: Built-in `print` function. Other I/O must be imported.
- **Math**: Built-in WASM-mapped functions for floats (`abs`, `sqrt`, `min`, `max`).
- **Arrays**: Built-in operations (`length`, `[]` access/assign, `add`, `remove`).
