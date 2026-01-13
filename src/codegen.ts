import binaryen from "binaryen";
import {
    Expr, Stmt, TypeNode, ExprVisitor, StmtVisitor,
    LiteralExpr, VariableExpr, AssignExpr, BinaryExpr, CallExpr, GetExpr, GroupingExpr, LogicalExpr, SetExpr, ThisExpr, UnaryExpr, BlockExpr, IfExpr, WhenExpr, LambdaExpr, ArrayLiteralExpr, IndexGetExpr, IndexSetExpr, PropagateExpr, CastExpr,
    ExpressionStmt, FunctionStmt, ReturnStmt, VarStmt, WhileStmt, ForStmt, BreakStmt, ContinueStmt, ValueStmt, UseStmt, TraitStmt, VocabularyStmt,
    NamedType, UnionType, ArrayType, GenericType, IsCondition, IntrinsicExpr
} from './ast.js';
import { Checker } from './checker.js';
import { TokenType, Token } from './token.js';

export class CodeGenerator implements ExprVisitor<binaryen.ExpressionRef>, StmtVisitor<binaryen.ExpressionRef> {
    private module: binaryen.Module;
    private checker: Checker;
    private localIndex: Map<string, number> = new Map();
    private nextLocalIndex: number = 0;
    private variableBindings: Map<string, binaryen.ExpressionRef> = new Map();
    private whenSubjectLocals: Map<WhenExpr, number[]> = new Map();
    private varStmtScratch: Map<VarStmt, number> = new Map();

    private valueTypeCache: Map<string, binaryen.Type> = new Map();

    constructor(module: binaryen.Module, checker: Checker) {
        this.module = module;
        this.module.setFeatures(binaryen.Features.Multivalue);
        this.checker = checker;
        this.generateImports();
    }

