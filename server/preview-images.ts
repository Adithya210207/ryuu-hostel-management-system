import {readFile} from 'node:fs/promises';
import path from 'node:path';

const names = ['room-concept', 'dining-concept', 'quiet-corner-concept', 'ryuu-exterior', 'ryuu-logo'];
let bundle: Promise<Record<string, string>> | undefined;

// Quick Tunnel's interactive access gate can interrupt delayed image requests.
// Include only these public photos in the authenticated page, never private files.
export async function previewImages(): Promise<Record<string, string>> {
  if (process.env.NODE_ENV !== 'development' || !process.env.DEV_TUNNEL_ORIGIN) return {};
  return bundle ??= Promise.all(names.map(async name => {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'images', `${name}.webp`));
    return [`/images/${name}.webp`, `data:image/webp;base64,${bytes.toString('base64')}`] as const;
  })).then(entries => Object.fromEntries(entries)).catch(error => {bundle = undefined; throw error;});
}
