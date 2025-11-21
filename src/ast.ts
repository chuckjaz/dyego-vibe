import { Token } from "./token";

// --- Visitor Interfaces ---

export interface ExprVisitor<R> {
  visitAssignExpr(expr: AssignExpr): R;
  visitBinaryExpr(expr: BinaryExpr): R;
  visitCallExpr(expr: CallExpr): R;
  visitGetExpr(expr: GetExpr): R;
  visitGroupingExpr(expr: GroupingExpr): R;
  visitLiteralExpr(expr: LiteralExpr): R;
  visitLogicalExpr(expr: LogicalExpr): R;
  visitSetExpr(expr: SetExpr): R;
  visitThisExpr(expr: ThisExpr): R;
  visitUnaryExpr(expr: UnaryExpr): R;
  visitVariableExpr(expr: VariableExpr): R;
  visitBlockExpr(expr: BlockExpr): R;
  visitIfExpr(expr: IfExpr): R;
  visitWhenExpr(expr: WhenExpr): R;
  visitLambdaExpr(expr: LambdaExpr): R;
  visitArrayLiteralExpr(expr: ArrayLiteralExpr): R;
  visitIndexGetExpr(expr: IndexGetExpr): R;
  visitIndexSetExpr(expr: IndexSetExpr): R;
  visitPropagateExpr(expr: PropagateExpr): R;
  visitCastExpr(expr: CastExpr): R;
}

export interface StmtVisitor<R> {
  visitExpressionStmt(stmt: ExpressionStmt): R;
  visitFunctionStmt(stmt: FunctionStmt): R;
  visitReturnStmt(stmt: ReturnStmt): R;
  visitVarStmt(stmt: VarStmt): R;
  visitWhileStmt(stmt: WhileStmt): R;
  visitForStmt(stmt: ForStmt): R;
  visitBreakStmt(stmt: BreakStmt): R;
  visitContinueStmt(stmt: ContinueStmt): R;
  visitValueStmt(stmt: ValueStmt): R;
  visitUseStmt(stmt: UseStmt): R;
}

export interface TypeVisitor<R> {
    visitNamedType(type: NamedType): R;
    visitUnionType(type: UnionType): R;
    visitArrayType(type: ArrayType): R;
    visitOptionalType(type: OptionalType): R;
    visitGenericType(type: GenericType): R;
}

// --- Base Classes ---

export abstract class Expr {
  abstract accept<R>(visitor: ExprVisitor<R>): R;
}

export abstract class Stmt {
  abstract accept<R>(visitor: StmtVisitor<R>): R;
}

export abstract class TypeNode {
    abstract accept<R>(visitor: TypeVisitor<R>): R;
}

// --- Expression Nodes ---

export class AssignExpr extends Expr {
  name: Token;
  value: Expr;

  constructor(name: Token, value: Expr) {
    super();
    this.name = name;
    this.value = value;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitAssignExpr(this);
  }
}

export class BinaryExpr extends Expr {
  left: Expr;
  operator: Token;
  right: Expr;

  constructor(left: Expr, operator: Token, right: Expr) {
    super();
    this.left = left;
    this.operator = operator;
    this.right = right;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitBinaryExpr(this);
  }
}

export class CallExpr extends Expr {
  callee: Expr;
  paren: Token;
  arguments: { name?: Token, value: Expr }[];

  constructor(callee: Expr, paren: Token, args: { name?: Token, value: Expr }[]) {
    super();
    this.callee = callee;
    this.paren = paren;
    this.arguments = args;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitCallExpr(this);
  }
}

export class GetExpr extends Expr {
  object: Expr;
  name: Token;
  isSafe: boolean; // for ?.

  constructor(object: Expr, name: Token, isSafe: boolean = false) {
    super();
    this.object = object;
    this.name = name;
    this.isSafe = isSafe;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitGetExpr(this);
  }
}

export class GroupingExpr extends Expr {
  expression: Expr;

  constructor(expression: Expr) {
    super();
    this.expression = expression;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitGroupingExpr(this);
  }
}

export class LiteralExpr extends Expr {
  value: any;

  constructor(value: any) {
    super();
    this.value = value;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitLiteralExpr(this);
  }
}

export class LogicalExpr extends Expr {
  left: Expr;
  operator: Token;
  right: Expr;

  constructor(left: Expr, operator: Token, right: Expr) {
    super();
    this.left = left;
    this.operator = operator;
    this.right = right;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitLogicalExpr(this);
  }
}

