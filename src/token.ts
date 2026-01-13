export enum TokenType {
  // Single-character tokens
  LEFT_PAREN = "LEFT_PAREN", RIGHT_PAREN = "RIGHT_PAREN",
  LEFT_BRACE = "LEFT_BRACE", RIGHT_BRACE = "RIGHT_BRACE",
  LEFT_BRACKET = "LEFT_BRACKET", RIGHT_BRACKET = "RIGHT_BRACKET",
  COMMA = "COMMA", DOT = "DOT", COLON = "COLON", SEMICOLON = "SEMICOLON",
  SLASH = "SLASH", STAR = "STAR", PERCENT = "PERCENT",
  PIPE = "PIPE",

  // One or two character tokens
  MINUS = "MINUS", ARROW = "ARROW",
  PLUS = "PLUS",
  BANG = "BANG", BANG_EQUAL = "BANG_EQUAL", // != isn't explicitly mentioned but standard
  EQUAL = "EQUAL", EQUAL_EQUAL = "EQUAL_EQUAL",
  GREATER = "GREATER", GREATER_EQUAL = "GREATER_EQUAL",
  LESS = "LESS", LESS_EQUAL = "LESS_EQUAL",
  QUESTION = "QUESTION", QUESTION_COLON = "QUESTION_COLON", QUESTION_DOT = "QUESTION_DOT",

  // Literals
  IDENTIFIER = "IDENTIFIER",
  STRING = "STRING",
  INTEGER = "INTEGER",
  FLOAT = "FLOAT",

  // Keywords
  VAL = "VAL", VAR = "VAR", VALUE = "VALUE", FUN = "FUN",
  IF = "IF", ELSE = "ELSE", WHEN = "WHEN",
  FOR = "FOR", WHILE = "WHILE", BREAK = "BREAK", CONTINUE = "CONTINUE",
  AS = "AS", TRAIT = "TRAIT", USE = "USE", RETURN = "RETURN",
  TRUE = "TRUE", FALSE = "FALSE", NULL = "NULL", THIS = "THIS",
  OPERATOR = "OPERATOR", IS = "IS", INTRINSIC = "INTRINSIC",
  VOCABULARY = "VOCABULARY",

  AND = "AND", OR = "OR", // && and ||

  COLON_COLON = "COLON_COLON", // ::

  EOF = "EOF"
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
