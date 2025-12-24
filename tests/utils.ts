
import { Checker } from '../src/checker.js';
import { CodeGenerator } from '../src/codegen.js';
import { Parser } from '../src/parser.js';
import { Lexer } from '../src/lexer.js';
import binaryen from "binaryen";
import fs from "fs";
import path from "path";

export async function compileAndRun(source: string): Promise<any> {
    const lexer = new Lexer(source, "test.dy");
    const parser = new Parser(lexer.scanTokens());
    const file = parser.parse();

    // Load prefix.dy
    const prefixSource = fs.readFileSync(path.resolve("src/prefix.dy"), "utf-8");
    const prefixLexer = new Lexer(prefixSource, "src/prefix.dy");
    const prefixParser = new Parser(prefixLexer.scanTokens());
    const prefixFile = prefixParser.parse();

    // Initialize checker with null to prevent auto-loading
    const checker = new Checker(null);

    // Manually check prefix file with isLoadingPrefix = true
    (checker as any).isLoadingPrefix = true;
    checker.check(prefixFile);
    (checker as any).isLoadingPrefix = false;

    // Check user file
    checker.check(file);

    if (checker.getErrors().length > 0) {
        throw new Error("Checker errors: " + checker.getErrors().map(d => d.message).join("\n"));
    }

    const module = new binaryen.Module();
    const codegen = new CodeGenerator(module, checker);

    // Generate code for prefix first, then user file
    for (const stmt of prefixFile) {
        codegen.generate(stmt);
    }
    for (const stmt of file) {
        codegen.generate(stmt);
    }

    if (!module.validate()) {
        throw new Error("Binaryen validation failed");
    }

    const wasm = module.emitBinary();
    const compiled = new WebAssembly.Module(wasm as any);
    const imports = {
        env: {
            print: () => { },
            print_f64: () => { }
        }
    };
    const instance = new WebAssembly.Instance(compiled, imports);

    // @ts-ignore
    return instance.exports.main();
}
