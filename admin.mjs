import {getStore} from '@netlify/blobs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import seed from '../../seed.json' with {type:'json'};
const json=(v,status=200,headers={})=>Response.json(v,{status,headers:{'Cache-Control':'no-store',...headers}});
const eq=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const secret=()=>process.env.ADMIN_SESSION_SECRET;
const token=()=>{const t=String(Date.now()+8*3600000);return t+'.'+createHmac('sha256',secret()).update(t).digest('hex')};
const authed=req=>{const v=(req.headers.get('cookie')||'').match(/(?:^|; )rh_session=([^;]+)/)?.[1]||'';const [t,s]=v.split('.');return !!(t&&s&&Number(t)>Date.now()&&eq(s,createHmac('sha256',secret()).update(t).digest('hex')))};
export default async(req)=>{
 if(!process.env.ADMIN_PASSWORD||!secret())return json({error:'Netlify ortam değişkenleri ADMIN_PASSWORD ve ADMIN_SESSION_SECRET ayarlanmamış.'},503);
 const url=new URL(req.url),action=url.searchParams.get('action');
 if(action==='login'&&req.method==='POST'){let d;try{d=await req.json()}catch{return json({error:'Geçersiz istek'},400)};
 if(!eq(d.username||'','runnershub')||!eq(d.password||'',process.env.ADMIN_PASSWORD))return json({error:'Kullanıcı adı veya şifre hatalı.'},401);
 return json({ok:true},200,{'Set-Cookie':`rh_session=${token()}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});}
 if(action==='logout'&&req.method==='POST')return json({ok:true},200,{'Set-Cookie':'rh_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 if(!authed(req))return json({error:'Yetkisiz erişim'},401);
 const store=getStore('runnershub');
 if(req.method==='GET')return json((await store.get('catalog',{type:'json'}))||seed);
 if(req.method==='PUT'){
 let d;try{d=await req.json()}catch{return json({error:'Geçersiz JSON'},400)};
 if(!Array.isArray(d.products)||!Array.isArray(d.reviews)||d.products.length>500||d.reviews.length>300)return json({error:'Geçersiz katalog'},400);
 const products=d.products.map((p,i)=>({id:Number(p.id)||i+1,name:String(p.name||'').slice(0,120),code:String(p.code||'').slice(0,60),category:['erkek','kadin','unisex'].includes(p.category)?p.category:'unisex',price:Math.max(0,Number(p.price)||0),stock:Math.max(0,Math.floor(Number(p.stock)||0)),tag:String(p.tag||'').slice(0,40),image:String(p.image||'').slice(0,1500),colors:Array.isArray(p.colors)?p.colors.slice(0,20).map(x=>String(x).slice(0,40)):['Görseldeki renk']}));
 const reviews=d.reviews.map(r=>({id:Number(r.id)||Date.now(),name:String(r.name||'').slice(0,90),text:String(r.text||'').slice(0,1000),stars:Math.max(1,Math.min(5,Number(r.stars)||5))}));
 if(products.some(p=>!p.name||!p.code||!/^https:\/\//.test(p.image)))return json({error:'Ürün adı, kodu ve https görsel bağlantısı zorunlu.'},400);
 await store.setJSON('catalog',{products,reviews});return json({ok:true});
 }
 return json({error:'Desteklenmeyen işlem'},405);
};
