import binaryen from "binaryen";
import {
    Expr, Stmt, TypeNode, ExprVisitor, StmtVisitor,
    LiteralExpr, VariableExpr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LogicalExpr, SetExpr, ThisExpr, UnaryExpr, BlockExpr, IfExpr, WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
    ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt,
    NamedType, UnionType, ArrayType, GenericType, IsCondition, IntrinsicExpr
} from "./ast";
import { Checker } from "./checker";
import { TokenType } from "./token";

export class CodeGenerator implements ExprVisitor<binaryen.ExpressionRef>, StmtVisitor<binaryen.ExpressionRef> {
    private module: binaryen.Module;
    private checker: Checker;
    private localIndex: Map<string, number> = new Map();
    private nextLocalIndex: number = 0;
    private variableBindings: Map<string, binaryen.ExpressionRef> = new Map();

    constructor(module: binaryen.Module, checker: Checker) {
        this.module = module;
        this.checker = checker;
    }

    generate(stmt: Stmt) {
        stmt.accept(this);
    }

    private evaluate(expr: Expr): binaryen.ExpressionRef {
        return expr.accept(this);
    }

    private evaluateWithBindings(expr: Expr, bindings: Map<string, binaryen.ExpressionRef>): binaryen.ExpressionRef {
        const previousBindings = this.variableBindings;
        this.variableBindings = new Map([...previousBindings, ...bindings]);
        try {
            return this.evaluate(expr);
        } finally {
            this.variableBindings = previousBindings;
        }
    }

    private execute(stmt: Stmt): binaryen.ExpressionRef {
        return stmt.accept(this);
    }

    visitFunctionStmt(stmt: FunctionStmt): binaryen.ExpressionRef {
        this.localIndex.clear();
        this.nextLocalIndex = 0;

        const params = binaryen.createType(stmt.params.map(p => this.resolveType(p.type)));
        const result = stmt.returnType ? this.resolveType(stmt.returnType) : binaryen.none;

        for (const param of stmt.params) {
            this.localIndex.set(param.name.lexeme, this.nextLocalIndex++);
        }

        // TODO: Scan for locals in body
        const vars: binaryen.Type[] = [];

        if (stmt.isIntrinsic) {
            return 0 as binaryen.ExpressionRef; // Nothing to generate
        }

        const body = this.evaluate(stmt.body);

        this.module.addFunction(stmt.name.lexeme, params, result, vars, body);
        this.module.addFunctionExport(stmt.name.lexeme, stmt.name.lexeme);
        return 0 as binaryen.ExpressionRef;
    }

    visitBlockExpr(expr: BlockExpr): binaryen.ExpressionRef {
        const children: binaryen.ExpressionRef[] = [];
        for (const stmt of expr.statements) {
            children.push(this.execute(stmt));
        }
        return this.module.block(null, children);
    }

    visitReturnStmt(stmt: ReturnStmt): binaryen.ExpressionRef {
        const value = stmt.value ? this.evaluate(stmt.value) : undefined;
        return this.module.return(value);
    }

    visitExpressionStmt(stmt: ExpressionStmt): binaryen.ExpressionRef {
        return this.evaluate(stmt.expression);
    }

    visitBinaryExpr(expr: BinaryExpr): binaryen.ExpressionRef {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);

        const leftType = expr.left.type;
        if (leftType instanceof NamedType) {
            const info = this.checker.getGlobal(leftType.name.lexeme);
            if (info instanceof ValueStmt) {
                const opName = expr.operator.lexeme;
                const method = info.methods.find(m => m.name.lexeme === opName && m.isOperator);
                if (method) {
                    if (method.body instanceof BlockExpr && method.body.statements.length === 1 && method.body.statements[0] instanceof ReturnStmt) {
                        const returnStmt = method.body.statements[0] as ReturnStmt;
                        if (returnStmt.value instanceof IntrinsicExpr) {
                            const intrinsic = returnStmt.value as IntrinsicExpr;
                            const argsMap = new Map<string, binaryen.ExpressionRef>();
                            argsMap.set("this", left);
                            if (method.params.length > 0) {
                                argsMap.set(method.params[0].name.lexeme, right);
                            }
                            return this.evaluateWithBindings(intrinsic, argsMap);
                        } else {
                            console.error("Return value is not IntrinsicExpr:", returnStmt.value);
                        }
                    } else {
                        console.error("Method body structure mismatch:", method.body);
                    }
                } else {
                    console.error(`Method '${opName}' not found or not operator in ${leftType.name.lexeme}. Available:`, info.methods.map(m => m.name.lexeme).join(", "));
                }
            } else {
                console.error("Info is not ValueStmt:", info);
            }
        } else {
            console.error("Left type is not NamedType:", leftType);
        }

