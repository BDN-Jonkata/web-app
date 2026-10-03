import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
import {createApp} from './app.js';

// npm --prefix server changes cwd, so resolve the root .env from this file.
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url))});
const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
const app=createApp();
app.listen(port,host,()=>console.log('Energy Bulgaria API listening on http://'+host+':'+port));
