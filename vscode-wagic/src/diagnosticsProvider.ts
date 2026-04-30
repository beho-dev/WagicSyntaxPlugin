import * as vscode from 'vscode';
import {
    keywords, zones, triggers, macros, constants, basicabilities, types,
    RELEVANT_LINE_PREFIXES, SKIP_REGIONS,
} from './wagicData';

// ---------------------------------------------------------------------------
// Pre-built lookup sets for O(1) membership tests
// ---------------------------------------------------------------------------
const keywordSet      = new Set(keywords);
const zoneSet         = new Set(zones);
const triggerSet      = new Set(triggers);
const macroSet        = new Set(macros);
const constantSet     = new Set([...constants, ...basicabilities]);
const typeSet         = new Set(types);

/** All known words combined (used for "unknown word" detection) */
const allKnownWords   = new Set([
    ...keywords, ...zones, ...triggers, ...macros,
    ...constants, ...basicabilities, ...types,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when lineText is a line that should receive Wagic analysis.
 * Mirrors the check from CheckWagicLineSyntax in the C++ plugin.
 */
function isRelevantLine(lower: string): boolean {
    return RELEVANT_LINE_PREFIXES.some(p => lower.startsWith(p));
}

/**
 * Returns true when `pos` (0-based char offset into `line`) falls inside any
 * skip-region such as name(...) or named!:...:!
 * Mirrors `containsWordBetween` from the C++ plugin.
 */
function insideSkipRegion(line: string, word: string, pos: number): boolean {
    for (const { open, close } of SKIP_REGIONS) {
        let searchFrom = 0;
        while (searchFrom < line.length) {
            const openIdx = line.indexOf(open, searchFrom);
            if (openIdx === -1) break;
            const closeIdx = line.indexOf(close, openIdx + open.length);
            if (closeIdx === -1) break;
            if (pos >= openIdx && pos <= closeIdx) {
                // The word is inside this skip region
                const inner = line.slice(openIdx + open.length, closeIdx);
                if (inner.includes(word)) return true;
            }
            searchFrom = openIdx + open.length + 1;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Bracket-balance checking
// ---------------------------------------------------------------------------
type BracketPair = { open: string; close: string; single: boolean };

const BRACKET_PAIRS: BracketPair[] = [
    { open: '(', close: ')', single: false },
    { open: '[', close: ']', single: false },
    { open: '{', close: '}', single: false },
    { open: '$', close: '$', single: true  },   // $$ couples
    { open: '!', close: '!', single: true  },   // !! couples
];

/** Checks bracket balance in a single line and returns diagnostics for any mismatch. */
function checkBrackets(
    lineText: string,
    lineIndex: number,
): vscode.Diagnostic[] {
    const diags: vscode.Diagnostic[] = [];

    for (const pair of BRACKET_PAIRS) {
        if (pair.single) {
            // For $ and !, they must appear an even number of times
            let count = 0;
            const positions: number[] = [];
            for (let i = 0; i < lineText.length; i++) {
                if (lineText[i] === pair.open) {
                    count++;
                    positions.push(i);
                }
            }
            if (count % 2 !== 0) {
                // Flag the last unpaired one
                const col = positions[positions.length - 1] ?? 0;
                diags.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, col, lineIndex, col + 1),
                    `Unbalanced '${pair.open}${pair.close}' pair`,
                    vscode.DiagnosticSeverity.Error,
                ));
            }
        } else {
            // Stack-based matching for (, [, {
            const stack: number[] = [];
            for (let i = 0; i < lineText.length; i++) {
                if (lineText[i] === pair.open) {
                    stack.push(i);
                } else if (lineText[i] === pair.close) {
                    if (stack.length === 0) {
                        // Unmatched close
                        diags.push(new vscode.Diagnostic(
                            new vscode.Range(lineIndex, i, lineIndex, i + 1),
                            `Unmatched '${pair.close}'`,
                            vscode.DiagnosticSeverity.Error,
                        ));
                    } else {
                        stack.pop();
                    }
                }
            }
            // Remaining items on stack are unmatched opens
            for (const col of stack) {
                diags.push(new vscode.Diagnostic(
                    new vscode.Range(lineIndex, col, lineIndex, col + 1),
                    `Unmatched '${pair.open}'`,
                    vscode.DiagnosticSeverity.Error,
                ));
            }
        }
    }
    return diags;
}

// ---------------------------------------------------------------------------
// Word tokenisation
// ---------------------------------------------------------------------------

/** Characters that separate Wagic tokens — mirrors the C++ plugin logic */
const TOKEN_SEPARATORS = /[^a-z@_~]/;

/**
 * Tokenises the "value" portion of a Wagic line into {word, col} objects.
 * Only lowercase alphabetic chars, @, _ and ~ are part of tokens.
 */
function tokeniseValue(value: string, valueOffset: number): Array<{ word: string; col: number }> {
    const tokens: Array<{ word: string; col: number }> = [];
    let i = 0;
    while (i < value.length) {
        const ch = value[i];

        // Skip non-word characters
        if (ch !== '@' && ch !== '_' && !(ch >= 'a' && ch <= 'z')) {
            i++;
            continue;
        }

        let start = i;
        // Include prefix char
        if (ch === '@' || ch === '_') i++;
        // Include leading double-underscore (macros start with __)
        if (i < value.length && value[i] === '_') i++;
        // Consume alphabetic body
        while (i < value.length && value[i] >= 'a' && value[i] <= 'z') i++;
        // Include trailing _ for macros (_ ... _)
        if (i < value.length && value[start] === '_' && value[i] === '_') i++;
        if (i < value.length && value[start] === '_' && value[i] === '_') i++;

        const word = value.slice(start, i);
        if (word.length > 0) {
            tokens.push({ word, col: valueOffset + start });
        }
    }
    return tokens;
}

// ---------------------------------------------------------------------------
// Compound-word prefixes that are valid even when the rest is a sub-word
// ---------------------------------------------------------------------------
const COMPOUND_PREFIXES = [
    'stored', 'mytarg', 'hascnt', 'hasability', 'myhasdead', 'oppohasdead',
    'totcnt', 'diffcardcounttype', 'cardcounttype', 'diffcardcountabil',
    'cardcountabil', 'halfup', 'halfdown', 'thirdup', 'thirddown', 'twice',
    'thrice', 'fourtimes', 'fivetimes', 'math', 'plus', 'minus', 'mathend',
    'minusend', 'plusend',
];

function isCompoundWord(word: string): boolean {
    return COMPOUND_PREFIXES.some(p => word.includes(p));
}

// ---------------------------------------------------------------------------
// Per-line diagnostic generation
// ---------------------------------------------------------------------------
function diagnoseValueLine(
    rawLine: string,
    lineIndex: number,
    reportUnknown: boolean,
): vscode.Diagnostic[] {
    const diags: vscode.Diagnostic[] = [];
    const lower = rawLine.toLowerCase();

    // Find the value offset
    let valueOffset = 0;
    const eqIdx = lower.indexOf('auto_define');
    if (eqIdx >= 0) {
        valueOffset = eqIdx + 11;
    } else {
        const eq = rawLine.indexOf('=');
        if (eq < 0) return diags;
        valueOffset = eq + 1;
    }

    const value = lower.slice(valueOffset);

    // Bracket checks on the full line
    diags.push(...checkBrackets(rawLine, lineIndex));

    if (!reportUnknown) return diags;

    // Word-by-word unknown-word checks
    const tokens = tokeniseValue(value, valueOffset);
    for (const { word, col } of tokens) {
        if (word.length === 0) continue;

        // Skip if in a skip-region (name(...) etc.)
        if (insideSkipRegion(lower, word, col)) continue;

        // Known word?
        if (allKnownWords.has(word)) continue;

        // Compound word (e.g. storedpower, hascntflying)? Skip unknown check.
        if (isCompoundWord(word)) continue;

        // Numeric-only tokens (e.g. damage amounts) are fine
        if (/^\d+$/.test(word)) continue;

        diags.push(new vscode.Diagnostic(
            new vscode.Range(lineIndex, col, lineIndex, col + word.length),
            `Unknown Wagic word: '${word}'`,
            vscode.DiagnosticSeverity.Warning,
        ));
    }
    return diags;
}

// ---------------------------------------------------------------------------
// Public provider class
// ---------------------------------------------------------------------------
export class WagicDiagnosticsProvider {
    private readonly collection: vscode.DiagnosticCollection;
    private readonly subscriptions: vscode.Disposable[] = [];

    constructor(collection: vscode.DiagnosticCollection) {
        this.collection = collection;
    }

    /** Attach event listeners to the extension context. */
    register(context: vscode.ExtensionContext): void {
        const onSave = vscode.workspace.onDidSaveTextDocument(doc => this.updateDocument(doc));
        const onOpen = vscode.workspace.onDidOpenTextDocument(doc => this.updateDocument(doc));
        const onChange = vscode.workspace.onDidChangeTextDocument(e => this.updateDocument(e.document));
        const onClose = vscode.workspace.onDidCloseTextDocument(doc => this.collection.delete(doc.uri));

        this.subscriptions.push(onSave, onOpen, onChange, onClose);
        context.subscriptions.push(...this.subscriptions);

        // Run on all currently open wagic documents
        for (const doc of vscode.workspace.textDocuments) {
            this.updateDocument(doc);
        }
    }

    /** (Re-)analyse a document and update the diagnostic collection. */
    updateDocument(document: vscode.TextDocument): void {
        if (document.languageId !== 'wagic') return;

        const config = vscode.workspace.getConfiguration('wagic');
        if (!config.get<boolean>('diagnostics.enabled', true)) {
            this.collection.delete(document.uri);
            return;
        }
        const reportUnknown = config.get<boolean>('diagnostics.reportUnknownWords', true);

        const diags: vscode.Diagnostic[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            const lower = text.toLowerCase();

            // Skip pure comment lines (# but not #AUTO_DEFINE)
            if (lower.startsWith('#') && !lower.startsWith('#auto_define')) continue;

            if (isRelevantLine(lower)) {
                diags.push(...diagnoseValueLine(text, i, reportUnknown));
            }
        }
        this.collection.set(document.uri, diags);
    }

    dispose(): void {
        this.subscriptions.forEach(s => s.dispose());
        this.collection.dispose();
    }
}
