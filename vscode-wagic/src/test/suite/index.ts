import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

/** Recursively collect *.test.js files from a directory. */
function collectTestFiles(dir: string, files: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectTestFiles(full, files);
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(full);
        }
    }
    return files;
}

export async function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
    const testsRoot = path.resolve(__dirname, '.');
    const files = collectTestFiles(testsRoot);
    for (const f of files) {
        mocha.addFile(f);
    }
    return new Promise((resolve, reject) => {
        mocha.run(failures => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed.`));
            } else {
                resolve();
            }
        });
    });
}
