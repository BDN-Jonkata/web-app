export const THEMES=['light','dark','system','forest','sunset'];
export const LANGUAGES=['bg','en'];
export const DEFAULT_PREFERENCES={theme:'system',language:'bg'};
export function normalizePreferences(input={}) {
  return {
    theme:THEMES.includes(input?.theme)?input.theme:DEFAULT_PREFERENCES.theme,
    language:LANGUAGES.includes(input?.language)?input.language:DEFAULT_PREFERENCES.language
  };
}
