import Path from 'path';

import type {ModuleFormat} from 'rollup';
// @ts-expect-error
import type {PluginOption} from 'vite';

const DEFAULT_EXTERNAL = {
  react: 'React',
  'react/jsx-runtime': 'JSXRuntime',
  '@douyinfe/semi-ui': 'SemiUI',
};

export interface DiwuBuildOptions {
  /**
   * default: <root>/src/components/index.ts
   */
  libEntry?: string;
  /**
   * default: <root>dist
   */
  outDir?: string;
  external?: Record<
    {packageName: string}['packageName'],
    {globalVar: string}['globalVar']
  >;
}

export function diwuBuild({
  libEntry = Path.join(process.cwd(), 'src/components/index.ts'),
  outDir = 'dist',
  external,
}: DiwuBuildOptions = {}): PluginOption {
  const mergerdExternal = {...DEFAULT_EXTERNAL, ...external};

  return {
    name: 'vite-plugin-diwu-build',
    config(config) {
      config.build ||= {};

      config.build.outDir = outDir;

      config.build.lib ||= {
        entry: libEntry,
        name: process.env.npm_package_name,
        // formats: ['es', 'umd'],
        fileName: (format: ModuleFormat) => `lib.${format}.js`,
      };

      config.build.rollupOptions ||= {};

      Object.assign(config.build.rollupOptions, {
        external: Object.keys(mergerdExternal),
        output: {
          globals: external,
        },
      });

      return config;
    },
  };
}
