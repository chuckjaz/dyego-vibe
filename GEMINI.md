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

## Implementation details

### Binary representations

#### Primitives

Primitive types are represented as their corresponding WASM types:

- `i8` -> `i32`
- `i16` -> `i32`
- `i32` -> `i32`
- `i64` -> `i64`
- `u8` -> `i32`
- `u16` -> `i32`
- `u32` -> `i32`
- `u64` -> `i64`
- `f32` -> `f32`
- `f64` -> `f64`
- `Boolean` -> `i32` (0 = false, 1 = true)
- `Rune` -> `i32`

##### Parameters

Primitive parameters are passed by value using the corresponding WASM type.

##### Local variables

Primitive local variables are represented as the corresponding WASM type.

##### Global, imported and exported variables

Primitive global and external variables are represented as the corresponding WASM type.

##### Return values

Primitive return values are returned by value using the corresponding WASM type.

##### Memory

Primitive types stored linearly in the order of declaration. The compiler is free to add padding between fields to align fields for efficiency.

The number of bytes allocated to a field is sufficient for storing the entire field value. For primitive types, they occupy,

- `i8`  -> 1 byte
- `i16` -> 2 bytes
- `i32` -> 4 bytes
- `i64` -> 8 bytes
- `u8` -> 1 byte
- `u16` -> 2 bytes
- `u32` -> 4 bytes
- `u64` -> 8 bytes
- `f32` -> 4 bytes
- `f64` -> 8 bytes
- `Boolean` -> 1 byte
- `Rune` -> 4 bytes (0 - 0x10FFFF)

##### Reference

Primitives in a reference type (that is a WASM/GC array or struct type) are represented as their corresponding WASM type.

#### Reference type

Reference types are WASM/GC allocated types and are garbage collected by the WASM GC.

##### Parameters

Reference types are represented as a WASM/GC type using the WASM/GC type specification. The details are described below for each type.

##### Local variables

Local variables of a reference type are represented as a WASM/GC type.

##### Global, exported and imported variables

Global, exported and imported variables of a reference type are represented as a WASM/GC type.

##### Return values

As with parameters and local variables, reference types as a WASM/GC type.

##### Memory

Reference types cannot be stored in a memory. They can only be stored in a local, global, or exported variable or in another reference type (or array reference type).

##### Reference

References in a reference type are represented as a WASM/GC type.

#### Array types

There are two different kinds of arrays, value arrays, and reference arrays.

A value array is a fixed size linear sequence of values indexable by an `i32`. When an array is declared with a fixed size, such as `i32[16]`, it declares a fixed size array of 16 elements and indexable by a range of `0..<16`.  If a fixed size array is index out of bound the program will trap.

When an array is declared with an unspecified length, such as `i32[]`, it is an array reference declared as a WASM/GC array type. It is indexable by an `i32`. If an reference array is indexed out of bound it will trap.

All arrays have a `size` pseudo-field of type `i32` that returns the number of elements of the array. For fixed arrays, `size` is a compile-time constant that is the value from the type declaration (e.g. `10` in a type declaration `f32[10]`). For an array reference, it is the number of elements currently allocated to the reference.

The elements of either array can be another of the same kind or of the other. For example, `i32[16][][32]` is a fixed size array of 16 reference arrays of a fixed 32 size `i32` arrays. For arrays of arrays of either kind, the syntax `a[i1][i2]` can be abbreviated `a[i1, i2]` with additional index until the element type is not an array type.

##### Parameters

When a fixed array is passed as parameter it is decomposed into individual parameters and is passed as an individual parameter. For example, if a function is declared as,

```
fun sum(vector: f32[3])
```

is transformed into,

```
fun sum(vector$0: f32, vector$1: f32, vector$2: f32)
```

and a call like,

```
sum(vector)
```

is transformed into,

```
sum(vector[0], vector[1], vector[2])
```

When a reference array is passed as a parameter it is declared as an array type from the WASM/GC specification. For example, the type `i32[]` is translated to `(array $i32$array (mut i32))`. The type of `vector` is declared as `$i32$array`.

For fixed array types whose element type is also a fixed array, the process is, appending on the index to the the name, until the element type is not an array type. If it is then a value type, the process continues as explained below for value types. 

The process of reducing a type to its constituent primitive or reference types is called flattening which will be referred to as flattening from this point forward.

##### Local variables

Local variables are flattened as described for parameters.

##### Global, imported and exported variables

Global, imported, and exported variables are flattened as described for parameters.

##### Return values

Return values are flattened and returned using the multi-value return feature of WASM.

##### Memory

Only fixed arrays whose element type can be flattened into a type that doesn't have any reference fields can be stored in a memory. When stored in a memory a fixed array elements have the same size as they would have when stored in memory. For example, an array `i8[7]` is stored in a memory as seven consecutive bytes.

A fixed array that cannot be stored in a memory is converted to a reference as described below.

##### Reference

A reference array is represented as a WASM/GC array type.

A fixed array stored in a reference converted to a reference array by first converting into a linearized array of the linear array element type. A fixed array is linearized by collapsing adjacent fixed array types into a linear array of N*M size, where N and M are the sizes of the arrays being linearized. If the linear element type is a fixed array the fixed array is then collapsed into the linear array to form another linear array. This process is repeated until the element is not a fixed array. The non-fixed array type is then the element type of the linearized array.
 
#### Value types

##### Parameters

Value types are flattened to fields until each field is a primitive or a reference type. The flattened fields are then passed as individual parameters. For example, consider the value,

```
value Point(val x: f64, val y: f64)
```

passed as a parameter to `distance` declared as,

```
fun distance(value: Point): f64
```

this can be transformed into,

```
fun distance$1(value$x: f64, value$y: f64): f64
```

The call,

```
distance(center)
```

could then be transformed into,

```
distance(center.x, center.y)
```

The flattening continues until there are only primitives or references fields. For a type like,

```
value Rectangle(val topLeft: Point, val bottomRight: Point)
```

passed into a function like,

```
fun area(rectangle: Rectangle): f64
```

This is first converted to,

```
fun area(rectangle$topLeft: Point, rectangle$bottomRight: Point): f64
```

then to,

```
fun area(rectangle$topLeft$x: f64, rectangle$topLeft$y: f64, rectangle$bottomRight$x: f64, rectangle$bottomRight$y: f64): f64
```

If the type is a fixed array type then is flattened as described above for fixed array types.

##### Local variables

Local variables are stored as the variables for each field of the flattened value type as described for parameters above.

##### Global, imported, and exported variables

Global, imported, and exported variables are stored as variables for each field of the flattened value type as described for parameters above.

##### Return values

A value type is returned as a flattened type where each field type is part of a multi-value return.
