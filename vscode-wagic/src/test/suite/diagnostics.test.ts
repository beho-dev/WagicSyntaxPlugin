/**
 * Unit tests for the WagicDiagnosticsProvider logic.
 *
 * These tests run inside a plain Node / Mocha environment (no VSCode host)
 * so they test the pure-logic helpers extracted from diagnosticsProvider.ts
 * in isolation, using lightweight stubs for the VSCode API.
 */

import * as assert from 'assert';
import * as suite from 'mocha';

// ---------------------------------------------------------------------------
// Minimal stubs for the VSCode types used in diagnosticsProvider
// ---------------------------------------------------------------------------

interface Range { startLine: number; startChar: number; endLine: number; endChar: number }
interface Diagnostic { range: Range; message: string; severity: number }

const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };

class VSRange implements Range {
    startLine: number; startChar: number; endLine: number; endChar: number;
    constructor(sl: number, sc: number, el: number, ec: number) {
        this.startLine = sl; this.startChar = sc;
        this.endLine = el; this.endChar = ec;
    }
}

// ---------------------------------------------------------------------------
// Inline re-implementation of the bracket-check logic under test
// (mirrors diagnosticsProvider.ts checkBrackets)
// ---------------------------------------------------------------------------

type BracketPair = { open: string; close: string; single: boolean };

const BRACKET_PAIRS: BracketPair[] = [
    { open: '(', close: ')', single: false },
    { open: '[', close: ']', single: false },
    { open: '{', close: '}', single: false },
    { open: '$', close: '$', single: true  },
    { open: '!', close: '!', single: true  },
];

function checkBrackets(lineText: string, lineIndex: number): Diagnostic[] {
    const diags: Diagnostic[] = [];

    for (const pair of BRACKET_PAIRS) {
        if (pair.single) {
            let count = 0;
            const positions: number[] = [];
            for (let i = 0; i < lineText.length; i++) {
                if (lineText[i] === pair.open) { count++; positions.push(i); }
            }
            if (count % 2 !== 0) {
                const col = positions[positions.length - 1] ?? 0;
                diags.push({
                    range: new VSRange(lineIndex, col, lineIndex, col + 1),
                    message: `Unbalanced '${pair.open}${pair.close}' pair`,
                    severity: DiagnosticSeverity.Error,
                });
            }
        } else {
            const stack: number[] = [];
            for (let i = 0; i < lineText.length; i++) {
                if (lineText[i] === pair.open) {
                    stack.push(i);
                } else if (lineText[i] === pair.close) {
                    if (stack.length === 0) {
                        diags.push({
                            range: new VSRange(lineIndex, i, lineIndex, i + 1),
                            message: `Unmatched '${pair.close}'`,
                            severity: DiagnosticSeverity.Error,
                        });
                    } else {
                        stack.pop();
                    }
                }
            }
            for (const col of stack) {
                diags.push({
                    range: new VSRange(lineIndex, col, lineIndex, col + 1),
                    message: `Unmatched '${pair.open}'`,
                    severity: DiagnosticSeverity.Error,
                });
            }
        }
    }
    return diags;
}

// ---------------------------------------------------------------------------
// Re-implementation of insideSkipRegion
// ---------------------------------------------------------------------------
const SKIP_REGIONS = [
    { open: 'name(', close: ')' },
    { open: 'named!:', close: ':!' },
];

