You're a programming language designer. I'm developing a new language, called Dyego, centered around mutable value semantics. This means that whenever a value is assigned, passed as an argument, or returned, a copy of that value is made.

Here are the established syntax and semantic rules:

1. Variable Declarations

    `val name = value`: Declares name as a variable holding a deeply immutable copy of value. You can't reassign name, and its held data (even complex types like arrays or custom value types) can't be internally modified.

    `var name = value`: Declares name as a variable holding an independent, mutable copy of value. You can reassign name. If value is a complex type, its internal state can be modified, but only name's specific copy will be affected.

2. Composite Value Types

    *Declaration*: `value TypeName(valField: Type, var varField: Type) { ... }`

    The `value` keyword marks a new type whose instances inherently follow value semantics.
    `val fieldName: Type` (inside a value type): Declares a field that can only be set during the value instance's initialization and remains read-only thereafter. It can't be modified by methods.

    `var fieldName: Type` (inside a value type): Declares a mutable field. It's settable during initialization and can be reassigned/modified later by mutating methods, provided the value instance it belongs to is itself a `var` variable.

3. Arrays

    Syntax: Array literals `[element1, element2, ...]` create a `Type[]` (e.g., `i32[]`).

    Mutability: An array's mutability depends on the variable it's assigned to:

    `val myArr = [1, 2]` creates a deeply immutable array copy.

    `var myArr = [1, 2]` creates an independent, mutable array copy.

4. Functions

    Syntax: `fun functionName(parameter1: Type1, parameter2: Type2): ReturnType { ... }`

    Parameters: All function parameters are implicitly val. They receive deeply immutable copies of the arguments and can't be reassigned or internally modified within the function.

    Return Values: Functions always return a copy of the result.

5. Methods on value Types

    Non-Mutating Methods: `fun methodName() { ... }`

    Callable on both `val` and `var` instances.

    `this` within these methods is implicitly `val` (deeply immutable); attempts to modify it or its fields will result in a compilation error.

    Mutating Methods: `var fun methodName() { ... }`

    Callable only on `var` instances (calling on a `val` instance is a compilation error).

    `this` within these methods is implicitly `var` (a mutable reference to the instance's copy).

    Implicit Return Value: A `var` fun method implicitly returns the modified `this` instance.

    Initialization Context: Inside a value type's initializer, this is implicitly `var` to allow for the setup of its fields.

6. Expression Syntax

    Operators: The language supports operators mirroring Kotlin's, with standard precedence rules.

    No Object Identity Comparison (`===`): The language explicitly does not include a triple equals (`===`) operator.

    Structural Equality (`==`): The `==` operator performs structural equality comparison, which recursively compares the contents of two values. Two value instances are equal if they are of the same type and all their corresponding fields are equal. Two arrays are equal if they have the same length and their elements at each index are equal.

    Assignment Expression Behavior: Uniquely, an assignment expression evaluates to the previous value of the variable on the left-hand side.

7. Lambda Syntax

    Basic Lambda: `{ param1: Type1 -> expression_or_block }`

    Trailing Lambda: A lambda argument can be moved outside the function call parentheses if it's the last argument.

8. Named Arguments

    You can name arguments in function calls using parameterName = argumentValue. Once a named argument is used, all subsequent arguments must also be named.

9. Output Model

    Target: Exclusively WebAssembly (WASM).

    Compilation: Produces a single, self-contained WASM module (.wasm file). No REPL.

    Memory Management: Uses WASM GC for value types and Reference Counting for primitive arrays.

10. Type System: Generics & Type Inferencing

    Generic Types: `value Box<T>(...)`, `fun <T> identity(value: T): T`, and `Type[]` are all supported.

    Type Inferencing: Comprehensive type inference is performed.

    Type Casting (as operator): expression as Type evaluates to `Type | Null`, returning the converted value on success or `Null` on failure.

11. Primitive Types

    Integers: `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`.

    Floating-Point: `f32`, `f64`.

    Other: `Boolean`, `Rune`, `String` (immutable `u8[]`).

    Overflow: Integer operations wrap around.

12. Control Flow

    Standard `if`/`else` (as expressions), `when` expressions, `for` loops, and `while` loops. Labeled `break` and `continue` are supported.

13. Union Types and `Null`

    The language uses union types to represent a value that could be one of several types, written as `TypeA | TypeB`.

    `Null`: There is a built-in value type named `Null` which implements the Error trait. It represents the absence of a value.

    Optional Type Shorthand: The `Type?` syntax is a shorthand for the union type `Type | Null`. All types are non-nullable by default.

14. Error Handling

    Errors are represented by values. Any value type can be designated as an error by implementing the built-in `Error` trait.

    Functions signal failure by returning a union type that includes one or more `Erro`r implementers (e.g., `fun findUser(): User | NotFoundError | DatabaseError`). `Null` is the most common and simplest error type.

    This approach allows for detailed, type-safe error information to be returned without resorting to exceptions.

15. Error Handling Operators

    Propagation Operator (`?`): `expression`? immediately returns an `Error` value from the current function or evaluates to the success value.

    Elvis Operator (`?:`): `expression ?: defaultValue` evaluates to `defaultValue` if `expression` is an `Error`, otherwise it evaluates to the success value.

    Safe-Call Operator (`?.`): `expression?.member` accesses `member` only if `expression` is not an `Error`; otherwise, it propagates the error.

16. Basic Input/Output

    The only built-in I/O is a print function. All other I/O must be imported from external modules.

17. Standard Array Operations

    Includes length property, `[]` access/assignment, and built-in var fun methods add and remove. Higher-order functions like map must be imported.

18. Built-in Math Operations

    For floating-point types (`f32`, `f64`), provides direct WASM-mapped functions: `abs(value)`, `sqrt(value)`, `min(value1, value2)`, `max(value1, value2)`.

19. Standard String Operations

    Advanced string manipulation must be imported from standard library modules.

20. Modules and Imports

    The language uses a module system with syntax inspired by Rust to organize and reuse code.

    Path Imports: The use keyword brings items into scope. Paths to items use a dot (`.`) as a separator (e.g., use `my_lib.utils.some_function`).

    List Imports: A `{}-`delimited list can be used to import multiple items from the same base path (e.g., `use my_lib.utils.{thing_one, thing_two}`).

     Trait Imports: Using the trait keyword in a path brings all trait implementations from that module into the current scope, making extension methods available (e.g., `use my_lib.extensions.trait`).