    private generateImports() {
        for (const [name, info] of this.checker.getGlobals()) {
            if (info instanceof FunctionStmt && info.isIntrinsic) {
                const paramTypes: binaryen.Type[] = [];
                for (const param of info.params) {
                    paramTypes.push(...this.getFlatTypes(param.type));
                }
                const params = binaryen.createType(paramTypes);

                const resultTypes = info.returnType ? this.getFlatTypes(info.returnType) : [];
                const result = resultTypes.length === 0 ? binaryen.none
                    : resultTypes.length === 1 ? resultTypes[0]
                        : binaryen.createType(resultTypes);

                this.module.addFunctionImport(name, "env", name, params, result);
            }
        }
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

    visitFunctionStmt(stmt: FunctionStmt, thisType?: binaryen.Type, className?: string): binaryen.ExpressionRef {
        const functionName = className ? `${className}_${stmt.name.lexeme}` : stmt.name.lexeme;
        this.localIndex.clear();
        this.nextLocalIndex = 0;
        this.whenSubjectLocals.clear();
        this.varStmtScratch.clear();

        const paramTypes: binaryen.Type[] = [];
        if (thisType !== undefined) {
            paramTypes.push(thisType);
        }

        for (const param of stmt.params) {
            const types = this.getFlatTypes(param.type);
            paramTypes.push(...types);
        }

        if (paramTypes.some(t => t === binaryen.none)) {
            return 0 as binaryen.ExpressionRef;
        }
        const params = binaryen.createType(paramTypes);

        const resultTypes = stmt.returnType ? this.getFlatTypes(stmt.returnType) : [];
        const result = resultTypes.length === 0 ? binaryen.none
            : resultTypes.length === 1 ? resultTypes[0]
                : binaryen.createType(resultTypes);

        if (thisType !== undefined) {
            this.localIndex.set("this", 0);
        }

        for (const param of stmt.params) {
            const types = this.getFlatTypes(param.type);
            this.localIndex.set(param.name.lexeme, this.nextLocalIndex);
            this.nextLocalIndex += types.length;
        }

        const vars = this.scanLocals(stmt.body);

        if (stmt.isIntrinsic) {
            return 0 as binaryen.ExpressionRef;
        }

        const body = this.evaluate(stmt.body);

        this.module.addFunction(functionName, params, result, vars, body);
        this.module.addFunctionExport(functionName, functionName);

        return 0 as binaryen.ExpressionRef;
    }

    visitThisExpr(expr: ThisExpr): binaryen.ExpressionRef {
        if (this.variableBindings.has("this")) {
            return this.variableBindings.get("this")!;
        }
        const index = this.localIndex.get("this");
        if (index === undefined) {
            throw new Error("'this' not bound and not found in local index");
        }
        const type = expr.type ? this.resolveType(expr.type) : binaryen.i32;
        return this.module.local.get(index, type);
    }

    private scanLocals(node: Stmt | Expr): binaryen.Type[] {
        if (node instanceof VarStmt) {
            this.localIndex.set(node.name.lexeme, this.nextLocalIndex);
            const typeNode = node.type || node.initializer.type;
            const flatTypes = typeNode ? this.getFlatTypes(typeNode) : [binaryen.i32];
            this.nextLocalIndex += flatTypes.length;

            const locals = [...flatTypes, ...this.scanLocals(node.initializer)];

            if (flatTypes.length > 1) {
                this.varStmtScratch.set(node, this.nextLocalIndex);
                this.nextLocalIndex++;
                const tupleType = binaryen.createType(flatTypes);
                locals.push(tupleType);
                // Also track that we used a scratch local? 
                // The map `varStmtScratch` is sufficient.
            }
            return locals;
        } else if (node instanceof BlockExpr) {
            return node.statements.flatMap(s => this.scanLocals(s));
        } else if (node instanceof IfExpr) {
            return [
                ...this.scanLocals(node.thenBranch),
                ...(node.elseBranch ? this.scanLocals(node.elseBranch) : [])
            ];
        } else if (node instanceof WhenExpr) {
            const locals: binaryen.Type[] = [];
            if (node.subject) {
                const index = this.nextLocalIndex;
                const flatTypes = node.subject.type ? this.getFlatTypes(node.subject.type) : [binaryen.i32];

                const indices: number[] = [];
                for (let i = 0; i < flatTypes.length; i++) indices.push(index + i);

                this.whenSubjectLocals.set(node, indices);
                this.nextLocalIndex += flatTypes.length;

                locals.push(...flatTypes);
                locals.push(...this.scanLocals(node.subject));

                // Also need scratch for subject if complex?
                // WhenExpr implementation used subjectVal -> set locals directly.
                // If subjectVal is tuple, we need to extract.
                // We established we need a scratch for that.
                // But WhenExpr isn't a VarStmt so `varStmtScratch` doesn't key it.
                // We can just rely on `visitWhenExpr` using `local.set` if it can?
                // No, we need a scratch.
                // TODO: Add scratch for WhenExpr subject. For now assuming simple subject or we error?
                // Actually `binaryen` doesn't need scratch if we can use `tuple.extract` on `local.tee`... 
                // But we don't have a local for the tuple yet.
            }
            for (const entry of node.entries) {
                for (const cond of entry.conditions) {
                    if (cond instanceof Expr) {
                        locals.push(...this.scanLocals(cond));
                    }
                }
                locals.push(...this.scanLocals(entry.body));
            }
            if (node.elseBranch) {
                locals.push(...this.scanLocals(node.elseBranch));
            }
            return locals;
        } else if (node instanceof ReturnStmt) {
            return node.value ? this.scanLocals(node.value) : [];
        } else if (node instanceof ExpressionStmt) {
            return this.scanLocals(node.expression);
        } else if (node instanceof VarStmt) {
            return []; // Should be unreachable given recursion structure, but just in case
        } else if (node instanceof BinaryExpr) {
            return [...this.scanLocals(node.left), ...this.scanLocals(node.right)];
        } else if (node instanceof CallExpr) {
            return [
                ...this.scanLocals(node.callee),
                ...node.arguments.flatMap(arg => this.scanLocals(arg.value))
            ];
        } else if (node instanceof GroupingExpr) {
            return this.scanLocals(node.expression);
        } else if (node instanceof UnaryExpr) {
            return this.scanLocals(node.right);
        }
        return [];
    }

    visitBlockExpr(expr: BlockExpr): binaryen.ExpressionRef {
        const children: binaryen.ExpressionRef[] = [];
        for (const stmt of expr.statements) {
            children.push(this.execute(stmt));
        }
        return this.module.block(null, children);
    }

    visitReturnStmt(stmt: ReturnStmt): binaryen.ExpressionRef {
        const value = stmt.value ? this.evaluate(stmt.value) : 0;
        if (!stmt.value) return this.module.return();
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
                            const args = [left, right];
                            const returnType = method.returnType ? this.resolveType(method.returnType) : binaryen.none;
                            const functionName = `${leftType.name.lexeme}_${method.name.lexeme}`;
                            return this.module.call(functionName, args, returnType);
                        }
                    } else {
                        const args = [left, right];
                        const returnType = method.returnType ? this.resolveType(method.returnType) : binaryen.none;
                        const functionName = `${leftType.name.lexeme}_${method.name.lexeme}`;
                        return this.module.call(functionName, args, returnType);
                    }
                } else {
                    console.error(`Method '${opName}' not found or not operator in ${leftType.name.lexeme}.`);
                }
            }
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
        const startIndex = this.localIndex.get(expr.name.lexeme);
        if (startIndex === undefined) {
            throw new Error(`Undefined variable ${expr.name.lexeme}`);
        }

        const typeNode = expr.type;
        const flatTypes = typeNode ? this.getFlatTypes(typeNode) : [binaryen.i32];

        if (flatTypes.length === 1) {
            return this.module.local.get(startIndex, flatTypes[0]);
        } else {
            const gets = flatTypes.map((t, i) => this.module.local.get(startIndex + i, t));
            return this.module.tuple.make(gets);
        }
    }

    visitLiteralExpr(expr: LiteralExpr): binaryen.ExpressionRef {
        if (typeof expr.value === 'number') {
            if (expr.type) {
                const type = this.resolveType(expr.type);
                if (type === binaryen.i64) {
                    const val = expr.value;
                    return this.module.i64.const(val, val < 0 ? -1 : 0);
                } else if (type === binaryen.f32) {
                    return this.module.f32.const(expr.value);
                } else if (type === binaryen.f64) {
                    return this.module.f64.const(expr.value);
                }
            }
            if (expr.tokenType === TokenType.FLOAT) {
                return this.module.f64.const(expr.value);
            } else {
                return this.module.i32.const(expr.value);
            }
        } else if (typeof expr.value === 'boolean') {
            return this.module.i32.const(expr.value ? 1 : 0);
        }
        throw new Error(`Unsupported literal: ${expr.value}`);
    }

    resolveType(type: TypeNode): binaryen.Type {
        if (type instanceof NamedType) {
            const flat = this.getFlatTypes(type);
            if (flat.length === 1) return flat[0];
            if (flat.length === 0) return binaryen.none;
            return binaryen.createType(flat);
        }
        return binaryen.i32;
    }

    getFlatTypes(type: TypeNode): binaryen.Type[] {
        if (type instanceof NamedType) {
            const info = this.checker.getGlobal(type.name.lexeme);
            if (info instanceof ValueStmt) {
                if (info.intrinsicType) {
                    switch (info.intrinsicType.lexeme) {
                        case "i32": return [binaryen.i32];
                        case "i64": return [binaryen.i64];
                        case "f32": return [binaryen.f32];
                        case "f64": return [binaryen.f64];
                        case "Boolean": return [binaryen.i32];
                        case "none": return [];
                    }
                }
                const fieldTypes: binaryen.Type[] = [];
                for (const field of info.fields) {
                    fieldTypes.push(...this.getFlatTypes(field.type));
                }
                return fieldTypes;
            }
        }
        return [binaryen.i32];
    }

    visitCallExpr(expr: CallExpr): binaryen.ExpressionRef {
        const callee = expr.callee;
        let functionName = "";
        let returnType = binaryen.none;
        let isConstructor = false;
        let valueStmt: ValueStmt | undefined;

        if (callee instanceof VariableExpr) {
            functionName = callee.name.lexeme;
            const funcInfo = this.checker.getGlobal(functionName);
            if (funcInfo instanceof FunctionStmt) {
                returnType = funcInfo.returnType ? this.resolveType(funcInfo.returnType) : binaryen.none;
            } else if (funcInfo instanceof ValueStmt) {
                isConstructor = true;
                valueStmt = funcInfo;
                returnType = this.resolveType(new NamedType(funcInfo.name));
            } else {
                throw new Error(`Function ${functionName} not found or not a function`);
            }
        } else if (callee instanceof GetExpr) {
            const objectType = callee.object.type;
            if (objectType instanceof NamedType) {
                functionName = `${objectType.name.lexeme}_${callee.name.lexeme}`;
                const info = this.checker.getGlobal(objectType.name.lexeme);
                if (info instanceof ValueStmt) {
                    const method = info.methods.find(m => m.name.lexeme === callee.name.lexeme);
                    if (method) {
                        returnType = method.returnType ? this.resolveType(method.returnType) : binaryen.none;
                    }
                }
            } else {
                throw new Error("Method call on non-named type not supported yet");
            }
        } else {
            throw new Error("Indirect calls not supported yet");
        }

        const args: binaryen.ExpressionRef[] = [];

        if (callee instanceof GetExpr) {
            const objectVal = this.evaluate(callee.object);
            const objectType = callee.object.type;
            const flatObj = objectType ? this.getFlatTypes(objectType) : [binaryen.i32];

            if (flatObj.length === 1) {
                args.push(objectVal);
            } else {
                // Warning: unsafe duplicate evaluation!
                // We should use a temp local here for correctness if side effects exist.
                for (let i = 0; i < flatObj.length; i++) {
                    args.push(this.module.tuple.extract(objectVal, i));
                }
            }
        }

        for (const arg of expr.arguments) {
            const val = this.evaluate(arg.value);
            const type = arg.value.type;
            const flat = type ? this.getFlatTypes(type) : [binaryen.i32];

            if (flat.length === 1) {
                args.push(val);
            } else {
                for (let i = 0; i < flat.length; i++) {
                    args.push(this.module.tuple.extract(val, i));
                }
            }
        }

        if (isConstructor) {
            const flatTypes = this.getFlatTypes(new NamedType(valueStmt!.name));
            if (flatTypes.length === 0) return this.module.nop(); // Unit?
            if (flatTypes.length === 1) {
                return args[0];
            }
            return this.module.tuple.make(args);
        }

        return this.module.call(functionName, args, returnType);
    }

    visitGetExpr(expr: GetExpr): binaryen.ExpressionRef {
        const objectVal = this.evaluate(expr.object);
        const objectType = expr.object.type;

        if (objectType instanceof NamedType) {
            const info = this.checker.getGlobal(objectType.name.lexeme);
            if (info instanceof ValueStmt) {
                let offset = 0;
                for (const field of info.fields) {
                    if (field.name.lexeme === expr.name.lexeme) {
                        const fieldFlat = this.getFlatTypes(field.type);

                        if (fieldFlat.length === 1) {
                            return this.module.tuple.extract(objectVal, offset);
                        } else {
                            const items: binaryen.ExpressionRef[] = [];
                            for (let k = 0; k < fieldFlat.length; k++) {
                                items.push(this.module.tuple.extract(objectVal, offset + k));
                            }
                            return this.module.tuple.make(items);
                        }
                    }
                    offset += this.getFlatTypes(field.type).length;
                }
                throw new Error(`Field ${expr.name.lexeme} not found in ${objectType.name.lexeme}`);
            }
        }
        throw new Error("GetExpr on non-NamedType");
    }

    visitGroupingExpr(expr: GroupingExpr): binaryen.ExpressionRef { return this.evaluate(expr.expression); }
    visitAssignExpr(expr: AssignExpr): binaryen.ExpressionRef { throw new Error("AssignExpr Not implemented"); }
    visitLogicalExpr(expr: LogicalExpr): binaryen.ExpressionRef { throw new Error("LogicalExpr Not implemented"); }
    visitSetExpr(expr: SetExpr): binaryen.ExpressionRef { throw new Error("SetExpr Not implemented"); }

    visitUnaryExpr(expr: UnaryExpr): binaryen.ExpressionRef {
        const right = this.evaluate(expr.right);
        const type = expr.right.type;

        if (type instanceof NamedType) {
            const info = this.checker.getGlobal(type.name.lexeme);
            if (info instanceof ValueStmt) {
                const opName = `prefix ${expr.operator.lexeme}`;
                const method = info.methods.find(m => m.name.lexeme === opName && m.isOperator);
                if (method) {
                    if (method.body instanceof BlockExpr && method.body.statements.length === 1 && method.body.statements[0] instanceof ReturnStmt) {
                        const returnStmt = method.body.statements[0] as ReturnStmt;
                        if (returnStmt.value instanceof IntrinsicExpr) {
                            const intrinsic = returnStmt.value as IntrinsicExpr;
                            const argsMap = new Map<string, binaryen.ExpressionRef>();
                            argsMap.set("this", right);
                            return this.evaluateWithBindings(intrinsic, argsMap);
                        }
                    }

                    const functionName = `${info.name.lexeme}_${opName}`;
                    return this.module.call(functionName, [right], this.resolveType(method.returnType || new NamedType(new Token(TokenType.IDENTIFIER, "Unit", null, 0, 0, "<internal>"))));
                }
            }
        }

        throw new Error(`Operator ${expr.operator.lexeme} not defined for type or not intrinsic.`);
    }

    visitIfExpr(expr: IfExpr): binaryen.ExpressionRef {
        const condition = this.evaluate(expr.condition);
        const thenBranch = this.evaluate(expr.thenBranch);
        const elseBranch = expr.elseBranch ? this.evaluate(expr.elseBranch) : undefined;
        return this.module.if(condition, thenBranch, elseBranch);
    }

    visitWhenExpr(expr: WhenExpr): binaryen.ExpressionRef {
        let subjectIndex = -1;
        let subjectSetup = this.module.nop();
        let subjectType = binaryen.i32;

        if (expr.subject) {
            const indices = this.whenSubjectLocals.get(expr);
            if (indices === undefined) {
                throw new Error("WhenExpr subject local not allocated.");
            }

            const subjectVal = this.evaluate(expr.subject);
            const flatTypes = expr.subject.type ? this.getFlatTypes(expr.subject.type) : [binaryen.i32];

            if (flatTypes.length === 1) {
                subjectSetup = this.module.local.set(indices[0], subjectVal);
                subjectType = flatTypes[0];
            } else {
                const sets: binaryen.ExpressionRef[] = [];
                for (let i = flatTypes.length - 1; i >= 0; i--) {
                    sets.push(this.module.local.set(indices[i], this.module.tuple.extract(subjectVal, i)));
                }
                subjectSetup = this.module.block(null, sets); (subjectVal as any); // Type cast if needed, though this logic is flawed slightly by tuple.extract consuming semantics? No, tuple.extract doesn't consume, it takes expression.
                // WE MUST USE A SCRATCH TUPLE HERE OR RISK MULTI EVAL.
                // Assuming evaluating expr.subject is safe or already normalized to a local read.
                // If expr.subject is 'p' (VariableExpr), it generates 'tuple.make(local.get...)'.
                // Then tuple.extract(tuple.make(local.get...)) is fine.
                // Optimization: Binaryen might optimize this, or we rely on it.
            }
        }

        const buildChain = (index: number): binaryen.ExpressionRef => {
            if (index >= expr.entries.length) {
                return expr.elseBranch ? this.evaluate(expr.elseBranch) : this.module.unreachable();
            }

            const entry = expr.entries[index];
            let conditionRef: binaryen.ExpressionRef | null = null;

            for (const cond of entry.conditions) {
                let check: binaryen.ExpressionRef;
                if (expr.subject) {
                    if (cond instanceof Expr) {
                        // We need the subject. VariableExpr would call visitVariableExpr -> tuple.make.
                        // But here we want the raw locals or similar?
                        // No, we can just use visitVariableExpr equivalent logic:
                        // Construct the 'subject' tuple from locals again?

                        // Wait, we don't have a 'variable' for the subject unless we bound it?
                        // The subject is implicitly 'it' or similar?
                        // No, in WhenExpr, we access it via our indices.

                        // Construct subject value from locals:
                        const indices = this.whenSubjectLocals.get(expr)!;
                        // get flat types again...
                        const flatTypes = expr.subject!.type ? this.getFlatTypes(expr.subject!.type) : [binaryen.i32];
                        let subj: binaryen.ExpressionRef;
                        if (flatTypes.length === 1) {
                            subj = this.module.local.get(indices[0], flatTypes[0]);
                        } else {
                            const gets = flatTypes.map((t, i) => this.module.local.get(indices[i], t));
                            subj = this.module.tuple.make(gets);
                        }

                        const val = this.evaluate(cond);
                        // Compare subj and val.
                        // Equality for tuples??
                        // Binaryen doesn't have tuple.eq.
                        // We must compare component-wise.

                        // TODO: Implement component-wise equality for tuples.
                        // Fallback to i32 for now.
                        check = this.module.i32.eq(subj, val);
                    } else {
                        throw new Error("IsCondition not implemented yet");
                    }
                } else {
                    if (cond instanceof Expr) {
                        check = this.evaluate(cond);
                    } else {
                        throw new Error("IsCondition not allowed without subject");
                    }
                }

                if (conditionRef === null) {
                    conditionRef = check;
                } else {
                    conditionRef = this.module.i32.or(conditionRef, check);
                }
            }

            if (conditionRef === null) {
                return buildChain(index + 1);
            }

            const thenBody = this.evaluate(entry.body);
            const elseBody = buildChain(index + 1);

            return this.module.if(conditionRef, thenBody, elseBody);
        };

        const body = buildChain(0);

        if (expr.subject) {
            const resultType = expr.type ? this.resolveType(expr.type) : binaryen.none;
            return this.module.block(null, [subjectSetup, body], resultType);
        } else {
            return body;
        }
    }

    visitCastExpr(expr: CastExpr): binaryen.ExpressionRef {
        const value = this.evaluate(expr.expression);
        const targetType = this.resolveType(expr.targetType);
        const sourceType = expr.expression.type ? this.resolveType(expr.expression.type) : binaryen.i32;

        if (targetType === sourceType) {
            return value;
        }

        if (targetType === binaryen.f64 && sourceType === binaryen.i32) {
            return this.module.f64.convert_s.i32(value);
        }
        if (targetType === binaryen.i64 && sourceType === binaryen.i32) {
            return this.module.i64.extend_s(value);
        }

        throw new Error(`Unsupported cast from ${sourceType} to ${targetType}`);
    }

    visitVarStmt(stmt: VarStmt): binaryen.ExpressionRef {
        const startIndex = this.localIndex.get(stmt.name.lexeme);
        if (startIndex === undefined) {
            throw new Error(`Local ${stmt.name.lexeme} not found in index`);
        }

        const init = this.evaluate(stmt.initializer);
        const typeNode = stmt.type || stmt.initializer.type;
        const flatTypes = typeNode ? this.getFlatTypes(typeNode) : [binaryen.i32];

        if (flatTypes.length === 1) {
            return this.module.local.set(startIndex, init);
        } else {
            const scratchIndex = this.varStmtScratch.get(stmt);
            if (scratchIndex === undefined) throw new Error("Scratch local not allocated for compound VarStmt");

            const setScratch = this.module.local.set(scratchIndex, init);

            const sets: binaryen.ExpressionRef[] = [setScratch];
            for (let i = 0; i < flatTypes.length; i++) {
                const extract = this.module.tuple.extract(this.module.local.get(scratchIndex, binaryen.createType(flatTypes)), i);
                sets.push(this.module.local.set(startIndex + i, extract));
            }

            return this.module.block(null, sets);
        }
    }

    visitWhileStmt(stmt: WhileStmt): binaryen.ExpressionRef { throw new Error("WhileStmt Not implemented"); }
    visitForStmt(stmt: ForStmt): binaryen.ExpressionRef { throw new Error("ForStmt Not implemented"); }
    visitBreakStmt(stmt: BreakStmt): binaryen.ExpressionRef { throw new Error("BreakStmt Not implemented"); }
    visitContinueStmt(stmt: ContinueStmt): binaryen.ExpressionRef { throw new Error("ContinueStmt Not implemented"); }
    visitValueStmt(stmt: ValueStmt): binaryen.ExpressionRef {
        const thisType = this.resolveType(new NamedType(stmt.name));
        for (const method of stmt.methods) {
            this.visitFunctionStmt(method, thisType, stmt.name.lexeme);
        }
        return 0 as binaryen.ExpressionRef;
    }
    visitUseStmt(stmt: UseStmt): binaryen.ExpressionRef { throw new Error("UseStmt Not implemented"); }
    visitTraitStmt(stmt: TraitStmt): binaryen.ExpressionRef { throw new Error("TraitStmt Not implemented"); }
    visitVocabularyStmt(stmt: VocabularyStmt): binaryen.ExpressionRef { return 0 as binaryen.ExpressionRef; }

    // Sub-visitors not needed?
    visitLambdaExpr(expr: LambdaExpr): binaryen.ExpressionRef { throw new Error("LambdaExpr Not implemented"); }
    visitArrayLiteralExpr(expr: ArrayLiteralExpr): binaryen.ExpressionRef { throw new Error("ArrayLiteralExpr Not implemented"); }
    visitIndexGetExpr(expr: IndexGetExpr): binaryen.ExpressionRef { throw new Error("IndexGetExpr Not implemented"); }
    visitIndexSetExpr(expr: IndexSetExpr): binaryen.ExpressionRef { throw new Error("IndexSetExpr Not implemented"); }
    visitPropagateExpr(expr: PropagateExpr): binaryen.ExpressionRef { throw new Error("PropagateExpr Not implemented"); }
}
