import { Lexer } from '../src/lexer.js';
import { Parser } from '../src/parser.js';
import { Checker } from '../src/checker.js';
import { CodeGenerator } from '../src/codegen.js';

describe("Binaryen Smoke Test", () => {
    it("should compile and run a simple add function", async () => {
        const binaryen = (await import("binaryen")).default;
        const module = new binaryen.Module();

        // Create a function type for (i32, i32) => i32
        const ii2i = binaryen.createType([binaryen.i32, binaryen.i32]);

        // Define the add function
        // (param $0 i32) (param $1 i32) (result i32)
        //   (i32.add (local.get $0) (local.get $1))
        module.addFunction(
            "add",
            ii2i,
            binaryen.i32,
            [], // no local variables
            module.i32.add(
                module.local.get(0, binaryen.i32),
                module.local.get(1, binaryen.i32)
            )
        );

        // Export the function
        module.addFunctionExport("add", "add");

        // Validate the module
        if (!module.validate()) {
            throw new Error("Module validation failed");
        }

        // Optimize the module (optional, but good for smoke test)
        module.optimize();

        // Get the binary data
        const wasm = module.emitBinary();

        // Instantiate the module
        const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm as any), {});

        // Call the exported function
        const add = instance.exports.add as (a: number, b: number) => number;
        expect(add(10, 20)).toBe(30);
        expect(add(-5, 5)).toBe(0);

        // Clean up
        module.dispose();
    });

    it("should compile and run a simple add function using CodeGenerator", async () => {
        const binaryen = (await import("binaryen")).default;
        const module = new binaryen.Module();

        const code = `
            fun add(a: i32, b: i32): i32 = a + b;
        `;

        const lexer = new Lexer(code, "test.dy");
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const checker = new Checker();
        checker.check(statements);

        const generator = new CodeGenerator(module, checker);
        generator.generate(statements[0]); // Generate the function

        if (!module.validate()) {
            throw new Error("Module validation failed");
        }

        const wasm = module.emitBinary();
        const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm as any), {});
        const add = instance.exports.add as (a: number, b: number) => number;

        expect(add(10, 20)).toBe(30);

        module.dispose();
    });

    it("should compile and run a max function using if expression", async () => {
        const binaryen = (await import("binaryen")).default;
        const module = new binaryen.Module();

        const code = `
            fun max(a: i32, b: i32): i32 = if (a > b) a else b;
        `;

        const lexer = new Lexer(code, "test.dy");
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const checker = new Checker();
        checker.check(statements);

        const generator = new CodeGenerator(module, checker);
        generator.generate(statements[0]);

        if (!module.validate()) {
            throw new Error("Module validation failed");
        }

        const wasm = module.emitBinary();
        const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm as any), {});
        const max = instance.exports.max as (a: number, b: number) => number;

        expect(max(10, 20)).toBe(20);
        expect(max(30, 20)).toBe(30);
        expect(max(5, 5)).toBe(5);

        module.dispose();
    });

    it("should compile and run unary operators", async () => {
        const binaryen = (await import("binaryen")).default;
        const module = new binaryen.Module();

        const code = `
            fun unary(a: i32, b: f64): f64 {
                val negA = -a;
                val plusA = +a;
                val notZero = !a;
                val negB = -b;
                val plusB = +b;
                
                if (notZero) {
                    // a is 0
                    // negB should be -b, plusB should be b
                    return negB + plusB; 
                } else {
                    // a is not 0
                    // negA should be -a, plusA should be a
                    // return negA + plusA which is 0
                    // let's return negA to verify it's negative
                    return (negA as f64);
                }
            }
        `;

        const lexer = new Lexer(code, "test.dy");
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const path = (await import("path")).default;
        const fs = (await import("fs")).default;

        const prefixPath = path.resolve("src/prefix.dy");
        // Initialize checker with null to prevent auto-loading
        const checker = new Checker(null);

        // Load and check prefix first
        const prefixSource = fs.readFileSync(prefixPath, "utf-8");
        const prefixLexer = new Lexer(prefixSource, "src/prefix.dy");
        const prefixParser = new Parser(prefixLexer.scanTokens());
        const prefixStatements = prefixParser.parse();

        // Hack to set isLoadingPrefix
        (checker as any).isLoadingPrefix = true;
        checker.check(prefixStatements);
        (checker as any).isLoadingPrefix = false;

        if (checker.getErrors().length > 0) {
            throw new Error("Prefix check failed: " + checker.getErrors()[0].message);
        }

        // Check user statements
        checker.check(statements);
        if (checker.getErrors().length > 0) {
            throw new Error(checker.getErrors()[0].message);
        }

        const generator = new CodeGenerator(module, checker);

        // Generate prefix code
        for (const stmt of prefixStatements) {
            generator.generate(stmt);
        }

        generator.generate(statements[0]);

        if (!module.validate()) {
            throw new Error("Module validation failed");
        }

        const wasm = module.emitBinary();
        const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm as any), {});
        const unary = instance.exports.unary as (a: number, b: number) => number;

        // a = 10 (not zero), returns negA = -10
        expect(unary(10, 20.5)).toBe(-10);

        // a = -5 (not zero), returns negA = 5
        expect(unary(-5, 5.5)).toBe(5);

        // a = 0 (zero), returns negB + plusB = -b + b = 0
        expect(unary(0, 10.5)).toBe(0);

        // Let's test float unary minus specifically
        // We can't easily return multiple values, so let's trust the logic above covers basic paths.
        // But we want to verify -b is actually negative.
    });
});
