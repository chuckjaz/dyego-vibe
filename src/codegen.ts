import binaryen from "binaryen";
import {
    Expr, Stmt, TypeNode, ExprVisitor, StmtVisitor,
    LiteralExpr, VariableExpr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LogicalExpr, SetExpr, ThisExpr, UnaryExpr, BlockExpr, IfExpr, WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
    ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt,
    NamedType, UnionType, ArrayType, GenericType, IsCondition
} from "./ast";
import { TokenType } from "./token";

export class CodeGenerator implements ExprVisitor<binaryen.ExpressionRef>, StmtVisitor<binaryen.ExpressionRef> {
    private module: binaryen.Module;
    private localIndex: Map<string, number> = new Map();
    private nextLocalIndex: number = 0;

    constructor(module: binaryen.Module) {
        this.module = module;
    }

    generate(stmt: Stmt) {
        stmt.accept(this);
    }

    private evaluate(expr: Expr): binaryen.ExpressionRef {
        return expr.accept(this);
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

        // Default to i32 if type is missing (for now)
        const type = expr.type ? this.resolveType(expr.type) : binaryen.i32;

        if (type === binaryen.i32) {
            switch (expr.operator.type) {
                case TokenType.PLUS: return this.module.i32.add(left, right);
                case TokenType.MINUS: return this.module.i32.sub(left, right);
                case TokenType.STAR: return this.module.i32.mul(left, right);
                // TODO: div_s vs div_u
                case TokenType.SLASH: return this.module.i32.div_s(left, right);
            }
        }
        // TODO: Handle other types
        throw new Error(`Unsupported binary operator ${expr.operator.lexeme} for type ${type}`);
    }

    visitVariableExpr(expr: VariableExpr): binaryen.ExpressionRef {
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
            switch (type.name.lexeme) {
                case "i32": return binaryen.i32;
                case "i64": return binaryen.i64;
                case "f32": return binaryen.f32;
                case "f64": return binaryen.f64;
                case "void": return binaryen.none;
                case "Unit": return binaryen.none;
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
    visitThisExpr(expr: ThisExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitUnaryExpr(expr: UnaryExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
    visitIfExpr(expr: IfExpr): binaryen.ExpressionRef { throw new Error("Not implemented"); }
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
