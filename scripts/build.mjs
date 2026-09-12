/**
 * Independent production build for the snapshot bar bundle.
 *
 * The plugin is built outside the harness monorepo, so this script owns both
 * faces instead of calling a repository build helper:
 *
 * - Host: ESM for Node, with every `@deepseek-ai/*` runtime package left as an
 *   import so the installed profile materializes exactly one Cordis instance.
 * - Client: one CommonJS browser bundle wrapped in the loader's closure-factory
 *   protocol, with the shared module table (React, Cordis, the slot and locale
 *   packages) requested through the injected `require` and everything else
 *   inlined.
 *
 * Declarations are emitted by the `tsc` project in `tsconfig.build.json`, which
 * runs before this script; the bundling step therefore removes only the two
 * JavaScript artifacts it owns.
 *
 * @module dsh-context-snapshot-bar/scripts/build
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIB = fileURLToPath(new URL('../lib', import.meta.url))
const ENTRY_BANNER = fileURLToPath(new URL('./client-entry.banner.js', import.meta.url))

/** The bundle id the loader registers and the browser boot graph names. */
const CLIENT_ID = 'dsh-context-snapshot-bar'

/**
 * Host specifiers left to the installed profile: every DSH package, so the
 * profile materializes exactly one Cordis instance and one session library.
 */
const HOST_EXTERNALS = ['@deepseek-ai/*', 'zod']

/**
 * Specifiers the browser resolves through the loader's module table: the
 * platform baseline plus the package rows this bundle declares in
 * `dsh.client.inject`. Every other import is inlined.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-session/client',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
]

/** The loader handoff the emitted bundle must open with. */
const CLIENT_BANNER = `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`
/** The loader handoff the emitted bundle must close with. */
const CLIENT_FOOTER = 'return module.exports; } });'

/**
 * Build the Host half: ESM, Node platform, every DSH package external.
 * @returns the emitted artifact path.
 */
async function buildHost() {
  const outfile = `${LIB}/index.js`
  await build({
    entryPoints: [`${ROOT}src/index.ts`],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    external: HOST_EXTERNALS,
  })
  return outfile
}

/**
 * Build the Client half: the loader closure factory plus its source map.
 * @returns the emitted artifact path.
 */
async function buildClient() {
  const outfile = `${LIB}/client.js`
  const bannerText = await readFile(ENTRY_BANNER, 'utf8')
  await build({
    entryPoints: [`${ROOT}src/client/index.tsx`],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    sourcesContent: true,
    legalComments: 'none',
    logLevel: 'warning',
    banner: { js: bannerText.trimEnd() },
    footer: { js: CLIENT_FOOTER },
    external: CLIENT_EXTERNALS,
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env': '{"MODE":"production"}',
    },
    // Automatic runtime: the emitted bundle calls the shared `react/jsx-runtime`
    // row instead of reaching for a `React` global the loader never provides.
    jsx: 'automatic',
    supported: { 'top-level-await': false },
    loader: { '.css': 'empty' },
  })
  return outfile
}

/**
 * Verify the emitted Client bundle carries the loader handoff the browser expects.
 * @param outfile - the emitted bundle path.
 */
async function assertClientHandoff(outfile) {
  const source = await readFile(outfile, 'utf8')
  if (!source.startsWith(CLIENT_BANNER)) {
    throw new Error(`${outfile}: missing the __ModuleLoader__ banner for ${CLIENT_ID}`)
  }
  // The source-map comment esbuild appends is the only line allowed after the footer.
  const body = source.trimEnd().replace(/\n\/\/# sourceMappingURL=.*$/u, '')
  if (!body.endsWith(CLIENT_FOOTER)) {
    throw new Error(`${outfile}: missing the __ModuleLoader__ factory footer`)
  }
  if (/\brequire\(\s*["']node:/.test(source)) {
    throw new Error(`${outfile}: browser bundle must not require node: builtins`)
  }
}

/**
 * Report the Host build's external declaration, so the packaging check reads
 * the same list the build uses instead of keeping a second copy of it.
 */
function printHostExternals() {
  process.stdout.write(`${HOST_EXTERNALS.join(' ')}\n`)
}

/** Build both halves of the bundle into `lib/`, keeping the emitted declarations. */
async function main() {
  await rm(`${LIB}/index.js`, { force: true })
  await rm(`${LIB}/client.js`, { force: true })
  await rm(`${LIB}/client.js.map`, { force: true })
  await mkdir(LIB, { recursive: true })
  const host = await buildHost()
  const client = await buildClient()
  await assertClientHandoff(client)
  await writeFile(
    `${LIB}/BUILD-INFO.json`,
    `${JSON.stringify({ host, client, clientId: CLIENT_ID, builtAt: new Date().toISOString() }, null, 2)}\n`,
  )
  process.stdout.write(`built ${host} and ${client}\n`)
}

if (process.argv.includes('--print-host-externals')) printHostExternals()
else await main()
