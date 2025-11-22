import { Token, TokenType } from "./token";
import {
  Expr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LiteralExpr,
  LogicalExpr, SetExpr, ThisExpr, UnaryExpr, VariableExpr, BlockExpr, IfExpr,
  WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr,
  CastExpr, Stmt, ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt,
  ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt, TypeNode, NamedType,
  UnionType, ArrayType, OptionalType, GenericType, WhenEntry
} from "./ast";

export class Parser {
  private readonly tokens: Token[];
  private current = 0;
  private errors: Error[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Stmt[] {
    const statements: Stmt[] = [];
    while (!this.isAtEnd()) {
        const decl = this.declaration();
        if (decl) {
            statements.push(decl);
        }
    }
    return statements;
  }

  getErrors(): Error[] {
      return this.errors;
  }

  private declaration(): Stmt | null {
    try {
      if (this.match(TokenType.FUN)) return this.functionDeclaration("function");
      if (this.match(TokenType.VAR)) return this.varDeclaration();
      if (this.match(TokenType.VAL)) return this.valDeclaration();
      if (this.match(TokenType.VALUE)) return this.valueDeclaration();
      if (this.match(TokenType.USE)) return this.useDeclaration();
      if (this.match(TokenType.TRAIT)) return this.traitDeclaration();

      return this.statement();
    } catch (error: any) {
      this.errors.push(error);
      this.synchronize();
      return null;
    }
  }

  // --- Declarations ---

  private functionDeclaration(kind: string, isMethod: boolean = false, isMutating: boolean = false): FunctionStmt {
    let generics: Token[] = [];
    if (this.match(TokenType.LESS)) {
        do {
            generics.push(this.consume(TokenType.IDENTIFIER, "Expect generic parameter name."));
        } while (this.match(TokenType.COMMA));
        this.consume(TokenType.GREATER, "Expect '>' after generic parameters.");
    }

    const name = this.consume(TokenType.IDENTIFIER, `Expect ${kind} name.`);
    this.consume(TokenType.LEFT_PAREN, `Expect '(' after ${kind} name.`);
    const parameters: { name: Token, type: TypeNode }[] = [];

    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        const paramName = this.consume(TokenType.IDENTIFIER, "Expect parameter name.");
        this.consume(TokenType.COLON, "Expect ':' after parameter name.");
        const paramType = this.parseType();
        parameters.push({ name: paramName, type: paramType });
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after parameters.");

    let returnType: TypeNode | null = null;
    if (this.match(TokenType.COLON)) {
      returnType = this.parseType();
    }

    // The block() method consumes the opening brace.
    // check for '{' before calling block to ensure correct error message location if needed,
    // but block() handles it.
    if (!this.check(TokenType.LEFT_BRACE)) {
        throw this.error(this.peek(), `Expect '{' before ${kind} body.`);
    }
    const body = this.block();
    return new FunctionStmt(name, parameters, returnType, body, generics, isMutating);
  }

  private varDeclaration(): Stmt {
      if (this.check(TokenType.FUN)) {
           if (this.match(TokenType.FUN)) {
               this.error(this.previous(), "Mutating methods ('var fun') are only allowed inside 'value' types.");
           }
      }

      const name = this.consume(TokenType.IDENTIFIER, "Expect variable name.");

      let type: TypeNode | null = null;
      if (this.match(TokenType.COLON)) {
          type = this.parseType();
      }

      this.consume(TokenType.EQUAL, "Expect '=' after variable name.");
      const initializer = this.expression();
      this.consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.");
      return new VarStmt(name, initializer, type, true);
  }

  private valDeclaration(): Stmt {
      const name = this.consume(TokenType.IDENTIFIER, "Expect variable name.");

      let type: TypeNode | null = null;
      if (this.match(TokenType.COLON)) {
          type = this.parseType();
      }

      this.consume(TokenType.EQUAL, "Expect '=' after variable name.");
      const initializer = this.expression();
      this.consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.");
      return new VarStmt(name, initializer, type, false);
  }

  private valueDeclaration(): Stmt {
      const name = this.consume(TokenType.IDENTIFIER, "Expect value type name.");
      let generics: Token[] = [];
      if (this.match(TokenType.LESS)) {
        do {
            generics.push(this.consume(TokenType.IDENTIFIER, "Expect generic parameter name."));
        } while (this.match(TokenType.COMMA));
        this.consume(TokenType.GREATER, "Expect '>' after generic parameters.");
      }

      this.consume(TokenType.LEFT_PAREN, "Expect '(' after value type name.");

      const fields: { name: Token, type: TypeNode, isMutable: boolean }[] = [];
      if (!this.check(TokenType.RIGHT_PAREN)) {
          do {
              let isMutable = false;
              if (this.match(TokenType.VAR)) {
                  isMutable = true;
              } else if (this.match(TokenType.VAL)) {
                  isMutable = false;
              } else {
                  this.error(this.peek(), "Expect 'val' or 'var' for field declaration.");
              }

              const fieldName = this.consume(TokenType.IDENTIFIER, "Expect field name.");
              this.consume(TokenType.COLON, "Expect ':' after field name.");
              const fieldType = this.parseType();
              fields.push({ name: fieldName, type: fieldType, isMutable });

          } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after value type fields.");

      this.consume(TokenType.LEFT_BRACE, "Expect '{' before value type body.");

      const methods: FunctionStmt[] = [];
      while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
          if (this.match(TokenType.FUN)) {
              methods.push(this.functionDeclaration("method", true, false));
          } else if (this.match(TokenType.VAR)) {
              if (this.match(TokenType.FUN)) {
                  methods.push(this.functionDeclaration("method", true, true));
              } else {
                   this.error(this.previous(), "Expect 'fun' after 'var' in value type body (for mutating method).");
              }
          } else {
              this.error(this.peek(), "Expect method declaration in value type body.");
          }
      }
      this.consume(TokenType.RIGHT_BRACE, "Expect '}' after value type body.");

      return new ValueStmt(name, fields, methods, generics);
  }

  private useDeclaration(): Stmt {
      const path: Token[] = [];
      let items: Token[] = [];
      let isTrait = false;

      path.push(this.consume(TokenType.IDENTIFIER, "Expect identifier in use path."));

      while (this.match(TokenType.DOT)) {
          if (this.match(TokenType.LEFT_BRACE)) {
              do {
                  items.push(this.consume(TokenType.IDENTIFIER, "Expect identifier in import list."));
              } while (this.match(TokenType.COMMA));
              this.consume(TokenType.RIGHT_BRACE, "Expect '}' after import list.");
              break;
          } else if (this.match(TokenType.TRAIT)) {
              isTrait = true;
              break;
          } else {
              path.push(this.consume(TokenType.IDENTIFIER, "Expect identifier in use path."));
          }
      }

      this.consume(TokenType.SEMICOLON, "Expect ';' after use declaration.");
      return new UseStmt(path, items, isTrait);
  }

  private traitDeclaration(): Stmt {
      const name = this.consume(TokenType.IDENTIFIER, "Expect trait name.");
      this.consume(TokenType.LEFT_BRACE, "Expect '{' before trait body.");

      const methods: FunctionStmt[] = [];
      while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
          // Traits usually contain method signatures or default implementations.
          // Assuming 'fun' keyword.
          if (this.match(TokenType.FUN)) {
              // Treat as function declaration.
              // If it has no body (just signature), my current functionDeclaration expects body.
              // I might need to adjust functionDeclaration to allow optional body?
              // Or maybe trait methods in Dyego always have default impls or {}?
              // GEMINI doesn't specify trait syntax details.
              // Kotlin interfaces allow both.
              // For now, I'll reuse functionDeclaration which enforces body.
              // If checking for abstract methods is needed, I'd need to modify functionDeclaration.
              // Let's assume for now they are parsed as functions.
              methods.push(this.functionDeclaration("method", true));
          } else {
              this.error(this.peek(), "Expect method declaration in trait body.");
          }
      }
      this.consume(TokenType.RIGHT_BRACE, "Expect '}' after trait body.");

      return new TraitStmt(name, methods);
  }

