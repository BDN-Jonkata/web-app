export function emailAuthPaths(csrfHeader){
  const json=schema=>({'application/json':{schema}});
  const string={type:'string'},email={type:'string',format:'email'},code={type:'string',pattern:'^[0-9]{6}$'};
  const password={type:'string',minLength:6,maxLength:30};
  const challenge={type:'object',properties:{verificationRequired:{type:'boolean',const:true},expiresAt:{type:'string',format:'date-time'},resendAt:{type:'string',format:'date-time'}},required:['verificationRequired','expiresAt','resendAt']};
  const profile={type:'object',properties:{user:{$ref:'#/components/schemas/UserProfile'},token:{type:'string',description:'Session token issued only after email code verification.'}},required:['user','token']};
  const endpoint=(summary,description,properties,required,status,schema,needsCookie=false)=>({post:{summary,description,tags:['Authentication'],
    security:needsCookie?[{verificationCookie:[]}]:[],parameters:[{...csrfHeader,required:true}],
    requestBody:{required:true,content:json({type:'object',properties,required})},
    responses:{[status]:{description:summary,content:json(schema)},'400':{description:'Invalid, expired, consumed code or invalid input.'},'429':{description:'IP/account rate limit or resend cooldown.'},'503':{description:'Database or SMTP unavailable.'}}}});
  return {
    '/api/auth/register':endpoint('Start signup verification','Creates an unverified account, sends a 10-minute code, and sets only an HttpOnly verification cookie. No session is issued.',
      {email,password,name:{type:'string',minLength:2,maxLength:60},preferences:{type:'object'}},['email','password','name'],202,challenge),
    '/api/auth/login':endpoint('Start login verification','Checks the password and sends an email code. No session is issued until verify-code.',{email,password:string,preferences:{type:'object'}},['email','password'],202,challenge),
    '/api/auth/verify-code':endpoint('Complete signup or login','Requires the verification cookie from the same browser and a single-use code; then issues the session.',{code},['code'],200,profile,true),
    '/api/auth/resend-code':endpoint('Resend email code','60-second cooldown, at most 3 sends per challenge. Does not extend expiry or reset failed attempts.',{},[],200,challenge,true),
    '/api/auth/forgot-password':endpoint('Request password recovery','Always returns the same response whether the account exists or not. Sends a code only for active accounts.',{email,language:{type:'string',enum:['bg','en']}},['email'],202,challenge),
    '/api/auth/reset-password':endpoint('Reset forgotten password','Requires the password-recovery cookie/code. Revokes all sessions and outstanding challenges. Queues a password-change email with time, IP/device and approximate location. Does not sign the user in.',
      {code,password,confirmPassword:password},['code','password','confirmPassword'],200,{type:'object',properties:{ok:{type:'boolean'},notificationPending:{type:'boolean'}}},true)
  };
}
