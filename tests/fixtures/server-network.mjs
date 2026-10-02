import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
import { appendFileSync } from 'node:fs';
import { fixtureTarget } from './network-map.mjs';

const origin = process.env.BIJUX_FIXTURE_ORIGIN;
if (!origin) throw new Error('Explicit BIJUX_FIXTURE_ORIGIN is required for offline validation.');
fixtureTarget(origin, origin);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const address = input instanceof Request ? input.url : String(input);
  let target;
  try {
    target = fixtureTarget(address, origin, process.env.BIJUX_APP_ORIGIN);
  } catch (error) {
    if (process.env.BIJUX_EGRESS_LOG) appendFileSync(process.env.BIJUX_EGRESS_LOG, `${JSON.stringify({ blocked_origin: new URL(address).origin })}\n`);
    throw error;
  }
  return originalFetch(input instanceof Request ? new Request(target, input) : target, options);
};

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof options === 'object' ? options.host : (typeof args[1] === 'string' ? args[1] : undefined);
  const socketPath = typeof options === 'object' ? options.path : (typeof options === 'string' ? options : undefined);
  if (!socketPath && host && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
    if (process.env.BIJUX_EGRESS_LOG) appendFileSync(process.env.BIJUX_EGRESS_LOG, `${JSON.stringify({ blocked_socket_host: host })}\n`);
    throw new Error('Undeclared non-loopback socket blocked.');
  }
  return originalConnect.apply(this, args);
};
syncBuiltinESMExports();
