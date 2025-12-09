import * as fs from 'fs';
import * as process from 'process';
import * as path from 'path'; // Need path for extension manipulation
import binaryen from 'binaryen';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { AstPrinter } from './ast_printer.js';
import { Checker } from './checker.js';
import { CodeGenerator } from './codegen.js';

function main() {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: dyego <filename> [-o <output>] [--emit-wasm]');
        process.exit(1);
    }

    let inputFilename: string | undefined;
    let outputFilename: string | undefined;
    let emitWasm = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-o') {
            if (i + 1 < args.length) {
                outputFilename = args[++i];
                emitWasm = true;
            } else {
                console.error('Error: -o option requires an argument');
                process.exit(1);
            }
        } else if (arg === '--emit-wasm') {
            emitWasm = true;
        } else if (!arg.startsWith('-')) {
            if (inputFilename) {
                console.error('Error: Multiple input files provided');
                process.exit(1);
            }
            inputFilename = arg;
        } else {
            console.error(`Error: Unknown option ${arg}`);
            process.exit(1);
        }
    }

    if (!inputFilename) {
        console.error('Error: No input file provided');
        process.exit(1);
    }

    // Default output filename if generating but no -o
    if (emitWasm && !outputFilename) {
        const p = path.parse(inputFilename);
        outputFilename = path.join(p.dir, p.name + '.wasm');
    }

    try {
        const content = fs.readFileSync(inputFilename, 'utf-8');

        const lexer = new Lexer(content, inputFilename);
        const tokens = lexer.scanTokens();

        const parser = new Parser(tokens);
        const statements = parser.parse();

        const parserErrors = parser.getErrors();
        if (parserErrors.length > 0) {
            for (const error of parserErrors) {
                // Error <filename>:<line>:<column>: <message>
                console.error(`Error ${error.token.filename}:${error.token.line}:${error.token.column}: ${error.message}`);
            }
            process.exit(1);
        }

        const checker = new Checker();
        checker.check(statements);

        const errors = checker.getErrors();
        if (errors.length > 0) {
            for (const error of errors) {
                console.error(`Error ${error.token.filename}:${error.token.line}:${error.token.column}: ${error.message}`);
            }
            process.exit(1);
        }

        if (emitWasm) {
            const module = new binaryen.Module();
            const codegen = new CodeGenerator(module, checker);

            for (const stmt of statements) {
                codegen.generate(stmt);
            }

            if (!module.validate()) {
                console.error("Module failed validation");
                process.exit(1);
            }

            const binary = module.emitBinary();
            fs.writeFileSync(outputFilename!, binary);
            // console.log(`Wrote ${outputFilename}`);
        } else {
            const printer = new AstPrinter();

            for (const stmt of statements) {
                console.log(printer.print(stmt));
            }
        }

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

main();
