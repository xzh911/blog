import {
  transformerMetaHighlight,
  transformerMetaWordHighlight,
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight
} from '@shikijs/transformers'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const algoliaAppId = process.env.VITE_ALGOLIA_APP_ID || process.env.ALGOLIA_APP_ID
const algoliaApiKey =
  process.env.VITE_ALGOLIA_API_KEY || process.env.ALGOLIA_API_KEY
const algoliaIndexName =
  process.env.VITE_ALGOLIA_INDEX_NAME || process.env.ALGOLIA_INDEX_NAME

const search =
  algoliaAppId && algoliaApiKey && algoliaIndexName
    ? {
        provider: 'algolia',
        options: {
          appId: algoliaAppId,
          apiKey: algoliaApiKey,
          indexName: algoliaIndexName
        }
      }
    : {
        provider: 'local'
      }

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const logsDir = resolve(rootDir, 'logs')

function extractTitle(markdown, fallback) {
  if (markdown.startsWith('---')) {
    const end = markdown.indexOf('\n---', 3)
    if (end !== -1) {
      const frontmatter = markdown.slice(0, end)
      const fromFrontmatter = frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.trim()
      if (fromFrontmatter) return fromFrontmatter
    }
  }

  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) return heading
  return fallback
}

function extractFrontmatterDate(markdown) {
  if (!markdown.startsWith('---')) return null
  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return null
  const frontmatter = markdown.slice(0, end)
  const dateRaw = frontmatter.match(/^date:\s*(.+)$/m)?.[1]?.trim()
  if (!dateRaw) return null
  const parsedDate = new Date(dateRaw)
  if (Number.isNaN(parsedDate.getTime())) return null
  return parsedDate
}

function getLogsSidebarItems() {
  return readdirSync(logsDir)
    .filter((name) => name.endsWith('.md') && name !== 'index.md')
    .map((fileName) => {
      const filePath = resolve(logsDir, fileName)
      const markdown = readFileSync(filePath, 'utf8')
      const slug = fileName.replace(/\.md$/, '')
      const fallback = slug.replace(/-/g, ' ')
      const parsedDate = extractFrontmatterDate(markdown)
      const sortTime =
        parsedDate ? parsedDate.getTime() : statSync(filePath).mtime.getTime()

      return {
        text: extractTitle(markdown, fallback),
        link: `/logs/${slug}`,
        sortTime
      }
    })
    .sort((a, b) => b.sortTime - a.sortTime || a.text.localeCompare(b.text, 'zh-Hans-CN'))
    .map(({ text, link }) => ({ text, link }))
}

const logsSidebarItems = [{ text: '日志总览', link: '/logs/' }, ...getLogsSidebarItems()]

export default {
  lang: 'zh-CN',
  base: '/',
  title: 'DevOps Notes',
  description: 'DevOps / Linux / Kubernetes learning notes',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#0f766e' }]
  ],
  markdown: {
    lineNumbers: true,
    theme: {
      light: 'github-light',
      dark: 'github-dark'
    },
    codeTransformers: [
      transformerNotationDiff({ matchAlgorithm: 'v3' }),
      transformerNotationHighlight({ matchAlgorithm: 'v3' }),
      transformerNotationFocus({ matchAlgorithm: 'v3' }),
      transformerMetaHighlight(),
      transformerMetaWordHighlight()
    ]
  },

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '首页', link: '/' },
      { text: 'Guide', link: '/guide' }
    ],
    sidebar: {
      '/': [
        {
          text: '概览',
          items: [
            { text: '首页', link: '/' },
            { text: 'Guide', link: '/guide' }
          ]
        },
        {
          text: '技术日志',
          items: logsSidebarItems
        }
      ],
      '/guide': [
        {
          text: 'Guide',
          items: [
            { text: '文档范围', link: '/guide#文档范围' },
            { text: '内容分层', link: '/guide#建议的内容分层' },
            { text: '写作方式', link: '/guide#推荐写作方式' }
          ]
        }
      ],
      '/logs/': [
        {
          text: '技术日志',
          items: logsSidebarItems
        }
      ]
    },
    outline: {
      level: [2, 3],
      label: '本页内容'
    },
    docFooter: {
      prev: '上一页',
      next: '下一页'
    },
    socialLinks: [],
    footer: {
      message: 'Focused notes for DevOps, Linux and Kubernetes.',
      copyright: 'Copyright © 2026 DevOps Notes'
    },
    search
  }
}
