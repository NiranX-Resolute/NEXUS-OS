const META_REASONING_PATTERNS = [
  /\btranscription error\b/i,
  /\bestablished persona\b/i,
  /\bexpected persona\b/i,
  /\btarget persona\b/i,
  /\bpersona dictates\b/i,
  /\bHinglish style\b/i,
  /\bprioritizing action\b/i,
  /\bwitty reply\b/i,
  /\bfriendly greeting\b/i,
  /\buser'?s task\b/i,
  /\buser'?s presence\b/i,
  /\buser'?s initial\b/i,
  /\backnowledg(?:e|ing) (?:the )?user\b/i,
  /\bcurrently inactive\b/i,
  /\bawaiting (?:a )?clear instruction\b/i,
  /\bholding my response\b/i,
  /\bready to process\b/i,
  /\bnon-verbal\b/i,
  /\bhedging my bets\b/i,
  /\bclarification is in order\b/i,
  /\bvalid preset\b/i,
  /\bpreset names?\b/i,
  /\bparameter\b/i,
  /\bappropriate tool\b/i,
  /\bsuitable for this request\b/i,
  /\bstep is to call\b/i,
  /\bsuccessfully initiated\b/i,
  /\baudio tools are apparent\b/i,
  /\bgeneric bot-like\b/i,
  /\bcasual Hinglish tone\b/i,
  /\bcharismatic,? sharp tone\b/i,
  /\bpath forward\b/i,
  /\bMy directive is\b/i,
  /\bmy directive\b/i,
  /\boptimal response\b/i,
  /\bdecision process\b/i,
  /\bI see the user\b/i,
  /\bI see that\b/i,
  /\bI (?:have|'ve) determined\b/i,
  /\bI am confident\b/i,
  /\bI(?:'m| am) choosing to\b/i,
  /\bWhile context includes\b/i,
  /\bIt seems "[^"]+"!/i,
  /\bMy initial read is\b/i,
  /\bLet's start with a casual\b/i,
  /\bthis Hinglish is so much fun!\b/i,
  /\bShould I assume\b/i,
  /\bI need to be\b/i,
  /\bI'll maintain\b/i,
  /\bI will maintain\b/i,
  /\bI'll offer\b/i,
  /\bI will offer\b/i,
  /\bI avoided generic\b/i,
  /\bI will respond\b/i,
  /\bTherefore,? I (?:opted|decided|choose)\b/i,
  /\bI opted (?:for|to)\b/i,
  /\bopted for\b/i,
  /\bto begin\.?\b/i,
  /\bIt offers a\b/i,
  /\bformulat(?:e|ing) (?:a|the) response\b/i,
  /\bcrafting (?:a|the) response\b/i,
  /\bdeliberat(?:e|ing)\b/i,
  /\bchain-?of-?thought\b/i,
  /\binternal (?:read|reasoning|plan)\b/i,
  /\bresponse strategy\b/i
]

export const sanitizeSpeechText = (raw: string): string => {
  if (!raw) return ''
  let text = raw
    .replace(/<\|nospeech\|>/gi, '')
    .replace(/<(?:no[- ]speech|silence|applause|music|laughter|noise)>[\s\S]*?/gi, '')
    .replace(/\[(?:no[- ]speech|silence|applause|music|laughter|noise)\]/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    // Strip bold reasoning headers like **Analyzing the Greeting**, **Awaiting User Input**, **Acknowledge User's Entry**, etc.
    .replace(/\*\*(?:[^*]|\*(?!\*))+\*\*/gi, '')
    // Strip markdown headings used for planning
    .replace(/^#+\s+[^\n]+/gim, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Split into sentences and discard any sentence matching internal chain-of-thought patterns
  const sentenceChunks = text.match(/[^.!?]+[.!?]+|\S+/g) || []
  if (sentenceChunks.length > 0) {
    const validSentences: string[] = []
    for (const chunk of sentenceChunks) {
      const trimmedChunk = chunk.trim()
      const isMeta = META_REASONING_PATTERNS.some((pattern) => pattern.test(trimmedChunk))
      if (!isMeta) {
        // Also deduplicate consecutive identical phrases
        if (!validSentences.some((s) => s.toLowerCase() === trimmedChunk.toLowerCase())) {
          validSentences.push(trimmedChunk)
        }
      } else {
        // If the meta sentence contains a quoted actual utterance like: Therefore, I opted for "Yo, kya chal raha hai?" to begin.
        const quotedMatch = trimmedChunk.match(/"([^"]{3,})"/i)
        if (quotedMatch && quotedMatch[1]) {
          const extractedQuote = quotedMatch[1].trim()
          const isQuoteMeta = META_REASONING_PATTERNS.some((pattern) => pattern.test(extractedQuote))
          if (!isQuoteMeta && !validSentences.some((s) => s.toLowerCase() === extractedQuote.toLowerCase())) {
            validSentences.push(extractedQuote)
          }
        }
      }
    }
    text = validSentences.join(' ').trim()
  }

  // If after stripping reasoning only ellipses, pure punctuation, unicode replacement chars or spaces remain, return empty
  if (/^[\s.!?…\-—\uFFFD]*$/.test(text)) return ''
  return text
}

export const isThoughtOrHoldingText = (text: string): boolean => {
  if (!text) return true
  const trimmed = text.trim()

  // XML thought tags
  if (
    /^<thought>[\s\S]*?<\/thought>$/i.test(trimmed) ||
    /^<thinking>[\s\S]*?<\/thinking>$/i.test(trimmed)
  ) {
    return true
  }

  // Pure holding / inactive status reports
  if (
    /^(?:\*\*[^*]+\*\*\s*)?(?:I am currently inactive|awaiting (?:a )?clear instruction|holding my response|ready to process when the user|previous input was non-verbal)/i.test(
      trimmed
    )
  ) {
    return true
  }

  // Check if sanitized text is empty
  const sanitized = sanitizeSpeechText(trimmed)
  return sanitized.length === 0
}

export const isMeaningfulUserSpeech = (raw: string): boolean => {
  if (!raw) return false
  const cleaned = sanitizeSpeechText(raw)
  if (!cleaned) return false

  // Reject bracketed noise tags like <noise>, [silence], etc.
  if (/^<[^>]+>$/i.test(cleaned) || /^\[[^\]]+\]$/i.test(cleaned)) return false

  // Reject strings made purely of punctuation, symbols, or question marks
  const alphaNumericOrIndic = cleaned.replace(/[\s\p{P}\p{S}\uFFFD]/gu, '')
  if (alphaNumericOrIndic.length < 1) {
    return false
  }

  // Reject isolated non-verbal filler sounds or accidental Japanese kana transcribed from humming
  if (/^(?:um+|uh+|mm+|hmm+|ah+|er|un|うん|ええ|ああ)$/i.test(alphaNumericOrIndic.trim())) {
    return false
  }

  return true
}
