import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { Checker } from "../src/checker";

describe("Intrinsic Type Validation", () => {
    it("should reject intrinsic type outside of prefix.dy", () => {
        const code = `
            value MyInt() {
                intrinsic type i32
            }
        `;

        const lexer = new Lexer(code);
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const checker = new Checker();
        checker.check(statements);

        const errors = checker.getErrors();
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("'intrinsic type' can only be used in the prefix file.");
    });
});
