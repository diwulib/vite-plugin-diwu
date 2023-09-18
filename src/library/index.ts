// @ts-expect-error
import type {PluginOption} from 'vite';

import type {DiwuConfig} from './config';
import {resolveConfig} from './config';
import {diwuBuild} from './build';
import {diwuClient} from './client';
import {diwuServer} from './server';

export * from './build';
export * from './client';
export * from './server';
export * from './config';

export default function diwu(override?: Partial<DiwuConfig>): PluginOption {
  const config = resolveConfig(override);
  return [diwuClient(config), diwuServer(config), diwuBuild(config)];
}
