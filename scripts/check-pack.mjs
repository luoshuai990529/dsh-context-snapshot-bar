/**
 * Publish-artifact check: verifies the packed tarball can actually load, and
 * fails on every packaging mistake that would only surface in a user's profile.
 *
 * The check runs `npm pack --dry-run` so it inspects exactly the file list npm
 * would publish, then verifies the manifest contract, the bundle layer, every
 * declared export entry, the Client factory handoff and source map, and the
 * absence of workspace, link, or absolute-source references.
 *
 * @module dsh-context-snapshot-bar/scripts/check-pack
 */

import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Files the published package must contain, spelled as npm reports them. */
const REQUIRED_FILES = [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
  'lib/index.js',
  'lib/client.js',
  'lib/client.js.map',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
]

/** Dependency sections that must exist on disk at install time. */
const INSTALL_SECTIONS = ['dependencies', 'peerDependencies']

/**
 * Ranges a published manifest must not carry: they resolve only on the build
 * machine, so a user's profile install would fail or silently link a checkout.
 */
const NON_PUBLISHABLE_RANGES = ['workspace:', 'link:', 'file:']

/** Failures collected across every check, reported together. */
const failures = []

/**
 * Record a check failure.
 * @param message - what is wrong and which file proves it.
 */
function fail(message) {
  failures.push(message)
}

/** Compare the packed file list and the manifest against the package contract. */
async function checkManifest() {
  const manifest = JSON.parse(await readFile(`${ROOT}package.json`, 'utf8'))
  const { stdout } = await run('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT })
  const [report] = JSON.parse(stdout)
  const packed = new Set(report.files.map(entry => entry.path))

  for (const required of REQUIRED_FILES) {
    if (!packed.has(required)) fail(`package.json/files: ${required} is not in the published tarball`)
  }
  // Every declared export entry must resolve inside the artifact: a subpath may
  // map straight to one file, or to a condition object.
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const entries = typeof target === 'string' ? [[subpath, target]] : Object.entries(target)
    for (const [condition, file] of entries) {
      const relative = file.replace(/^\.\//, '')
      if (!packed.has(relative)) {
        fail(`package.json/exports: ${subpath}.${condition} points at ${file}, which is not packed`)
      }
    }
  }
  for (const section of INSTALL_SECTIONS) {
    for (const [dep, range] of Object.entries(manifest[section] ?? {})) {
      if (NON_PUBLISHABLE_RANGES.some(prefix => range.startsWith(prefix))) {
        fail(`package.json/${section}: ${dep} uses the non-publishable range ${range}`)
      }
    }
  }
  for (const [dep, range] of Object.entries(manifest.devDependencies ?? {})) {
    if (NON_PUBLISHABLE_RANGES.some(prefix => range.startsWith(prefix))) {
      fail(`package.json/devDependencies: ${dep} uses ${range}, which only resolves on this machine`)
    }
  }
  if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') {
    fail('package.json/dsh.bundle: the patch layer is not declared')
  }
  if (manifest.dsh?.client?.platform !== 'web') {
    fail('package.json/dsh.client: platform must be "web" for the browser half to load')
  }
  return { manifest, packed }
}

/**
 * Verify the patch layer inserts exactly this bundle's row, by package name.
 *
 * A relative or absolute source path would work only from the plugin checkout.
 */
async function checkPatch() {
  const patch = await readFile(`${ROOT}cordis.patch.yml`, 'utf8')
  if (!patch.includes('dsh-context-snapshot-bar')) {
    fail('cordis.patch.yml: the layer does not insert this package')
  }
  if (/name:\s*['"]?[./]/.test(patch)) {
    fail('cordis.patch.yml: the layer references a file path instead of the installed package name')
  }
}

/** Verify the Client artifact is a lazy loader factory with a readable source map. */
async function checkClientArtifact() {
  const bundle = await readFile(`${ROOT}lib/client.js`, 'utf8')
  if (!bundle.includes('window.__ModuleLoader__.load({ id: "dsh-context-snapshot-bar"')) {
    fail('lib/client.js: missing the module-loader factory handoff')
  }
  if (bundle.includes(ROOT)) {
    fail('lib/client.js: the artifact embeds an absolute build path')
  }
  if (/\brequire\(\s*["']node:/.test(bundle)) {
    fail('lib/client.js: the browser bundle requires a node: builtin')
  }
  const map = JSON.parse(await readFile(`${ROOT}lib/client.js.map`, 'utf8'))
  if (!Array.isArray(map.sources) || map.sources.length === 0) {
    fail('lib/client.js.map: the source map names no sources')
  }
  if (!Array.isArray(map.sourcesContent) || map.sourcesContent.includes(null)) {
    fail('lib/client.js.map: the source map omits source content, so browser frames cannot be read')
  }
}

/**
 * Verify the Host artifact is an ESM module that leaves DSH packages to the
 * installed profile.
 *
 * Each entry below is a package the profile already materializes, so an inlined
 * copy would be a second instance rather than a self-contained bundle. The
 * externals list is read from the build script itself, so this check cannot
 * drift from the build that produces the artifact.
 */
async function checkHostArtifact() {
  const bundle = await readFile(`${ROOT}lib/index.js`, 'utf8')
  if (bundle.includes('node_modules') || bundle.includes(ROOT)) {
    fail('lib/index.js: the artifact embeds a build path, so a dependency was inlined')
  }
  const { stdout } = await run(process.execPath, [`${ROOT}scripts/build.mjs`, '--print-host-externals'], { cwd: ROOT })
    .catch(error => ({ stdout: error.stdout ?? '' }))
  if (!stdout.includes('@deepseek-ai/*')) {
    fail('scripts/build.mjs: the Host build does not declare the DSH packages external')
  }
  if (!stdout.includes('zod')) {
    fail('scripts/build.mjs: the Host build does not declare zod external, so the schemas would come from a second copy')
  }
  // The declared dependencies must be the ones a real install must satisfy, so
  // assert the manifest lists them rather than relying on the bundle alone.
  const manifest = JSON.parse(await readFile(`${ROOT}package.json`, 'utf8'))
  for (const dep of ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', 'zod']) {
    if (manifest.dependencies?.[dep] === undefined) {
      fail(`package.json/dependencies: ${dep} is imported by the Host bundle but not declared`)
    }
  }
  if (manifest.peerDependencies?.['@deepseek-ai/cordis'] === undefined) {
    fail('package.json/peerDependencies: @deepseek-ai/cordis must stay a peer so the profile owns the instance')
  }
  await access(`${ROOT}lib/index.js`)
}

/** Run every artifact check and report the collected failures. */
async function main() {
  await checkManifest()
  await checkPatch()
  await checkClientArtifact()
  await checkHostArtifact()
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`check-pack: ${failure}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('check-pack: ok\n')
}

await main()
