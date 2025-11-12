# Contributing to AlmondCoder

First off, thank you for considering contributing to AlmondCoder! It's people like you that make AlmondCoder such a great tool. 🌰

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Style Guidelines](#code-style-guidelines)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Communication](#communication)

## 📜 Code of Conduct

This project and everyone participating in it is governed by a code of conduct. By participating, you are expected to uphold this code. Please be respectful, inclusive, and considerate in all interactions.

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** - Use the version specified in `.nvmrc` (recommended to use `nvm`)
- **pnpm** - Version 10.0.0 or higher (`npm install -g pnpm`)
- **Git** - Latest stable version
- **Anthropic API Key** - For Claude SDK integration

### Setup Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/almondcoder.git
   cd almondcoder
   ```

3. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/almondcoder/almondcoder.git
   ```

4. **Install dependencies**
   ```bash
   pnpm install
   ```

5. **Start development server**
   ```bash
   pnpm dev
   ```

The application should now be running in development mode with hot reload enabled.

## 🔄 Development Workflow

### Branching Strategy

We follow a feature branch workflow:

1. **Create a feature branch** from `main`
   ```bash
   git checkout main
   git pull upstream main
   git checkout -b feature/your-feature-name
   ```

2. **Branch naming conventions:**
   - `feature/` - New features (e.g., `feature/terminal-improvements`)
   - `fix/` - Bug fixes (e.g., `fix/worktree-cleanup`)
   - `docs/` - Documentation updates (e.g., `docs/update-readme`)
   - `refactor/` - Code refactoring (e.g., `refactor/ipc-handlers`)
   - `test/` - Test additions/modifications (e.g., `test/claude-sdk`)

### Making Changes

1. **Make your changes** in your feature branch

2. **Follow code style guidelines** (see below)

3. **Test your changes** thoroughly

4. **Commit your changes** with clear, descriptive messages
   ```bash
   git add .
   git commit -m "feat: add terminal color scheme customization"
   ```

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, missing semicolons, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Examples:**
```
feat: add git branch graph visualization
fix: resolve worktree cleanup on Windows
docs: update installation instructions
refactor: simplify IPC handler logic
```

## 🔍 Pull Request Process

### Before Submitting

1. **Sync with upstream**
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run linter and fix issues**
   ```bash
   pnpm lint:fix
   ```

3. **Test the build**
   ```bash
   pnpm prebuild
   ```

4. **Push to your fork**
   ```bash
   git push origin your-feature-branch
   ```

### Submitting the PR

1. Go to the [AlmondCoder repository](https://github.com/almondcoder/almondcoder)
2. Click "New Pull Request"
3. Select your fork and branch
4. Fill out the PR template with:
   - **Clear title** following commit conventions
   - **Description** of changes
   - **Related issues** (if applicable)
   - **Screenshots** (for UI changes)
   - **Testing steps**

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Update documentation for user-facing changes
- Add tests if applicable
- Ensure all CI checks pass
- Respond to review feedback promptly
- Keep PR commits clean (squash if needed)

## 🎨 Code Style Guidelines

### TypeScript

We use [Biome](https://biomejs.dev/) for linting and formatting:

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

**Key conventions:**
- Use **TypeScript** for all new code
- Prefer **functional components** with hooks
- Use **explicit types** over `any`
- Follow **camelCase** for variables/functions
- Follow **PascalCase** for components/classes
- Use **async/await** over promise chains

### React Components

```typescript
// Good
interface ButtonProps {
  label: string;
  onClick: () => void;
}

export function Button({ label, onClick }: ButtonProps) {
  return <button onClick={onClick}>{label}</button>;
}

// Avoid
export default function Button(props: any) { ... }
```

### IPC Communication

When adding new IPC channels:

1. Define types in `src/shared/types.ts`
2. Add handler in `src/main/index.ts`
3. Expose via `src/preload/index.ts`
4. Use typed IPC calls in renderer

## 🏗️ Project Structure

Understanding the architecture:

### Electron Process Architecture

```
src/
├── main/                  # Main process (Node.js)
│   ├── index.ts          # IPC handlers, Git operations
│   └── claude-sdk.ts     # Claude SDK integration
├── preload/               # Preload scripts
│   └── index.ts          # IPC bridge (contextBridge)
└── renderer/              # Renderer process (React)
    ├── index.tsx         # Entry point
    ├── screens/          # Main screens
    │   ├── main.tsx      # Project selection
    │   └── workspace.tsx # Main workspace
    └── components/        # Reusable components
        ├── Prompts.tsx   # AI conversation UI
        ├── Terminal.tsx  # Terminal emulation
        ├── Overview.tsx  # Git branch visualization
        └── DiffView.tsx  # Diff viewer
```

### Key Files

- `electron.vite.config.ts` - Build configuration
- `electron-builder.js` - Package configuration
- `CLAUDE.md` - Project documentation for Claude AI
- `biome.json` - Linter/formatter configuration

## 🧪 Testing

### Manual Testing

1. Test in development mode (`pnpm dev`)
2. Test production build (`pnpm preview`)
3. Test on multiple platforms (if possible)
4. Test with real Git repositories

### Testing Checklist

For significant changes, ensure:

- [ ] Application starts without errors
- [ ] All IPC communication works
- [ ] Git operations function correctly
- [ ] UI is responsive and accessible
- [ ] No console errors or warnings
- [ ] Memory leaks are addressed
- [ ] Works on target platforms

## 💬 Communication

### Getting Help

- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community discussion
- **Pull Request Comments** - Code-specific discussions

### Reporting Bugs

When reporting bugs, include:

1. **AlmondCoder version** (`Help > About`)
2. **Operating system** and version
3. **Steps to reproduce**
4. **Expected behavior**
5. **Actual behavior**
6. **Screenshots/logs** (if applicable)

### Suggesting Features

When suggesting features:

1. **Check existing issues** to avoid duplicates
2. **Explain the use case** clearly
3. **Describe the solution** you'd like
4. **Consider alternatives**
5. **Provide examples** or mockups

## 📝 Documentation

When updating documentation:

- Keep README.md user-focused
- Keep CLAUDE.md technical and comprehensive
- Document all public APIs
- Add JSDoc comments for complex functions
- Update changelog for user-facing changes

## 🎯 Good First Issues

Look for issues labeled `good first issue` or `help wanted` to get started!

## 🙏 Thank You

Your contributions make AlmondCoder better for everyone. Thank you for taking the time to contribute! 🌰

---

**Questions?** Open an issue or start a discussion on GitHub.
