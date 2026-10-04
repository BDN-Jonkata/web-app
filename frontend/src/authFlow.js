export function challengeTiming(challenge,now=Date.now()){
  const seconds=value=>Math.max(0,Math.ceil((Date.parse(value)-now)/1000)||0);
  return {expiresIn:seconds(challenge?.expiresAt),resendIn:seconds(challenge?.resendAt)};
}

export function isVerifiedAuthentication(data){
  return Boolean(data?.user?.id&&data.user.isEmailVerified===true&&!data.verificationRequired);
}