export class SetExpr extends Expr {
  object: Expr;
  name: Token;
  value: Expr;
  isSafe: boolean; // for ?. assignment? not common but good to track if syntax allows

  constructor(object: Expr, name: Token, value: Expr, isSafe: boolean = false) {
    super();
    this.object = object;
    this.name = name;
    this.value = value;
    this.isSafe = isSafe;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitSetExpr(this);
  }
}

export class ThisExpr extends Expr {
  keyword: Token;

  constructor(keyword: Token) {
    super();
    this.keyword = keyword;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitThisExpr(this);
  }
}

export class UnaryExpr extends Expr {
  operator: Token;
  right: Expr;

  constructor(operator: Token, right: Expr) {
    super();
    this.operator = operator;
    this.right = right;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitUnaryExpr(this);
  }
}

export class VariableExpr extends Expr {
  name: Token;

  constructor(name: Token) {
    super();
    this.name = name;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitVariableExpr(this);
  }
}

export class BlockExpr extends Expr {
  statements: Stmt[];

  constructor(statements: Stmt[]) {
    super();
    this.statements = statements;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitBlockExpr(this);
  }
}

export class IfExpr extends Expr {
  condition: Expr;
  thenBranch: Expr;
  elseBranch: Expr | null;

  constructor(condition: Expr, thenBranch: Expr, elseBranch: Expr | null) {
    super();
    this.condition = condition;
    this.thenBranch = thenBranch;
    this.elseBranch = elseBranch;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitIfExpr(this);
  }
}

export class WhenEntry {
    conditions: Expr[]; // if empty, it's 'else'
    body: Expr;

    constructor(conditions: Expr[], body: Expr) {
        this.conditions = conditions;
        this.body = body;
    }
}

export class WhenExpr extends Expr {
  subject: Expr | null;
  entries: WhenEntry[];
  elseBranch: Expr | null; // Distinct from an entry with no conditions?

  constructor(subject: Expr | null, entries: WhenEntry[], elseBranch: Expr | null) {
    super();
    this.subject = subject;
    this.entries = entries;
    this.elseBranch = elseBranch;
  }

  accept<R>(visitor: ExprVisitor<R>): R {
    return visitor.visitWhenExpr(this);
  }
}

export class LambdaExpr extends Expr {
    params: { name: Token, type: TypeNode | null }[];
    body: Expr; // Can be BlockExpr

    constructor(params: { name: Token, type: TypeNode | null }[], body: Expr) {
        super();
        this.params = params;
        this.body = body;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitLambdaExpr(this);
    }
}

export class ArrayLiteralExpr extends Expr {
    elements: Expr[];

    constructor(elements: Expr[]) {
        super();
        this.elements = elements;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitArrayLiteralExpr(this);
    }
}

export class IndexGetExpr extends Expr {
    object: Expr;
    index: Expr;

    constructor(object: Expr, index: Expr) {
        super();
        this.object = object;
        this.index = index;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitIndexGetExpr(this);
    }
}

export class IndexSetExpr extends Expr {
    object: Expr;
    index: Expr;
    value: Expr;

    constructor(object: Expr, index: Expr, value: Expr) {
        super();
        this.object = object;
        this.index = index;
        this.value = value;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitIndexSetExpr(this);
    }
}

export class PropagateExpr extends Expr {
    expression: Expr;
    operator: Token; // ?

    constructor(expression: Expr, operator: Token) {
        super();
        this.expression = expression;
        this.operator = operator;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitPropagateExpr(this);
    }
}

export class CastExpr extends Expr {
    expression: Expr;
    targetType: TypeNode;
    operator: Token; // as

    constructor(expression: Expr, targetType: TypeNode, operator: Token) {
        super();
        this.expression = expression;
        this.targetType = targetType;
        this.operator = operator;
    }

    accept<R>(visitor: ExprVisitor<R>): R {
        return visitor.visitCastExpr(this);
    }
}


// --- Statement Nodes ---

export class ExpressionStmt extends Stmt {
  expression: Expr;

  constructor(expression: Expr) {
    super();
    this.expression = expression;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitExpressionStmt(this);
  }
}

export class FunctionStmt extends Stmt {
  name: Token;
  params: { name: Token, type: TypeNode }[];
  returnType: TypeNode | null;
  body: Expr; // Usually BlockExpr, but could be expression body? GEMINI.md says { ... }
  generics: Token[]; // <T>
  isMutating: boolean; // var fun

