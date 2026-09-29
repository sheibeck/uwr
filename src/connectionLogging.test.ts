import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logConnectError, logDisconnect } from './connectionLogging';

describe('connection logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a clean disconnect with console.log only', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logDisconnect();

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Disconnected from SpacetimeDB');
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs a disconnect carrying an error (2.10 routing) as a warning including the error', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new Error('websocket closed unexpectedly');

    logDisconnect(err);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Disconnected from SpacetimeDB:', err);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs an initial connection failure exactly as before', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = new Error('connect refused');

    logConnectError(err);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Error connecting to SpacetimeDB:', err);
  });

  it('wires main.ts through contextually typed inline lambdas', () => {
    const source = readFileSync(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');

    expect(source).toMatch(/\.onDisconnect\(\(_ctx, err\) => logDisconnect\(err\)\)/);
    expect(source).toMatch(/\.onConnectError\(\(_ctx, err\) => logConnectError\(err\)\)/);
  });
});
