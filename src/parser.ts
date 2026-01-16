import { Token, TokenType } from './token.js';
import {
  Expr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LiteralExpr,
  LogicalExpr, SetExpr, ThisExpr, UnaryExpr, VariableExpr, BlockExpr, IfExpr,
  WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr,
  CastExpr, Stmt, ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt,
  ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt, VocabularyStmt, TypeNode, NamedType,
  UnionType, ArrayType, WhenEntry, IsCondition, IntrinsicExpr
} from './ast.js';

export class ParserError extends Error {
  token: Token;
  message: string;

  constructor(token: Token, message: string) {
    super(message);
    this.token = token;
    this.message = message;
  }
}

export class Parser {
  private readonly tokens: Token[];
  private current = 0;
  private errors: ParserError[] = [];

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

  getErrors(): ParserError[] {
    return this.errors;
  }

  private parseQualifiedIdentifier(message: string): Token {
    if (this.peek().type !== TokenType.IDENTIFIER) {
      throw this.error(this.peek(), message);
    }

    let token = this.advance();
    if (this.peek().type !== TokenType.COLON_COLON) {
      return token;
    }

    const parts: Token[] = [token];
    let lexeme = token.lexeme;

    while (this.match(TokenType.COLON_COLON)) {
      const next = this.consume(TokenType.IDENTIFIER, "Expect identifier after '::'.");
      parts.push(next);
      lexeme += "::" + next.lexeme;
    }

    // Create synthetic token with identifying symbol parts in literal
    // We assume the Lexer has already interned the symbols into the identifiers' literals
    const symbols = parts.map(t => t.literal);
    return new Token(TokenType.IDENTIFIER, lexeme, symbols, token.line, token.column, token.filename);
  }

