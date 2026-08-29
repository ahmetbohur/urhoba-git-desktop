import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Sözdizimi renklendirme.
 *
 * Shiki'nin hazır paketi (`shiki` kök girişi) 300'den fazla dilbilgisini
 * erişilebilir kıldığı için Vite hepsini ayrı parça olarak üretiyordu — 11 MB
 * ölü ağırlık. Bunun yerine yalnızca aşağıdaki dilleri açıkça listeliyoruz;
 * paketleyici de sadece bunları çıktıya koyuyor. Yeni bir dil istenirse tek
 * satır eklemek yeterli.
 *
 * Dilbilgileri ilk kullanıldıklarında yükleniyor; motor olarak WASM yerine
 * JavaScript regex motoru seçildi, böylece paketle birlikte bir .wasm dosyası
 * taşımak gerekmiyor.
 */

type LangModule = { default: unknown };

const LANGUAGES: Record<string, () => Promise<LangModule>> = {
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  javascript: () => import('@shikijs/langs/javascript'),
  jsx: () => import('@shikijs/langs/jsx'),
  json: () => import('@shikijs/langs/json'),
  css: () => import('@shikijs/langs/css'),
  scss: () => import('@shikijs/langs/scss'),
  html: () => import('@shikijs/langs/html'),
  markdown: () => import('@shikijs/langs/markdown'),
  python: () => import('@shikijs/langs/python'),
  ruby: () => import('@shikijs/langs/ruby'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  c: () => import('@shikijs/langs/c'),
  cpp: () => import('@shikijs/langs/cpp'),
  csharp: () => import('@shikijs/langs/csharp'),
  php: () => import('@shikijs/langs/php'),
  shell: () => import('@shikijs/langs/shellscript'),
  yaml: () => import('@shikijs/langs/yaml'),
  toml: () => import('@shikijs/langs/toml'),
  sql: () => import('@shikijs/langs/sql'),
  xml: () => import('@shikijs/langs/xml'),
  vue: () => import('@shikijs/langs/vue'),
  svelte: () => import('@shikijs/langs/svelte'),
  dockerfile: () => import('@shikijs/langs/docker'),
};

const EXTENSION_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  xml: 'xml',
  svg: 'xml',
  vue: 'vue',
  svelte: 'svelte',
};

export function languageForPath(filePath: string): string | null {
  const name = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (name === 'dockerfile') return 'dockerfile';
  const extension = name.includes('.') ? name.split('.').pop() : undefined;
  if (!extension) return null;
  const language = EXTENSION_TO_LANG[extension];
  return language && language in LANGUAGES ? language : null;
}

let corePromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!corePromise) {
    corePromise = Promise.all([
      import('@shikijs/themes/github-light'),
      import('@shikijs/themes/github-dark'),
    ]).then(([light, dark]) =>
      createHighlighterCore({
        themes: [light.default, dark.default],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      }),
    );
  }
  return corePromise;
}

export interface HighlightToken {
  content: string;
  color?: string;
}

/**
 * Verilen kodu satır satır renklendirilmiş token'lara böler.
 * Dönen dizinin uzunluğu girdideki satır sayısına eşittir.
 * Renklendirme başarısız olursa null döner ve diff düz metin gösterilir.
 */
export async function tokenizeLines(
  code: string,
  language: string,
  dark: boolean,
): Promise<HighlightToken[][] | null> {
  const loader = LANGUAGES[language];
  if (!loader) return null;
  try {
    const highlighter = await getHighlighter();
    if (!loadedLanguages.has(language)) {
      const module = await loader();
      await highlighter.loadLanguage(module.default as Parameters<HighlighterCore['loadLanguage']>[0]);
      loadedLanguages.add(language);
    }
    const result = highlighter.codeToTokens(code, {
      lang: language,
      theme: dark ? 'github-dark' : 'github-light',
    });
    return result.tokens.map((line) =>
      line.map((token) => ({ content: token.content, color: token.color })),
    );
  } catch {
    return null;
  }
}
