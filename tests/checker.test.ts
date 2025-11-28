import { Checker, CheckerError } from '../src/checker';
import { Parser } from '../src/parser';
import { Lexer } from '../src/lexer';
import { Stmt } from '../src/ast';

function check(source: string) {
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    const statements = parser.parse();

    const parserErrors = parser.getErrors();
    if (parserErrors.length > 0) {
        return parserErrors.map(e => {
            return new CheckerError({ lexeme: "", line: 0, column: 0 } as any, e.message);
        });
    }

    const checker = new Checker();
    checker.check(statements);
    return checker.getErrors();
}

describe('Type Checker', () => {
    test('Valid variable declaration with type', () => {
        const errors = check('var x: i32 = 10;');
        expect(errors.length).toBe(0);
    });

    test('Valid variable declaration with inference', () => {
        const errors = check('var x = 10;');
        expect(errors.length).toBe(0);
    });

    test('Invalid variable declaration type mismatch', () => {
        const errors = check('var x: i32 = "string";');
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Valid function call', () => {
        const source = `
            fun add(a: i32, b: i32): i32 {
                return a + b;
            }
            add(1, 2);
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Invalid function call argument type', () => {
        const source = `
            fun add(a: i32, b: i32): i32 {
                return a + b;
            }
            add(1, "2");
        `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Invalid function call argument count', () => {
        const source = `
            fun add(a: i32, b: i32): i32 {
                return a + b;
            }
            add(1);
        `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected 2 arguments but got 1");
    });

    test('Valid function return type', () => {
        const source = `
            fun getInt(): i32 {
                return 42;
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Invalid function return type', () => {
        const source = `
            fun getInt(): i32 {
                return "42";
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Variable reassignment type check', () => {
        const source = `
            var x: i32 = 1;
            x = 2;
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Variable reassignment invalid type', () => {
        const source = `
            var x: i32 = 1;
            x = "2";
        `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Block expression return type', () => {
        const source = `
            fun test(): i32 {
                val x = 10;
                x // Implicit return of the block
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Block expression return type mismatch', () => {
        const source = `
            fun test(): i32 {
                val x = "string";
                x
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('If expression type mismatch', () => {
        const source = `
            var x: i32 = if (true) 1 else "string";
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("If branches must return compatible types");
    });

    test('If condition must be boolean', () => {
        const source = `
            if (1) { }
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Expected type Boolean, but got i32");
    });

    test('Issue #10: Float literal 1.0 is interpreted as f64, not i32', () => {
        const source = `
            value Point(val x: f64, val y: f64) {
                fun distance() {
                    x*x + y*y
                }
            }
            val p = Point(1.0, 2.0);
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Issue #13: When expression returning value', () => {
        const source = `
            var x: i32 = when (true) {
                true -> 1
                else -> 2
            };
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('When expression branches compatibility mismatch', () => {
        const source = `
            var x = when (true) {
                true -> 1
                else -> "string"
            };
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("When branches must return compatible types");
    });

    test('When expression with subject', () => {
        const source = `
           var x: i32 = when (10) {
               1 -> 11
               2 -> 12
               else -> 13
           };
       `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('When expression with subject mismatch', () => {
        const source = `
           var x: i32 = when (10) {
               true -> 11
               else -> 12
           };
       `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Expected type i32, but got Boolean");
    });

    test('When expression returning value must have else branch', () => {
        const source = `
           var x: i32 = when (true) {
               true -> 1
           };
       `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("'when' expression must be exhaustive");
    });

    // --- Array Tests ---

    test('Array literal inference', () => {
        const source = `
           var x = [1, 2, 3];
       `;
        // Should infer i32[]
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Array literal type mismatch', () => {
        const source = `
           var x = [1, "2"];
       `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Array elements must be of the same type");
    });

    test('Array literal assignment', () => {
        const source = `
           var x: i32[] = [1, 2, 3];
       `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Array literal assignment mismatch', () => {
        const source = `
           var x: String[] = [1, 2, 3];
       `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Expected type String[], but got i32[]");
    });

    test('Nested Array literal inference', () => {
        const source = `
           var x = [[1, 2], [3, 4]];
       `;
        // Should infer i32[][]
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Nested Array literal type mismatch', () => {
        const source = `
           var x = [[1, 2], ["3", "4"]];
       `;
        const errors = check(source);
        expect(errors.length).toBe(1);
        expect(errors[0].message).toContain("Array elements must be of the same type");
    });

    test('Issue #16: Array index has incorrect type', () => {
        const source = `
            val a = [1, 2, 3];
            val b: i32 = a[0];
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Array index assignment with correct type', () => {
        const source = `
            val a = [1, 2, 3];
            a[0] = 4;
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Array index assignment with incorrect type', () => {
        const source = `
            val a = [1, 2, 3];
            a[0] = "4";
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Array index must be integer', () => {
        const source = `
            val a = [1, 2, 3];
            val b = a["0"];
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Index must be an integer");
    });

    test('Array index cannot be array', () => {
        const source = `
            val a = [1, 2, 3];
            val b = a[[0]];
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Index must be an integer");
    });

    test('Empty array literal requires explicit type', () => {
        const source = `
            val x = [];
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Cannot infer type of empty array");
    });

    test('Empty array literal with explicit type', () => {
        const source = `
            val x: i32[] = [];
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });
    test('Operator overloading type check', () => {
        const source = `
            value Vector(val x: f64, val y: f64) {
                operator fun \`+\`(other: Vector) = Vector(x = x + other.x, y = y + other.y);
                operator fun \`*\`(scale: f64) = Vector(x = x * scale, y = y * scale);
                operator fun dot(other: Vector): f64 = x * other.x + y * other.y;
            }
            val v1 = Vector(1.0, 2.0);
            val v2 = Vector(3.0, 4.0);
            val v3: Vector = v1 + v2;
            val v4: Vector = v1 * 2.0;
            val d: f64 = v1 dot v2;
        `;
        const errors = check(source);
        if (errors.length > 0) {
            console.log(errors.map(e => e.message));
        }
        expect(errors.length).toBe(0);
    });

    test('Operator overloading type mismatch', () => {
        const source = `
            value Vector(val x: f64, val y: f64) {
                operator fun \`+\`(other: Vector) = Vector(x = x + other.x, y = y + other.y);
            }
            val v1 = Vector(1.0, 2.0);
            val v3 = v1 + 2.0; // Error: Expected Vector, got f64
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Expected type Vector, but got f64");
    });
    test('examples/vector.dy checks correctly', () => {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../examples/vector.dy');
        const source = fs.readFileSync(filePath, 'utf-8');
        const errors = check(source);
        if (errors.length > 0) {
            console.log(errors.map(e => e.message));
        }
        expect(errors.length).toBe(0);
    });

    test('Forward reference of method on this fails', () => {
        const source = `
            value Foo(val x: i32) {
                fun bar() {
                    baz() // Error: baz not yet defined
                }
                fun baz() {
                    x
                }
            }
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Undefined variable 'baz'");
    });

    test('Recursive call on this succeeds', () => {
        const source = `
            value Foo(val x: i32) {
                fun factorial(n: i32): i32 {
                    if (n < 2) 1 else n * factorial(n - 1)
                }
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Backward reference of method on this succeeds', () => {
        const source = `
            value Foo(val x: i32) {
                fun baz() {
                    x
                }
                fun bar() {
                    baz()
                }
            }
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });
});

describe('Extension Methods', () => {
    test('parses extension method', () => {
        // We need to access parser directly for this test as check() swallows AST
        const lexer = new Lexer('fun i32.square(): i32 { return this * this; }');
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const stmts = parser.parse();

        expect(stmts.length).toBe(1);
        // We need to cast to any or import FunctionStmt/NamedType if not available
        // They are imported in checker.test.ts
        const { FunctionStmt, NamedType } = require('../src/ast');
        const func = stmts[0] as any;
        expect(func).toBeInstanceOf(FunctionStmt);
        expect(func.name.lexeme).toBe('square');
        expect(func.extensionType).toBeInstanceOf(NamedType);
        expect((func.extensionType as any).name.lexeme).toBe('i32');
    });

    test('checks extension method on primitive', () => {
        const source = `
      fun f64.floor(): f64 { return this; }
      val pi = 3.14;
      val three = pi.floor();
    `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('checks extension method on user type', () => {
        const source = `
      value Point(val x: f64, val y: f64) {}
      fun Point.sum(): f64 { return this.x + this.y; }
      val p = Point(1.0, 2.0);
      val s = p.sum();
    `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('extension method resolves correctly', () => {
        const source = `
       fun i32.inc(): i32 { return this + 1; }
       val x = 1.inc();
     `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('instance method takes precedence', () => {
        const source = `
        value Box(val x: i32) {
            fun foo(): i32 { return 1; }
        }
        fun Box.foo(): i32 { return 2; }

        val b = Box(10);
        val r = b.foo();
      `;
        const errors = check(source);
        expect(errors.length).toBe(0);

        const source2 = `
        value Box(val x: i32) {
            fun foo(): i32 { return 1; }
        }
        fun Box.foo(): f64 { return 2.0; }

        val b = Box(10);
        val r: i32 = b.foo(); // Should be i32 (instance)
      `;
        const errors2 = check(source2);
        expect(errors2.length).toBe(0);

        const source3 = `
        value Box(val x: i32) {
            fun foo(): i32 { return 1; }
        }
        fun Box.foo(): f64 { return 2.0; }

        val b = Box(10);
        val r: f64 = b.foo(); // Should fail if instance is picked
      `;
        const errors3 = check(source3);
        expect(errors3.length).toBeGreaterThan(0);
        expect(errors3[0].message).toContain("Expected type f64, but got i32");
    });

    test('extension method scoping', () => {
        const source = `
        val x = 1;
        if (true) {
            fun i32.plusOne(): i32 { return this + 1; }
            val y = x.plusOne();
        }
      `;
        const errors = check(source);
        expect(errors.length).toBe(0);

        const sourceFail = `
        val x = 1;
        if (true) {
            fun i32.plusOne(): i32 { return this + 1; }
        }
        val z = x.plusOne();
      `;
        const errorsFail = check(sourceFail);
        expect(errorsFail.length).toBeGreaterThan(0);
        expect(errorsFail[0].message).toContain("Undefined property or method 'plusOne'");
    });
});
