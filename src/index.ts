import * as fs from 'fs';
import * as process from 'process';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { AstPrinter } from './ast_printer';

function main() {
    const args = process.argv.slice(2);

    if (args.length !== 1) {
        console.log('Usage: dyego <filename>');
        process.exit(1);
    }

    const filename = args[0];

    try {
        const content = fs.readFileSync(filename, 'utf-8');

        const lexer = new Lexer(content);
        const tokens = lexer.scanTokens();

        const parser = new Parser(tokens);
        const statements = parser.parse();

        const printer = new AstPrinter();

        for (const stmt of statements) {
            console.log(printer.print(stmt));
        }

    } catch (e: any) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

main();
