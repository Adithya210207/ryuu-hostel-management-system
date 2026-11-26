import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest {
 return {id:'/',name:'Ryuu',short_name:'Ryuu',description:'Your stay, messages and everyday updates.',start_url:'/portal',scope:'/',display:'standalone',background_color:'#0d0c11',theme_color:'#0d0c11',lang:'en',
 icons:[{src:'/pwa/icon-192.png?v=house-1',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/pwa/icon-512.png?v=house-1',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/pwa/maskable-512.png?v=house-1',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
}
