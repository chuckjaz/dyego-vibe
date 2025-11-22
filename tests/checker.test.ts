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
        // If parser failed, we should probably report these as errors too
        // But for Checker tests, we usually expect valid syntax.
        // If syntax is invalid, Checker might not run fully.
        // We wrap Parser Error into CheckerError-like object or just throw/fail test?
        // Let's return them as CheckerErrors for simplicity in testing.
        // Warning: Parser Error is generic Error, not CheckerError.
        // We map them.
        return parserErrors.map(e => {
            // Dummy token for error
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
        // Note: My parser/block implementation might treat `x` as an expression statement.
        // If parsing is correct for block expressions, this should work if I implemented logic correctly.
        // Wait, my parser might parse `x` as `ExpressionStmt(VariableExpr(x))`.
        // And `visitBlockExpr` should return the type of the last statement if it's an expression statement.

        // However, `FunctionStmt` body is an Expr. If it is a `BlockExpr`, `evaluate` calls `visitBlockExpr`.

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
});
