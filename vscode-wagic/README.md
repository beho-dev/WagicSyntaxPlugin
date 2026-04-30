# Wagic Syntax — VS Code Extension

A VS Code port of the [WagicSyntaxPlugin for Notepad++](https://github.com/beho-dev/WagicSyntaxPlugin).  
Provides syntax highlighting, autocompletion, and bracket diagnostics for [Wagic the Homebrew](https://github.com/WagicProject/wagic) card configuration files (`.dat`).

---

## Features

### Syntax Highlighting

The extension colours each token category in your Wagic `.dat` files:

| Category | Colour | Examples |
|---|---|---|
| Comments (`#` lines) | Green | `# This is a comment` |
| Keywords | Blue | `destroy`, `draw`, `counter`, `damage` |
| Triggers | Dark red | `@each upkeep`, `@tapped`, `@damageof` |
| Zones | Purple | `mybattlefield`, `opponenthand`, `graveyard` |
| Macros | Orange | `_DIES_`, `__CYCLING__`, `_LANDFALL_` |
| Constants & basic abilities | Gray | `power`, `toughness`, `flying`, `trample` |
| Section headers | Teal | `[card]`, `[/card]` |

### Autocompletion

Press **Ctrl+Space** on any `text=`, `name=`, `type=`, `subtype=` (or other Wagic value) line to get a popup list of matching keywords, zones, triggers, macros, constants, and abilities.  
Typing a prefix (e.g. `fly`) filters the list automatically.

### Inline Diagnostics

While you edit, the extension checks:

- **Unbalanced brackets** — `()`, `[]`, `{}`, `$$` and `!!` couples are validated per line; any unmatched delimiter is highlighted as an **error**.
- **Unknown words** — unrecognised tokens on `text=` / `#AUTO_DEFINE` lines are highlighted as **warnings** (can be disabled in settings).

### Auto-detection

Files that contain `[card]`, `[/card]` or `#AUTO_DEFINE` are automatically identified as Wagic files when they carry the `.dat` extension, so no manual language selection is needed.

---

## Language Configuration

- **Line comments** — `#`
- **Auto-closing pairs** — `()`, `[]`, `{}`

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `wagic.diagnostics.enabled` | `true` | Enable/disable all inline diagnostics |
| `wagic.diagnostics.reportUnknownWords` | `true` | Highlight unrecognised words as warnings |

Toggle diagnostics at any time via **Ctrl+Shift+P → Wagic: Toggle Inline Diagnostics**.

---

## Installation

### From VSIX (release)

1. Download the latest `vscode-wagic-*.vsix` from the [Releases](../../releases) page.
2. In VS Code open the **Extensions** view (**Ctrl+Shift+X**).
3. Click the **…** menu → **Install from VSIX…** and select the downloaded file.
4. Reload VS Code.

### From source

```bash
cd vscode-wagic
npm install
npm run compile
# Package (requires @vscode/vsce):
npx vsce package
```

Then install the generated `.vsix` as above.

---

## Development

```bash
cd vscode-wagic
npm install        # install dependencies
npm run watch      # incremental TypeScript compilation
# Press F5 in VS Code to launch an Extension Development Host
```

Run the unit tests (no VS Code host required):

```bash
npm test
```

---

## License

Released under the [GNU General Public License version 2](http://www.gnu.org/licenses/gpl-2.0.txt), matching the original Notepad++ plugin.