  constructor(name: Token, params: { name: Token, type: TypeNode }[], returnType: TypeNode | null, body: Expr, generics: Token[], isMutating: boolean) {
    super();
    this.name = name;
    this.params = params;
    this.returnType = returnType;
    this.body = body;
    this.generics = generics;
    this.isMutating = isMutating;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitFunctionStmt(this);
  }
}

export class ReturnStmt extends Stmt {
  keyword: Token;
  value: Expr | null;

  constructor(keyword: Token, value: Expr | null) {
    super();
    this.keyword = keyword;
    this.value = value;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitReturnStmt(this);
  }
}

export class VarStmt extends Stmt {
  name: Token;
  initializer: Expr;
  type: TypeNode | null;
  isMutable: boolean;

  constructor(name: Token, initializer: Expr, type: TypeNode | null, isMutable: boolean) {
    super();
    this.name = name;
    this.initializer = initializer;
    this.type = type;
    this.isMutable = isMutable;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitVarStmt(this);
  }
}

export class WhileStmt extends Stmt {
  condition: Expr;
  body: Expr;

  constructor(condition: Expr, body: Expr) {
    super();
    this.condition = condition;
    this.body = body;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitWhileStmt(this);
  }
}

export class ForStmt extends Stmt {
  variable: Token;
  iterable: Expr;
  body: Expr;

  constructor(variable: Token, iterable: Expr, body: Expr) {
    super();
    this.variable = variable;
    this.iterable = iterable;
    this.body = body;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitForStmt(this);
  }
}

export class BreakStmt extends Stmt {
  keyword: Token;
  label: Token | null;

  constructor(keyword: Token, label: Token | null) {
    super();
    this.keyword = keyword;
    this.label = label;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitBreakStmt(this);
  }
}

export class ContinueStmt extends Stmt {
  keyword: Token;
  label: Token | null;

  constructor(keyword: Token, label: Token | null) {
    super();
    this.keyword = keyword;
    this.label = label;
  }

  accept<R>(visitor: StmtVisitor<R>): R {
    return visitor.visitContinueStmt(this);
  }
}

export class ValueStmt extends Stmt {
    name: Token;
    fields: { name: Token, type: TypeNode, isMutable: boolean }[];
    methods: FunctionStmt[];
    generics: Token[];

    constructor(name: Token, fields: { name: Token, type: TypeNode, isMutable: boolean }[], methods: FunctionStmt[], generics: Token[]) {
        super();
        this.name = name;
        this.fields = fields;
        this.methods = methods;
        this.generics = generics;
    }

    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitValueStmt(this);
    }
}

export class UseStmt extends Stmt {
    path: Token[]; // path segments
    items: Token[]; // {item1, item2}
    isTrait: boolean;

    constructor(path: Token[], items: Token[], isTrait: boolean) {
        super();
        this.path = path;
        this.items = items;
        this.isTrait = isTrait;
    }

    accept<R>(visitor: StmtVisitor<R>): R {
        return visitor.visitUseStmt(this);
    }
}


// --- Type Nodes ---

export class NamedType extends TypeNode {
    name: Token;
    generics: TypeNode[];

    constructor(name: Token, generics: TypeNode[] = []) {
        super();
        this.name = name;
        this.generics = generics;
    }

    accept<R>(visitor: TypeVisitor<R>): R {
        return visitor.visitNamedType(this);
    }
}

export class UnionType extends TypeNode {
    types: TypeNode[];

    constructor(types: TypeNode[]) {
        super();
        this.types = types;
    }

    accept<R>(visitor: TypeVisitor<R>): R {
        return visitor.visitUnionType(this);
    }
}

export class ArrayType extends TypeNode {
    elementType: TypeNode;

    constructor(elementType: TypeNode) {
        super();
        this.elementType = elementType;
    }

    accept<R>(visitor: TypeVisitor<R>): R {
        return visitor.visitArrayType(this);
    }
}

export class OptionalType extends TypeNode {
    innerType: TypeNode;

    constructor(innerType: TypeNode) {
        super();
        this.innerType = innerType;
    }

    accept<R>(visitor: TypeVisitor<R>): R {
        return visitor.visitOptionalType(this);
    }
}

export class GenericType extends TypeNode {
    // Used for when a type is just a generic parameter T?
    // Or use NamedType for that? NamedType seems sufficient if it refers to "T".
    // This class might be redundant if we use NamedType for "T".
    // But if we want to distinguish type arguments...
    // I'll leave it out for now and use NamedType.

    name: Token;

    constructor(name: Token) {
        super();
        this.name = name;
    }

    accept<R>(visitor: TypeVisitor<R>): R {
        return visitor.visitGenericType(this);
    }
}
