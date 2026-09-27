# Security policy

## Supported versions

MarkUP is pre-1.0 and released on a rolling basis. Only the latest release of each package (core, HTML/text renderers, CLI, language server, VS Code extension, desktop app) is supported; please upgrade before reporting an issue.

## Reporting a vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Instead, report it privately using [GitHub Security Advisories](https://github.com/arturjoaodaros-dev/MarkUP/security/advisories/new) for this repository. Include:

- affected package(s) and version(s);
- a minimal reproduction (a `.markup` document, CLI invocation, or steps in the desktop app);
- the potential impact (e.g. XSS in rendered output, path traversal in the desktop app or CLI).

There is no guaranteed response time, but reports are reviewed as they come in.

## Scope

This includes the parser and renderers (`@markup-lang/core`, `@markup-lang/html`, `@markup-lang/text`), the CLI, the language server/service, the VS Code extension, and the desktop app (including its Tauri backend). It does not include the documentation site's third-party hosting infrastructure (Vercel).
