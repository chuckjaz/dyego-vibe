import {
    Expr, Stmt, TypeNode, ExprVisitor, StmtVisitor,
    LiteralExpr, VariableExpr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LogicalExpr, SetExpr, ThisExpr, UnaryExpr, BlockExpr, IfExpr, WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
    ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt,
    NamedType, UnionType, ArrayType, OptionalType, GenericType
} from "./ast";
import { TokenType, Token } from "./token";

export class CheckerError extends Error {
    token: Token;
    message: string;

    constructor(token: Token, message: string) {
        super(message);
        this.token = token;
        this.message = message;
    }
}

type TypeInfo = TypeNode | FunctionStmt;

class Environment {
    values: Map<string, TypeInfo> = new Map();
    enclosing: Environment | null;

    constructor(enclosing: Environment | null = null) {
        this.enclosing = enclosing;
    }

    define(name: string, info: TypeInfo) {
        this.values.set(name, info);
    }

    get(name: Token): TypeInfo {
        if (this.values.has(name.lexeme)) {
            return this.values.get(name.lexeme)!;
        }

        if (this.enclosing !== null) {
            return this.enclosing.get(name);
        }

        throw new CheckerError(name, "Undefined variable '" + name.lexeme + "'.");
    }

    assign(name: Token, info: TypeInfo) {
        if (this.values.has(name.lexeme)) {
            this.values.set(name.lexeme, info);
            return;
        }

        if (this.enclosing !== null) {
            this.enclosing.assign(name, info);
            return;
        }

        throw new CheckerError(name, "Undefined variable '" + name.lexeme + "'.");
    }
}

export class Checker implements ExprVisitor<TypeNode>, StmtVisitor<void> {
    private environment: Environment = new Environment();
    private currentFunction: FunctionStmt | null = null;
    private errors: CheckerError[] = [];

    check(statements: Stmt[]) {
        try {
            for (const statement of statements) {
                this.execute(statement);
            }
        } catch (error) {
            if (error instanceof CheckerError) {
                this.errors.push(error);
            } else {
                throw error;
            }
        }
    }

    getErrors(): CheckerError[] {
        return this.errors;
    }

    private execute(stmt: Stmt) {
        stmt.accept(this);
    }

    private evaluate(expr: Expr): TypeNode {
        return expr.accept(this);
    }

    private isTypeCompatible(target: TypeNode, source: TypeNode): boolean {
        if (target instanceof NamedType && source instanceof NamedType) {
            return target.name.lexeme === source.name.lexeme;
        }
        // Basic compatibility check
        // TODO: Implement more complex compatibility (Union types, Inheritance, etc.)
        // Strip tokens/location for structural check
        const targetStr = this.typeToString(target);
        const sourceStr = this.typeToString(source);
        if (targetStr !== "Type" && sourceStr !== "Type") {
             return targetStr === sourceStr;
        }
        return JSON.stringify(target) === JSON.stringify(source);
    }

    private checkType(expected: TypeNode, actual: TypeNode, token: Token) {
        if (!this.isTypeCompatible(expected, actual)) {
            throw new CheckerError(token, `Expected type ${this.typeToString(expected)}, but got ${this.typeToString(actual)}.`);
        }
    }

    private typeToString(type: TypeNode): string {
        if (type instanceof NamedType) {
            return type.name.lexeme;
        }
        // Helper for ArrayType, etc.
        if (type instanceof ArrayType) {
            return this.typeToString(type.elementType) + "[]";
        }
        return "Type";
    }

    private getUnitType(line: number = 0): TypeNode {
        return new NamedType(new Token(TokenType.IDENTIFIER, "Unit", null, line, 0));
    }

    private getBooleanType(): TypeNode {
        return new NamedType(new Token(TokenType.IDENTIFIER, "Boolean", null, 0, 0));
    }

    // --- StmtVisitor ---

