const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
process.env.DATABASE_URL='postgresql://test@localhost/test';
process.env.PUBLIC_FULL_ACCESS='true';
const db=new PGlite();
let server;
const pg=require('../server/postgres');
// Use the PostgreSQL engine with pg-compatible result parsers.
const query=async(text,values=[])=>{
 const result=await db.query(text,values);
 for(const row of result.rows) for(const field of result.fields || []) {
  const value=row[field.name];
  if(value!==null && [20,1700].includes(field.dataTypeID)) row[field.name]=Number(value);
 }
 return {...result,rowCount:result.affectedRows};
};
pg.setTestPool({query,connect:async()=>({query,release(){}})});
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS',name)}
(async()=>{
 try {
  await db.exec(fs.readFileSync('database/postgres/neon_setup.sql','utf8'));
  await check('original sample data preserved',async()=>{
   const rows=(await query('SELECT COUNT(*)::int n FROM dbo.bookings')).rows;assert.equal(rows[0].n,630);
   assert.equal((await query('SELECT COUNT(*)::int n FROM dbo.payments')).rows[0].n,540);
  });
  const app=require('../server/index');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  async function api(path,method='GET',body,expected=200){const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{throw Error(path+': '+text)}assert.equal(r.status,expected,path+': '+text);return data;}
  await check('health, all bootstrap tables and reporting',async()=>{
   assert.equal((await api('/health')).engine,'PostgreSQL');
   const data=await api('/bootstrap');assert.equal(data.customers.length,100);assert.equal(data.bookings.length,630);assert.equal(typeof data.services[0].price,'number');
   assert(Array.isArray(await api('/reports/daily')));
  });
  let customer,vehicle;
  await check('customer and vehicle CRUD with UTF-8 and bound parameters',async()=>{
   customer=(await api('/customers','POST',{first_name:"ทดสอบ ' OR 1=1 --",last_name:'นีออน',phone:'test-123'},201)).id;
   await api('/customers/'+customer,'PUT',{first_name:'ทดสอบ',last_name:'แก้ไข',phone:'test-123'});
   vehicle=(await api('/vehicles','POST',{customer_id:customer,license_plate:'TEST-1',brand:'Demo',model:'Test',color:'Blue',vehicle_type:'Sedan'},201)).id;
   await api('/vehicles/'+vehicle,'PUT',{customer_id:customer,license_plate:'TEST-2',brand:'Demo',model:'Test',color:'Red',vehicle_type:'Sedan'});
   assert.equal((await query('SELECT color FROM dbo.vehicles WHERE vehicle_id=$1',[vehicle])).rows[0].color,'Red');
  });
  let service,staff,bay,material,card;
  await check('generic CRUD and constraints',async()=>{
   service=(await api('/services','POST',{package_name:'Test wash',price:100,duration_minutes:30,status:'Active'},201)).id;
   staff=(await api('/staff','POST',{first_name:'Test',last_name:'Staff',phone:'test-staff',position:'Technician',status:'Active'},201)).id;
   bay=(await api('/bays','POST',{bay_name:'Test bay',status:'Available'},201)).id;
   material=(await api('/materials','POST',{material_name:'Test soap',unit:'ml',unit_cost:2,stock_qty:10},201)).id;
   card=(await api('/members','POST',{customer_id:customer,card_number:'TESTCARD',member_type:'Test',remaining_credit:2,expiry_date:'2099-12-31',status:'Active'},201)).id;
   await api('/materials/'+material,'PUT',{stock_qty:12});
   await api('/customers','POST',{first_name:'Duplicate',last_name:'Phone',phone:'test-123'},409);
  });
  let booking;
  const bookingBody=(time,cardId=null)=>({vehicle_id:vehicle,package_id:service,bay_id:bay,staff_id:staff,start_time:time,member_card_id:cardId});
  await check('booking creation, overlap rejection and opening hours',async()=>{
   booking=(await api('/bookings','POST',bookingBody('2030-01-02T08:00',card),201)).id;
   await api('/bookings','POST',bookingBody('2030-01-02T08:10'),400);
   await api('/bookings','POST',bookingBody('2030-01-02T07:00'),400);
   await api('/bookings/'+booking,'PUT',{start_time:'2030-01-02T09:00',booking_status:'Pending'});
   assert.equal((await query('SELECT start_time::time::text t FROM dbo.bookings WHERE booking_id=$1',[booking])).rows[0].t,'08:00:00');
  });
  await check('start deducts one credit, stock changes and invalid usage rolls back',async()=>{
   await api('/bookings/'+booking+'/start','POST',{});
   assert.equal((await query('SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=$1',[card])).rows[0].remaining_credit,1);
   await api('/bookings/'+booking+'/start','POST',{},400);
   await api('/material_usage','POST',{booking_id:booking,material_id:material,quantity_used:3},201);
   assert.equal((await query('SELECT stock_qty FROM dbo.materials WHERE material_id=$1',[material])).rows[0].stock_qty,9);
   await api('/material_usage','POST',{booking_id:booking,material_id:material,quantity_used:99},400);
   assert.equal((await query('SELECT stock_qty FROM dbo.materials WHERE material_id=$1',[material])).rows[0].stock_qty,9);
  });
  await check('complete then member payment never deducts credit twice',async()=>{
   await api('/bookings/'+booking,'PUT',{booking_status:'Completed'});
   await api('/payments','POST',{booking_id:booking,payment_method:'Member_Credit'},201);
   await api('/payments','POST',{booking_id:booking,payment_method:'Member_Credit'},400);
   assert.equal((await query('SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=$1',[card])).rows[0].remaining_credit,1);
  });
  await check('completion procedure, cash payment, cancellation and protected history',async()=>{
   let b=(await api('/bookings','POST',bookingBody('2030-01-03T08:00'),201)).id;
   await api('/bookings/'+b+'/start','POST',{});
   await api('/bookings/'+b+'/complete','POST',{payment_method:'Cash'});
   await api('/bookings/'+b,'DELETE',null,409);
   b=(await api('/bookings','POST',bookingBody('2030-01-04T08:00'),201)).id;
   await api('/bookings/'+b+'/cancel','POST',{});
   assert.equal((await query('SELECT booking_status FROM dbo.bookings WHERE booking_id=$1',[b])).rows[0].booking_status,'Cancelled');
  });
  await check('atomic reception rolls back invalid payment',async()=>{
   const count=(await query('SELECT COUNT(*)::int n FROM dbo.bookings')).rows[0].n;
   await api('/reception','POST',{...bookingBody('2030-01-05T08:00'),payment_method:'Cash',paid_amount:99},400);
   assert.equal((await query('SELECT COUNT(*)::int n FROM dbo.bookings')).rows[0].n,count);
   const b=await api('/reception','POST',{...bookingBody('2030-01-05T08:00'),payment_method:'Cash',paid_amount:100},201);
   await api('/bookings/'+b.booking_id+'/complete','POST',{payment_method:'Cash'});
   assert.equal((await query('SELECT COUNT(*)::int n FROM dbo.payments WHERE booking_id=$1',[b.booking_id])).rows[0].n,1);
  });
  await check('ad hoc member credit payment and date conversion',async()=>{
   // A historical completed booking not linked to a card: payment debits one available credit.
   const b=(await api('/bookings','POST',bookingBody('2030-01-06T08:00'),201)).id;
   await api('/bookings/'+b+'/start','POST',{});
   await api('/bookings/'+b,'PUT',{booking_status:'Completed'});
   await api('/payments','POST',{booking_id:b,payment_method:'Member_Credit',payment_date:'2030-01-06T09:00'},201);
   assert.equal((await query('SELECT remaining_credit FROM dbo.member_cards WHERE member_card_id=$1',[card])).rows[0].remaining_credit,0);
  });
  await check('delete unreferenced master records, reject foreign key deletion',async()=>{
   const id=(await api('/customers','POST',{first_name:'Delete',last_name:'Test',phone:'delete-test'},201)).id;
   await api('/customers/'+id,'DELETE');
   await api('/customers/'+customer,'DELETE',null,409);
  });
  await check('current-data export and restore preserves every table, IDs and balances',async()=>{
   const {renderExport,tables}=require('./export-sqlserver.cjs');
   const before={};
   for(const [table,id] of tables) before[table]=(await query(`SELECT * FROM dbo.${table} ORDER BY ${id}`)).rows;
   const exported=renderExport(before);
   await db.exec('DROP SCHEMA dbo CASCADE');
   await db.exec(fs.readFileSync('database/postgres/neon_schema.sql','utf8'));
   await db.exec(exported);
   for(const [table,id] of tables) assert.deepEqual((await query(`SELECT * FROM dbo.${table} ORDER BY ${id}`)).rows,before[table],table);
   const next=await api('/customers','POST',{first_name:'After',last_name:'Import',phone:'after-import'},201);
   assert(next.id>Math.max(...before.customers.map(c=>c.customer_id)));
   await assert.rejects(db.exec(exported),/Import requires empty/);
   await db.exec('ROLLBACK');
   const pending=before.bookings.find(b=>b.booking_status==='Pending');
   await assert.rejects(query('DELETE FROM dbo.bookings WHERE booking_id=$1',[pending.booking_id]),/Use cancellation/);
  });
  console.log(`${passed} PostgreSQL integration checks passed; live Neon credentials and Vercel deployment not tested.`);
 } finally {if(server)await new Promise(r=>server.close(r));await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
