# Contributing to LipSync

Thank you for your interest in contributing to LipSync! This document provides guidelines and instructions to help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Report Bugs](#how-to-report-bugs)
- [How to Request Features](#how-to-request-features)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Development Setup](#development-setup)

## Code of Conduct

All contributors are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

## How to Report Bugs

If you find a bug, please open an issue on GitHub with the following information:

- **A clear, descriptive title** — summarize the problem
- **Steps to reproduce** — what actions trigger the bug
- **Expected behavior** — what you expected to happen
- **Actual behavior** — what actually happened
- **Environment details** — OS, browser, Node.js version, etc.
- **Screenshots or logs** — if applicable
- **Minimal reproduction** — a reduced test case or link to a repository that demonstrates the issue

Check existing issues first to avoid duplicates.

## How to Request Features

Feature requests are welcome! Open an issue with:

- **Use case** — what problem would this feature solve?
- **Proposed solution** — how you envision it working
- **Alternatives considered** — any other approaches you've thought about
- **Context** — why this would benefit the project

Label your issue with `enhancement` if possible.

## Pull Request Process

1. **Fork the repository** to your own GitHub account.
2. **Create a feature branch** from `master`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
   Use a descriptive branch name (`feature/`, `fix/`, `refactor/`, `docs/`).
3. **Make your changes**, following the [coding standards](#coding-standards) below.
4. **Write or update tests** for your changes. New features must include tests.
5. **Run the test suite** to confirm nothing is broken:
   ```bash
   npm test
   ```
6. **Run the TypeScript type checker**:
   ```bash
   npm run build:tsc
   ```
7. **Commit your changes** with a descriptive message (see [Commit Messages](#commit-messages)).
8. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
9. **Open a pull request** against the `master` branch. Provide a clear description of your changes, referencing any related issues.
10. **Participate in the review** — address feedback, make adjustments, and push updates as needed.
11. **Once approved**, a maintainer will merge your PR.

## Coding Standards

- **TypeScript strict mode** — the project uses `strict: true` in `tsconfig.json`. All code must compile without errors under strict settings.
- **Tests required** — new features must include appropriate tests. Bug fixes should include a test that catches the regression.
- **ES2022 modules** — use `import`/`export` syntax (no CommonJS).
- **Formatting** — follow the existing code style. Consistency matters more than any single style guide.
- **Documentation** — public APIs, non-trivial logic, and algorithmic details should have JSDoc comments.
- **No dead code** — avoid commented-out code, unused variables, or unreachable paths.

## Commit Messages

Use descriptive commit messages. There is no strict conventional-commits requirement, but please follow these guidelines:

- Write in the **imperative present tense** ("Fix bug" not "Fixed bug" or "Fixes bug").
- **First line** should be a short summary (≤72 characters).
- **Body** (optional, after a blank line) can contain more detail, context, or rationale.
- Prefixes like `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` are welcome but not required.

**Good examples:**

```
Add viseme blending between consecutive phonemes

Previously transitions were instantaneous, causing visible popping.
This change adds a 50ms linear blend between morph targets.
```

```
Fix crash when microphone input is empty
```

## Development Setup

### Prerequisites

- **Node.js** >= 18.x (uses ES2022 modules)
- **npm** >= 9.x

### Local Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/LipSync.git
cd LipSync

# Install dependencies
npm install

# Start the development server (with hot reload)
npm run dev

# Run all tests (204+ tests)
npm test

# Type-check the codebase
npm run build:tsc

# Build for production
npm run build
```

### Project Scripts

| Command              | Description                              |
|----------------------|------------------------------------------|
| `npm install`        | Install all dependencies                 |
| `npm run dev`        | Start Vite dev server with HMR           |
| `npm run build`      | Vite production build → `dist/`          |
| `npm run build:tsc`  | TypeScript type check (`tsc --noEmit`)   |
| `npm test`           | Run all tests (Vitest)                   |
| `npm run test:watch` | Run tests in watch mode                  |
| `npx serve dist -l 30925` | Serve the production build          |

---

Thank you for contributing!
