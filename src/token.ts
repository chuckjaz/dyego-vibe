export const enum TokenType {
  // Single-character tokens
  LEFT_PAREN, RIGHT_PAREN,
  LEFT_BRACE, RIGHT_BRACE,
  LEFT_BRACKET, RIGHT_BRACKET,
  COMMA, DOT, COLON, SEMICOLON,
  SLASH, STAR, PERCENT,
  PIPE,

  // One or two character tokens
  MINUS, ARROW,
  PLUS,
  BANG, BANG_EQUAL, // != isn't explicitly mentioned but standard
  EQUAL, EQUAL_EQUAL,
  GREATER, GREATER_EQUAL,
  LESS, LESS_EQUAL,
  QUESTION, QUESTION_COLON, QUESTION_DOT,

  // Literals
  IDENTIFIER,
  STRING,
  INTEGER,
  FLOAT,

  // Keywords
  VAL, VAR, VALUE, FUN,
  IF, ELSE, WHEN,
  FOR, WHILE, BREAK, CONTINUE,
  AS, TRAIT, USE, RETURN,
  TRUE, FALSE, NULL, THIS,
  OPERATOR, IS, INTRINSIC,
  VOCABULARY,

  AND, OR, // && and ||

  COLON_COLON, // ::

  EOF
}

export class Symbol {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  toString(): string {
    return this.name;
  }
}

export class Token {
  type: TokenType;
  lexeme: string;
  literal: any;
  line: number;
  column: number;
  filename: string;

  constructor(type: TokenType, lexeme: string, literal: any, line: number, column: number, filename: string) {
    this.type = type;
    this.lexeme = lexeme;
    this.literal = literal;
    this.line = line;
    this.column = column;
    this.filename = filename;
  }

  toString(): string {
    return `${this.type} ${this.lexeme} ${this.literal} (${this.filename}:${this.line}:${this.column})`;
  }
}
