import ChildProcess from 'child_process';
import Crypto from 'crypto';
import Path from 'path';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import FSE from 'fs-extra';
import {rollup} from 'rollup';
// @ts-expect-error
import type {PluginOption} from 'vite';

import type {
  Identifier,
  ImportDeclaration,
  Program,
  SimpleCallExpression,
  // eslint-disable-next-line @mufan/reference-missing-proof
} from 'estree';

const DIWU_IMPORT_REG = new RegExp(`('|")${'diwu'}('|")`);

export interface DiwuServerOptions {
  /**
   * default: <root>/dist
   */
  outDir?: string;
}

/**
 * node 逻辑转换
 */
export function diwuServer({
  outDir = 'dist',
}: DiwuServerOptions = {}): PluginOption {
  const diwuCachePath = Path.join(process.cwd(), 'node_modules/.diwu');

  FSE.ensureDirSync(diwuCachePath);

  return {
    name: 'vite-plugin-diwu-server',
    async transform(code, id) {
      if (id.includes('node_modules') || !DIWU_IMPORT_REG.test(code)) {
        return;
      }

      const acornNode = this.parse(code) as unknown as Program;

      if (acornNode.type !== 'Program' || !acornNode.body?.length) {
        return;
      }

      const diwuImport = acornNode.body.find(
        (item): item is ImportDeclaration => {
          if (item.type !== 'ImportDeclaration') {
            return false;
          }

          return item.source.value === 'diwu' && item.specifiers.length > 0;
        },
      );

      const diwuImportNameSet = new Set(
        diwuImport?.specifiers.map(item => {
          if (item.type !== 'ImportSpecifier') {
            return undefined;
          }

          if (!item.imported.name.startsWith('diwu')) {
            return undefined;
          }

          return item.imported.name;
        }),
      );

      diwuImportNameSet.delete(undefined);

      if (!diwuImportNameSet.size) {
        return;
      }

      // 移除除 diwu 外的 import，转换所有 diwuFn/diwuHook export

      const diwuExports: {
        name: string;
        init: SimpleCallExpression;
      }[] = [];

      acornNode.body.forEach(item => {
        if (item.type !== 'ExportNamedDeclaration') {
          return;
        }

        const declaration = item.declaration;

        if (declaration?.type !== 'VariableDeclaration') {
          return;
        }

        const id = declaration.declarations[0].id;
        const init = declaration.declarations[0].init;

        if (
          id.type !== 'Identifier' ||
          init?.type !== 'CallExpression' ||
          init.callee.type !== 'Identifier'
        ) {
          return;
        }

        if (diwuImportNameSet.has(init.callee.name)) {
          diwuExports.push({name: id.name, init});
        }
      });

      const hash = generateHash(code);

      const transformedCode = `import {${[...diwuImportNameSet]
        .map(name => `$${name}`)
        .join(',')}} from "diwu";${diwuExports
        .map(
          diwu =>
            `export const ${diwu.name} = $${
              (diwu.init.callee as Identifier).name
            }("${hash}-${diwu.name}");`,
        )
        .join('\n')}`;

      try {
        const serverCode = (
          await (
            await rollup({
              input: id,
              plugins: [
                typescript({
                  compilerOptions: {
                    target: 'esnext',
                  },
                  tsconfig: false,
                }),
                commonjs(),
                resolve({
                  preferBuiltins: true,
                }),
                json(),
              ],
              onwarn: () => {},
            })
          ).generate({
            format: 'cjs',
          })
        ).output[0].code;

        const scriptsDirPath = Path.join(diwuCachePath, 'scripts');

        await FSE.ensureDir(scriptsDirPath);

        const filePath = Path.join(scriptsDirPath, `${hash}.js`);

        const fileContent = `${serverCode};
      process.on('message', async ({method, args}) => {
        try {
          const context = {${diwuExports.map(item => item.name).join(',')}};
          process.send({data: await context[method](...args)});
          process.exit(0);
        } catch (error) {
          process.send({error: error?.message});
          process.exit(1);
        }
      });
      `;

        const manifestPath = Path.join(diwuCachePath, 'manifest.json');

        let manifest;

        try {
          manifest = await FSE.readJSON(manifestPath);
        } catch (error) {
          manifest = {};
        }

        const oldFilePath = manifest[id];

        manifest[id] = filePath;

        await FSE.writeJSON(manifestPath, manifest, {spaces: 2});
        await FSE.outputFile(filePath, fileContent);

        if (typeof oldFilePath === 'string' && oldFilePath !== filePath) {
          await FSE.remove(oldFilePath);
        }
      } catch (error) {}

      console.info(`[diwu]: "${id}" transformed`);

      return transformedCode;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const [_, file, method] =
          req.url?.match(/diwu\/([0-9a-z]+)-([0-9a-zA-Z\$]+)$/) || [];

        if (file && method) {
          let ret: any = {error: 'script error'};

          try {
            const args = await new Promise(resolve => {
              let body = '';

              req.on('readable', () => {
                const chunk = req.read();

                if (chunk) {
                  body += chunk;
                }
              });

              req.on('end', () => resolve(JSON.parse(body)));
            });

            const child = ChildProcess.fork(
              Path.join(diwuCachePath, 'scripts', file),
            );

            child.on('message', data => (ret = data));

            child.send({method, args});

            await new Promise<void>(resolve => child.on('exit', resolve));
          } catch (error: any) {
            ret = {error: error?.message || ret?.error || ''};
          }

          res.writeHead(200, {'Content-Type': 'application/json'});
          res.write(JSON.stringify(ret));
          res.end();
          return;
        }

        return next();
      });
    },
    async closeBundle() {
      // 仅生产环境
      if (this.meta.watchMode) {
        return;
      }

      await FSE.copy(
        Path.join(diwuCachePath, 'scripts'),
        Path.join(process.cwd(), `${outDir}/scripts`),
      );
    },
  };
}

function generateHash(pass: string): string {
  return Crypto.createHmac('sha256', '$diwu').update(pass).digest('hex');
}
