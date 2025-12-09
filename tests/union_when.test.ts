import { Lexer } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import { Checker } from '../src/checker.js';

function check(source: string) {
    const lexer = new Lexer(source, "test.dy");
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    const statements = parser.parse();
    if (parser.getErrors().length > 0) {
        throw parser.getErrors()[0];
    }
    const checker = new Checker();
    checker.check(statements);
    if (checker.getErrors().length > 0) {
        throw checker.getErrors()[0];
    }
}

function checkError(source: string, expectedError: string) {
    try {
        check(source);
        throw new Error("Expected error but got none.");
    } catch (e: any) {
        if (!e.message.includes(expectedError)) {
            throw new Error(`Expected error containing "${expectedError}", but got "${e.message}"`);
        }
    }
}

describe('Union Type Checking', () => {
    test('Basic union compatibility', () => {
        check(`
            val x: i32 | f64 = 1;
            val y: i32 | f64 = 1.0;
        `);
    });

    test('Union assignment', () => {
        check(`
            var x: i32 | f64 = 1;
            x = 2.0;
        `);
    });

    test('Incompatible assignment', () => {
        checkError(`
            var x: i32 | f64 = 1;
            x = "string";
        `, "Expected type i32 | f64, but got String.");
    });
});

describe('When Expression with Is', () => {
    test('Exhaustive when with is', () => {
        check(`
            val x: i32 | f64 = 1;
            when (x) {
                is i32 -> { }
                is f64 -> { }
            }
        `);
    });

    test('When with else', () => {
        check(`
            val x: i32 | f64 | String = 1;
            when (x) {
                is i32 -> { }
                else -> { }
            }
        `);
    });

    test('Not exhaustive error', () => {
        checkError(`
            val x: i32 | f64 = 1;
            when (x) {
                is i32 -> { }
            }
        `, "When expression is not exhaustive. Missing cases: f64.");
    });

    test('Redundant else error', () => {
        checkError(`
            val x: i32 | f64 = 1;
            when (x) {
                is i32 -> { }
                is f64 -> { }
                else -> { }
            }
        `, "'else' branch is redundant because all cases are covered.");
    });

    test('Flow typing', () => {
        // Assuming i32 has some method or we can check type compatibility inside
        // Since we don't have methods on primitives easily accessible in tests without setup,
        // we can check assignment to specific type.
        check(`
            val x: i32 | f64 = 1;
            when (x) {
                is i32 -> {
                    val y: i32 = x; // Should be allowed
                }
                is f64 -> {
                    val z: f64 = x; // Should be allowed
                }
            }
        `);
    });

    test('Flow typing error', () => {
        checkError(`
            val x: i32 | f64 = 1;
            when (x) {
                is i32 -> {
                    val y: f64 = x; // Should fail
                }
                is f64 -> { }
            }
        `, "Expected type f64, but got i32.");
    });

    test('Is condition with non-union subject', () => {
        // Should be allowed if types are compatible?
        // "Check that the expression e is a union type for which the type is compatible."
        // If e is i32, is i32 is compatible.
        check(`
            val x: i32 = 1;
            when (x) {
                is i32 -> {}
            }
         `);
    });

    test('Is condition incompatible type', () => {
        checkError(`
            val x: i32 = 1;
            when (x) {
                is String -> {}
                else -> {}
            }
        `, "Type 'String' is not compatible with subject type 'i32'.");
    });
});
