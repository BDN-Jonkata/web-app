export const DIVIDER_WIDTH=8;
export const WIDTH_KEY='energy-chat-width';

export function panelBounds(width){
  return {min:320,max:Math.max(320,width-400-DIVIDER_WIDTH)};
}

export function chatWidth(preferred,width){
  const {min,max}=panelBounds(width);
  const fallback=width<=1050?370:450;
  return Math.round(Math.min(max,Math.max(min,Number.isFinite(preferred)?preferred:fallback)));
}

export function readChatWidth(storage){
  try {
    const value=storage.getItem(WIDTH_KEY);
    const number=Number(value);
    return value!==null&&Number.isFinite(number)&&number>0?number:null;
  } catch { return null; }
}
