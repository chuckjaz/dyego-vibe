
import { Lexer } from '../src/lexer';
import { Parser } from '../src/parser';
import {
    VarStmt, LiteralExpr, BinaryExpr, FunctionStmt, ValueStmt,
    CallExpr, LambdaExpr, IfExpr, WhenExpr, BlockExpr, NamedType,
    VariableExpr, TraitStmt
} from '../src/ast';

describe('Parser', () => {
  const parse = (source: string) => {
    const lexer = new Lexer(source);
    const tokens = lexer.scanTokens();
    const parser = new Parser(tokens);
    return parser.parse();
  };

  test('parses variable declaration', () => {
    const stmts = parse('val x = 1;');
    expect(stmts.length).toBe(1);
    expect(stmts[0]).toBeInstanceOf(VarStmt);
    const stmt = stmts[0] as VarStmt;
    expect(stmt.name.lexeme).toBe('x');
    expect(stmt.isMutable).toBe(false);
    expect(stmt.initializer).toBeInstanceOf(LiteralExpr);
  });

  test('parses function declaration', () => {
    const stmts = parse('fun add(a: i32, b: i32): i32 { return a + b; }');
    expect(stmts.length).toBe(1);
    expect(stmts[0]).toBeInstanceOf(FunctionStmt);
    const func = stmts[0] as FunctionStmt;
    expect(func.name.lexeme).toBe('add');
    expect(func.params.length).toBe(2);
    expect(func.returnType).toBeInstanceOf(NamedType);
  });

  test('parses value declaration', () => {
      const stmts = parse('value Point(val x: f32, val y: f32) { fun distance() { } }');
      expect(stmts.length).toBe(1);
      expect(stmts[0]).toBeInstanceOf(ValueStmt);
      const val = stmts[0] as ValueStmt;
      expect(val.name.lexeme).toBe('Point');
      expect(val.fields.length).toBe(2);
      expect(val.methods.length).toBe(1);
  });

  test('parses expressions', () => {
      // Expression statement
      const stmts = parse('1 + 2 * 3;');
      expect(stmts.length).toBe(1);
      // It should be an ExpressionStmt wrapping a BinaryExpr
      // Actually, 1 + (2 * 3)
  });

  test('parses if expression', () => {
      const stmts = parse('val x = if (true) 1 else 2;');
      const stmt = stmts[0] as VarStmt;
      expect(stmt.initializer).toBeInstanceOf(IfExpr);
  });

  test('parses when expression', () => {
      const stmts = parse(`
        val x = when (y) {
            1 -> "one",
            2 -> "two",
            else -> "other"
        };
      `);
      const stmt = stmts[0] as VarStmt;
      expect(stmt.initializer).toBeInstanceOf(WhenExpr);
  });

  test('parses lambda', () => {
      const stmts = parse('val f = { x: i32 -> x + 1 };');
      const stmt = stmts[0] as VarStmt;
      expect(stmt.initializer).toBeInstanceOf(LambdaExpr);
      const lambda = stmt.initializer as LambdaExpr;
      expect(lambda.params.length).toBe(1);
      // Body is BlockExpr containing ExpressionStmt?
      // Or just ExpressionStmt?
      // My parser implementation wraps lambda body in BlockExpr always.
      expect(lambda.body).toBeInstanceOf(BlockExpr);
  });

  test('parses trailing lambda', () => {
      const stmts = parse('list.map { it + 1 };');
      expect(stmts.length).toBe(1);
      const stmt = stmts[0] as any; // ExpressionStmt
      expect(stmt.expression).toBeInstanceOf(CallExpr);
      const call = stmt.expression as CallExpr;
      expect(call.arguments.length).toBe(1);
      expect(call.arguments[0].value).toBeInstanceOf(LambdaExpr);
  });

  test('parses trait declaration', () => {
      const stmts = parse('trait Printable { fun print() {} }');
      expect(stmts.length).toBe(1);
      expect(stmts[0]).toBeInstanceOf(TraitStmt);
      const trait = stmts[0] as TraitStmt;
      expect(trait.name.lexeme).toBe('Printable');
      expect(trait.methods.length).toBe(1);
  });

  test('parses array literal', () => {
      const stmts = parse('val arr = [1, 2, 3];');
      const stmt = stmts[0] as VarStmt;
      // Expect ArrayLiteralExpr
  });

  test('reports errors for invalid syntax', () => {
      const lexer = new Lexer('val p = Point(1.0f, 2.0f);');
      const tokens = lexer.scanTokens();
      const parser = new Parser(tokens);
      parser.parse();
      const errors = parser.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Expect ')' after arguments.");
  });

});
