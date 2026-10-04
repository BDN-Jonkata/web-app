import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {challengeTiming,isVerifiedAuthentication} from './authFlow.js';
import {translate,errorText} from './i18n.js';

test('only completed email verification can mark the frontend authenticated',()=>{
  assert.equal(isVerifiedAuthentication({verificationRequired:true}),false);
  assert.equal(isVerifiedAuthentication({user:{id:'user',isEmailVerified:false}}),false);
  assert.equal(isVerifiedAuthentication({user:{id:'user',isEmailVerified:true}}),true);
  assert.equal(isVerifiedAuthentication({verificationRequired:true,user:{id:'user',isEmailVerified:true}}),false);
});
test('verification timer clamps expired/malformed dates and keeps separate resend cooldown',()=>{
  const now=Date.parse('2026-10-04T12:00Z');
  const challenge={expiresAt:new Date(now+600000).toISOString(),resendAt:new Date(now+60000).toISOString()};
  assert.deepEqual(challengeTiming(challenge,now),{expiresIn:600,resendIn:60});
  assert.deepEqual(challengeTiming(challenge,now+61000),{expiresIn:539,resendIn:0});
  assert.deepEqual(challengeTiming(challenge,now+600001),{expiresIn:0,resendIn:0});
  assert.deepEqual(challengeTiming({},now),{expiresIn:0,resendIn:0});
});
test('dialog includes signup/login verification, password recovery and safe code entry',()=>{
  const source=readFileSync(new URL('./AuthDialog.jsx',import.meta.url),'utf8');
  for(const text of ['/auth/forgot-password','/auth/resend-code',"authenticate('verify-code'",'autoComplete="one-time-code"','name="confirmPassword"','pattern="[0-9]{6}"','notificationPending','form.reset()'])assert.ok(source.includes(text),text);
  assert.doesNotMatch(source,/localStorage|sessionStorage/);
  const settings=readFileSync(new URL('./AppSettings.jsx',import.meta.url),'utf8');
  assert.ok(settings.indexOf('if(data.verificationRequired)return data')<settings.indexOf('setUser(data.user);setPreferences(normalizePreferences(data.user.preferences));setNotice(null)'));
});
test('authentication controls and errors are translated in both languages',()=>{
  for(const label of ['Забравена парола?','Нова парола','Повтори новата парола','Код от имейла','Потвърди имейла си','Изпрати кода отново','Промени паролата']){
    assert.notEqual(translate('en',label),label);assert.equal(translate('bg',label),label);
  }
  for(const code of ['EMAIL_NOT_CONFIGURED','EMAIL_UNAVAILABLE','EMAIL_RATE_LIMIT','INVALID_VERIFICATION','PASSWORD_MISMATCH'])assert.notEqual(errorText({code},'bg'),errorText({code},'en'));
});