        throw new Error(`Operator ${expr.operator.lexeme} not defined for type or not intrinsic.`);
    }

    visitIntrinsicExpr(expr: IntrinsicExpr): binaryen.ExpressionRef {
        const moduleName = expr.module.lexeme;
        const opName = expr.op.lexeme;
        const args = expr.args.map(arg => this.evaluate(arg));

        const mod = (this.module as any)[moduleName];
        if (!mod) {
            throw new Error(`Unknown intrinsic module ${moduleName}`);
        }
        const func = mod[opName];
        if (!func) {
            throw new Error(`Unknown intrinsic operation ${moduleName}.${opName}`);
        }

        return func.apply(mod, args);
    }

    visitVariableExpr(expr: VariableExpr): binaryen.ExpressionRef {
        if (this.variableBindings.has(expr.name.lexeme)) {
            return this.variableBindings.get(expr.name.lexeme)!;
        }
        const index = this.localIndex.get(expr.name.lexeme);
        if (index === undefined) {
            throw new Error(`Undefined variable ${expr.name.lexeme}`);
        }
        // We need to know the type of the variable to use local.get?
        // binaryen.local.get takes (index, type).
        // The AST VariableExpr should have a type if checked.
        const type = expr.type ? this.resolveType(expr.type) : binaryen.i32;
        return this.module.local.get(index, type);
    }

    visitThisExpr(expr: ThisExpr): binaryen.ExpressionRef {
        if (this.variableBindings.has("this")) {
            return this.variableBindings.get("this")!;
        }
        throw new Error("'this' not bound");
    }

    visitLiteralExpr(expr: LiteralExpr): binaryen.ExpressionRef {
        if (typeof expr.value === 'number') {
            // Check if float or int
            if (expr.tokenType === TokenType.FLOAT) {
                return this.module.f64.const(expr.value);
            } else {
                return this.module.i32.const(expr.value);
            }
        }
        throw new Error("Unsupported literal");
    }

    resolveType(type: TypeNode): binaryen.Type {
        if (type instanceof NamedType) {
            const info = this.checker.getGlobal(type.name.lexeme);
            if (info instanceof ValueStmt && info.intrinsicType) {
                switch (info.intrinsicType.lexeme) {
                    case "i32": return binaryen.i32;
                    case "i64": return binaryen.i64;
                    case "f32": return binaryen.f32;
                    case "f64": return binaryen.f64;
                    case "none": return binaryen.none;
                }
            }
        }
        return binaryen.i32;
    }

    // Stubs for other methods
    visitAssignExpr(expr: AssignExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitCallExpr(expr: CallExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitGetExpr(expr: GetExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitGroupingExpr(expr: GroupingExpr): binaryen.ExpressionRef { return this.evaluate(expr.expression); }
    visitLogicalExpr(expr: LogicalExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitSetExpr(expr: SetExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitUnaryExpr(expr: UnaryExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitIfExpr(expr: IfExpr): binaryen.ExpressionRef {
        const condition = this.evaluate(expr.condition);
        const thenBranch = this.evaluate(expr.thenBranch);
        const elseBranch = expr.elseBranch ? this.evaluate(expr.elseBranch) : undefined;
        return this.module.if(condition, thenBranch, elseBranch);
    }
    visitWhenExpr(expr: WhenExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitLambdaExpr(expr: LambdaExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitArrayLiteralExpr(expr: ArrayLiteralExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitIndexGetExpr(expr: IndexGetExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitIndexSetExpr(expr: IndexSetExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitPropagateExpr(expr: PropagateExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitCastExpr(expr: CastExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }

    visitVarStmt(stmt: VarStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitWhileStmt(stmt: WhileStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitForStmt(stmt: ForStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitBreakStmt(stmt: BreakStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitContinueStmt(stmt: ContinueStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitValueStmt(stmt: ValueStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitUseStmt(stmt: UseStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitTraitStmt(stmt: TraitStmt): binaryen.ExpressionRef { throw new Error("Not implemented"); }
}
