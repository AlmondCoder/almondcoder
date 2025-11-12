/** @type {import('electron-builder').Configuration} */
const { resolve, dirname } = require('node:path')
const pkg = require('./package.json')

const author = pkg.author?.name ?? pkg.author
const currentYear = new Date().getFullYear()
const authorInKebabCase = author.replace(/\s+/g, '-')
const appId = `com.${authorInKebabCase}.${pkg.name}`.toLowerCase()

const artifactName = `${pkg.name}-v${pkg.version}-\${os}.\${ext}`

function getDevFolder(path) {
  // path is like "./node_modules/.dev/main/index.js"
  // dirname gives us "./node_modules/.dev/main"
  // We want "node_modules/.dev"
  const dir = dirname(path)
  const parts = dir.replace(/^\.\//, '').split(/\/|\\/)
  const nodeModules = parts[0]
  const devFolder = parts[1]
  return [nodeModules, devFolder].join('/')
}

// Only use identity if not in CI or if explicitly enabled
const macIdentity = process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
  ? null
  : 'Vaibhav Maheshwari (5A3Y32DLL4)'

const config = {
  appId,
  productName: pkg.displayName,
  copyright: `Copyright © ${currentYear} — ${author}`,

  directories: {
    app: getDevFolder(pkg.main),
    output: `dist/v${pkg.version}`,
  },

  // Disable ASAR packaging to allow Claude SDK CLI execution
  // ASAR archives don't support executing binaries/scripts directly
  // This ensures the SDK can spawn its CLI process correctly
  asar: false,

  files: [
    '**/*',
    '!**/node_modules/@anthropic-ai/claude-agent-sdk/vendor/claude-code-jetbrains-plugin/**/*',
  ],

  publish: {
    provider: 'github',
    owner: 'AlmondCoder',
    repo: 'almondcoder',
  },

  mac: {
    artifactName,
    icon: `${pkg.resources}/build/icons/icon.icns`,
    category: 'public.app-category.utilities',
    target: ['zip', 'dmg', 'dir'],
    entitlements: `${pkg.resources}/build/entitlements.mac.plist`,
    entitlementsInherit: `${pkg.resources}/build/entitlements.mac.plist`,
    gatekeeperAssess: false,
    hardenedRuntime: true,
    ...(macIdentity && { identity: macIdentity }),
    notarize: !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD),
    signIgnore: [
      // Don't sign Java JAR files - they use their own signing mechanism
      '\\.jar$',
    ],
  },

  linux: {
    artifactName,
    category: 'Utilities',
    synopsis: pkg.description,
    target: ['AppImage', 'deb', 'pacman', 'freebsd', 'rpm'],
  },

  win: {
    artifactName,
    icon: `${pkg.resources}/build/icons/icon.ico`,
    target: ['zip', 'portable'],
  },
}

module.exports = config