  // --- Statements ---

  private statement(): Stmt {
    if (this.match(TokenType.WHILE)) return this.whileStatement();
    if (this.match(TokenType.FOR)) return this.forStatement();
    if (this.match(TokenType.BREAK)) return this.breakStatement();
    if (this.match(TokenType.CONTINUE)) return this.continueStatement();
    if (this.match(TokenType.RETURN)) return this.returnStatement();

    return this.expressionStatement();
  }

  private whileStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.");
    const condition = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after condition.");
    const body = this.statement();

    return new WhileStmt(condition, this.getExpressionFromStmt(body));
  }

  private forStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'for'.");
    const variable = this.consume(TokenType.IDENTIFIER, "Expect variable name.");
    this.consume(TokenType.COLON, "Expect ':' after variable name in for loop.");

    const iterable = this.expression();
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after loop clauses.");
    const body = this.statement();

    return new ForStmt(variable, iterable, this.getExpressionFromStmt(body));
  }

  private getExpressionFromStmt(stmt: Stmt): Expr {
      if (stmt instanceof ExpressionStmt) {
          return stmt.expression;
      }
      return new BlockExpr([stmt]);
  }

  private breakStatement(): Stmt {
      const keyword = this.previous();
      let label: Token | null = null;
      if (this.check(TokenType.IDENTIFIER)) {
          label = this.consume(TokenType.IDENTIFIER, "Expect label.");
      }
      this.consume(TokenType.SEMICOLON, "Expect ';' after 'break'.");
      return new BreakStmt(keyword, label);
  }

  private continueStatement(): Stmt {
      const keyword = this.previous();
      let label: Token | null = null;
      if (this.check(TokenType.IDENTIFIER)) {
          label = this.consume(TokenType.IDENTIFIER, "Expect label.");
      }
      this.consume(TokenType.SEMICOLON, "Expect ';' after 'continue'.");
      return new ContinueStmt(keyword, label);
  }

  private returnStatement(): Stmt {
      const keyword = this.previous();
      let value: Expr | null = null;
      if (!this.check(TokenType.SEMICOLON) && !this.check(TokenType.RIGHT_BRACE)) {
          value = this.expression();
      }
      // Allow optional semicolon if block ends
      if (this.check(TokenType.SEMICOLON)) {
          this.advance();
      } else if (!this.check(TokenType.RIGHT_BRACE)) {
          this.consume(TokenType.SEMICOLON, "Expect ';' after return value.");
      }
      return new ReturnStmt(keyword, value);
  }

  private expressionStatement(): Stmt {
    const expr = this.expression();

    if (expr instanceof BlockExpr || expr instanceof IfExpr || expr instanceof WhenExpr) {
        if (this.check(TokenType.SEMICOLON)) {
            this.advance();
        }
    } else if (this.check(TokenType.RIGHT_BRACE)) {
        // Allow omitting semicolon if it's the last statement in a block
    } else {
        this.consume(TokenType.SEMICOLON, "Expect ';' after expression.");
    }

    return new ExpressionStmt(expr);
  }

  // --- Expressions ---

  private expression(): Expr {
    return this.assignment();
  }

  private assignment(): Expr {
    const expr = this.elvis();

    if (this.match(TokenType.EQUAL)) {
      const equals = this.previous();
      const value = this.assignment();

      if (expr instanceof VariableExpr) {
        const name = expr.name;
        return new AssignExpr(name, value);
      } else if (expr instanceof GetExpr) {
          return new SetExpr(expr.object, expr.name, value, expr.isSafe);
      } else if (expr instanceof IndexGetExpr) {
          return new IndexSetExpr(expr.object, expr.index, value);
      }

      this.error(equals, "Invalid assignment target.");
    }

    return expr;
  }

  private elvis(): Expr {
      let expr = this.or();

      while (this.match(TokenType.QUESTION_COLON)) {
          const operator = this.previous();
          const rightRecursive = this.elvis();
          return new BinaryExpr(expr, operator, rightRecursive);
      }

      return expr;
  }

  private or(): Expr {
    let expr = this.and();

    while (this.match(TokenType.OR)) {
      const operator = this.previous();
      const right = this.and();
      expr = new LogicalExpr(expr, operator, right);
    }

    return expr;
  }

  private and(): Expr {
    let expr = this.equality();

    while (this.match(TokenType.AND)) {
      const operator = this.previous();
      const right = this.equality();
      expr = new LogicalExpr(expr, operator, right);
    }

    return expr;
  }

  private equality(): Expr {
    let expr = this.comparison();

    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator = this.previous();
      const right = this.comparison();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private comparison(): Expr {
    let expr = this.term();

    while (this.match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) {
      const operator = this.previous();
      const right = this.term();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private term(): Expr {
    let expr = this.factor();

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous();
      const right = this.factor();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private factor(): Expr {
    let expr = this.unary();

    while (this.match(TokenType.SLASH, TokenType.STAR, TokenType.PERCENT)) {
      const operator = this.previous();
      const right = this.unary();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private unary(): Expr {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator = this.previous();
      const right = this.unary();
      return new UnaryExpr(operator, right);
    }

    return this.cast();
  }

  private cast(): Expr {
      let expr = this.call();

      while (this.match(TokenType.AS)) {
          const operator = this.previous();
          const type = this.parseType();
          expr = new CastExpr(expr, type, operator);
      }

      return expr;
  }

  private call(): Expr {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expr = this.finishCall(expr);
      } else if (this.match(TokenType.DOT)) {
        const name = this.consume(TokenType.IDENTIFIER, "Expect property name after '.'.");
        expr = new GetExpr(expr, name, false);
      } else if (this.match(TokenType.QUESTION_DOT)) {
         const name = this.consume(TokenType.IDENTIFIER, "Expect property name after '?.'.");
         expr = new GetExpr(expr, name, true);
      } else if (this.match(TokenType.LEFT_BRACKET)) {
          const index = this.expression();
          this.consume(TokenType.RIGHT_BRACKET, "Expect ']' after index.");
          expr = new IndexGetExpr(expr, index);
      } else if (this.match(TokenType.QUESTION)) {
          const operator = this.previous();
          expr = new PropagateExpr(expr, operator);
      } else if (this.check(TokenType.LEFT_BRACE)) {
          // Trailing lambda without parentheses: list.map { ... }
          // Treated as a call with one argument (the lambda)
          const lambda = this.lambda();
          expr = new CallExpr(expr, this.previous(), [{ value: lambda }]);
      } else {
        break;
      }
    }

    return expr;
  }

  private finishCall(callee: Expr): Expr {
    const args: { name?: Token, value: Expr }[] = [];
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        let name: Token | undefined;
        if (this.check(TokenType.IDENTIFIER) && this.peekNext()?.type === TokenType.EQUAL) {
            name = this.consume(TokenType.IDENTIFIER, "Expect parameter name.");
            this.consume(TokenType.EQUAL, "Expect '='.");
            const value = this.expression();
            args.push({ name, value });
        } else {
            args.push({ value: this.expression() });
        }
      } while (this.match(TokenType.COMMA));
    }

    const paren = this.consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.");

    if (this.check(TokenType.LEFT_BRACE)) {
        const lambdaExpr = this.lambda();
        args.push({ value: lambdaExpr });
    }

    return new CallExpr(callee, paren, args);
  }

  private primary(): Expr {
    if (this.match(TokenType.FALSE)) return new LiteralExpr(false);
    if (this.match(TokenType.TRUE)) return new LiteralExpr(true);
    if (this.match(TokenType.NULL)) return new LiteralExpr(null);
    if (this.match(TokenType.THIS)) return new ThisExpr(this.previous());

    if (this.match(TokenType.INTEGER, TokenType.FLOAT, TokenType.STRING)) {
      return new LiteralExpr(this.previous().literal);
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return new VariableExpr(this.previous());
    }

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.");
      return new GroupingExpr(expr);
    }

    if (this.match(TokenType.IF)) {
        return this.ifExpression();
    }

    if (this.match(TokenType.WHEN)) {
        return this.whenExpression();
    }

    if (this.check(TokenType.LEFT_BRACE)) {
        return this.lambda();
    }

    if (this.match(TokenType.LEFT_BRACKET)) {
        return this.arrayLiteral();
    }

    throw this.error(this.peek(), "Expect expression.");
  }

  private ifExpression(): Expr {
      this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'if'.");
      const condition = this.expression();
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after if condition.");

      const thenBranch = this.parseControlFlowBody();
      let elseBranch: Expr | null = null;
      if (this.match(TokenType.ELSE)) {
          elseBranch = this.parseControlFlowBody();
      }

      return new IfExpr(condition, thenBranch, elseBranch);
  }

  private whenExpression(): Expr {
      this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'when'.");
      let subject: Expr | null = null;
      if (!this.check(TokenType.RIGHT_PAREN)) {
          subject = this.expression();
      }
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after when subject.");
      this.consume(TokenType.LEFT_BRACE, "Expect '{' after when.");

      const entries: WhenEntry[] = [];
      let elseBranch: Expr | null = null;

      while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
          if (this.match(TokenType.ELSE)) {
              this.consume(TokenType.ARROW, "Expect '->' after 'else'.");
              elseBranch = this.parseControlFlowBody();
              this.match(TokenType.COMMA, TokenType.SEMICOLON);
          } else {
              const conditions: Expr[] = [];
              do {
                  conditions.push(this.expression());
              } while (this.match(TokenType.COMMA));

              this.consume(TokenType.ARROW, "Expect '->' after conditions.");
              const body = this.parseControlFlowBody();
              entries.push(new WhenEntry(conditions, body));
              this.match(TokenType.COMMA, TokenType.SEMICOLON);
          }
      }
      this.consume(TokenType.RIGHT_BRACE, "Expect '}' after when body.");

      return new WhenExpr(subject, entries, elseBranch);
  }

  private parseControlFlowBody(): Expr {
      if (this.check(TokenType.LEFT_BRACE)) {
          return this.block();
      } else {
          return this.expression();
      }
  }

  private block(): BlockExpr {
    this.consume(TokenType.LEFT_BRACE, "Expect '{' to start block.");
    const statements: Stmt[] = [];
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      const decl = this.declaration();
      if (decl) statements.push(decl);
    }
    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after block.");
    return new BlockExpr(statements);
  }

  private lambda(): LambdaExpr {
      this.consume(TokenType.LEFT_BRACE, "Expect '{' to start lambda.");

      let params: { name: Token, type: TypeNode | null }[] = [];
      let isParams = false;

      if (this.check(TokenType.IDENTIFIER)) {
          const next = this.peekNext();
          if (next && (next.type === TokenType.COLON || next.type === TokenType.COMMA || next.type === TokenType.ARROW)) {
              isParams = true;
          }
      }

      if (isParams) {
          do {
              const name = this.consume(TokenType.IDENTIFIER, "Expect param name.");
              let type: TypeNode | null = null;
              if (this.match(TokenType.COLON)) {
                  type = this.parseType();
              }
              params.push({ name, type });
          } while (this.match(TokenType.COMMA));
          this.consume(TokenType.ARROW, "Expect '->' after lambda parameters.");
      }

      const statements: Stmt[] = [];
      while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
          const decl = this.declaration();
          if (decl) statements.push(decl);
      }
      this.consume(TokenType.RIGHT_BRACE, "Expect '}' after lambda body.");

      return new LambdaExpr(params, new BlockExpr(statements));
  }

  private arrayLiteral(): ArrayLiteralExpr {
      this.consume(TokenType.LEFT_BRACKET, "Expect '['.");
      const elements: Expr[] = [];
      if (!this.check(TokenType.RIGHT_BRACKET)) {
          do {
              elements.push(this.expression());
          } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RIGHT_BRACKET, "Expect ']'.");
      return new ArrayLiteralExpr(elements);
  }

  // --- Type Parsing ---

  private parseType(): TypeNode {
      let type = this.parseBaseType();

      while (true) {
          if (this.match(TokenType.LEFT_BRACKET)) {
              this.consume(TokenType.RIGHT_BRACKET, "Expect ']' after '[' for array type.");
              type = new ArrayType(type);
          } else if (this.match(TokenType.QUESTION)) {
              type = new OptionalType(type);
          } else {
              break;
          }
      }

      if (this.match(TokenType.PIPE)) {
          const rhs = this.parseType();
          if (rhs instanceof UnionType) {
               return new UnionType([type, ...rhs.types]);
          } else {
               return new UnionType([type, rhs]);
          }
      }

      return type;
  }

  private parseBaseType(): TypeNode {
      if (this.match(TokenType.LEFT_PAREN)) {
          const type = this.parseType();
          this.consume(TokenType.RIGHT_PAREN, "Expect ')' after grouped type.");
          return type;
      }

      const name = this.consume(TokenType.IDENTIFIER, "Expect type name.");
      const generics: TypeNode[] = [];
      if (this.match(TokenType.LESS)) {
          do {
              generics.push(this.parseType());
          } while (this.match(TokenType.COMMA));
          this.consume(TokenType.GREATER, "Expect '>' after generic type arguments.");
      }

      return new NamedType(name, generics);
  }

  // --- Helpers ---

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();

    throw this.error(this.peek(), message);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token | undefined {
      if (this.current + 1 >= this.tokens.length) return undefined;
      return this.tokens[this.current + 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private error(token: Token, message: string): Error {
    return new Error(`[line ${token.line}] Error at '${token.lexeme}': ${message}`);
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.SEMICOLON) return;

      switch (this.peek().type) {
        case TokenType.FUN:
        case TokenType.VAL:
        case TokenType.VAR:
        case TokenType.FOR:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.RETURN:
          return;
      }

      this.advance();
    }
  }
}
