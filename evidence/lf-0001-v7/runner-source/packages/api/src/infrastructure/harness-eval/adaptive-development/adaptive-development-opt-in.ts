import { ADAPTIVE_DEVELOPMENT_MODE } from './adaptive-development-types.js';

export interface AdaptiveDevelopmentOptInDetection {
  activated: boolean;
  mode?: typeof ADAPTIVE_DEVELOPMENT_MODE;
  alias?: 'adaptive-development-sop' | 'adaptive-local-trial' | 'free-plan-hard-gates';
  reason: string;
}

const ALIASES: Array<{
  alias: NonNullable<AdaptiveDevelopmentOptInDetection['alias']>;
  pattern: RegExp;
}> = [
  {
    alias: 'adaptive-development-sop',
    pattern: /\badaptive[-_\s]development[-_\s]sop\b/i,
  },
  {
    alias: 'adaptive-local-trial',
    pattern: /\badaptive[-_\s]local[-_\s]trial\b/i,
  },
  {
    alias: 'free-plan-hard-gates',
    pattern: /\bfree[-_\s]*plan\s*(?:\+|and|with|[-_\s])*\s*hard[-_\s]*gates?\b/i,
  },
];

const ACTIVATION_LANGUAGE =
  /(?:请|按|使用|启用|开始|进入|切换|采用|推进|执行|运行|需要|后续需要|开始用|改用|use|enable|start|enter|switch|run|proceed|opt[-\s]?in|continue\s+with)/i;
const NEGATION_LANGUAGE = /(?:不要|不启用|不使用|不用|无需|禁止|别用|without|do\s+not|don't|dont|must\s+not|disable)/i;
const DISCUSSION_ONLY =
  /(?:是什么|什么是|区别|差别|如何选择|怎么选|会不会|是否应该|介绍|解释|文档.*提到|what\s+is|difference|compare|comparison|should\s+we|how\s+do|mentioned\s+in)/i;

/**
 * Conservative runtime detector for the public Free Plan aliases.
 *
 * The detector intentionally needs both an alias and activation language. Merely
 * discussing the Skill must not create an evaluation episode.
 */
export function detectAdaptiveDevelopmentOptIn(text: string): AdaptiveDevelopmentOptInDetection {
  const normalized = text.trim();
  const match = ALIASES.find(({ pattern }) => pattern.test(normalized));
  if (!match) {
    return { activated: false, reason: 'no public adaptive-development alias found' };
  }
  if (NEGATION_LANGUAGE.test(normalized)) {
    return { activated: false, alias: match.alias, reason: 'alias is explicitly negated' };
  }
  if (DISCUSSION_ONLY.test(normalized) && !hasStrongImperative(normalized)) {
    return { activated: false, alias: match.alias, reason: 'alias is discussed rather than activated' };
  }
  if (!ACTIVATION_LANGUAGE.test(normalized)) {
    return { activated: false, alias: match.alias, reason: 'alias lacks explicit activation language' };
  }
  return {
    activated: true,
    mode: ADAPTIVE_DEVELOPMENT_MODE,
    alias: match.alias,
    reason: 'explicit public-alias activation',
  };
}

function hasStrongImperative(text: string): boolean {
  return /(?:请(?:按|使用|启用|开始|采用)|现在(?:启用|开始|切换)|must\s+(?:use|enable)|please\s+(?:use|enable|start))/i.test(
    text,
  );
}
