import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HAS_LINUX_PTY = process.platform === 'linux' && Boolean(Bun.which('script'));
const ptyTest = HAS_LINUX_PTY ? test : test.skip;

async function pump(
  stream: ReadableStream<Uint8Array>,
  append: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      append(decoder.decode(value, { stream: true }));
    }
    append(decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

async function waitForRendererReady(
  child: Bun.Subprocess,
  output: () => string,
  timeoutMs: number,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (output().includes('WORDLE TUI')) return;
    if (child.exitCode !== null) {
      throw new Error(`PTY child exited before renderer readiness (code ${child.exitCode})`);
    }
    await Bun.sleep(20);
  }
  throw new Error(`PTY renderer readiness timed out after ${timeoutMs}ms`);
}

async function boundedExit(child: Bun.Subprocess, timeoutMs: number): Promise<number | null> {
  return Promise.race([
    child.exited,
    Bun.sleep(timeoutMs).then(() => null),
  ]);
}

/**
 * OpenTUI native coverage policy:
 * - this real createCliRenderer PTY smoke runs on Linux when util-linux `script`
 *   is available (including the Ubuntu CI matrix leg)
 * - macOS/Windows run the full OpenTUI test-renderer suite in CI, while this
 *   Linux-specific PTY harness is explicitly skipped
 * - observable title readiness, hard deadlines, and finally cleanup prevent
 *   startup races or leaked PTY/native processes
 */
ptyTest('real createCliRenderer launches in a PTY and quits cleanly', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordle-pty-smoke-'));
  const command = `XDG_STATE_HOME=${stateDir} ${process.execPath} ./src/index.ts --lang=en`;
  const child = Bun.spawn(['script', '-qfec', command, '/dev/null'], {
    cwd: root,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let output = '';
  let stderr = '';
  const outputDone = pump(child.stdout, (text) => { output += text; });
  const stderrDone = pump(child.stderr, (text) => { stderr += text; });
  let timedOut = false;

  try {
    await waitForRendererReady(child, () => output, 3_000);
    child.stdin.write(new Uint8Array([3])); // Ctrl+C -> app quit -> renderer teardown
    child.stdin.flush();

    const code = await boundedExit(child, 4_000);
    if (code === null) {
      timedOut = true;
      child.kill('SIGKILL');
      await child.exited;
    }
    await Promise.all([outputDone, stderrDone]);

    expect(timedOut, `PTY smoke timed out; stderr: ${stderr}`).toBe(false);
    expect(code).toBe(0);
    expect(output).toContain('WORDLE TUI');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGKILL');
      await child.exited.catch(() => {});
    }
    await Promise.allSettled([outputDone, stderrDone]);
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}, 8_000);
