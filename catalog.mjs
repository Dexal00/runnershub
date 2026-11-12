import {getStore} from '@netlify/blobs';
import seed from '../../seed.json' with {type:'json'};
export default async () => {
 try { const data=await getStore('runnershub').get('catalog',{type:'json'});return Response.json(data||seed,{headers:{'Cache-Control':'no-store'}}); }
 catch(e){return Response.json({error:'Katalog okunamadı'},{status:503});}
};
