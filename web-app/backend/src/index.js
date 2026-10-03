import {createApp} from './app.js';
import {loadBackendEnvironment} from './environment.js';

// Resolve backend/.env independently of where npm was started.
loadBackendEnvironment();
const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
const app=createApp();
app.listen(port,host,()=>console.log('Energy Bulgaria API listening on http://'+host+':'+port));
