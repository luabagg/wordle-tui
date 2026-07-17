import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const SMOKE_TIMEOUT_MS = 12_000;

function bounded<T>(label: string, promise: Promise<T>, ms = 5_000): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (handle) clearTimeout(handle);
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await Bun.sleep(20);
  }
  return !isProcessAlive(pid);
}

function textPayload(result: unknown): unknown {
  if (!result || typeof result !== 'object' || !('content' in result)) {
    throw new Error('MCP response did not contain content');
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) throw new Error('MCP response content was not an array');
  const entry = content.find((item) => (
    item
    && typeof item === 'object'
    && (item as { type?: unknown }).type === 'text'
  )) as { text?: unknown } | undefined;
  if (typeof entry?.text !== 'string') {
    throw new Error('MCP response did not contain text content');
  }
  return JSON.parse(entry.text);
}

/**
 * Real stdio child-process smoke: Client.connect performs JSON-RPC initialize,
 * then this test exercises tools/list and tools/call. Transport closure in
 * finally is the explicit child-process teardown.
 */
test('real MCP stdio initialize -> tools/list -> tools/call flow', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`${root}/src/index.ts`, '--mcp'],
    cwd: root,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'wordle-phase3-smoke', version: '1.0.0' });

  try {
    await bounded('MCP initialize', client.connect(transport));
    expect(client.getServerVersion()).toMatchObject({ name: 'wordle-tui-mcp' });

    const listed = await bounded('MCP tools/list', client.listTools());
    expect(listed.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      'start_game',
      'get_state',
      'submit_guess',
      'get_tips',
    ]));

    await bounded('MCP start_game', client.callTool({
      name: 'start_game',
      arguments: { language: 'en' },
    }));

    const initial = await bounded('MCP get_state', client.callTool({
      name: 'get_state',
      arguments: {},
    }));
    expect(textPayload(initial)).toMatchObject({
      language: 'en',
      status: 'playing',
      guessesUsed: 0,
    });

    const invalid = await bounded('MCP invalid submit_guess', client.callTool({
      name: 'submit_guess',
      arguments: { guess: 'ab3de' },
    }));
    expect(invalid.isError).toBe(true);
    expect(textPayload(invalid)).toMatchObject({
      ok: false,
      error: { code: 'invalid_chars' },
    });

    const valid = await bounded('MCP valid submit_guess', client.callTool({
      name: 'submit_guess',
      arguments: { guess: 'crane' },
    }));
    expect(valid.isError).not.toBe(true);
    expect(textPayload(valid)).toMatchObject({ language: 'en', guessesUsed: 1 });
  } finally {
    const pid = transport.pid;
    try {
      await bounded('MCP transport teardown', transport.close(), 3_000);
    } catch (closeError) {
      if (pid) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Process already exited.
        }
        const reaped = await waitForProcessExit(pid, 2_000);
        if (!reaped) {
          throw new Error(`MCP child ${pid} remained alive after SIGKILL`, {
            cause: closeError,
          });
        }
      }
    }
  }
}, SMOKE_TIMEOUT_MS);
