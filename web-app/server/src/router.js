const complexSignals = /architect|migration|security|race condition|performance|refactor|database|debug|implement|code|integration/i;
const simpleSignals = /summarize|translate|rename|format|explain briefly|yes or no|list/i;

export function routePrompt(message) {
  const lengthScore = Math.min(25, Math.floor(message.length / 30));
  const complexScore = complexSignals.test(message) ? 36 : 8;
  const simpleDiscount = simpleSignals.test(message) ? 18 : 0;
  const complexity = Math.max(5, Math.min(100, 20 + lengthScore + complexScore - simpleDiscount));
  const model = complexity >= 82 ? 'Claude Opus' : complexity >= 55 ? 'Claude Sonnet' : 'Claude Haiku';
  const checks = [
    { question: 'Can Jev decompose this request?', answer: true, confidence: 98 },
    { question: 'Does it need repository context?', answer: /project|repo|code|file|app/i.test(message), confidence: 93 },
    { question: 'Does it require deep reasoning?', answer: complexity >= 55, confidence: 88 },
    { question: 'Is it safety-sensitive?', answer: /medical|legal|finance|security/i.test(message), confidence: 91 }
  ];
  return { model, complexity, confidence: Math.max(82, 99 - Math.abs(55 - complexity) / 3), checks };
}

export function composeDemoReply(message, route) {
  const hard = route.model !== 'Claude Haiku';
  return `I decomposed your request into ${route.checks.length} routing checks. ${hard ? 'The implementation and architecture need stronger reasoning' : 'The task is clear and can stay on the fast path'}, so I selected ${route.model}. In production, the conversational model would now receive the Jev decisions plus the cached project skeleton instead of rereading the whole codebase.`;
}
