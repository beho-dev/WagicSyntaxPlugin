import * as vscode from 'vscode';
import { WagicCompletionProvider } from './completionProvider';
import { WagicDiagnosticsProvider } from './diagnosticsProvider';

let diagnosticsProvider: WagicDiagnosticsProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
    // -----------------------------------------------------------------------
    // Autocompletion
    // -----------------------------------------------------------------------
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { language: 'wagic', scheme: 'file' },
        new WagicCompletionProvider(),
        // Trigger characters: the same ones that the Notepad++ plugin considers
        // part of a prefix (@, _, ~)
        '@', '_', '~',
    );
    context.subscriptions.push(completionDisposable);

    // -----------------------------------------------------------------------
    // Diagnostics (bracket checking + unknown words)
    // -----------------------------------------------------------------------
    const collection = vscode.languages.createDiagnosticCollection('wagic');
    diagnosticsProvider = new WagicDiagnosticsProvider(collection);
    diagnosticsProvider.register(context);
    context.subscriptions.push(collection);

    // -----------------------------------------------------------------------
    // Command: toggle diagnostics
    // -----------------------------------------------------------------------
    const toggleCmd = vscode.commands.registerCommand('wagic.toggleDiagnostics', async () => {
        const config = vscode.workspace.getConfiguration('wagic');
        const current = config.get<boolean>('diagnostics.enabled', true);
        await config.update('diagnostics.enabled', !current, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(
            `Wagic diagnostics ${!current ? 'enabled' : 'disabled'}.`,
        );
        // Refresh immediately
        if (diagnosticsProvider) {
            for (const doc of vscode.workspace.textDocuments) {
                diagnosticsProvider.updateDocument(doc);
            }
        }
    });
    context.subscriptions.push(toggleCmd);
}

export function deactivate(): void {
    diagnosticsProvider?.dispose();
}
