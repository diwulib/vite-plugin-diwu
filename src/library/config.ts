import Path from 'path';

const DEFAULT_EXTERNAL = {
  react: 'React',
  'react/jsx-runtime': 'JSXRuntime',
  '@douyinfe/semi-ui': 'SemiUI',
};

export interface DiwuConfig {
  /**
   * default: <root>/src/components/index.ts
   */

  libEntry: string;
  /**
   * default: <root>/dist
   */
  outDir: string;
  /**
   * default: <root>/tsconfig.json
   */
  tsconfig: string;
  external: Record<
    {packageName: string}['packageName'],
    {globalVar: string}['globalVar']
  >;
}

export function resolveConfig(config: Partial<DiwuConfig> = {}): DiwuConfig {
  return {
    libEntry: Path.resolve(
      config.libEntry ||
        process.env?.npm_package_diwu_libEntry ||
        'src/components/index.ts',
    ),
    outDir: config.outDir || process.env?.npm_package_diwu_outDir || 'dist',
    tsconfig: Path.resolve(
      config.tsconfig ||
        process.env?.npm_package_diwu_tsconfig ||
        'tsconfig.json',
    ),
    external: {...DEFAULT_EXTERNAL, ...config.external},
  };
}
