import { Token, TokenType } from "../src/token";
import {
    BinaryExpr, LiteralExpr, GroupingExpr, UnaryExpr, BlockExpr,
    ExpressionStmt, VarStmt, FunctionStmt, ReturnStmt, IfExpr,
    NamedType, AssignExpr, CallExpr, VariableExpr
} from "../src/ast";
import { AstPrinter } from "../src/ast_printer";

describe("AST Construction and Printing", () => {
    test("should print a complex function AST", () => {
        // fun add(a: i32, b: i32): i32 {
        //   val sum = a + b
        //   return sum
        // }

        const token = (type: TokenType, lexeme: string, literal: any = null) =>
            new Token(type, lexeme, literal, 1, 1);

        const params = [
            { name: token(TokenType.IDENTIFIER, "a"), type: new NamedType(token(TokenType.IDENTIFIER, "i32")) },
            { name: token(TokenType.IDENTIFIER, "b"), type: new NamedType(token(TokenType.IDENTIFIER, "i32")) }
        ];

        const returnType = new NamedType(token(TokenType.IDENTIFIER, "i32"));

        const bodyStmts = [
            new VarStmt(
                token(TokenType.IDENTIFIER, "sum"),
                new BinaryExpr(
                    new VariableExpr(token(TokenType.IDENTIFIER, "a")),
                    token(TokenType.PLUS, "+"),
                    new VariableExpr(token(TokenType.IDENTIFIER, "b"))
                ),
                null, // inferred type
                false // val
            ),
            new ReturnStmt(
                token(TokenType.RETURN, "return"),
                new VariableExpr(token(TokenType.IDENTIFIER, "sum"))
            )
        ];

        const body = new BlockExpr(bodyStmts);

        const func = new FunctionStmt(
            token(TokenType.IDENTIFIER, "add"),
            params,
            returnType,
            body,
            [], // no generics
            false // not mutating
        );

        const printer = new AstPrinter();
        const output = printer.print(func);

        // Expected: (fun add (a:i32 b:i32):i32 (block (val sum (+ a b)) (return sum)))
        expect(output).toBe("(fun add (a:i32 b:i32):i32 (block (val sum (+ a b)) (return sum)))");
    });

    test("should print if expression", () => {
        // if (x > 0) 1 else 0
        const token = (type: TokenType, lexeme: string, literal: any = null) =>
            new Token(type, lexeme, literal, 1, 1);

        const ifExpr = new IfExpr(
            new BinaryExpr(
                new VariableExpr(token(TokenType.IDENTIFIER, "x")),
                token(TokenType.GREATER, ">"),
                new LiteralExpr(0)
            ),
            new LiteralExpr(1),
            new LiteralExpr(0)
        );

        const printer = new AstPrinter();
        expect(printer.print(ifExpr)).toBe("(if (> x 0) 1 0)");
    });

    test("should print assignment returns old value", () => {
        // a = 5
        const token = (type: TokenType, lexeme: string, literal: any = null) =>
            new Token(type, lexeme, literal, 1, 1);

        const assign = new AssignExpr(
            token(TokenType.IDENTIFIER, "a"),
            new LiteralExpr(5)
        );

        const printer = new AstPrinter();
        expect(printer.print(assign)).toBe("(assign a 5)");
    });
});
