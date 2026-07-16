#!/usr/bin/env bun

export interface EntrypointLoaders {
  loadCli: () => Promise<{ run: (argv?: string[]) => Promise<unknown> }>;
  loadMcp: () => Promise<{ main: () => Promise<void> }>;
}

const defaultLoaders: EntrypointLoaders = {
  loadCli: () => import('./cli'),
  loadMcp: () => import('./mcp'),
};

export async function main(
  argv = process.argv.slice(2),
  overrides: Partial<EntrypointLoaders> = {},
): Promise<void> {
  const loaders = { ...defaultLoaders, ...overrides };
  if (argv.includes('--mcp')) {
    const mcp = await loaders.loadMcp();
    await mcp.main();
    return;
  }

  const cli = await loaders.loadCli();
  await cli.run(argv);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
