const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Palette mirrors the web app (frontend/src/appearance.css, default theme).
const color={ink:'#20342c',lime:'#d8ed93',accent:'#567c43',accentSoft:'#eaf1e3',bg:'#edf1eb',surface:'#fafbf7',paper:'#ffffff',
  line:'#dfe5dc',muted:'#69776e',warnBg:'#fff7e8',warnText:'#876a40',warnLine:'#f0dfbd'};
const font="'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif";
const mono="'IBM Plex Mono','SFMono-Regular',Consolas,'Courier New',monospace";

const brand=language=>language==='en'?'Energy Bulgaria':'Енергия България';
const footerText=language=>language==='en'
  ?'This is an automated message — please do not reply. We will never ask for your password or code by email, phone or chat.'
  :'Това е автоматично съобщение — моля, не отговаряй. Никога няма да поискаме паролата или кода ти по имейл, телефон или чат.';

function codeBlock(code,hint){
  const digits=String(code).split('').map(d=>
    '<td style="width:44px;height:56px;text-align:center;vertical-align:middle;background:'+color.paper+';border:1px solid '+color.line+';border-radius:10px;'+
    'font-family:'+mono+';font-size:28px;font-weight:700;color:'+color.ink+'">'+escape(d)+'</td>').join('<td style="width:6px"></td>');
  return '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px"><tr>'+digits+'</tr></table>'+
    (hint?'<p style="margin:0 0 4px;text-align:center;font-size:13px;color:'+color.muted+'">'+escape(hint)+'</p>':'');
}

function notice(text,tone='warn'){
  const warn=tone==='warn';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr>'+
    '<td style="padding:14px 16px;background:'+(warn?color.warnBg:color.accentSoft)+';border:1px solid '+(warn?color.warnLine:color.line)+';border-left:4px solid '+(warn?'#cda14a':color.accent)+';border-radius:10px;'+
    'font-size:14px;line-height:1.55;color:'+(warn?color.warnText:color.ink)+'">'+escape(text)+'</td></tr></table>';
}

function detailsTable(rows){
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;border:1px solid '+color.line+';border-radius:12px;border-collapse:separate;border-spacing:0;background:'+color.surface+'">'+
    rows.map(([label,value],i)=>'<tr><td style="padding:12px 16px;width:38%;font-size:13px;color:'+color.muted+';vertical-align:top;'+(i?'border-top:1px solid '+color.line:'')+'">'+escape(label)+'</td>'+
      '<td style="padding:12px 16px;font-size:14px;font-weight:600;color:'+color.ink+';word-break:break-word;vertical-align:top;'+(i?'border-top:1px solid '+color.line:'')+'">'+escape(value)+'</td></tr>').join('')+
    '</table>';
}

function layout({language,title,preheader,greeting,intro,body}){
  const name=brand(language);
  return '<!doctype html><html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>'+escape(title)+'</title></head>'+
    '<body style="margin:0;padding:0;background:'+color.bg+';font-family:'+font+';color:'+color.ink+';-webkit-text-size-adjust:100%">'+
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">'+escape(preheader)+'&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:'+color.bg+'"><tr><td align="center" style="padding:32px 16px">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">'+
      // header
      '<tr><td style="background:'+color.ink+';border-radius:18px 18px 0 0;padding:28px 32px">'+
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
          '<td style="width:40px;height:40px;background:'+color.lime+';border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;line-height:40px;color:'+color.ink+'">&#9889;</td>'+
          '<td style="padding-left:12px;font-size:18px;font-weight:700;letter-spacing:.2px;color:'+color.lime+'">'+escape(name)+'</td>'+
        '</tr></table></td></tr>'+
      // accent strip
      '<tr><td style="height:4px;background:'+color.accent+';font-size:0;line-height:0">&nbsp;</td></tr>'+
      // card
      '<tr><td style="background:'+color.paper+';padding:36px 32px 32px;border-left:1px solid '+color.line+';border-right:1px solid '+color.line+'">'+
        '<h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;font-weight:700;color:'+color.ink+'">'+escape(title)+'</h1>'+
        '<p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:'+color.ink+'">'+escape(greeting)+'</p>'+
        '<p style="margin:0;font-size:16px;line-height:1.6;color:'+color.ink+'">'+escape(intro)+'</p>'+
        body+
      '</td></tr>'+
      // footer
      '<tr><td style="background:'+color.surface+';border:1px solid '+color.line+';border-top:none;border-radius:0 0 18px 18px;padding:20px 32px;text-align:center">'+
        '<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:'+color.muted+'">'+escape(footerText(language))+'</p>'+
        '<p style="margin:0;font-size:12px;font-weight:600;color:'+color.accent+'">'+escape(name)+'</p></td></tr>'+
    '</table></td></tr></table></body></html>';
}

