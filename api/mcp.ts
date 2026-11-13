import type { IncomingMessage, ServerResponse } from "node:http";
import { handle } from "../src/http.js";

export const config = { maxDuration: 30 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handle(req as any, res);
}
