
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import { AstPrinter } from '../src/ast_printer';
import { TokenType } from '../src/token';

function parse(source: string) {
    const lexer = new Lexer(source, "test.dy");
    const parser = new Parser(lexer.scanTokens());
    const statements = parser.parse();
    const errors = parser.getErrors();
    if (errors.length > 0) {
        throw new Error(errors[0].message);
    }
    return statements;
}

test('vocabulary keyword token', () => {
    const lexer = new Lexer('vocabulary', "test.dy");
    const tokens = lexer.scanTokens();
    expect(tokens[0].type).toBe(TokenType.VOCABULARY);
});

test('colon colon token', () => {
    const lexer = new Lexer('::', "test.dy");
    const tokens = lexer.scanTokens();
    expect(tokens[0].type).toBe(TokenType.COLON_COLON);
});

test('vocabulary declaration parsing', () => {
    const source = 'vocabulary { A, B }';
    const statements = parse(source);
    const printer = new AstPrinter();
    const result = statements.map(s => s.accept(printer)).join(" ");
    expect(result).toContain('(vocabulary (A B))');
});

test('qualified name parsing in expression', () => {
    const source = 'var x = A::B;';
    const statements = parse(source);
    const printer = new AstPrinter();
    const result = statements.map(s => s.accept(printer)).join(" ");
    expect(result).toContain('(var x A::B)');
});

test('qualified name parsing in function declaration', () => {
    const source = 'fun A::foo() {}';
    const statements = parse(source);
    const printer = new AstPrinter();
    const result = statements.map(s => s.accept(printer)).join(" ");
    expect(result).toContain('(fun A::foo () (block ))');
});

test('qualified name with multiple parts', () => {
    const source = 'var x = A::B::C;';
    const statements = parse(source);
    const printer = new AstPrinter();
    const result = statements.map(s => s.accept(printer)).join(" ");
    expect(result).toContain('(var x A::B::C)');
});

test('qualified name in type', () => {
    const source = 'var x: My::Type = init;';
    const statements = parse(source);
    expect(statements.length).toBe(1);
});
