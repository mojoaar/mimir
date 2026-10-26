import { Prism } from 'prism-react-renderer'

/**
 * prism-react-renderer bundles a small language set (json, markup, css, sql…)
 * and no shell. prismjs registers a language onto a global Prism instance, so
 * that instance has to be put there before the extra language is imported.
 */
;(globalThis as unknown as { Prism: typeof Prism }).Prism = Prism
