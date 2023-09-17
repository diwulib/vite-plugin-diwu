import Path from 'path';

import FSE from 'fs-extra';
import type {
  BaseType,
  Definition,
  SubTypeFormatter,
} from 'ts-json-schema-generator';
import {
  FunctionType,
  SchemaGenerator,
  createFormatter,
  createParser,
  createProgram,
} from 'ts-json-schema-generator';
import * as ts from 'typescript';
// @ts-expect-error
import type {PluginOption} from 'vite';

import {createPropsParse} from './parser';

export interface DiwuClientOptions {
  /**
   * default: <root>/dist
   */
  outDir?: string;
}

export class FunctionParamsTypeFormatter implements SubTypeFormatter {
  supportsType(type: FunctionType): boolean {
    return type instanceof FunctionType;
  }

  getDefinition(type: FunctionType): Definition {
    // Return a custom schema for the function property.
    return {
      type: 'object',
      properties: {
        isFunction: {
          type: 'boolean',
          const: true,
        },
      },
    };
  }

  getChildren(type: FunctionType): BaseType[] {
    return [];
  }
}

/**
 * 组件信息收集
 */
export function diwuClient({
  outDir = 'dist',
}: DiwuClientOptions = {}): PluginOption {
  const diwuCachePath = Path.join(process.cwd(), 'node_modules/.diwu');

  FSE.ensureDirSync(diwuCachePath);

  return {
    name: 'vite-plugin-diwu-client',
    enforce: 'pre',
    async transform(source, id) {
      if (id.includes('node_modules')) {
        return;
      }

      if (id.includes('porter/component')) {
        const config = {
          path: id,
          tsconfig: Path.join(__dirname, '../../../tsconfig.component.json'),
          type: '*',
        };

        const formatter = createFormatter(config, fmt => {
          fmt.addTypeFormatter(new FunctionParamsTypeFormatter());
        });

        const program = createProgram(config);

        const parser = createParser(program, config, chainNodeParser => {
          chainNodeParser.addNodeParser(
            createPropsParse(program, chainNodeParser),
          );
        });

        const generator = new SchemaGenerator(
          program,
          parser,
          formatter,
          config,
        );
        const schema = generator.createSchema(config.type);

        // @ts-ignore 112
        console.log(schema.definitions?.PorterProps?.properties);
      }

      const sourceFile = ts.createSourceFile(
        id,
        source,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TS,
      );

      const comments: Record<string, string> = {};

      for (const statement of sourceFile.statements) {
        if (
          !ts.isFunctionDeclaration(statement) &&
          !ts.isVariableStatement(statement)
        ) {
          continue;
        }

        if (
          !statement.modifiers?.some(
            modifier => modifier.kind === ts.SyntaxKind.ExportKeyword,
          )
        ) {
          continue;
        }

        const commentRanges =
          ts.getLeadingCommentRanges(source, statement.pos) || [];

        if (!commentRanges.length) {
          continue;
        }

        const commentText = commentRanges
          .map(range =>
            source
              .substring(range.pos + 3, range.end - 2)
              .replace(/^\s*\*\s?/gm, '')
              .trim(),
          )
          .filter(Boolean)
          .join('\n');

        if (!commentText) {
          continue;
        }

        comments[
          ts.isFunctionDeclaration(statement)
            ? statement.name?.getText() || ''
            : statement.declarationList.declarations[0].name.getText()
        ] = commentText;
      }

      const componentsPath = Path.join(diwuCachePath, 'components.json');

      let components;

      try {
        components = await FSE.readJSON(componentsPath);
      } catch (error) {
        components = {};
      }

      for (const componentName in comments) {
        components[componentName] ||= {};
        components[componentName].description = comments[componentName];
      }

      await FSE.writeJSON(componentsPath, components, {spaces: 2});
    },
    // 生成组件描述信息
    async closeBundle() {
      // 仅生产环境
      if (this.meta.watchMode) {
        return;
      }

      const fileName = Path.join(process.cwd(), `${outDir}/lib.es.js`);
      const sourceFile = ts.createSourceFile(
        fileName,
        FSE.readFileSync(fileName).toString(),
        ts.ScriptTarget.Latest,
        true,
      );

      const exportVariables: string[] = [];

      function visit(node: ts.Node): void {
        if (ts.isExportDeclaration(node)) {
          node.forEachChild(innerNode => {
            if (
              ts.isIdentifier(innerNode) &&
              ts.isVariableDeclaration(innerNode.parent)
            ) {
              exportVariables.push(innerNode.text);
            } else if (ts.isNamedExports(innerNode)) {
              innerNode.elements.forEach(namedExport => {
                if (ts.isIdentifier(namedExport.name)) {
                  exportVariables.push(namedExport.name.text);
                }
              });
            }
          });
        }

        node.forEachChild(childNode => visit(childNode));
      }

      visit(sourceFile);

      const componentsPath = Path.join(diwuCachePath, 'components.json');

      type Component = unknown;

      let components: Record<string, Component>;

      try {
        components = await FSE.readJSON(componentsPath);
      } catch (error) {
        components = {};
      }

      await FSE.writeJSON(
        Path.join(process.cwd(), `${outDir}/components.json`),
        exportVariables.reduce<Record<string, Component>>((dict, name) => {
          dict[name] = components[name] || {};
          return dict;
        }, {}),
      );
    },
  };
}
