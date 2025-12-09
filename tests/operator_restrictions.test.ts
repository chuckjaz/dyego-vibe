import { Checker } from '../src/checker.js';
import { Parser } from '../src/parser.js';
import { Lexer } from '../src/lexer.js';

function check(source: string) {
    const lexer = new Lexer(source, "test.dy");
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    const statements = parser.parse();
    const parserErrors = parser.getErrors();
    if (parserErrors.length > 0) {
        return parserErrors;
    }
    const checker = new Checker();
    checker.check(statements);
    return checker.getErrors();
}

describe('Operator Restrictions', () => {
    test('Operator type mismatch fails', () => {
        const source = `
            val a = 1;
            val b = "string";
            val c = a + b;
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Expected type i32, but got String");
    });

    test('Undefined operator fails', () => {
        const source = `
            val a = true;
            val b = false;
            val c = a / b;
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Operator '/' is not defined for type 'Boolean'");
    });

    test('Defined operator succeeds', () => {
        const source = `
            val a = 1;
            val b = 2;
            val c = a + b;
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Structural equality succeeds for defined types', () => {
        const source = `
            val a = 1;
            val b = 2;
            val c = a == b;
        `;
        const errors = check(source);
        expect(errors.length).toBe(0);
    });

    test('Structural equality fails for undefined types (if any)', () => {
        // Currently all primitives have == defined.
        // Let's try to define a new type without == and see if it fails.
        const source = `
            value MyType() {}
            val a = MyType();
            val b = MyType();
            val c = a == b;
        `;
        const errors = check(source);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("Operator '==' is not defined for type 'MyType'");
    });
});