    visitVarStmt(stmt: VarStmt): void {
        let initializerType: TypeNode | null = null;
        if (stmt.initializer) {
            initializerType = this.evaluate(stmt.initializer);
        }

        if (stmt.type) {
            if (initializerType) {
                this.checkType(stmt.type, initializerType, stmt.name);
            }
            this.environment.define(stmt.name.lexeme, stmt.type);
        } else {
            if (initializerType) {
                this.environment.define(stmt.name.lexeme, initializerType);
            } else {
                throw new CheckerError(stmt.name, "Variable must have a type annotation or an initializer.");
            }
        }
    }

    visitFunctionStmt(stmt: FunctionStmt): void {
        this.environment.define(stmt.name.lexeme, stmt);

        const previousEnv = this.environment;
        this.environment = new Environment(this.environment);

        const previousFunction = this.currentFunction;
        this.currentFunction = stmt;

        for (const param of stmt.params) {
            this.environment.define(param.name.lexeme, param.type);
        }

        const bodyType = this.evaluate(stmt.body);

        if (stmt.returnType) {
            if (this.typeToString(bodyType) !== "Unit") {
                this.checkType(stmt.returnType, bodyType, stmt.name);
            } else if (this.typeToString(stmt.returnType) === "Unit") {
                // OK
            }
        }

        this.environment = previousEnv;
        this.currentFunction = previousFunction;
    }

    visitReturnStmt(stmt: ReturnStmt): void {
        if (!this.currentFunction) {
            throw new CheckerError(stmt.keyword, "Can't return from top-level code.");
        }

        let valueType: TypeNode;
        if (stmt.value) {
            valueType = this.evaluate(stmt.value);
        } else {
             valueType = this.getUnitType(stmt.keyword.line);
        }

        if (this.currentFunction.returnType) {
             this.checkType(this.currentFunction.returnType, valueType, stmt.keyword);
        }
    }

    visitExpressionStmt(stmt: ExpressionStmt): void {
        this.evaluate(stmt.expression);
    }

    visitBlockExpr(expr: BlockExpr): TypeNode {
        const previousEnv = this.environment;
        this.environment = new Environment(this.environment);

        let lastType: TypeNode = this.getUnitType();

        for (const stmt of expr.statements) {
            if (stmt instanceof ExpressionStmt) {
                lastType = this.evaluate(stmt.expression);
            } else {
                this.execute(stmt);
                lastType = this.getUnitType();
            }
        }

        this.environment = previousEnv;
        return lastType;
    }

    visitLiteralExpr(expr: LiteralExpr): TypeNode {
        if (typeof expr.value === 'number') {
            if (Number.isInteger(expr.value)) {
                return new NamedType(new Token(TokenType.IDENTIFIER, "i32", null, 0, 0)); // Default integer type
            } else {
                return new NamedType(new Token(TokenType.IDENTIFIER, "f32", null, 0, 0)); // Default float type
            }
        } else if (typeof expr.value === 'string') {
            return new NamedType(new Token(TokenType.IDENTIFIER, "String", null, 0, 0));
        } else if (typeof expr.value === 'boolean') {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Boolean", null, 0, 0));
        } else if (expr.value === null) {
             return new NamedType(new Token(TokenType.IDENTIFIER, "Null", null, 0, 0));
        }
        return new NamedType(new Token(TokenType.IDENTIFIER, "Dynamic", null, 0, 0));
    }

    visitVariableExpr(expr: VariableExpr): TypeNode {
        const info = this.environment.get(expr.name);
        if (info instanceof FunctionStmt) {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Function", null, expr.name.line, expr.name.column));
        }
        return info;
    }

    visitCallExpr(expr: CallExpr): TypeNode {
        let calleeInfo: TypeInfo | null = null;

        if (expr.callee instanceof VariableExpr) {
             calleeInfo = this.environment.get(expr.callee.name);
        } else {
            const _calleeType = this.evaluate(expr.callee);
        }

        if (calleeInfo instanceof FunctionStmt) {
            const func = calleeInfo;

            if (expr.arguments.length !== func.params.length) {
                throw new CheckerError(expr.paren, `Expected ${func.params.length} arguments but got ${expr.arguments.length}.`);
            }

            for (let i = 0; i < expr.arguments.length; i++) {
                const arg = expr.arguments[i];
                const param = func.params[i];

                const argType = this.evaluate(arg.value);
                this.checkType(param.type, argType, expr.paren);
            }

            return func.returnType || this.getUnitType();
        } else {
            throw new CheckerError(expr.paren, "Can only call named functions.");
        }
    }

