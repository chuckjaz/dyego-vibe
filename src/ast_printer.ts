import {
  AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LiteralExpr, LogicalExpr,
  SetExpr, ThisExpr, UnaryExpr, VariableExpr, BlockExpr, IfExpr, WhenExpr,
  LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
  Expr, Stmt, ExprVisitor, StmtVisitor, TypeVisitor,
  ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt,
  BreakStmt, ContinueStmt, ValueStmt, UseStmt,
  TypeNode, NamedType, UnionType, ArrayType, OptionalType, GenericType
} from "./ast";

export class AstPrinter implements ExprVisitor<string>, StmtVisitor<string>, TypeVisitor<string> {
  print(stmtOrExpr: Stmt | Expr | TypeNode): string {
    if (stmtOrExpr instanceof Stmt) {
        return stmtOrExpr.accept(this);
    } else if (stmtOrExpr instanceof Expr) {
        return stmtOrExpr.accept(this);
    } else {
        return stmtOrExpr.accept(this);
    }
  }

  visitBlockExpr(expr: BlockExpr): string {
    const stmts = expr.statements.map(stmt => stmt.accept(this)).join(" ");
    return `(block ${stmts})`;
  }

  visitAssignExpr(expr: AssignExpr): string {
    return this.parenthesize("assign", expr.name.lexeme, expr.value);
  }

  visitBinaryExpr(expr: BinaryExpr): string {
    return this.parenthesize(expr.operator.lexeme, expr.left, expr.right);
  }

  visitCallExpr(expr: CallExpr): string {
    const args = expr.arguments.map(arg => {
        if (arg.name) {
            return `${arg.name.lexeme}=${arg.value.accept(this)}`;
        }
        return arg.value.accept(this);
    }).join(" ");
    return `(call ${expr.callee.accept(this)} ${args})`;
  }

  visitGetExpr(expr: GetExpr): string {
    return `(get${expr.isSafe ? "?" : ""} ${expr.object.accept(this)} ${expr.name.lexeme})`;
  }

  visitGroupingExpr(expr: GroupingExpr): string {
    return this.parenthesize("group", expr.expression);
  }

  visitLiteralExpr(expr: LiteralExpr): string {
    if (expr.value === null) return "nil";
    if (typeof expr.value === "string") return `"${expr.value}"`;
    return expr.value.toString();
  }

  visitLogicalExpr(expr: LogicalExpr): string {
    return this.parenthesize(expr.operator.lexeme, expr.left, expr.right);
  }

  visitSetExpr(expr: SetExpr): string {
    return `(set${expr.isSafe ? "?" : ""} ${expr.object.accept(this)} ${expr.name.lexeme} ${expr.value.accept(this)})`;
  }

  visitThisExpr(expr: ThisExpr): string {
    return "this";
  }

  visitUnaryExpr(expr: UnaryExpr): string {
    return this.parenthesize(expr.operator.lexeme, expr.right);
  }

  visitVariableExpr(expr: VariableExpr): string {
    return expr.name.lexeme;
  }

  visitIfExpr(expr: IfExpr): string {
      let s = `(if ${expr.condition.accept(this)} ${expr.thenBranch.accept(this)}`;
      if (expr.elseBranch) {
          s += ` ${expr.elseBranch.accept(this)}`;
      }
      s += ")";
      return s;
  }

  visitWhenExpr(expr: WhenExpr): string {
      let s = `(when `;
      if (expr.subject) s += `${expr.subject.accept(this)} `;
      s += expr.entries.map(e => {
          const conds = e.conditions.map(c => c.accept(this)).join(", ");
          return `[${conds} -> ${e.body.accept(this)}]`;
      }).join(" ");
      if (expr.elseBranch) {
          s += ` [else -> ${expr.elseBranch.accept(this)}]`;
      }
      s += ")";
      return s;
  }

  visitLambdaExpr(expr: LambdaExpr): string {
      const params = expr.params.map(p => `${p.name.lexeme}${p.type ? ":" + p.type.accept(this) : ""}`).join(" ");
      return `(lambda (${params}) ${expr.body.accept(this)})`;
  }

  visitArrayLiteralExpr(expr: ArrayLiteralExpr): string {
      return `(array ${expr.elements.map(e => e.accept(this)).join(" ")})`;
  }