  private declaration(): Stmt | null {
    try {
      switch (this.peek().type) {
        case TokenType.FUN:
          this.advance();
          return this.functionDeclaration("function");
        case TokenType.VAR:
          this.advance();
          return this.varDeclaration();
        case TokenType.VAL:
          this.advance();
          return this.valDeclaration();
        case TokenType.VALUE:
          this.advance();
          return this.valueDeclaration();
        case TokenType.USE:
          this.advance();
          return this.useDeclaration();
        case TokenType.VOCABULARY:
          this.advance();
          return this.vocabularyDeclaration();
        case TokenType.TRAIT:
          this.advance();
          return this.traitDeclaration();
        default:
          return this.statement();
      }
    } catch (error: any) {
      if (error instanceof ParserError) {
        this.errors.push(error);
      } else {
        // Wrap unknown errors or rethrow? For now, assume all parsing errors are ParserError
        // If it's something else, it might be a bug in the parser code.
        // But to be safe let's push it if it has a message, or create a generic one.
        // However, synchronizing requires us to recover.
        // Let's assume we only catch ParserErrors thrown by this.error()
        this.errors.push(new ParserError(this.peek(), error.message));
      }
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

    let name: Token;
    let extensionType: TypeNode | null = null;

    // Try to parse a type. This could be the function name (as a NamedType) or the extension type.
    const type = this.parseType();

    if (this.match(TokenType.DOT)) {
      extensionType = type;
      name = this.parseQualifiedIdentifier(`Expect ${kind} name.`);
    } else {
      if (type instanceof NamedType && type.generics.length === 0) {
        name = type.name;
      } else {
        throw this.error(this.previous(), `Invalid ${kind} name.`);
      }
    }
    this.consume(TokenType.LEFT_PAREN, `Expect '(' after ${kind} name.`);
    const parameters: { name: Token, type: TypeNode }[] = [];

    if (this.peek().type !== TokenType.RIGHT_PAREN) {
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
    let body: BlockExpr;
    let isIntrinsic = false;

    if (this.match(TokenType.EQUAL)) {
      let isIntrinsicDecl = false;
      if (this.peek().type === TokenType.INTRINSIC) {
        const next = this.peekNext();
        // If next is not identifier, it's definitely not an intrinsic expression (module name must be identifier)
        if (!next || next.type !== TokenType.IDENTIFIER) {
          isIntrinsicDecl = true;
        } else {
          // If next is identifier, check if it's followed by DOT
          const nextNext = this.peekTwice();
          if (!nextNext || nextNext.type !== TokenType.DOT) {
            isIntrinsicDecl = true;
          }
        }

        if (isIntrinsicDecl) {
          this.consume(TokenType.INTRINSIC, "Expect 'intrinsic'.");
        }
      }

      if (isIntrinsicDecl) {
        isIntrinsic = true;
        body = new BlockExpr([]);
        if (this.peek().type === TokenType.SEMICOLON) {
          this.advance();
        }
      } else {
        const value = this.expression();
        if (this.peek().type === TokenType.SEMICOLON) {
          this.advance();
        }
        body = new BlockExpr([new ReturnStmt(this.previous(), value)]);
      }
    } else {
      if (this.peek().type !== TokenType.LEFT_BRACE) {
        throw this.error(this.peek(), `Expect '{' before ${kind} body.`);
      }
      body = this.block();
    }
    return new FunctionStmt(name, parameters, returnType, body, generics, isMutating, kind === "operator", extensionType, isIntrinsic);
  }

  private varDeclaration(): Stmt {
    if (this.peek().type === TokenType.FUN) {
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
    const name = this.parseQualifiedIdentifier("Expect value type name.");
    let generics: Token[] = [];
    if (this.match(TokenType.LESS)) {
      do {
        generics.push(this.consume(TokenType.IDENTIFIER, "Expect generic parameter name."));
      } while (this.match(TokenType.COMMA));
      this.consume(TokenType.GREATER, "Expect '>' after generic parameters.");
    }

    this.consume(TokenType.LEFT_PAREN, "Expect '(' after value type name.");

    const fields: { name: Token, type: TypeNode, isMutable: boolean }[] = [];
    if (this.peek().type !== TokenType.RIGHT_PAREN) {
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
    let intrinsicType: Token | null = null;

    while (this.peek().type !== TokenType.RIGHT_BRACE && !this.isAtEnd()) {
      if (this.match(TokenType.FUN)) {
        methods.push(this.functionDeclaration("method", true, false));
      } else if (this.match(TokenType.VAR)) {
        if (this.match(TokenType.FUN)) {
          methods.push(this.functionDeclaration("method", true, true));
        } else {
          this.error(this.previous(), "Expect 'fun' after 'var' in value type body (for mutating method).");
        }
      } else if (this.match(TokenType.OPERATOR)) {
        this.consume(TokenType.FUN, "Expect 'fun' after 'operator'.");
        methods.push(this.functionDeclaration("operator", true, false));
      } else if (this.match(TokenType.INTRINSIC)) {
        // intrinsic type <Identifier>
        // Check if 'type' follows
        // Since 'type' is not a keyword in TokenType (based on what I see), it might be an identifier.
        // Let's check if we have a specific token for 'type' or if we need to match identifier "type".
        // Looking at imports, there is no TokenType.TYPE.
        // So we expect identifier "type".
        const typeToken = this.consume(TokenType.IDENTIFIER, "Expect 'type' after 'intrinsic'.");
        if (typeToken.lexeme !== "type") {
          throw this.error(typeToken, "Expect 'type' after 'intrinsic'.");
        }
        intrinsicType = this.consume(TokenType.IDENTIFIER, "Expect intrinsic type name.");
      } else {
        throw this.error(this.peek(), `Expect method declaration in value type body, received '${this.peek().lexeme}'.`);
      }
    }
    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after value type body.");

    return new ValueStmt(name, fields, methods, generics, intrinsicType);
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

  private vocabularyDeclaration(): Stmt {
    this.consume(TokenType.LEFT_BRACE, "Expect '{' after 'vocabulary'.");
    const members: Token[] = [];
    if (this.peek().type !== TokenType.RIGHT_BRACE) {
      do {
        members.push(this.consume(TokenType.IDENTIFIER, "Expect identifier in vocabulary."));
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after vocabulary members.");
    return new VocabularyStmt(members);
  }

  private traitDeclaration(): Stmt {
    const name = this.consume(TokenType.IDENTIFIER, "Expect trait name.");
    this.consume(TokenType.LEFT_BRACE, "Expect '{' before trait body.");

    const methods: FunctionStmt[] = [];
    while (this.peek().type !== TokenType.RIGHT_BRACE && !this.isAtEnd()) {
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
    switch (this.peek().type) {
      case TokenType.WHILE:
        this.advance();
        return this.whileStatement();
      case TokenType.FOR:
        this.advance();
        return this.forStatement();
      case TokenType.BREAK:
        this.advance();
        return this.breakStatement();
      case TokenType.CONTINUE:
        this.advance();
        return this.continueStatement();
      case TokenType.RETURN:
        this.advance();
        return this.returnStatement();
      default:
        return this.expressionStatement();
    }
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
    if (this.peek().type === TokenType.IDENTIFIER) {
      label = this.consume(TokenType.IDENTIFIER, "Expect label.");
    }
    this.consume(TokenType.SEMICOLON, "Expect ';' after 'break'.");
    return new BreakStmt(keyword, label);
  }

  private continueStatement(): Stmt {
    const keyword = this.previous();
    let label: Token | null = null;
    if (this.peek().type === TokenType.IDENTIFIER) {
      label = this.consume(TokenType.IDENTIFIER, "Expect label.");
    }
    this.consume(TokenType.SEMICOLON, "Expect ';' after 'continue'.");
    return new ContinueStmt(keyword, label);
  }

  private returnStatement(): Stmt {
    const keyword = this.previous();
    let value: Expr | null = null;
    if (this.peek().type !== TokenType.SEMICOLON && this.peek().type !== TokenType.RIGHT_BRACE) {
      value = this.expression();
    }
    // Allow optional semicolon if block ends
    if (this.peek().type === TokenType.SEMICOLON) {
      this.advance();
    } else if (this.peek().type !== TokenType.RIGHT_BRACE) {
      this.consume(TokenType.SEMICOLON, "Expect ';' after return value.");
    }
    return new ReturnStmt(keyword, value);
  }

  private expressionStatement(): Stmt {
    const expr = this.expression();

    if (expr instanceof BlockExpr || expr instanceof IfExpr || expr instanceof WhenExpr) {
      if (this.peek().type === TokenType.SEMICOLON) {
        this.advance();
      }
    } else if (this.peek().type === TokenType.RIGHT_BRACE) {
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
        return new IndexSetExpr(expr.object, expr.index, value, expr.bracket);
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

    while (this.match(TokenType.BANG_EQUAL) || this.match(TokenType.EQUAL_EQUAL)) {
      const operator = this.previous();
      const right = this.comparison();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private comparison(): Expr {
    let expr = this.infix();

    while (this.match(TokenType.GREATER) || this.match(TokenType.GREATER_EQUAL) || this.match(TokenType.LESS) || this.match(TokenType.LESS_EQUAL)) {
      const operator = this.previous();
      const right = this.infix();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private infix(): Expr {
    let expr = this.term();

    while (this.match(TokenType.IDENTIFIER)) {
      const operator = this.previous();
      const right = this.term();
      // Infix operators are left-associative
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private term(): Expr {
    let expr = this.factor();

    while (this.match(TokenType.MINUS) || this.match(TokenType.PLUS)) {
      const operator = this.previous();
      const right = this.factor();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private factor(): Expr {
    let expr = this.unary();

    while (this.match(TokenType.SLASH) || this.match(TokenType.STAR) || this.match(TokenType.PERCENT)) {
      const operator = this.previous();
      const right = this.unary();
      expr = new BinaryExpr(expr, operator, right);
    }

    return expr;
  }

  private unary(): Expr {
    if (this.match(TokenType.BANG) || this.match(TokenType.MINUS) || this.match(TokenType.PLUS)) {
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
      switch (this.peek().type) {
        case TokenType.LEFT_PAREN:
          this.advance();
          expr = this.finishCall(expr);
          break;
        case TokenType.DOT:
          this.advance();
          const name = this.parseQualifiedIdentifier("Expect property name after '.'.");
          expr = new GetExpr(expr, name, false);
          break;
        case TokenType.QUESTION_DOT:
          this.advance();
          const qName = this.parseQualifiedIdentifier("Expect property name after '?.'.");
          expr = new GetExpr(expr, qName, true);
          break;
        case TokenType.LEFT_BRACKET:
          this.advance();
          const bracket = this.previous();
          const index = this.expression();
          this.consume(TokenType.RIGHT_BRACKET, "Expect ']' after index.");
          expr = new IndexGetExpr(expr, index, bracket);
          break;
        case TokenType.QUESTION:
          this.advance();
          const operator = this.previous();
          expr = new PropagateExpr(expr, operator);
          break;
        case TokenType.LEFT_BRACE:
          // Trailing lambda without parentheses: list.map { ... }
          // Treated as a call with one argument (the lambda)
          const lambda = this.lambda();
          expr = new CallExpr(expr, this.previous(), [{ value: lambda }]);
          break;
        default:
          return expr;
      }
    }
  }

  private finishCall(callee: Expr): Expr {
    const args: { name?: Token, value: Expr }[] = [];
    if (this.peek().type !== TokenType.RIGHT_PAREN) {
      do {
        let name: Token | undefined;
        if (this.peek().type === TokenType.IDENTIFIER && this.peekNext()?.type === TokenType.EQUAL) {
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

    if (this.peek().type === TokenType.LEFT_BRACE) {
      const lambdaExpr = this.lambda();
      args.push({ value: lambdaExpr });
    }

    return new CallExpr(callee, paren, args);
  }

  private primary(): Expr {
    switch (this.peek().type) {
      case TokenType.FALSE:
        this.advance();
        return new LiteralExpr(false);
      case TokenType.TRUE:
        this.advance();
        return new LiteralExpr(true);
      case TokenType.NULL:
        this.advance();
        return new LiteralExpr(null);
      case TokenType.THIS:
        this.advance();
        return new ThisExpr(this.previous());
      case TokenType.INTEGER:
      case TokenType.FLOAT:
      case TokenType.STRING:
        this.advance();
        const token = this.previous();
        return new LiteralExpr(token.literal, token.type);
      case TokenType.IDENTIFIER:
        return new VariableExpr(this.parseQualifiedIdentifier("Expect identifier."));
      case TokenType.LEFT_PAREN:
        this.advance();
        const expr = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.");
        return new GroupingExpr(expr);
      case TokenType.IF:
        this.advance();
        return this.ifExpression();
      case TokenType.WHEN:
        this.advance();
        return this.whenExpression();
      case TokenType.LEFT_BRACE:
        return this.lambda();
      case TokenType.LEFT_BRACKET:
        this.advance();
        return this.arrayLiteral();
      case TokenType.INTRINSIC:
        this.advance();
        return this.intrinsicExpression();
      default:
        throw this.error(this.peek(), "Expect expression.");
    }
  }

  private intrinsicExpression(): Expr {
    const module = this.consume(TokenType.IDENTIFIER, "Expect intrinsic module name.");
    this.consume(TokenType.DOT, "Expect '.' after module name.");
    const op = this.consume(TokenType.IDENTIFIER, "Expect intrinsic operation name.");
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after operation name.");

    const args: Expr[] = [];
    if (this.peek().type !== TokenType.RIGHT_PAREN) {
      do {
        args.push(this.expression());
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.");

    return new IntrinsicExpr(module, op, args);
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
    const keyword = this.previous();
    let subject: Expr | null = null;
    if (this.match(TokenType.LEFT_PAREN)) {
      if (this.peek().type !== TokenType.RIGHT_PAREN) {
        subject = this.expression();
      }
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after when subject.");
    }
    this.consume(TokenType.LEFT_BRACE, "Expect '{' after when.");

    const entries: WhenEntry[] = [];
    let elseBranch: Expr | null = null;

    while (this.peek().type !== TokenType.RIGHT_BRACE && !this.isAtEnd()) {
      if (this.match(TokenType.ELSE)) {
        this.consume(TokenType.ARROW, "Expect '->' after 'else'.");
        elseBranch = this.parseControlFlowBody();
        this.match(TokenType.COMMA);
        this.match(TokenType.SEMICOLON);
      } else {
        const conditions: (Expr | IsCondition)[] = [];
        do {
          if (this.match(TokenType.IS)) {
            if (!subject) {
              throw this.error(this.previous(), "'is' condition is only allowed when 'when' has a subject.");
            }
            const type = this.parseType();
            conditions.push(new IsCondition(type));
          } else {
            conditions.push(this.expression());
          }
        } while (this.match(TokenType.COMMA));

        this.consume(TokenType.ARROW, "Expect '->' after conditions.");
        const body = this.parseControlFlowBody();
        entries.push(new WhenEntry(conditions, body));
        this.match(TokenType.COMMA);
        this.match(TokenType.SEMICOLON);
      }
    }
    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after when body.");

    return new WhenExpr(keyword, subject, entries, elseBranch);
  }

  private parseControlFlowBody(): Expr {
    if (this.peek().type === TokenType.LEFT_BRACE) {
      return this.block();
    } else {
      return this.expression();
    }
  }

  private block(): BlockExpr {
    this.consume(TokenType.LEFT_BRACE, "Expect '{' to start block.");
    const statements: Stmt[] = [];
    while (this.peek().type !== TokenType.RIGHT_BRACE && !this.isAtEnd()) {
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

    if (this.peek().type === TokenType.IDENTIFIER) {
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
    while (this.peek().type !== TokenType.RIGHT_BRACE && !this.isAtEnd()) {
      const decl = this.declaration();
      if (decl) statements.push(decl);
    }
    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after lambda body.");

    return new LambdaExpr(params, new BlockExpr(statements));
  }

  private arrayLiteral(): ArrayLiteralExpr {
    // The '[' was already consumed by primary()
    const elements: Expr[] = [];
    if (this.peek().type !== TokenType.RIGHT_BRACKET) {
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
        const nullType = new NamedType(new Token(TokenType.IDENTIFIER, "Null", null, 0, 0, this.peek().filename));
        if (type instanceof UnionType) {
          type = new UnionType([...type.types, nullType]);
        } else {
          type = new UnionType([type, nullType]);
        }
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

    const name = this.parseQualifiedIdentifier("Expect type name.");
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

  private match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }

    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.peek().type === type) return this.advance();

    throw this.error(this.peek(), message);
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

  private peekTwice(): Token | undefined {
    if (this.current + 2 >= this.tokens.length) return undefined;
    return this.tokens[this.current + 2];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private error(token: Token, message: string): ParserError {
    return new ParserError(token, message);
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
