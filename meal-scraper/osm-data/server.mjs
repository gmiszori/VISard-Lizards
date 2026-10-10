import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {options, nearby} from './provider.mjs';
const token = process.env.ROUTE_CONNECTOR_TOKEN || '';
if (token.length < 16) throw new Error('Configure ROUTE_CONNECTOR_TOKEN (at least 16 characters).');
let busy = false;
createServer(async (req,res) => {
  const respond = (status,body) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
  const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) return respond(401,{error:'Unauthorized'});
  if (req.method === 'GET' && req.url === '/health') return respond(200,{ready:true});
  if (req.method !== 'POST' || !['/options','/nearby'].includes(req.url)) return respond(404,{error:'Not found'});
  if (busy) return respond(429,{error:'Route data service is busy.',code:'route_provider_busy'});
  busy = true;
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('Request is too large.'); chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    respond(200, await (req.url === '/options' ? options(input) : nearby(input)));
  } catch (error) {
    respond(422,{error: error.code ? error.message : 'Could not verify route data. Check locations, provider availability and logs.',code:error.code || 'route_provider_failed'});
    console.error('Route data lookup failed:', error.message?.slice(0,160));
  } finally { busy = false; }
}).listen(8093,'0.0.0.0', () => console.log('OSM read-only route data service listening on 8093.'));
