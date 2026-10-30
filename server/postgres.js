// Compatibility boundary for the fixed, parameterized queries in index.js.
// SQL Server remains available when DATABASE_URL is absent.
const { Pool, types } = require('pg');
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);
types.setTypeParser(1082, value => value);
types.setTypeParser(1114, value => new Date(value.replace(' ', 'T') + 'Z'));
let injectedPool;
function translate(text, inputs) {
  let q = text.replace(/\[([a-z_][a-z_0-9]*)\]/gi, '$1')
    .replace(/\s+WITH\s*\(UPDLOCK,HOLDLOCK\)/gi, '')
    .replace(/CONVERT\(date,GETDATE\(\)\)/gi, '(CURRENT_TIMESTAMP AT TIME ZONE \'Asia/Bangkok\')::date')
    .replace(/CONVERT\(date,(@\w+)\)/gi, 'CAST($1 AS date)')
    .replace(/TRY_CONVERT\(datetime2,(@\w+)\)/gi, 'CAST($1 AS timestamp)')
    .replace(/SYSDATETIME\(\)/gi, "(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')");
  const top = q.match(/^SELECT TOP\s*(?:\((\d+)\)|(\d+))\s+/i);
  if (top) q = q.replace(top[0], 'SELECT ') + ' LIMIT ' + (top[1] || top[2]);
  const output = q.match(/\s+OUTPUT INSERTED\.(\w+) AS id\s+/i);
  if (output) q = q.replace(output[0], ' ') + ' RETURNING ' + output[1] + ' AS id';
  const names = [];
  q = q.replace(/@(\w+)/g, (_, name) => {
    if (!Object.hasOwn(inputs, name)) throw Error('Missing query parameter: ' + name);
    if (!names.includes(name)) names.push(name);
    return '$' + (names.indexOf(name) + 1);
  });
  return { text: q, values: names.map(name => inputs[name]) };
}
function mapResult(result) { return {recordset:result.rows || [],rowsAffected:[result.rowCount ?? result.affectedRows ?? 0]}; }
function mapError(error) {
  if (error.code === '23505') error.number = 2627;
  if (['23503','23514','40001','40P01'].includes(error.code)) error.number = 547;
  return error;
}
class Request {
  constructor(transaction) { this.transaction=transaction; this.inputs={}; }
  input(name,value) { this.inputs[name]=value; return this; }
  async query(text) {
    const query = translate(text,this.inputs);
    try {
      if (this.transaction) return mapResult(await this.transaction.client.query(query.text,query.values));
      return mapResult(await pool().query(query.text,query.values));
    } catch(error) { throw mapError(error); }
  }
  async execute(name) {
    const allowed = ['usp_create_booking','usp_start_booking','usp_cancel_booking','usp_use_material','usp_complete_booking','sp_process_car_wash_booking','usp_save_customer','usp_delete_customer','usp_save_vehicle','usp_delete_vehicle'];
    if (!allowed.includes(name)) throw Error('Unsupported database operation');
    const keys=Object.keys(this.inputs);
    try {
      const result = await pool().query(`SELECT * FROM dbo.${name}(${keys.map((key,i)=>`p_${key} => $${i+1}`).join(',')})`,keys.map(key=>this.inputs[key]));
      return mapResult(result);
    } catch(error) { throw mapError(error); }
  }
}
let realPool;
function pool() {
  if (injectedPool) return injectedPool;
  if (!realPool) {
    const url = new URL(process.env.DATABASE_URL);
    if (url.hostname.endsWith('.neon.tech')) url.searchParams.set('sslmode','verify-full');
    realPool = new Pool({connectionString:url.toString(),max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:15000,allowExitOnIdle:true});
    realPool.on('error', error => console.error('PostgreSQL idle connection:',error.code || 'connection error'));
  }
  return realPool;
}
class Transaction {
  async begin() {
    this.client=await pool().connect();
    try {
      await this.client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await this.client.query('SELECT pg_advisory_xact_lock(857210)');
    } catch(error) { this.client.release();this.client=null;throw mapError(error); }
  }
  async commit() { try {await this.client.query('COMMIT');} finally {this.client.release();this.client=null;} }
  async rollback() { if(this.client) try {await this.client.query('ROLLBACK');} finally {this.client.release();this.client=null;} }
}
module.exports={connect:async()=>({request:()=>new Request()}),Request,Transaction,ISOLATION_LEVEL:{SERIALIZABLE:'SERIALIZABLE'},translate,setTestPool:p=>{injectedPool=p;}};
