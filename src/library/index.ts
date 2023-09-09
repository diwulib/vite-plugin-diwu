// @ts-expect-error
import type {PluginOption} from 'vite';

import {diwuBuild, type DiwuBuildOptions} from './build';
import {diwuClient, type DiwuClientOptions} from './client';
import {diwuServer, type DiwuServerOptions} from './server';

export * from './build';
export * from './client';
export * from './server';

export interface DiwuOptions
  extends DiwuClientOptions,
    DiwuServerOptions,
    DiwuBuildOptions {}

export default function diwu(options: DiwuOptions = {}): PluginOption {
  return [diwuClient(options), diwuServer(options), diwuBuild(options)];
}
