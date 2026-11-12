import {getStore} from '@netlify/blobs';
import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import seed from '../../seed.json' with {type:'json'};

const json=(v,status=200,headers={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...headers}});
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const secret=()=>process.env.ADMIN_SESSION_SECRET;
const token=()=>{const t=String(Date.now()+8*3600000);return t+'.'+createHmac('sha256',secret()).update(t).digest('hex')};
const authed=req=>{const v=(req.headers.get('cookie')||'').match(/(?:^|; )rh_session=([^;]+)/)?.[1]||'';const [t,s]=v.split('.');return !!(t&&s&&Number(t)>Date.now()&&eq(s,createHmac('sha256',secret()).update(t).digest('hex')))};

export default async(req)=>{
 try {
  if(!process.env.ADMIN_PASSWORD||!secret())return json({error:'Netlify ortam değişkenleri ADMIN_PASSWORD ve ADMIN_SESSION_SECRET ayarlanmamış.'},503);
  const url=new URL(req.url),action=url.searchParams.get('action');
  if(action==='login'&&req.method==='POST'){
   let d;try{d=await req.json()}catch{return json({error:'Geçersiz istek'},400)};
   if(!eq(d.username||'','runnershub')||!eq(d.password||'',process.env.ADMIN_PASSWORD))return json({error:'Kullanıcı adı veya şifre hatalı.'},401);
   return json({ok:true},200,{'Set-Cookie':`rh_session=${token()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});
  }
  if(action==='logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':'rh_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
  if(!authed(req))return json({error:'Yetkisiz erişim'},401);

  // Admin-only image upload. Files are stored in a persistent site-wide Netlify Blobs store.
  if(action==='upload'&&req.method==='POST'){
   const form=await req.formData();
   const file=form.get('file');
   if(!file || typeof file.arrayBuffer!=='function')return json({error:'Fotoğraf seçilmedi.'},400);
   const allowed=new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
   const ext=allowed.get(file.type);
   if(!ext)return json({error:'Yalnızca JPG, PNG, WebP veya AVIF fotoğraf yükleyebilirsin.'},415);
   if(file.size>4*1024*1024)return json({error:'Fotoğraf en fazla 4 MB olabilir.'},413);
   const key=`products/${randomUUID()}.${ext}`;
   const bytes=await file.arrayBuffer();
   await getStore('runnershub-images').set(key,new Blob([bytes],{type:file.type}),{metadata:{contentType:file.type}});
   return json({ok:true,url:`/.netlify/functions/image?key=${encodeURIComponent(key)}`});
  }

  const store=getStore('runnershub');
  if(req.method==='GET')return json((await store.get('catalog',{type:'json'}))||seed);
  if(req.method==='PUT'){
   let d;try{d=await req.json()}catch{return json({error:'Geçersiz JSON'},400)};
   if(!Array.isArray(d.products)||!Array.isArray(d.reviews)||d.products.length>500||d.reviews.length>300)return json({error:'Geçersiz katalog'},400);
   const products=d.products.map((p,i)=>({id:Number(p.id)||i+1,name:String(p.name||'').slice(0,120),code:String(p.code||'').slice(0,60),category:['erkek','kadin','unisex'].includes(p.category)?p.category:'unisex',price:Math.max(0,Number(p.price)||0),stock:Math.max(0,Math.floor(Number(p.stock)||0)),tag:String(p.tag||'').slice(0,40),image:String(p.image||'').slice(0,1500),colors:Array.isArray(p.colors)?p.colors.slice(0,20).map(x=>String(x).slice(0,40)):['Görseldeki renk']}));
   const reviews=d.reviews.map(r=>({id:Number(r.id)||Date.now(),name:String(r.name||'').slice(0,90),text:String(r.text||'').slice(0,1000),stars:Math.max(1,Math.min(5,Number(r.stars)||5))}));
   const validImage=image=>/^https:\/\//i.test(image)||/^\/.netlify\/functions\/image\?key=products%2F[a-f0-9-]+\.(jpg|png|webp|avif)$/i.test(image);
   if(products.some(p=>!p.name||!p.code||!validImage(p.image)))return json({error:'Her ürün için ad, kod ve yüklenmiş fotoğraf veya HTTPS görsel bağlantısı gerekli.'},400);
   await store.setJSON('catalog',{products,reviews});return json({ok:true});
  }
  return json({error:'Desteklenmeyen işlem'},405);
 } catch(error) {
  console.error('RunnersHub admin function error:',error);
  return json({error:'Sunucu işlemi tamamlayamadı. Netlify Function loglarını kontrol edin.'},500);
 }
};