    visitAssignExpr(expr: AssignExpr): TypeNode {
        const variableType = this.environment.get(expr.name);
        if (variableType instanceof FunctionStmt) {
             throw new CheckerError(expr.name, "Cannot assign to a function.");
        }

        const valueType = this.evaluate(expr.value);
        this.checkType(variableType, valueType, expr.name);
        return variableType;
    }

    visitBinaryExpr(expr: BinaryExpr): TypeNode {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);
        this.checkType(left, right, expr.operator);

        if (["EQUAL_EQUAL", "BANG_EQUAL", "GREATER", "GREATER_EQUAL", "LESS", "LESS_EQUAL"].includes(expr.operator.type)) {
             return this.getBooleanType();
        }

        return left;
    }

    visitGetExpr(expr: GetExpr): TypeNode { return this.getUnitType(); }
    visitGroupingExpr(expr: GroupingExpr): TypeNode { return this.evaluate(expr.expression); }
    visitLogicalExpr(expr: LogicalExpr): TypeNode {
        this.evaluate(expr.left);
        this.evaluate(expr.right);
        return this.getBooleanType();
    }
    visitSetExpr(expr: SetExpr): TypeNode { return this.getUnitType(); }
    visitThisExpr(expr: ThisExpr): TypeNode { return this.getUnitType(); }
    visitUnaryExpr(expr: UnaryExpr): TypeNode { return this.evaluate(expr.right); }

    visitIfExpr(expr: IfExpr): TypeNode {
        const conditionType = this.evaluate(expr.condition);
        // Use a dummy token for error reporting if condition is not simple
        const errorToken = (expr.condition instanceof VariableExpr) ? expr.condition.name : new Token(TokenType.IF, "if", null, 0, 0);
        this.checkType(this.getBooleanType(), conditionType, errorToken);

        const thenType = this.evaluate(expr.thenBranch);
        if (expr.elseBranch) {
            const elseType = this.evaluate(expr.elseBranch);
            if (!this.isTypeCompatible(thenType, elseType)) {
                 throw new CheckerError(new Token(TokenType.ELSE, "else", null, 0, 0), `If branches must return compatible types. Got ${this.typeToString(thenType)} and ${this.typeToString(elseType)}.`);
            }
            return thenType;
        }
        return thenType;
    }

    visitWhileStmt(stmt: WhileStmt): void {
        const conditionType = this.evaluate(stmt.condition);
        this.checkType(this.getBooleanType(), conditionType, new Token(TokenType.WHILE, "while", null, 0, 0));
        this.evaluate(stmt.body);
    }

    visitForStmt(stmt: ForStmt): void {
        this.evaluate(stmt.body);
    }

    visitBreakStmt(stmt: BreakStmt): void { }
    visitContinueStmt(stmt: ContinueStmt): void { }
    visitValueStmt(stmt: ValueStmt): void { }
    visitUseStmt(stmt: UseStmt): void { }
    visitTraitStmt(stmt: TraitStmt): void { }

    visitWhenExpr(expr: WhenExpr): TypeNode { return this.getUnitType(); }
    visitLambdaExpr(expr: LambdaExpr): TypeNode { return this.getUnitType(); }
    visitArrayLiteralExpr(expr: ArrayLiteralExpr): TypeNode { return this.getUnitType(); }
    visitIndexGetExpr(expr: IndexGetExpr): TypeNode { return this.getUnitType(); }
    visitIndexSetExpr(expr: IndexSetExpr): TypeNode { return this.getUnitType(); }
    visitPropagateExpr(expr: PropagateExpr): TypeNode { return this.evaluate(expr.expression); }
    visitCastExpr(expr: CastExpr): TypeNode { return expr.targetType; }
}
