import { compileAndRun } from './utils.js';

describe("unary operator overloading", () => {
    it("supports prefix - on i32", async () => {
        const result = await compileAndRun(`
            fun main(): i32 {
                val x = 10;
                return -x;
            }
        `);
        expect(result).toBe(-10);
    });

    it("supports prefix + on i32", async () => {
        const result = await compileAndRun(`
            fun main(): i32 {
                val x = 10;
                return +x;
            }
        `);
        expect(result).toBe(10);
    });

    it("supports prefix ! on Boolean", async () => {
        const result = await compileAndRun(`
            fun main(): i32 {
                val x = true;
                if (!x) {
                    return 1;
                } else {
                    return 0;
                }
            }
        `);
        expect(result).toBe(0);
    });

    it("supports prefix ! on Boolean (true case)", async () => {
        const result = await compileAndRun(`
            fun main(): i32 {
                val x = false;
                if (!x) {
                    return 1;
                } else {
                    return 0;
                }
            }
        `);
        expect(result).toBe(1);
    });

    /*
    it("supports custom prefix operator", async () => {
        const result = await compileAndRun(`
            value Vector(val x: i32, val y: i32) {
                operator fun \`prefix -\`(): Vector {
                    return Vector(-x, -y);
                }
            }

            fun main(): i32 {
                val v = Vector(10, 20);
                val negV = -v;
                return negV.x + negV.y;
            }
        `);
        expect(result).toBe(-30);
    });
    */
});
