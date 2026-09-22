import { createClient } from '@supabase/supabase-js';
const URL='https://tvoipuianfvonbjtcndp.supabase.co', KEY='sb_publishable_g6-a_G_E-5iXOrMr4DVwsg_g0gM5vi8';
const A=createClient(URL,KEY,{auth:{persistSession:false}});
const B=createClient(URL,KEY,{auth:{persistSession:false}});
await A.auth.signInWithPassword({email:'test1@homeapp.dev',password:'TestHomeApp2026!'});
await B.auth.signInWithPassword({email:'test2@homeapp.dev',password:'TestHomeApp2026!'});
const ch=B.channel('rt-debug')
 .on('postgres_changes',{event:'*',schema:'public',table:'shopping_items'},p=>console.log('EVENT:',p.eventType,p.new?.name,p.new?.checked))
 .subscribe(st=>console.log('status:',st));
await new Promise(r=>setTimeout(r,4000));
const {data:ins}=await A.from('shopping_items').insert({household_id:'11111111-1111-1111-1111-111111111111',name:'rt-debug-item',added_by:'יובל'}).select().single();
await new Promise(r=>setTimeout(r,2000));
await A.from('shopping_items').update({checked:true}).eq('id',ins.id);
await new Promise(r=>setTimeout(r,5000));
await A.from('shopping_items').delete().eq('id',ins.id);
await new Promise(r=>setTimeout(r,2000));
process.exit(0);
