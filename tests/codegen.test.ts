import { Lexer } from "../src/lexer";
import { Parser } from "../src/parser";
import { Checker } from "../src/checker";
import { CodeGenerator } from "../src/codegen";

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

        const lexer = new Lexer(code);
        const tokens = lexer.scanTokens();
        const parser = new Parser(tokens);
        const statements = parser.parse();

        const checker = new Checker();
        checker.check(statements);

        const generator = new CodeGenerator(module);
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
});