  visitIndexGetExpr(expr: IndexGetExpr): string {
      return `(index ${expr.object.accept(this)} ${expr.index.accept(this)})`;
  }

  visitIndexSetExpr(expr: IndexSetExpr): string {
      return `(index-set ${expr.object.accept(this)} ${expr.index.accept(this)} ${expr.value.accept(this)})`;
  }

  visitPropagateExpr(expr: PropagateExpr): string {
      return `(propagate ${expr.expression.accept(this)})`;
  }

  visitCastExpr(expr: CastExpr): string {
      return `(cast ${expr.expression.accept(this)} ${expr.targetType.accept(this)})`;
  }

  // Statements

  visitExpressionStmt(stmt: ExpressionStmt): string {
    return this.parenthesize("stmt", stmt.expression);
  }

  visitFunctionStmt(stmt: FunctionStmt): string {
      const params = stmt.params.map(p => `${p.name.lexeme}:${p.type.accept(this)}`).join(" ");
      let s = `(${stmt.isMutating ? "var-fun" : "fun"} ${stmt.name.lexeme}`;
      if (stmt.generics.length > 0) s += `<${stmt.generics.map(g => g.lexeme).join(", ")}>`;
      s += ` (${params})`;
      if (stmt.returnType) s += `:${stmt.returnType.accept(this)}`;
      s += ` ${stmt.body.accept(this)})`;
      return s;
  }

  visitReturnStmt(stmt: ReturnStmt): string {
      if (stmt.value) return `(return ${stmt.value.accept(this)})`;
      return "(return)";
  }

  visitVarStmt(stmt: VarStmt): string {
      let s = `(${stmt.isMutable ? "var" : "val"} ${stmt.name.lexeme}`;
      if (stmt.type) s += `:${stmt.type.accept(this)}`;
      s += ` ${stmt.initializer.accept(this)})`;
      return s;
  }

  visitWhileStmt(stmt: WhileStmt): string {
      return `(while ${stmt.condition.accept(this)} ${stmt.body.accept(this)})`;
  }

  visitForStmt(stmt: ForStmt): string {
      return `(for ${stmt.variable.lexeme} in ${stmt.iterable.accept(this)} ${stmt.body.accept(this)})`;
  }

  visitBreakStmt(stmt: BreakStmt): string {
      return stmt.label ? `(break ${stmt.label.lexeme})` : "(break)";
  }

  visitContinueStmt(stmt: ContinueStmt): string {
      return stmt.label ? `(continue ${stmt.label.lexeme})` : "(continue)";
  }

  visitValueStmt(stmt: ValueStmt): string {
      const fields = stmt.fields.map(f => `${f.isMutable ? "var" : "val"} ${f.name.lexeme}:${f.type.accept(this)}`).join(" ");
      const methods = stmt.methods.map(m => m.accept(this)).join(" ");
      let s = `(value ${stmt.name.lexeme}`;
      if (stmt.generics.length > 0) s += `<${stmt.generics.map(g => g.lexeme).join(", ")}>`;
      s += ` (${fields}) (${methods}))`;
      return s;
  }

  visitUseStmt(stmt: UseStmt): string {
      const path = stmt.path.map(t => t.lexeme).join(".");
      const items = stmt.items.length > 0 ? `.{${stmt.items.map(t => t.lexeme).join(", ")}}` : "";
      return `(use ${stmt.isTrait ? "trait " : ""}${path}${items})`;
  }

  // Types

  visitNamedType(type: NamedType): string {
      let s = type.name.lexeme;
      if (type.generics.length > 0) {
          s += `<${type.generics.map(t => t.accept(this)).join(", ")}>`;
      }
      return s;
  }

  visitUnionType(type: UnionType): string {
      return `(${type.types.map(t => t.accept(this)).join(" | ")})`;
  }

  visitArrayType(type: ArrayType): string {
      return `${type.elementType.accept(this)}[]`;
  }

  visitOptionalType(type: OptionalType): string {
      return `${type.innerType.accept(this)}?`;
  }

  visitGenericType(type: GenericType): string {
      return type.name.lexeme;
  }

  private parenthesize(name: string, ...exprs: (Expr | string)[]): string {
    let builder = `(${name}`;
    for (const expr of exprs) {
      builder += " ";
      if (expr instanceof Expr) {
        builder += expr.accept(this);
      } else {
        builder += expr;
      }
    }
    builder += ")";
    return builder;
  }
}
