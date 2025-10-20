/**
 * Language Detection Utility
 *
 * Detects programming language from file path/extension
 * for syntax highlighting purposes.
 */

const languageMap: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  mjs: 'javascript',
  cjs: 'javascript',

  // Python
  py: 'python',
  pyw: 'python',
  pyx: 'python',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Config/Data
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',

  // Programming Languages
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  r: 'r',
  lua: 'lua',
  perl: 'perl',
  pl: 'perl',
  dart: 'dart',
  elm: 'elm',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  hs: 'haskell',
  lhs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  fs: 'fsharp',
  fsx: 'fsharp',
  fsi: 'fsharp',

  // Markup
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  tex: 'latex',
  rst: 'restructuredtext',

  // Database
  sql: 'sql',
  pgsql: 'sql',
  mysql: 'sql',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',

  // Docker
  dockerfile: 'docker',

  // Additional formats
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'bash',
  properties: 'properties',
  gitignore: 'text',
  txt: 'text',
  log: 'text',

  // Build tools
  makefile: 'makefile',
  mk: 'makefile',
  cmake: 'cmake',

  // Other
  diff: 'diff',
  patch: 'diff',
  vim: 'vim',
}

/**
 * Detects programming language from file path
 * @param filePath - The file path to analyze
 * @returns The detected language identifier for syntax highlighting
 */
export function detectLanguageFromPath(filePath: string): string {
  if (!filePath) return 'text'

  // Extract filename and extension
  const fileName = filePath.split('/').pop()?.toLowerCase() || ''
  const extension = fileName.split('.').pop()?.toLowerCase()

  // Check for specific filenames first (e.g., Dockerfile, Makefile)
  if (fileName === 'dockerfile' || fileName.startsWith('dockerfile.')) {
    return 'docker'
  }
  if (fileName === 'makefile' || fileName === 'gnumakefile') {
    return 'makefile'
  }
  if (fileName === 'cmakelists.txt') {
    return 'cmake'
  }

  // Fall back to extension mapping
  return languageMap[extension || ''] || 'text'
}
