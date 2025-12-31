import serverless from 'serverless-http';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initAppForServerless } from '../server/index';

let handler: any = null;

async function ensureHandler() {
  if (!handler) {
    const app = await initAppForServerless();
    handler = serverless(app);
  }
  return handler;
}

export default async function (req: VercelRequest, res: VercelResponse) {
  const h = await ensureHandler();
  return h(req, res);
}
