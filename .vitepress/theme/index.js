import DefaultTheme from 'vitepress/theme'
import { inBrowser } from 'vitepress'
import mermaid from 'mermaid'
import './custom.css'

let mermaidReady = false

async function renderMermaidDiagrams() {
  if (!inBrowser) return

  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral'
    })
    mermaidReady = true
  }

  const blocks = document.querySelectorAll('.vp-doc div.language-mermaid')
  for (const block of blocks) {
    if (block.dataset.mermaidConverted === 'true') continue
    const code = block.querySelector('code')
    if (!code) continue

    const source = code.textContent?.trim()
    if (!source) continue

    const mermaidContainer = document.createElement('pre')
    mermaidContainer.className = 'mermaid'
    mermaidContainer.textContent = source
    block.replaceChildren(mermaidContainer)
    block.dataset.mermaidConverted = 'true'
  }

  await mermaid.run({
    querySelector: '.vp-doc pre.mermaid:not([data-processed="true"])'
  })
}

export default {
  ...DefaultTheme,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx)
    if (!inBrowser) return

    const previousHook = ctx.router.onAfterRouteChanged
    ctx.router.onAfterRouteChanged = async (...args) => {
      await previousHook?.(...args)
      await renderMermaidDiagrams()
    }

    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          void renderMermaidDiagrams()
        },
        { once: true }
      )
      return
    }

    void renderMermaidDiagrams()
  }
}