const codeCopy={
  bg:{
    SIGNUP:{subject:'Потвърди профила си',intro:'Благодарим, че се регистрира. Въведи кода по-долу, за да потвърдиш имейла си и да активираш профила.'},
    LOGIN:{subject:'Потвърди входа',intro:'Получихме опит за вход в профила ти. Въведи кода по-долу, за да потвърдиш, че си ти.'},
    RESET_PASSWORD:{subject:'Възстановяване на парола',intro:'Получихме заявка за промяна на паролата ти. Въведи кода по-долу, за да зададеш нова парола.'},
    greeting:name=>`Здравей, ${name},`,label:'Твоят код за потвърждение',
    hint:'Валиден е 10 минути',
    warn:'Въведи кода в същия браузър, от който го поиска. Не го споделяй с никого.',
    ignore:'Ако не си направил тази заявка, просто игнорирай имейла — профилът ти е в безопасност.'},
  en:{
    SIGNUP:{subject:'Confirm your account',intro:'Thanks for signing up. Enter the code below to verify your email and activate your account.'},
    LOGIN:{subject:'Confirm your login',intro:'We received a sign-in attempt on your account. Enter the code below to confirm it is you.'},
    RESET_PASSWORD:{subject:'Reset your password',intro:'We received a request to change your password. Enter the code below to set a new one.'},
    greeting:name=>`Hello ${name},`,label:'Your verification code',
    hint:'Expires in 10 minutes',
    warn:'Enter this code in the same browser where you requested it. Never share it with anyone.',
    ignore:'If you did not request this, you can safely ignore this email — your account is secure.'}
};

export function renderCodeEmail({language='bg',name,purpose,code}){
  const lang=language==='en'?'en':'bg',copy=codeCopy[lang],variant=copy[purpose]||copy.LOGIN;
  const title=variant.subject+' — '+brand(lang);
  const html=layout({language:lang,title:variant.subject,preheader:copy.label+': '+code+' · '+copy.hint,
    greeting:copy.greeting(name),intro:variant.intro,
    body:'<p style="margin:28px 0 0;text-align:center;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:'+color.accent+'">'+escape(copy.label)+'</p>'+
      codeBlock(code,copy.hint)+notice(copy.warn)+
      '<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:'+color.muted+'">'+escape(copy.ignore)+'</p>'});
  const text=[copy.greeting(name),'',variant.intro,'',copy.label+': '+code,copy.hint,'',copy.warn,copy.ignore].join('\n');
  return {subject:title,html,text};
}

export function renderPasswordChangedEmail({language='bg',name,changedAt,where,ip,device}){
  const en=language==='en',lang=en?'en':'bg';
  const title=(en?'Your password was changed':'Паролата ти беше променена')+' — '+brand(lang);
  const heading=en?'Your password was changed':'Паролата ти беше променена';
  const greeting=en?`Hello ${name},`:`Здравей, ${name},`;
  const intro=en?'The password of your account was just changed. Here are the details:':'Паролата на профила ти току-що беше променена. Ето подробностите:';
  const labels=en?['Time (UTC)','Approximate location','IP address','Device / browser']:['Време (UTC)','Приблизително местоположение','IP адрес','Устройство / браузър'];
  const approx=en?'IP location is approximate and may reflect a VPN, not your actual location.':'Местоположението по IP е приблизително и може да показва VPN, а не реалното ти място.';
  const action=en?'If this was not you, use “Forgot password?” immediately to recover your account. All previous sessions were signed out.'
    :'Ако не си ти, използвай „Забравена парола?“ веднага за възстановяване. Всички предишни сесии са прекратени.';
  const rows=[[labels[0],changedAt],[labels[1],where],[labels[2],ip],[labels[3],device]];
  const html=layout({language:lang,title:heading,preheader:en?'Your account password was changed.':'Паролата на профила ти беше променена.',greeting,intro,
    body:detailsTable(rows)+
      '<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:'+color.muted+'">'+escape(approx)+'</p>'+
      notice(action)});
  const text=[greeting,'',intro,...rows.map(([label,value])=>label+': '+value),approx,'',action].join('\n');
  return {subject:title,html,text};
}