function insideSkipRegion(line: string, word: string, pos: number): boolean {
    for (const { open, close } of SKIP_REGIONS) {
        let searchFrom = 0;
        while (searchFrom < line.length) {
            const openIdx = line.indexOf(open, searchFrom);
            if (openIdx === -1) break;
            const closeIdx = line.indexOf(close, openIdx + open.length);
            if (closeIdx === -1) break;
            if (pos >= openIdx && pos <= closeIdx) {
                const inner = line.slice(openIdx + open.length, closeIdx);
                if (inner.includes(word)) return true;
            }
            searchFrom = openIdx + open.length + 1;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

suite.suite('Bracket checking', () => {
    test('balanced parentheses produce no diagnostics', () => {
        const diags = checkBrackets('text=damage(target hand)', 0);
        const parenDiags = diags.filter(d => d.message.includes('(') || d.message.includes(')'));
        assert.strictEqual(parenDiags.length, 0);
    });

    test('unmatched open paren is flagged', () => {
        const diags = checkBrackets('text=damage(target', 0);
        const errors = diags.filter(d => d.message.includes("Unmatched '('"));
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].range.startChar, 11);
    });

    test('unmatched close paren is flagged', () => {
        const diags = checkBrackets('text=damage target)', 0);
        const errors = diags.filter(d => d.message.includes("Unmatched ')'"));
        assert.strictEqual(errors.length, 1);
        assert.strictEqual(errors[0].range.startChar, 18);
    });

    test('nested brackets all balanced', () => {
        const diags = checkBrackets('text=foo(bar[baz{qux}])', 0);
        const structural = diags.filter(d => !d.message.includes('$$') && !d.message.includes('!!'));
        assert.strictEqual(structural.length, 0);
    });

    test('odd number of $ markers is flagged', () => {
        const diags = checkBrackets('text=foo$bar$baz$', 0);
        const errors = diags.filter(d => d.message.includes('$$'));
        assert.strictEqual(errors.length, 1);
    });

    test('even number of $ markers is not flagged', () => {
        const diags = checkBrackets('text=foo$bar$', 0);
        const errors = diags.filter(d => d.message.includes('$$'));
        assert.strictEqual(errors.length, 0);
    });

    test('odd number of ! markers is flagged', () => {
        const diags = checkBrackets('text=foo!bar', 0);
        const errors = diags.filter(d => d.message.includes('!!'));
        assert.strictEqual(errors.length, 1);
    });

    test('line with no brackets produces no bracket diagnostics', () => {
        const diags = checkBrackets('text=destroy target', 0);
        assert.strictEqual(diags.length, 0);
    });

    test('multiple unmatched opens reported individually', () => {
        const diags = checkBrackets('text=((target', 0);
        const errors = diags.filter(d => d.message.includes("Unmatched '('"));
        assert.strictEqual(errors.length, 2);
    });

    test('mixed unmatched brackets are each reported', () => {
        const diags = checkBrackets('text=(target]', 0);
        const openParen  = diags.filter(d => d.message === "Unmatched '('");
        const closeBrace = diags.filter(d => d.message === "Unmatched ']'");
        assert.strictEqual(openParen.length, 1);
        assert.strictEqual(closeBrace.length, 1);
    });
});

suite.suite('Skip-region detection', () => {
    test('word inside name(...) is skipped', () => {
        const line = 'text=destroy name(lightning bolt) target';
        // 'bolt' is at position 27
        const pos = line.indexOf('bolt');
        assert.ok(insideSkipRegion(line, 'bolt', pos));
    });

    test('word outside name(...) is not skipped', () => {
        const line = 'text=destroy name(lightning bolt) target';
        const pos = line.indexOf('destroy');
        assert.ok(!insideSkipRegion(line, 'destroy', pos));
    });

    test('word inside named!:...:! is skipped', () => {
        const line = 'text=named!:bolt:! target';
        const pos = line.indexOf('bolt');
        assert.ok(insideSkipRegion(line, 'bolt', pos));
    });

    test('word outside named!:...:! is not skipped', () => {
        const line = 'text=named!:bolt:! target';
        const pos = line.indexOf('target');
        assert.ok(!insideSkipRegion(line, 'target', pos));
    });

    test('empty line returns false', () => {
        assert.ok(!insideSkipRegion('', 'anything', 0));
    });
});

suite.suite('isRelevantLine', () => {
    const RELEVANT_LINE_PREFIXES = [
        'text=', 'name=', 'power=', 'toughness=',
        'type=', 'subtype=', 'grade=', 'backside=', 'partner=', '#auto_define',
    ];

    function isRelevantLine(lower: string): boolean {
        return RELEVANT_LINE_PREFIXES.some(p => lower.startsWith(p));
    }

    test('text= line is relevant', () => assert.ok(isRelevantLine('text=flying')));
    test('name= line is relevant', () => assert.ok(isRelevantLine('name=air elemental')));
    test('type= line is relevant', () => assert.ok(isRelevantLine('type=creature')));
    test('#auto_define line is relevant', () => assert.ok(isRelevantLine('#auto_define flying')));
    test('[card] line is NOT relevant', () => assert.ok(!isRelevantLine('[card]')));
    test('comment line is NOT relevant', () => assert.ok(!isRelevantLine('# this is a comment')));
    test('empty line is NOT relevant', () => assert.ok(!isRelevantLine('')));
});
