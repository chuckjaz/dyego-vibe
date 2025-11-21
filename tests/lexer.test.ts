import { Lexer } from "../src/lexer";
import { TokenType, Token } from "../src/token";

describe("Lexer", () => {
  it("should tokenize empty string", () => {
    const lexer = new Lexer("");
    const tokens = lexer.scanTokens();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  it("should tokenize single characters", () => {
    const input = "(){}[],.-+;*";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    const expectedTypes = [
      TokenType.LEFT_PAREN, TokenType.RIGHT_PAREN,
      TokenType.LEFT_BRACE, TokenType.RIGHT_BRACE,
      TokenType.LEFT_BRACKET, TokenType.RIGHT_BRACKET,
      TokenType.COMMA, TokenType.DOT,
      TokenType.MINUS, TokenType.PLUS,
      TokenType.SEMICOLON, TokenType.STAR,
      TokenType.EOF
    ];

    expect(tokens.map(t => t.type)).toEqual(expectedTypes);
  });

  it("should tokenize operators", () => {
    const input = "! != = == < <= > >= -> ? ?: ?. | || &&";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    const expectedTypes = [
      TokenType.BANG, TokenType.BANG_EQUAL,
      TokenType.EQUAL, TokenType.EQUAL_EQUAL,
      TokenType.LESS, TokenType.LESS_EQUAL,
      TokenType.GREATER, TokenType.GREATER_EQUAL,
      TokenType.ARROW,
      TokenType.QUESTION, TokenType.QUESTION_COLON, TokenType.QUESTION_DOT,
      TokenType.PIPE, TokenType.OR, TokenType.AND,
      TokenType.EOF
    ];

    expect(tokens.map(t => t.type)).toEqual(expectedTypes);
  });

  it("should tokenize keywords", () => {
    const input = "val var value fun if else when for while break continue as trait use return true false null this";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    const expectedTypes = [
        TokenType.VAL, TokenType.VAR, TokenType.VALUE, TokenType.FUN,
        TokenType.IF, TokenType.ELSE, TokenType.WHEN,
        TokenType.FOR, TokenType.WHILE, TokenType.BREAK, TokenType.CONTINUE,
        TokenType.AS, TokenType.TRAIT, TokenType.USE, TokenType.RETURN,
        TokenType.TRUE, TokenType.FALSE, TokenType.NULL, TokenType.THIS,
        TokenType.EOF
    ];

    expect(tokens.map(t => t.type)).toEqual(expectedTypes);
  });

  it("should tokenize identifiers", () => {
    const input = "abc _name myVar123";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[0].lexeme).toBe("abc");

    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].lexeme).toBe("_name");

    expect(tokens[2].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[2].lexeme).toBe("myVar123");
  });

  it("should tokenize integers", () => {
    const input = "123 0 9999";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.INTEGER);
    expect(tokens[0].literal).toBe(123);

    expect(tokens[1].type).toBe(TokenType.INTEGER);
    expect(tokens[1].literal).toBe(0);

    expect(tokens[2].type).toBe(TokenType.INTEGER);
    expect(tokens[2].literal).toBe(9999);
  });

  it("should tokenize floats", () => {
    const input = "123.45 0.0 10.5";
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.FLOAT);
    expect(tokens[0].literal).toBe(123.45);

    expect(tokens[1].type).toBe(TokenType.FLOAT);
    expect(tokens[1].literal).toBe(0.0);

    expect(tokens[2].type).toBe(TokenType.FLOAT);
    expect(tokens[2].literal).toBe(10.5);
  });

  it("should tokenize strings", () => {
    const input = '"hello" "world"';
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    expect(tokens[0].type).toBe(TokenType.STRING);
    expect(tokens[0].literal).toBe("hello");

    expect(tokens[1].type).toBe(TokenType.STRING);
    expect(tokens[1].literal).toBe("world");
  });

  it("should handle comments", () => {
    const input = `
      // This is a line comment
      val x = 1
      /* This is a
         block comment */
      var y = 2
    `;
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    // val x = 1
    expect(tokens[0].type).toBe(TokenType.VAL);
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[2].type).toBe(TokenType.EQUAL);
    expect(tokens[3].type).toBe(TokenType.INTEGER);

    // var y = 2
    expect(tokens[4].type).toBe(TokenType.VAR);
    expect(tokens[5].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[6].type).toBe(TokenType.EQUAL);
    expect(tokens[7].type).toBe(TokenType.INTEGER);
  });

  it("should handle complex snippet", () => {
      const input = `
        value Point(val x: i32, val y: i32) {}
        val p = Point(10, 20)
      `;
      const lexer = new Lexer(input);
      const tokens = lexer.scanTokens();

      // value Point(val x: i32, val y: i32) {}
      expect(tokens[0].type).toBe(TokenType.VALUE);
      expect(tokens[1].lexeme).toBe("Point");
      expect(tokens[2].type).toBe(TokenType.LEFT_PAREN);
      expect(tokens[3].type).toBe(TokenType.VAL);
      expect(tokens[4].lexeme).toBe("x");
      expect(tokens[5].type).toBe(TokenType.COLON);
      expect(tokens[6].lexeme).toBe("i32");
      expect(tokens[7].type).toBe(TokenType.COMMA);
      expect(tokens[8].type).toBe(TokenType.VAL);
      expect(tokens[9].lexeme).toBe("y");
      expect(tokens[10].type).toBe(TokenType.COLON);
      expect(tokens[11].lexeme).toBe("i32");
      expect(tokens[12].type).toBe(TokenType.RIGHT_PAREN);
      expect(tokens[13].type).toBe(TokenType.LEFT_BRACE);
      expect(tokens[14].type).toBe(TokenType.RIGHT_BRACE);

      // val p = Point(10, 20)
      expect(tokens[15].type).toBe(TokenType.VAL);
      expect(tokens[16].lexeme).toBe("p");
      expect(tokens[17].type).toBe(TokenType.EQUAL);
      expect(tokens[18].lexeme).toBe("Point");
      expect(tokens[19].type).toBe(TokenType.LEFT_PAREN);
      expect(tokens[20].literal).toBe(10);
      expect(tokens[21].type).toBe(TokenType.COMMA);
      expect(tokens[22].literal).toBe(20);
      expect(tokens[23].type).toBe(TokenType.RIGHT_PAREN);
  });

  it("should handle multiline strings with correct columns", () => {
    const input = `val s = "line1
line2"`;
    const lexer = new Lexer(input);
    const tokens = lexer.scanTokens();

    // val s = "..."
    // val at 1:1
    expect(tokens[0].type).toBe(TokenType.VAL);
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].column).toBe(1);

    // s at 1:5
    expect(tokens[1].type).toBe(TokenType.IDENTIFIER);
    expect(tokens[1].line).toBe(1);
    expect(tokens[1].column).toBe(5);

    // = at 1:7
    expect(tokens[2].type).toBe(TokenType.EQUAL);
    expect(tokens[2].line).toBe(1);
    expect(tokens[2].column).toBe(7);

    // string at 1:9
    expect(tokens[3].type).toBe(TokenType.STRING);
    expect(tokens[3].line).toBe(2); // Ends on line 2
    expect(tokens[3].column).toBe(9); // Starts at column 9
    expect(tokens[3].literal).toBe("line1\nline2");
  });
});
