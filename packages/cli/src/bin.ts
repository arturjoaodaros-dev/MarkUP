import { main } from './main.ts';

const code = await main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  },
  cwd: process.cwd(),
  color: !process.env.NO_COLOR && process.stdout.isTTY === true,
});
process.exitCode = code;
