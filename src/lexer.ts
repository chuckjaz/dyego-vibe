import { TokenType, Token } from "./token";

export class Lexer {
  private readonly source: string;
  private readonly tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private startColumn = 1;

  private static readonly keywords: Record<string, TokenType> = {
    val: TokenType.VAL,
    var: TokenType.VAR,
    value: TokenType.VALUE,
    fun: TokenType.FUN,
    if: TokenType.IF,
    else: TokenType.ELSE,
    when: TokenType.WHEN,
    for: TokenType.FOR,
    while: TokenType.WHILE,
    break: TokenType.BREAK,
    continue: TokenType.CONTINUE,
    as: TokenType.AS,
    trait: TokenType.TRAIT,
    use: TokenType.USE,
    return: TokenType.RETURN,
    true: TokenType.TRUE,
    false: TokenType.FALSE,
    null: TokenType.NULL,
    this: TokenType.THIS,
  };

  constructor(source: string) {
    this.source = source;
  }

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.startColumn = this.column; // Capture start column
      this.scanToken();
    }

    this.tokens.push(new Token(TokenType.EOF, "", null, this.line, this.column));
    return this.tokens;
  }

  private scanToken(): void {
    const c = this.advance();
    switch (c) {
      case "(": this.addToken(TokenType.LEFT_PAREN); break;
      case ")": this.addToken(TokenType.RIGHT_PAREN); break;
      case "{": this.addToken(TokenType.LEFT_BRACE); break;
      case "}": this.addToken(TokenType.RIGHT_BRACE); break;
      case "[": this.addToken(TokenType.LEFT_BRACKET); break;
      case "]": this.addToken(TokenType.RIGHT_BRACKET); break;
      case ",": this.addToken(TokenType.COMMA); break;
      case ".": this.addToken(TokenType.DOT); break;
      case ":": this.addToken(TokenType.COLON); break;
      case ";": this.addToken(TokenType.SEMICOLON); break;
      case "|":
        if (this.match("|")) {
          this.addToken(TokenType.OR);
        } else {
          this.addToken(TokenType.PIPE);
        }
        break;
      case "+": this.addToken(TokenType.PLUS); break;
      case "*": this.addToken(TokenType.STAR); break;
      case "%": this.addToken(TokenType.PERCENT); break;

      case "-":
        this.addToken(this.match(">") ? TokenType.ARROW : TokenType.MINUS);
        break;
      case "!":
        this.addToken(this.match("=") ? TokenType.BANG_EQUAL : TokenType.BANG);
        break;
      case "=":
        this.addToken(this.match("=") ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
        break;
      case "<":
        this.addToken(this.match("=") ? TokenType.LESS_EQUAL : TokenType.LESS);
        break;
      case ">":
        this.addToken(this.match("=") ? TokenType.GREATER_EQUAL : TokenType.GREATER);
        break;
      case "?":
        if (this.match(":")) {
          this.addToken(TokenType.QUESTION_COLON);
        } else if (this.match(".")) {
          this.addToken(TokenType.QUESTION_DOT);
        } else {
          this.addToken(TokenType.QUESTION);
        }
        break;
      case "&":
        if (this.match("&")) {
          this.addToken(TokenType.AND);
        } else {
          throw new Error(`Unexpected character: ${c} at line ${this.line}, column ${this.column - 1}`);
        }
        break;

      case "/":
        if (this.match("/")) {
          // A comment goes until the end of the line.
          while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
        } else if (this.match("*")) {
          this.blockComment();
        } else {
          this.addToken(TokenType.SLASH);
        }
        break;

      case " ":
      case "\r":
      case "\t":
        // Ignore whitespace.
        break;

      case "\n":
        this.line++;
        this.column = 1;
        break;

      case '"': this.string(); break;

      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          throw new Error(`Unexpected character: ${c} at line ${this.line}, column ${this.column - 1}`);
        }
        break;
    }
  }

  private blockComment(): void {
    while (!this.isAtEnd()) {
      if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        return;
      }
      if (this.peek() === "\n") {
        this.line++;
        this.column = 1;
        this.advance();
      } else {
        this.advance();
      }
    }
    throw new Error("Unterminated block comment");
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek())) this.advance();

    const text = this.source.substring(this.start, this.current);
    let type = Lexer.keywords[text];
    if (type === undefined) type = TokenType.IDENTIFIER;
    this.addToken(type);
  }

  private number(): void {
    while (this.isDigit(this.peek())) this.advance();

    // Look for a fractional part.
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      // Consume the "."
      this.advance();

      while (this.isDigit(this.peek())) this.advance();
      this.addToken(TokenType.FLOAT, parseFloat(this.source.substring(this.start, this.current)));
    } else {
      this.addToken(TokenType.INTEGER, parseInt(this.source.substring(this.start, this.current)));
    }
  }

  private string(): void {
    while (this.peek() !== '"' && !this.isAtEnd()) {
      if (this.peek() === "\n") {
        this.line++;
        this.column = 1;
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      throw new Error("Unterminated string.");
    }

    // The closing ".
    this.advance();

    // Trim the surrounding quotes.
    const value = this.source.substring(this.start + 1, this.current - 1);
    this.addToken(TokenType.STRING, value);
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;

    this.current++;
    this.column++;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return "\0";
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return "\0";
    return this.source.charAt(this.current + 1);
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") ||
           (c >= "A" && c <= "Z") ||
            c == "_";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private isDigit(c: string): boolean {
    return c >= "0" && c <= "9";
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    this.column++;
    return this.source.charAt(this.current++);
  }

  private addToken(type: TokenType, literal: any = null): void {
    const text = this.source.substring(this.start, this.current);
    // Use the stored startColumn which was captured at the beginning of scanToken
    this.tokens.push(new Token(type, text, literal, this.line, this.startColumn));
  }
}
