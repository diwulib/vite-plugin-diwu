import type {ModuleFormat} from 'rollup';
// @ts-expect-error
import type {PluginOption} from 'vite';

import type {DiwuConfig} from './config';

export function diwuBuild({
  libEntry,
  outDir,
  external,
}: DiwuConfig): PluginOption {
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
        external: Object.keys(external),
        output: {
          globals: external,
        },
      });

      return config;
    },
  };
}
