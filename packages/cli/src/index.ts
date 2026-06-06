import chalk from 'chalk';
import { Command } from 'commander';
import { buildCommand } from './commands/build';
import { callCommand } from './commands/call';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { newCommand } from './commands/new';
import { serveCommand } from './commands/serve';

const program = new Command();

program
  .name('husk')
  .description('HUSK - HTTP Universal Skill Kernel. Serve a folder of agent skills over HTTP.')
  .version('0.1.0');

program
  .command('serve')
  .argument('[dir]', 'skills directory (default: ./skills, else .)')
  .description('Serve a folder of skills over HTTP with one long-lived Bun process')
  .option('-p, --port <port>', 'port to listen on (default 3000, or $HUSK_PORT)')
  .option('-H, --host <host>', 'host to bind (default 127.0.0.1; use 0.0.0.0 to expose off-host)')
  .option('-w, --watch', 'reload skills when files change')
  .option('--cors', 'enable permissive CORS headers (off by default)')
  .option('-c, --concurrency <n>', 'max concurrent invocations (0 = unlimited)')
  .option('-n, --name <name>', 'service name shown on the index page')
  .action((dir, opts) => serveCommand(dir, opts));

program
  .command('list')
  .argument('[dir]', 'skills directory')
  .description('List the skills discovered in a directory')
  .option('--json', 'output the skill cards as JSON')
  .action((dir, opts) => listCommand(dir, opts));

program
  .command('call')
  .argument('<name>', 'skill slug or name')
  .description('Invoke a skill locally without HTTP (the one-shot / serverless path)')
  .option('-i, --input <value>', 'text input; "-" reads stdin, "@path" reads a file')
  .option('-f, --file <path>', 'file input (for file-input skills)')
  .option('-d, --dir <dir>', 'skills directory')
  .option('-o, --out <dir>', 'directory to write file outputs into')
  .action((name, opts) => callCommand(name, opts));

program
  .command('new')
  .argument('<name>', 'skill name')
  .description('Scaffold a new skill folder (SKILL.md + a starter kernel script)')
  .option('-l, --lang <lang>', 'kernel language: bash | python | ts', 'bash')
  .option('-d, --dir <dir>', 'skills directory to create it in', 'skills')
  .action((name, opts) => newCommand(name, opts));

program
  .command('init')
  .argument('[dir]', 'project directory (default: .)')
  .description('Create a HUSK project with a ./skills folder and a starter skill')
  .action((dir, opts) => initCommand(dir, opts));

program
  .command('build')
  .argument('[dir]', 'skills directory to copy into the image (default: skills)')
  .description('Generate deployment artifacts so the same skills run in a container')
  .option('--docker', 'emit a Dockerfile (+ .dockerignore)')
  .option('-p, --port <port>', 'port the container serves on', '3000')
  .option('--force', 'overwrite an existing Dockerfile')
  .action((dir, opts) => buildCommand(dir, opts));

void program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red(`error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
