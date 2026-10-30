// Run on the Windows computer from the project root. Credentials remain in .env.
require('dotenv').config();
const sql=require('mssql');
const fs=require('node:fs');
const path=require('node:path');
const tables=[['customers','customer_id'],['vehicles','vehicle_id'],['member_cards','member_card_id'],['service_packages','package_id'],['wash_bays','bay_id'],['staff','staff_id'],['bookings','booking_id'],['payments','payment_id'],['materials','material_id'],['material_usage','usage_id']];
function literal(value) {
 if(value===null)return 'NULL';
 if(value instanceof Date)return "'"+value.toISOString().replace('Z','')+"'";
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Invalid numeric value');return String(value);}
 return "'"+String(value).replaceAll("'","''")+"'";
}
function renderExport(data) {
 const out=['-- Current SQL Server data. Contains customer records: keep private.','BEGIN;',"SET LOCAL TIME ZONE 'Asia/Bangkok';",'DO $$ BEGIN'];
 for(const [table] of tables)out.push(`IF EXISTS(SELECT 1 FROM dbo.${table}) THEN RAISE EXCEPTION 'Import requires empty ${table}'; END IF;`);
 out.push('END $$;','-- Import recorded balances and historical statuses without replaying debits.','ALTER TABLE dbo.bookings DISABLE TRIGGER USER;','ALTER TABLE dbo.material_usage DISABLE TRIGGER USER;');
 for(const [table,id] of tables){
  for(const row of data[table]) {
   const columns=Object.keys(row);
   if(columns.some(c=>!/^\w+$/.test(c)))throw Error('Unexpected column');
   out.push(`INSERT INTO dbo.${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map(c=>literal(row[c])).join(',')});`);
  }
  out.push(`SELECT setval(pg_get_serial_sequence('dbo.${table}','${id}'),COALESCE((SELECT MAX(${id}) FROM dbo.${table}),1),EXISTS(SELECT 1 FROM dbo.${table}));`);
 }
 out.push('ALTER TABLE dbo.bookings ENABLE TRIGGER USER;','ALTER TABLE dbo.material_usage ENABLE TRIGGER USER;','COMMIT;');
 return out.join('\n')+'\n';
}
async function main(){
 const directory=path.resolve('exports');fs.mkdirSync(directory,{recursive:true});
 const output=path.join(directory,'windows_data.sql');
 if(fs.existsSync(output))throw Error('exports/windows_data.sql already exists. Rename or preserve it before exporting again.');
 const pool=await sql.connect({server:process.env.DB_SERVER,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,...(process.env.DB_PORT?{port:Number(process.env.DB_PORT)}:{}),options:{encrypt:process.env.DB_ENCRYPT==='true',trustServerCertificate:process.env.DB_TRUST_CERT!=='false'}});
 const transaction=new sql.Transaction(pool);
 try {
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const data={};
  for(const [table,id]of tables) data[table]=(await new sql.Request(transaction).query(`SELECT * FROM dbo.[${table}] ORDER BY [${id}]`)).recordset;
  await transaction.commit();
  fs.writeFileSync(output,renderExport(data),{encoding:'utf8',flag:'wx',mode:0o600});
  console.log('Created exports/windows_data.sql. Keep this file private; paste it only into your Neon SQL Editor.');
  for(const [table]of tables)console.log(table+': '+data[table].length+' rows');
 }catch(error){try{await transaction.rollback()}catch{}throw error}finally{await pool.close()}
}
module.exports={renderExport,tables};
if(require.main===module)main().catch(error=>{console.error('Export failed:',error.message);process.exitCode=1});
