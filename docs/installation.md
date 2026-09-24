---
title: Installation
description: Download MarkUP Desktop for Windows, install the VS Code extension, or build the markup command-line tool from source.
---

# Installation

## MarkUP Desktop

Version 0.2.0, Windows 10 and 11, 64-bit.

| File | Description |
|---|---|
| [MarkUP-Setup-x64.exe](downloads/MarkUP-Setup-x64.exe) | Installer. Installs for the current user without administrator rights, adds a Start menu entry and associates `.markup` and `.mkup` files. |
| [MarkUP-x64.msi](downloads/MarkUP-x64.msi) | Windows Installer package. Installs for all users; suitable for managed deployment. |
| [MarkUP-Portable-x64.exe](downloads/MarkUP-Portable-x64.exe) | Single executable, no installation. Does not register file types. |
| [SHA256SUMS.txt](downloads/SHA256SUMS.txt) | SHA-256 checksums of the three files. |

The installers install the Microsoft Edge WebView2 runtime if it is missing. The portable executable requires it to be present already; it is included in Windows 11 and in current Windows 10 updates.

The files are not code-signed yet. Windows SmartScreen may show *Windows protected your PC*; verify the checksum, then choose *More info* → *Run anyway*.

```powershell
Get-FileHash .\MarkUP-Setup-x64.exe -Algorithm SHA256
```

To uninstall, use *Settings* → *Apps* → *Installed apps*.

There are no packaged builds for macOS or Linux. The application builds on both from source; see [Desktop](desktop.md#building-from-source).

## VS Code extension

Version 0.2.1 of the `markup-lang` extension: [markup.vsix](downloads/markup.vsix).

```sh
code --install-extension markup.vsix
```

Or, in VS Code: *Extensions* view → *…* menu → *Install from VSIX…*. Installing over an earlier version upgrades it. The extension is described in [VS Code extension](vscode.md).

## Command-line tool

The `markup` command is built from the repository. It requires [Node.js](https://nodejs.org) 22.12 or newer.

```sh
git clone https://github.com/arturjoaodaros-dev/MarkUP.git
cd MarkUP
npm install
npm run build
npm link -w @markup-lang/cli
```

`npm link` puts `markup` on your `PATH`. Without it, run `node packages/cli/dist/markup.js`.

```sh
markup --version
```

## Libraries

The parser and renderers are the packages `@markup-lang/core`, `@markup-lang/html` and `@markup-lang/text` in the same repository. Using them from code is described in [Extending MarkUP](extending.md#using-the-core-directly).
