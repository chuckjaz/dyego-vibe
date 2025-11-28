import {
    Expr, Stmt, TypeNode, ExprVisitor, StmtVisitor,
    LiteralExpr, VariableExpr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LogicalExpr, SetExpr, ThisExpr, UnaryExpr, BlockExpr, IfExpr, WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
    ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt,
    NamedType, UnionType, ArrayType, GenericType, IsCondition
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

type TypeInfo = TypeNode | FunctionStmt | ValueStmt;

class Environment {
    values: Map<string, TypeInfo> = new Map();
    extensions: FunctionStmt[] = [];
    enclosing: Environment | null;

    constructor(enclosing: Environment | null = null) {
        this.enclosing = enclosing;
    }

    define(name: string, info: TypeInfo) {
        this.values.set(name, info);
    }

    addExtension(stmt: FunctionStmt) {
        this.extensions.push(stmt);
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

    lookup(name: string): TypeInfo | undefined {
        if (this.values.has(name)) {
            return this.values.get(name);
        }

        if (this.enclosing !== null) {
            return this.enclosing.lookup(name);
        }

        return undefined;
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
    private currentValue: ValueStmt | null = null;
    private errors: CheckerError[] = [];
    private expectedType: TypeNode | null = null;
    private currentInferredReturnType: TypeNode | null = null;
    private visibleMethods: Map<string, FunctionStmt> = new Map();

    constructor() {
        this.definePrimitives();
    }

    private definePrimitives() {
        const f64Methods = [
            new FunctionStmt(
                new Token(TokenType.IDENTIFIER, "sqrt", null, 0, 0),
                [], // params
                new NamedType(new Token(TokenType.IDENTIFIER, "f64", null, 0, 0)), // return type
                new BlockExpr([]), // body
                [], // generics
                false, // isMutating
                false // isOperator
            )
        ];
        const f64 = new ValueStmt(
            new Token(TokenType.IDENTIFIER, "f64", null, 0, 0),
            [], // fields
            f64Methods,
            [] // generics
        );
        this.environment.define("f64", f64);
    }

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
        const type = expr.accept(this);
        expr.type = type;
        return type;
    }

    private isTypeCompatible(target: TypeNode, source: TypeNode): boolean {
        if (target instanceof NamedType && source instanceof NamedType) {
            return target.name.lexeme === source.name.lexeme;
        }

        if (target instanceof ArrayType && source instanceof ArrayType) {
            return this.isTypeCompatible(target.elementType, source.elementType);
        }

        if (target instanceof UnionType) {
            // A is compatible with A | B
            // A | B is compatible with A | B | C
            if (source instanceof UnionType) {
                return source.types.every(s => target.types.some(t => this.isTypeCompatible(t, s)));
            } else {
                return target.types.some(t => this.isTypeCompatible(t, source));
            }
        }

        if (source instanceof UnionType) {
            // A | B is NOT compatible with A (unless B is A)
            return source.types.every(s => this.isTypeCompatible(target, s));
        }

        // Basic compatibility check
        // TODO: Implement more complex compatibility (Inheritance, etc.)
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
        if (type instanceof UnionType) {
            return type.types.map(t => this.typeToString(t)).join(" | ");
        }
        return "Type";
    }

    private lookupExtension(name: string, type: TypeNode): FunctionStmt | undefined {
        let env: Environment | null = this.environment;
        while (env) {
            for (const ext of env.extensions) {
                if (ext.name.lexeme === name && ext.extensionType) {
                    if (this.isTypeCompatible(ext.extensionType, type)) {
                        return ext;
                    }
                }
            }
            env = env.enclosing;
        }
        return undefined;
    }

    private getUnitType(line: number = 0): TypeNode {
        return new NamedType(new Token(TokenType.IDENTIFIER, "Unit", null, line, 0));
    }

    private getBooleanType(): TypeNode {
        return new NamedType(new Token(TokenType.IDENTIFIER, "Boolean", null, 0, 0));
    }

    private checkFunction(stmt: FunctionStmt, defineName: boolean): void {
        if (defineName) {
            this.environment.define(stmt.name.lexeme, stmt);
        }

        const previousEnv = this.environment;
        this.environment = new Environment(this.environment);

        const previousFunction = this.currentFunction;
        this.currentFunction = stmt;

        if (this.currentValue && !defineName) {
            const value = this.currentValue;
            const thisType = new NamedType(value.name);
            this.environment.define("this", thisType);

            for (const field of value.fields) {
                this.environment.define(field.name.lexeme, field.type);
            }
        } else if (stmt.extensionType) {
            this.environment.define("this", stmt.extensionType);
        }

        for (const param of stmt.params) {
            this.environment.define(param.name.lexeme, param.type);
        }

        const previousInferredReturnType = this.currentInferredReturnType;
        this.currentInferredReturnType = null;

        const bodyType = this.evaluate(stmt.body);

        if (stmt.returnType) {
            if (this.typeToString(bodyType) !== "Unit") {
                this.checkType(stmt.returnType, bodyType, stmt.name);
            } else if (this.typeToString(stmt.returnType) === "Unit") {
                // OK
            }
        } else {
            // Infer return type
            if (this.typeToString(bodyType) !== "Unit") {
                if (this.currentInferredReturnType) {
                    if (!this.isTypeCompatible(this.currentInferredReturnType, bodyType)) {
                        throw new CheckerError(stmt.name, `Function body returns ${this.typeToString(bodyType)}, but previous returns were ${this.typeToString(this.currentInferredReturnType)}.`);
                    }
                } else {
                    this.currentInferredReturnType = bodyType;
                }
            }
            stmt.returnType = this.currentInferredReturnType || this.getUnitType();
        }

        this.environment = previousEnv;
        this.currentFunction = previousFunction;
        this.currentInferredReturnType = previousInferredReturnType;
    }

    // --- StmtVisitor ---

    visitVarStmt(stmt: VarStmt): void {
        let initializerType: TypeNode | null = null;
        if (stmt.initializer) {
            if (stmt.type) {
                const previousExpected = this.expectedType;
                this.expectedType = stmt.type;
                initializerType = this.evaluate(stmt.initializer);
                this.expectedType = previousExpected;
            } else {
                initializerType = this.evaluate(stmt.initializer);
            }
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
        if (stmt.extensionType) {
            this.environment.addExtension(stmt);
            this.checkFunction(stmt, false);
        } else {
            this.checkFunction(stmt, true);
        }
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
        } else {
            if (this.currentInferredReturnType) {
                if (!this.isTypeCompatible(this.currentInferredReturnType, valueType)) {
                    throw new CheckerError(stmt.keyword, `Return types must be consistent. Expected ${this.typeToString(this.currentInferredReturnType)}, but got ${this.typeToString(valueType)}.`);
                }
            } else {
                this.currentInferredReturnType = valueType;
            }
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
            if (expr.tokenType === TokenType.FLOAT) {
                return new NamedType(new Token(TokenType.IDENTIFIER, "f64", null, 0, 0)); // Default float literal to f64 as per Issue #10
            }
            if (Number.isInteger(expr.value)) {
                return new NamedType(new Token(TokenType.IDENTIFIER, "i32", null, 0, 0)); // Default integer type
            } else {
                return new NamedType(new Token(TokenType.IDENTIFIER, "f64", null, 0, 0)); // Default float type
            }
        } else if (typeof expr.value === 'string') {
            return new NamedType(new Token(TokenType.IDENTIFIER, "String", null, 0, 0));
        } else if (typeof expr.value === 'boolean') {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Boolean", null, 0, 0));
        } else if (expr.value === null) {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Null", null, 0, 0));
        }
        throw new CheckerError(new Token(TokenType.IDENTIFIER, "Unknown literal", null, 0, 0), "Unknown literal type.");
    }

    visitVariableExpr(expr: VariableExpr): TypeNode {
        const info = this.environment.get(expr.name);
        if (info instanceof FunctionStmt) {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Function", null, expr.name.line, expr.name.column));
        }
        if (info instanceof ValueStmt) {
            return new NamedType(info.name);
        }
        return info;
    }

    visitCallExpr(expr: CallExpr): TypeNode {
        if (expr.callee instanceof GetExpr) {
            const getExpr = expr.callee;
            const objectType = this.evaluate(getExpr.object);

            if (objectType instanceof NamedType) {
                const info = this.environment.lookup(objectType.name.lexeme);
                if (info instanceof ValueStmt) {
                    const method = info.methods.find(m => m.name.lexeme === getExpr.name.lexeme);
                    if (method) {
                        if (expr.arguments.length !== method.params.length) {
                            throw new CheckerError(expr.paren, `Expected ${method.params.length} arguments but got ${expr.arguments.length}.`);
                        }
                        for (let i = 0; i < expr.arguments.length; i++) {
                            const arg = expr.arguments[i];
                            const param = method.params[i];
                            const argType = this.evaluate(arg.value);
                            this.checkType(param.type, argType, expr.paren);
                        }
                        return method.returnType || this.getUnitType();
                    }
                    // Fall through to extension check
                }
            }

            // Check for extension method
            const extension = this.lookupExtension(getExpr.name.lexeme, objectType);
            if (extension) {
                if (expr.arguments.length !== extension.params.length) {
                    throw new CheckerError(expr.paren, `Expected ${extension.params.length} arguments but got ${expr.arguments.length}.`);
                }
                for (let i = 0; i < expr.arguments.length; i++) {
                    const arg = expr.arguments[i];
                    const param = extension.params[i];
                    const argType = this.evaluate(arg.value);
                    this.checkType(param.type, argType, expr.paren);
                }
                return extension.returnType || this.getUnitType();
            }

            if (objectType instanceof NamedType) {
                const info = this.environment.lookup(objectType.name.lexeme);
                if (info instanceof ValueStmt) {
                    throw new CheckerError(getExpr.name, `Undefined method '${getExpr.name.lexeme}' on '${info.name.lexeme}'.`);
                }
            }
            throw new CheckerError(getExpr.name, `Undefined property or method '${getExpr.name.lexeme}'.`);
        }


        let calleeInfo: TypeInfo | null | undefined = null;

        if (expr.callee instanceof VariableExpr) {
            const callee = expr.callee;
            calleeInfo = this.environment.lookup(callee.name.lexeme);
            if (!calleeInfo && this.currentValue) {
                // Implicit 'this' lookup: only check visible methods
                calleeInfo = this.visibleMethods.get(callee.name.lexeme);
            }
            if (!calleeInfo) {
                throw new CheckerError(callee.name, "Undefined variable '" + callee.name.lexeme + "'.");
            }
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
        } else if (calleeInfo instanceof ValueStmt) {
            const val = calleeInfo;
            if (expr.arguments.length !== val.fields.length) {
                throw new CheckerError(expr.paren, `Expected ${val.fields.length} arguments but got ${expr.arguments.length}.`);
            }
            for (let i = 0; i < expr.arguments.length; i++) {
                const arg = expr.arguments[i];
                const field = val.fields[i];
                const argType = this.evaluate(arg.value);
                this.checkType(field.type, argType, expr.paren);
            }
            return new NamedType(val.name);
        } else {
            throw new CheckerError(expr.paren, "Can only call named functions.");
        }
    }

    visitAssignExpr(expr: AssignExpr): TypeNode {
        const variableType = this.environment.get(expr.name);
        if (variableType instanceof FunctionStmt) {
            throw new CheckerError(expr.name, "Cannot assign to a function.");
        }
        if (variableType instanceof ValueStmt) {
            throw new CheckerError(expr.name, "Cannot assign to a value type.");
        }

        const valueType = this.evaluate(expr.value);
        this.checkType(variableType, valueType, expr.name);
        return variableType;
    }

    visitBinaryExpr(expr: BinaryExpr): TypeNode {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);

        // Check for overloaded operator on the left operand
        if (left instanceof NamedType) {
            const info = this.environment.lookup(left.name.lexeme);
            if (info instanceof ValueStmt) {
                const operatorName = expr.operator.lexeme;
                let method: FunctionStmt | undefined;

                if (info === this.currentValue) {
                    // If we are inside the value type, only check visible methods
                    method = this.visibleMethods.get(operatorName);
                } else {
                    method = info.methods.find(m => m.name.lexeme === operatorName);
                }

                if (method) {
                    // Check if it's a valid operator overload
                    // For standard operators, it must be marked as 'operator'
                    // For infix identifiers, it can be a regular method (or operator?)
                    // The parser sets isOperator=true for 'operator fun'.
                    // We should enforce isOperator for standard ops?
                    // The prompt says "overloaded operators are check against the function signature".

                    if (method.params.length !== 1) {
                        throw new CheckerError(expr.operator, `Operator '${operatorName}' must have exactly one parameter.`);
                    }

                    const param = method.params[0];
                    this.checkType(param.type, right, expr.operator);

                    return method.returnType || this.getUnitType();
                }
            }
        }

        this.checkType(left, right, expr.operator);

        if (["EQUAL_EQUAL", "BANG_EQUAL", "GREATER", "GREATER_EQUAL", "LESS", "LESS_EQUAL"].includes(expr.operator.type)) {
            return this.getBooleanType();
        }

        return left;
    }

    visitGetExpr(expr: GetExpr): TypeNode {
        const objectType = this.evaluate(expr.object);
        if (objectType instanceof NamedType) {
            const info = this.environment.lookup(objectType.name.lexeme);
            if (info instanceof ValueStmt) {
                const field = info.fields.find(f => f.name.lexeme === expr.name.lexeme);
                if (field) {
                    return field.type;
                }
                let method: FunctionStmt | undefined;
                if (info === this.currentValue) {
                    method = this.visibleMethods.get(expr.name.lexeme);
                } else {
                    method = info.methods.find(m => m.name.lexeme === expr.name.lexeme);
                }

                if (method) {
                    return new NamedType(new Token(TokenType.IDENTIFIER, "Function", null, expr.name.line, expr.name.column));
                }
                // Fall through to extension check
            }
        }

        const extension = this.lookupExtension(expr.name.lexeme, objectType);
        if (extension) {
            return new NamedType(new Token(TokenType.IDENTIFIER, "Function", null, expr.name.line, expr.name.column));
        }

        if (objectType instanceof NamedType) {
            const info = this.environment.lookup(objectType.name.lexeme);
            if (info instanceof ValueStmt) {
                throw new CheckerError(expr.name, `Undefined property '${expr.name.lexeme}' on '${info.name.lexeme}'.`);
            }
        }

        return this.getUnitType();
    }
    visitGroupingExpr(expr: GroupingExpr): TypeNode { return this.evaluate(expr.expression); }
    visitLogicalExpr(expr: LogicalExpr): TypeNode {
        this.evaluate(expr.left);
        this.evaluate(expr.right);
        return this.getBooleanType();
    }
    visitSetExpr(expr: SetExpr): TypeNode { return this.getUnitType(); }
    visitThisExpr(expr: ThisExpr): TypeNode {
        const type = this.environment.lookup("this");
        if (type instanceof NamedType || type instanceof UnionType || type instanceof ArrayType || type instanceof GenericType) {
            return type as TypeNode;
        }
        throw new CheckerError(expr.keyword, "Invalid use of 'this'.");
    }
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

    visitValueStmt(stmt: ValueStmt): void {
        this.environment.define(stmt.name.lexeme, stmt);

        const previousValue = this.currentValue;
        const previousVisibleMethods = this.visibleMethods;
        this.currentValue = stmt;
        this.visibleMethods = new Map();

        for (const method of stmt.methods) {
            // Add method to visible methods BEFORE checking if we want recursive calls to be valid
            // Or AFTER if we want strictly "defined before use"?
            // Prompt says: "treat methods not yet seen as being undefined".
            // Usually this means defined *before* the current method?
            // "only allow methods that have been already been seen by the checker to be called on this"
            // If I call `foo()` inside `foo()`, `foo` has been seen?
            // "treat methods not yet seen as being undefined (that is, only define them in the environment as they are checked)"
            // This implies we add them as we go.
            // If I add it before checking, recursion is allowed.
            // If I add it after, recursion is NOT allowed.
            // "Allow method and operators on this to be called in the body of a method."
            // Usually recursion is allowed.
            // I will add it BEFORE checking to allow recursion.
            this.visibleMethods.set(method.name.lexeme, method);
            this.checkFunction(method, false);
        }

        this.currentValue = previousValue;
        this.visibleMethods = previousVisibleMethods;
    }

    visitUseStmt(stmt: UseStmt): void { }
    visitTraitStmt(stmt: TraitStmt): void { }

    visitWhenExpr(expr: WhenExpr): TypeNode {
        let subjectType: TypeNode | null = null;
        if (expr.subject) {
            subjectType = this.evaluate(expr.subject);
        }

        const entryTypes: TypeNode[] = [];
        const coveredTypes: TypeNode[] = [];

        for (const entry of expr.entries) {
            const previousEnv = this.environment;
            this.environment = new Environment(this.environment);

            for (const condition of entry.conditions) {
                if (condition instanceof IsCondition) {
                    if (!subjectType) {
                        throw new CheckerError(expr.keyword, "'is' condition is only allowed when 'when' has a subject.");
                    }
                    // Check if condition.type is part of subjectType
                    if (!this.isTypeCompatible(subjectType, condition.type) && !this.isTypeCompatible(condition.type, subjectType)) {
                        throw new CheckerError(expr.keyword, `Type '${this.typeToString(condition.type)}' is not compatible with subject type '${this.typeToString(subjectType)}'.`);
                    }

                    // Narrow type in body
                    // If subject is a variable, we can shadow it with narrowed type
                    if (expr.subject instanceof VariableExpr) {
                        this.environment.define(expr.subject.name.lexeme, condition.type);
                    }
                    coveredTypes.push(condition.type);

                } else {
                    const conditionType = this.evaluate(condition);
                    if (subjectType) {
                        // Check compatibility with subject
                        this.checkType(subjectType, conditionType, expr.keyword);
                    } else {
                        // Condition must be boolean
                        this.checkType(this.getBooleanType(), conditionType, expr.keyword);
                    }
                }
            }
            entryTypes.push(this.evaluate(entry.body));
            this.environment = previousEnv;
        }

        if (expr.elseBranch) {
            entryTypes.push(this.evaluate(expr.elseBranch));

            // Check if else is redundant?
            // "It is also an error to leave one of the parts of a union uncovered by a branch of the when statement. In other ords the when statement must be complete."
            // "The else clause, assume the type to be a union typ with the types in the other is causes excluded. This this is an empty set, report an error."

            if (subjectType instanceof UnionType) {
                const remainingTypes = subjectType.types.filter(t => !coveredTypes.some(c => this.isTypeCompatible(c, t)));
                if (remainingTypes.length === 0 && coveredTypes.length > 0) {
                    // If we have covered all types and there is an else, it might be redundant, but prompt says:
                    // "This this is an empty set, report an error."
                    throw new CheckerError(expr.keyword, "'else' branch is redundant because all cases are covered.");
                }
            }

        } else {
            // Check exhaustiveness
            if (subjectType instanceof UnionType) {
                const remainingTypes = subjectType.types.filter(t => !coveredTypes.some(c => this.isTypeCompatible(c, t)));
                if (remainingTypes.length > 0) {
                    throw new CheckerError(expr.keyword, `When expression is not exhaustive. Missing cases: ${remainingTypes.map(t => this.typeToString(t)).join(", ")}.`);
                }
            } else if (subjectType) {
                // If not a union type, and no else, and we used 'is', we probably didn't cover it unless it's a single type 'is T'
                if (coveredTypes.length > 0) {
                    const remaining = !coveredTypes.some(c => this.isTypeCompatible(c, subjectType));
                    if (remaining) {
                        throw new CheckerError(expr.keyword, "When expression is not exhaustive.");
                    }
                }
            }
        }

        if (entryTypes.length === 0) {
            return this.getUnitType();
        }

        const firstType = entryTypes[0];
        // ... rest of compatibility check ...
        for (let i = 1; i < entryTypes.length; i++) {
            // Allow union return?
            // "The when statement must be complete."
            // Usually when returns a common supertype.
            // For now, keep strict compatibility or allow union?
            // Existing code enforces compatibility with first branch.
            if (!this.isTypeCompatible(firstType, entryTypes[i])) {
                // Try to find common supertype or union?
                // For now, stick to existing logic but maybe allow one way compatibility?
                // If we want to return a Union, we'd need to construct it.
                // But let's stick to existing strict check unless requested.
                throw new CheckerError(expr.keyword, `When branches must return compatible types. Got ${this.typeToString(firstType)} and ${this.typeToString(entryTypes[i])}.`);
            }
        }

        return firstType;
    }
    visitLambdaExpr(expr: LambdaExpr): TypeNode { return this.getUnitType(); }

    visitArrayLiteralExpr(expr: ArrayLiteralExpr): TypeNode {
        if (expr.elements.length === 0) {
            if (this.expectedType instanceof ArrayType) {
                return this.expectedType;
            }
            throw new CheckerError(new Token(TokenType.LEFT_BRACKET, "[", null, 0, 0), "Cannot infer type of empty array. Please provide an explicit type.");
        }

        const firstType = this.evaluate(expr.elements[0]);

        for (let i = 1; i < expr.elements.length; i++) {
            const elementType = this.evaluate(expr.elements[i]);
            if (!this.isTypeCompatible(firstType, elementType)) {
                throw new CheckerError(new Token(TokenType.LEFT_BRACKET, "[", null, 0, 0), `Array elements must be of the same type. Expected ${this.typeToString(firstType)}, but got ${this.typeToString(elementType)}.`);
            }
        }

        return new ArrayType(firstType);
    }

    visitIndexGetExpr(expr: IndexGetExpr): TypeNode {
        const objectType = this.evaluate(expr.object);
        const indexType = this.evaluate(expr.index);

        const isI32 = indexType instanceof NamedType && indexType.name.lexeme === "i32";

        if (!isI32) {
            throw new CheckerError(expr.bracket, `Index must be an integer.`);
        }

        if (objectType instanceof ArrayType) {
            return objectType.elementType;
        }

        throw new CheckerError(expr.bracket, `Type ${this.typeToString(objectType)} is not an array.`);
    }

    visitIndexSetExpr(expr: IndexSetExpr): TypeNode {
        const objectType = this.evaluate(expr.object);
        const indexType = this.evaluate(expr.index);
        const valueType = this.evaluate(expr.value);

        const isI32 = indexType instanceof NamedType && indexType.name.lexeme === "i32";

        if (!isI32) {
            throw new CheckerError(expr.bracket, `Index must be an integer.`);
        }

        if (objectType instanceof ArrayType) {
            this.checkType(objectType.elementType, valueType, expr.bracket);
            return objectType.elementType;
        }

        throw new CheckerError(expr.bracket, `Type ${this.typeToString(objectType)} is not an array.`);
    }
    visitPropagateExpr(expr: PropagateExpr): TypeNode { return this.evaluate(expr.expression); }
    visitCastExpr(expr: CastExpr): TypeNode { return expr.targetType; }
}
