// Gera index.html autónomo (JS + CSS embutidos) que funciona aberto por duplo clique (file://).
// Uso: node tools/build.mjs   (requer esbuild)
import { build } from 'esbuild';
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const r = await build({ entryPoints: [root + 'js/main.js'], bundle: true, format: 'esm', write: false, minify: true,
  external: ['three', 'three/addons/*'], target: 'es2020', legalComments: 'none', nodePaths: [root + 'tools/node_modules'] });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(root + 'css/style.css', 'utf8');
let html = fs.readFileSync(root + 'index-dev.html', 'utf8');
html = html.replace(/<link[^>]*href="css\/style.css"[^>]*>/, () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script type="module">\n${js}\n</script>`);
fs.writeFileSync(root + 'index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
