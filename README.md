<div align="center">

 ![Image](https://avatars.githubusercontent.com/u/232196805?s=400&u=6401ccc6274b97becdcbe02f1bc88ba2b98bbe03&v=4) 
# AlmondCoder

### AI-powered coding assistant with Git integration

[![Version](https://img.shields.io/badge/version-0.1.2-blue.svg)](https://github.com/almondcoder/almondcoder/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)](https://github.com/almondcoder/almondcoder)

</div>

---

## 📖 Overview

**AlmondCoder** is an Electron-based desktop application that provides an AI-powered coding assistant interface with deep Git integration. It uses the Anthropic Claude Agent SDK to execute AI queries with real-time streaming, manages isolated development environments through Git worktrees, and provides a comprehensive workspace for collaborative coding with AI.

## ✨ Key Features

- 🤖 **Claude AI Integration** - Powered by Anthropic's Claude Agent SDK with streaming responses
- 🌳 **Git Worktree Management** - Isolated development environments for each AI conversation
- 🔀 **Branch Visualization** - Visual Git branch graph with merge capabilities
- 💬 **Conversation History** - Persistent conversation management with resumption support
- 🛡️ **Permission System** - Granular control over AI tool usage with manual approval
- 🖥️ **Embedded Terminal** - Full terminal emulation with ANSI escape code rendering
- 📊 **Visual Diff Viewer** - Side-by-side diff comparison for code changes
- 🎨 **Modern UI** - Clean, responsive interface built with React 19 and Tailwind CSS 4

## 🚀 Installation

### For End Users

Download the latest release for your platform:

- **macOS**: [AlmondCoder-0.1.2.dmg](https://github.com/almondcoder/almondcoder/releases)
- **Linux**: [AlmondCoder-0.1.2.AppImage](https://github.com/almondcoder/almondcoder/releases)
- **Windows**: [AlmondCoder-Setup-0.1.2.exe](https://github.com/almondcoder/almondcoder/releases)

### For Developers

#### Prerequisites

- Node.js (version in `.nvmrc`)
- pnpm 10.0.0 or higher
- Git

#### Setup

```bash
# Clone the repository
git clone https://github.com/almondcoder/almondcoder.git
cd almondcoder

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## 🛠️ Development

### Available Commands

```bash
# Development
pnpm dev              # Start in development mode with hot reload
pnpm preview          # Preview production build

# Building
pnpm prebuild         # Clean and compile for production
pnpm build            # Build distributable packages

# Code Quality
pnpm lint             # Check for issues using Biome
pnpm lint:fix         # Auto-fix issues with Biome

# Release
pnpm make:release     # Interactive release wizard
```

### Project Structure

```
src/
├── main/              # Electron main process
│   ├── index.ts      # Entry point, IPC handlers
│   └── claude-sdk.ts # Claude SDK integration
├── preload/           # Preload scripts (IPC bridge)
├── renderer/          # React UI
│   ├── components/   # UI components
│   └── screens/      # Main application screens
└── shared/            # Shared types and utilities
```

## 🏗️ Technology Stack

- **Electron 37.6.0** - Cross-platform desktop framework
- **React 19** - UI library with TypeScript
- **@anthropic-ai/claude-agent-sdk** - AI agent capabilities
- **node-pty** - Terminal emulation
- **Tailwind CSS 4** - Utility-first CSS framework
- **electron-vite** - Build tooling
- **pnpm** - Package manager

## 📦 Data Storage

AlmondCoder stores all data locally in `~/.almondcoder/`:

```
~/.almondcoder/
├── recent-projects.json              # Recent project list
└── <project-name>/
    ├── project-info.json            # Project metadata
    ├── prompts/                     # Prompt records
    │   └── conversations/           # Conversation histories
    └── <worktree-name>/            # Isolated worktree directories
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and workflow.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Anthropic Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- Inspired by modern AI coding assistants

---

<div align="center">

Made with 🌰 by the AlmondCoder Team

[Website](https://almondcoder.com) • [GitHub](https://github.com/almondcoder/almondcoder) • [Issues](https://github.com/almondcoder/almondcoder/issues)

</div>
