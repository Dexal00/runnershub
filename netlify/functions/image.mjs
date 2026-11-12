import {getStore} from '@netlify/blobs';

export default async(req)=>{
 try {
  const key=new URL(req.url).searchParams.get('key')||'';
  // Only serve files inside the products namespace with a supported extension.
  if(!/^products\/[a-f0-9-]+\.(jpg|png|webp|avif)$/i.test(key))return new Response('Not found',{status:404});
  const entry=await getStore('runnershub-images').getWithMetadata(key,{type:'blob',consistency:'strong'});
  if(!entry || !entry.data)return new Response('Not found',{status:404});
  const type=entry.metadata?.contentType||'application/octet-stream';
  if(!['image/jpeg','image/png','image/webp','image/avif'].includes(type))return new Response('Unsupported media type',{status:415});
  return new Response(entry.data,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 } catch(error) {
  console.error('RunnersHub image function error:',error);
  return new Response('Image unavailable',{status:500});
 }
};

