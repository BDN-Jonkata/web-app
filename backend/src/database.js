import {PrismaClient} from '@prisma/client';
import {loadBackendEnvironment} from './environment.js';
let client;
export function getDatabase() {
  if(!client){
    if(!process.env.DATABASE_URL)loadBackendEnvironment();
    if(!process.env.DATABASE_URL)throw Object.assign(new Error('Database not configured'),{status:503,code:'DB_NOT_CONFIGURED'});
    const url=new URL(process.env.DATABASE_URL);
    if(!url.searchParams.has('connect_timeout'))url.searchParams.set('connect_timeout','3');
    if(!url.searchParams.has('pool_timeout'))url.searchParams.set('pool_timeout','3');
    client=new PrismaClient({datasources:{db:{url:url.toString()}},errorFormat:'minimal'});
  }
  return client;
}
