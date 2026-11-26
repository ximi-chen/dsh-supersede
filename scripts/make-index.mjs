#!/usr/bin/env node
/**
 * Generate the format-1 plugin market index for this repository.
 *
 * Run it after the release commit exists and before committing the generated
 * `plugin-index.json`: the index is a separate commit that points at the
 * release commit's SHA (a commit cannot contain a URL that points at itself).
 *
 *   node scripts/make-index.mjs
 *   node scripts/make-index.mjs --commit <sha> --timestamp <unix-seconds>
 *
 * The generated document is what DSH's Discover tab reads when a user adds
 * this repository's raw `plugin-index.json` as an index source.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const sha = arg('--commit') ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
if (!/^[0-9a-f]{40}$/u.test(sha)) {
  console.error(`make-index: not a 40-hex commit SHA: ${JSON.stringify(sha)}`)
  process.exit(1)
}

const timestampArg = arg('--timestamp')
const timestamp = timestampArg === undefined
  ? Number(execFileSync('git', ['log', '-1', '--format=%ct', sha], { cwd: ROOT, encoding: 'utf8' }).trim())
  : Number(timestampArg)
if (!Number.isInteger(timestamp) || timestamp < 0) {
  console.error(`make-index: publishTimestamp must be integer Unix seconds, got ${JSON.stringify(timestampArg)}`)
  process.exit(1)
}

if (arg('--commit') === undefined) {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()
  if (dirty !== '') {
    console.warn('make-index: working tree is dirty; the index will point at HEAD, not at these changes.')
  }
}

const semver = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
if (!semver.test(pkg.version)) {
  console.error(`make-index: package.json version must be an exact SemVer version: ${JSON.stringify(pkg.version)}`)
  process.exit(1)
}

const engineRange = typeof pkg.engines?.dsh === 'string' ? pkg.engines.dsh : '>=0.2.2-rc.5 <0.3.0-0'

const iconPath = join(ROOT, 'icon.png')
const iconMime = 'image/png'
const iconBytes = statSync(iconPath).size
if (iconBytes > 32 * 1024) {
  console.error(`make-index: icon.png is ${iconBytes} bytes; the market index allows 32 KiB of decoded icon data`)
  process.exit(1)
}
const icon = `data:${iconMime};base64,${readFileSync(iconPath).toString('base64')}`

const repo = 'https://github.com/ximi-chen/dsh-supersede'
const title = { en: 'Supersede', zh: '接替' }
const description = {
  en: 'Per-session Supersede switch for the composer: a message sent while a turn runs cancels that turn and opens the next one with it. Idle sends run normally; Busy Enter must be queue.',
  zh: '输入框工具行左侧的按会话「接替」开关：运行中发送消息会中止当前轮，并由这条消息开启下一轮；空闲发送不受影响，需要忙碌回车为「排队」。',
}

const index = {
  format: 1,
  title: { en: 'dsh-supersede', zh: '接替' },
  description: {
    en: 'A per-session Supersede switch for the DeepSeek Harness composer.',
    zh: 'DeepSeek Harness 输入框的按会话「接替」开关。',
  },
  metadata: {},
  plugins: [
    {
      name: pkg.name,
      title,
      description,
      icon,
      author: typeof pkg.author === 'string' ? pkg.author : 'ximi-chen',
      homepage: pkg.homepage,
      repository: { url: repo },
      metadata: { keywords: pkg.keywords ?? [] },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: timestamp,
          source: { type: 'git', url: repo, commit: sha },
          engines: { dsh: engineRange },
        },
      ],
    },
  ],
}

const out = join(ROOT, 'plugin-index.json')
writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`)
console.log(`make-index: ${pkg.name}@${pkg.version} -> ${out}`)
console.log(`make-index: source commit ${sha}, publishTimestamp ${timestamp}`)
