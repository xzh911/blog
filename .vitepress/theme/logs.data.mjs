import { createContentLoader } from 'vitepress'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function stripFrontmatter(source) {
  if (!source.startsWith('---')) return source
  const end = source.indexOf('\n---', 3)
  if (end === -1) return source
  return source.slice(end + 4)
}

function firstHeading(source) {
  return source.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
}

function firstParagraph(source) {
  const body = stripFrontmatter(source)
    .replace(/^#.+$/m, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line !== '---' &&
        !line.startsWith('#') &&
        !line.startsWith('```') &&
        !line.startsWith(':::')
    )

  return body[0] || '暂无摘要'
}

function guessCategory(title) {
  const name = title.toLowerCase()
  if (name.includes('kubernetes') || name.includes('k8s')) return 'Kubernetes'
  if (name.includes('docker')) return 'Container'
  if (name.includes('nginx') || name.includes('tls')) return 'Gateway'
  if (name.includes('ingress')) return 'Ingress'
  if (name.includes('cicd') || name.includes('ci/cd') || name.includes('发布')) return 'Release'
  if (name.includes('监控') || name.includes('告警')) return 'Observability'
  if (name.includes('apt') || name.includes('tailscale') || name.includes('网络')) return 'Network'
  if (name.includes('linux')) return 'Linux'
  return 'Log'
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default createContentLoader('logs/*.md', {
  render: false,
  transform(raw) {
    const logs = raw
      .filter((entry) => entry.url !== '/logs/')
      .map((entry) => {
        const slug = entry.url.replace(/^\/logs\//, '')
        const filePath = resolve(rootDir, 'logs', `${slug}.md`)
        const fileDate = statSync(filePath).mtime
        const pickedDate = parseDate(entry.frontmatter.date) || fileDate
        const title = entry.frontmatter.title || firstHeading(entry.src) || slug.replace(/-/g, ' ')

        return {
          url: entry.url,
          title,
          description: entry.frontmatter.description || firstParagraph(entry.src),
          category: entry.frontmatter.category || guessCategory(title),
          date: pickedDate.toISOString(),
          dateText: formatDate(pickedDate),
          sortTime: pickedDate.getTime()
        }
      })
      .sort((a, b) => b.sortTime - a.sortTime || a.title.localeCompare(b.title, 'zh-Hans-CN'))

    return logs
  }
})
