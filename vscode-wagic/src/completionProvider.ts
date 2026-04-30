import * as vscode from 'vscode';
import { allWords, triggers, macros, RELEVANT_LINE_PREFIXES } from './wagicData';

/**
 * Characters that terminate a Wagic word token.
 * Mirrors the list used by the Notepad++ plugin's HandleScnModified.
 */
const WORD_TERMINATORS = new Set([
    '\r', '\n', '\t', '"', ' ', ')', '(', ']', '[', '{', '}',
    '$', '!', ':', '^', '/', '<', '>', ',', '.', '|', '=', '-',
    '+', '%', ';', '*', '&',
]);

/**
 * Special prefix characters that are included in a token (triggers start with @,
 * macros start with _, some multipliers start with ~).
 */
const PREFIX_CHARS = new Set(['@', '_', '~']);

/**
 * Returns true when the line is one that should receive Wagic syntax analysis.
 * Mirrors the check from CheckWagicLineSyntax / HandleScnModified in the C++ plugin.
 */
export function isRelevantLine(lineText: string): boolean {
    const lower = lineText.toLowerCase();
    return RELEVANT_LINE_PREFIXES.some(p => lower.startsWith(p));
}

/**
 * Extracts the partial Wagic word that the cursor is currently inside/at the end of.
 * Returns the word (possibly with leading @, _ or ~ prefix) and its start offset in the line.
 */
function extractPartialWord(lineText: string, charIndex: number): { word: string; start: number } {
    // Scan backwards to find word start
    let start = charIndex;
    while (start > 0 && !WORD_TERMINATORS.has(lineText[start - 1])) {
        start--;
    }

    // Include a leading prefix character if present just before the word
    if (start > 0 && PREFIX_CHARS.has(lineText[start - 1])) {
        start--;
    }

    const word = lineText.slice(start, charIndex);
    return { word, start };
}

export class WagicCompletionProvider implements vscode.CompletionItemProvider {
    // Pre-sort all items once at construction time for fast prefix filtering
    private readonly sortedWords: string[];

    constructor() {
        this.sortedWords = [...allWords, ...triggers, ...macros].sort();
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // Only provide completions on lines that the Wagic plugin would analyse
        if (!isRelevantLine(lineText)) {
            return undefined;
        }

        const { word: partial, start } = extractPartialWord(lineText, position.character);
        if (partial.length === 0) {
            return undefined;
        }

        const partialLower = partial.toLowerCase();
        const range = new vscode.Range(
            position.line, start,
            position.line, position.character,
        );

        const items: vscode.CompletionItem[] = [];
        for (const candidate of this.sortedWords) {
            if (candidate.toLowerCase().startsWith(partialLower)) {
                const item = new vscode.CompletionItem(candidate, vscode.CompletionItemKind.Keyword);
                item.range = range;
                items.push(item);
                // Limit results to keep the popup manageable
                if (items.length >= 200) {
                    break;
                }
            }
        }
        return items;
    }
}
