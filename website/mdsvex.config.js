import remarkGithub from 'remark-github';
import remarkAbbr from 'remark-abbr';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { defineMDSveXConfig as defineConfig, escapeSvelte } from 'mdsvex';
import { createHighlighter } from 'shiki';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';
import {
  transformerNotationHighlight,
  transformerNotationDiff,
  transformerNotationWordHighlight,
  transformerMetaHighlight,
  transformerMetaWordHighlight,
} from '@shikijs/transformers';

import rehypeCallouts from 'rehype-callouts';
import rehypeLinkProcessor from 'rehype-link-processor';
import remarkCodeTitles from "remark-flexible-code-titles";

// Custom transformer for automatic code block scrolling
const autoScrollTransformer = {
  name: 'auto-scroll-code-blocks',
  pre(node) {
    // Add CSS classes for automatic scrolling behavior
    const existingClasses = node.properties.className || [];
    node.properties.className = [
      ...existingClasses,
      'auto-scroll-code',
      'scroll-both' // Enable both horizontal and vertical scrolling
    ];
    
    // Add data attributes for enhanced styling control
    node.properties['data-auto-scroll'] = 'true';
    
    // Ensure proper styling attributes are set
    if (!node.properties.style) {
      node.properties.style = '';
    }
  },
  code(node) {
    // Ensure code elements within pre blocks have proper classes
    const existingClasses = node.properties.className || [];
    if (!existingClasses.includes('auto-scroll-content')) {
      node.properties.className = [
        ...existingClasses,
        'auto-scroll-content'
      ];
    }
  }
};

const theme = ['vitesse-dark', 'vitesse-light'];

// const myTheme = createCssVariablesTheme({
// 	name: 'css-variables',
// 	variablePrefix: '--shiki-',
// 	variableDefaults: {},
// 	fontStyle: true
//   })

const highlighter = await createHighlighter({
  themes: theme,
  langs: ['shellsession', 'typescript', 'javascript', 'csv', 'diff', 'json', 'yaml', 'md'],
});

const config = defineConfig({
  extensions: ['.svelte.md', '.md', '.svx'],

  smartypants: {
    dashes: 'oldschool',
  },
  highlight: {
    highlighter: async (code, lang = 'text', meta) => {
      const html = escapeSvelte(
        highlighter.codeToHtml(code, {
          lang,
          meta: { __raw: meta },
          themes: {
            light: 'vitesse-light',
            dark: 'vitesse-dark',
          },
          transformers: [
            autoScrollTransformer, // Add our custom transformer first
            transformerColorizedBrackets({
              themes: {
                nord: ['goldenrod', 'blueviolet', 'dodgerblue', 'crimson'],
              },
            }),
            transformerNotationHighlight(),
            transformerNotationDiff(),
            transformerNotationWordHighlight(),
            transformerMetaHighlight(),
            transformerMetaWordHighlight(),
            {
              name: 'custom-copy-button',
              pre(node) {
                const btn = {
                  type: 'element',
                  tagName: 'button',
                  properties: {
                    className: ['copy'],
                    onclick: `
(function(btn){
  var text = btn.parentElement.innerText;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  btn.classList.add('copied');
  setTimeout(function(){ btn.classList.remove('copied'); }, 2000);
})(this);
return false;`
                  },
                  children: [
                    { type: 'element', tagName: 'span', properties: { className: ['ready'] }, children: [] },
                    { type: 'element', tagName: 'span', properties: { className: ['success'] }, children: [] }
                  ]
                };
                node.children.push(btn);
              }
            },
          ],
        })
      );
      return `{@html \`${html}\` }`;
    },
  },
  remarkPlugins: [remarkAbbr, remarkCodeTitles],
  rehypePlugins: [
    rehypeCallouts,
    rehypeLinkProcessor({
      rules: [
        'external', // <-- enable the external link rule
      ],
    }),
  ],
});

export default config;


