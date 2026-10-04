// Disposable test repository. Never imports Prisma, reads .env, or touches PostgreSQL.
export function authRepository(){
  const tables={user:new Map(),session:new Map(),authChallenge:new Map(),emailNotification:new Map()};
  let id=0,tail=Promise.resolve();
  function matches(record,where={}){
    return Object.entries(where).every(([key,value])=>{
      const actual=record[key];
      if(value&&typeof value==='object'&&!(value instanceof Date)){
        return Object.entries(value).every(([operator,target])=>operator==='lt'?actual<target:operator==='lte'?actual<=target:operator==='gt'?actual>target:operator==='gte'?actual>=target:operator==='in'?target.includes(actual):false);
      }
      return value===null?actual==null:actual===value;
    });
  }
  function update(record,data){
    for(const [key,value] of Object.entries(data))record[key]=value&&typeof value==='object'&&'increment' in value?(record[key]||0)+value.increment:value;
    return {...record};
  }
  const db={};
  for(const [table,records] of Object.entries(tables)){
    const primary=['session','authChallenge'].includes(table)?'tokenHash':'id';
    db[table]={
      async create({data}){
        if(table==='user'&&[...records.values()].some(item=>item.email===data.email))throw Object.assign(new Error('Duplicate'),{code:'P2002'});
        const record={id:'fixture-'+(++id),isActive:true,isEmailVerified:false,role:'USER',userId:null,attempts:0,sendCount:1,consumedAt:null,sentAt:null,createdAt:new Date(),...data};
        records.set(record[primary],record);return {...record};
      },
      async findUnique({where,include}){
        const record=[...records.values()].find(item=>matches(item,where));
        return record?{...record,...(include?.user?{user:tables.user.get(record.userId)?{...tables.user.get(record.userId)}:null}:{})}:null;
      },
      async findMany({where,orderBy,take,skip}={}){
        let result=[...records.values()].filter(item=>matches(item,where));
        if(orderBy){const [key,direction]=Object.entries(orderBy)[0];result.sort((a,b)=>(a[key]-b[key])*(direction==='desc'?-1:1))}
        if(skip)result=result.slice(skip);if(take)result=result.slice(0,take);return result.map(item=>({...item}));
      },
      async update({where,data}){const record=[...records.values()].find(item=>matches(item,where));if(!record)throw Error('Fixture missing');return update(record,data)},
      async updateMany({where,data}){let count=0;for(const record of records.values())if(matches(record,where)){update(record,data);count++}return {count}},
      async deleteMany({where}={}){let count=0;for(const [key,record] of records)if(matches(record,where)){records.delete(key);count++}return {count}}
    };
  }
  db.$transaction=(fn,options)=>{
    if(options&&options.isolationLevel!=='Serializable')throw Error('Expected serializable transaction');
    const run=tail.then(async()=>{
      const snapshots=structuredClone(tables);
      try{return await fn(db)}catch(error){
        for(const [table,records] of Object.entries(tables)){records.clear();for(const [key,value] of snapshots[table])records.set(key,value)}
        throw error;
      }
    });
    tail=run.catch(()=>{});return run;
  };
  return {db,tables};
}
