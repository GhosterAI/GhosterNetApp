import React from 'react'
import * as Flags from 'country-flag-icons/react/3x2'
import { Server } from 'lucide-react'

interface CountryFlagProps {
  code?: string
  className?: string
  fallback?: React.ReactNode
}

const COUNTRY_PATTERNS: Array<{ code: string; regex: RegExp }> = [
  { code: 'NL', regex: /(?:\uD83C\uDDF3\uD83C\uDDF1|\bNL\b|netherlands|нидерланд|амстердам|amsterdam)/i },
  { code: 'DE', regex: /(?:\uD83C\uDDE9\uD83C\uDDEA|\bDE\b|germany|германи|франкфурт|frankfurt|берлин|berlin)/i },
  { code: 'US', regex: /(?:\uD83C\uDDFA\uD83C\uDDF8|\bUS\b|\bUSA\b|united states|сша|америк|нью-йорк|new york|лонг|вашингтон|штат)/i },
  { code: 'FI', regex: /(?:\uD83C\uDDEB\uD83C\uDDEE|\bFI\b|finland|финлянди|хельсинки|helsinki)/i },
  { code: 'SE', regex: /(?:\uD83C\uDDF8\uD83C\uDDEA|\bSE\b|sweden|швеци|стокгольм|stockholm)/i },
  { code: 'GB', regex: /(?:\uD83C\uDDEC\uD83C\uDDE7|\bGB\b|\bUK\b|united kingdom|london|лондон|великобритан|англи)/i },
  { code: 'FR', regex: /(?:\uD83C\uDDEB\uD83C\uDDF7|\bFR\b|france|франци|париж|paris)/i },
  { code: 'PL', regex: /(?:\uD83C\uDDF5\uD83C\uDDF1|\bPL\b|poland|польш|варшав|warsaw)/i },
  { code: 'KZ', regex: /(?:\uD83C\uDDF0\uD83C\uDDFF|\bKZ\b|kazakhstan|казахстан|алмат|астан)/i },
  { code: 'TR', regex: /(?:\uD83C\uDDF9\uD83C\uDDF7|\bTR\b|turkey|турци|стамбул|istanbul)/i },
  { code: 'RU', regex: /(?:\uD83C\uDDF7\uD83C\uDDFA|\bRU\b|russia|росси|москв|moscow|питер|spb)/i },
  { code: 'SG', regex: /(?:\uD83C\uDDF8\uD83C\uDDEC|\bSG\b|singapore|сингапур)/i },
  { code: 'JP', regex: /(?:\uD83C\uDDEF\uD83C\uDDF5|\bJP\b|japan|япони|токио|tokyo)/i },
  { code: 'CH', regex: /(?:\uD83C\uDDE8\uD83C\uDDED|\bCH\b|switzerland|швейцари|цюрих)/i },
  { code: 'AT', regex: /(?:\uD83C\uDDE6\uD83C\uDDF9|\bAT\b|austria|австри|вена)/i },
  { code: 'CZ', regex: /(?:\uD83C\uDDE8\uD83C\uDDFF|\bCZ\b|czech|чехи|прага)/i },
  { code: 'ES', regex: /(?:\uD83C\uDDEA\uD83C\uDDF8|\bES\b|spain|испани|мадрид|барселон)/i },
  { code: 'IT', regex: /(?:\uD83C\uDDEE\uD83C\uDDF9|\bIT\b|italy|итали|рим|милан)/i },
  { code: 'CA', regex: /(?:\uD83C\uDDE8\uD83C\uDDE6|\bCA\b|canada|канада|торонто)/i },
  { code: 'UA', regex: /(?:\uD83C\uDDFA\uD83C\uDDE6|\bUA\b|ukraine|украин|киев)/i },
  { code: 'NO', regex: /(?:\uD83C\uDDF3\uD83C\uDDF4|\bNO\b|norway|норвеги|осло)/i },
  { code: 'DK', regex: /(?:\uD83C\uDDE9\uD83C\uDDF0|\bDK\b|denmark|дания|копенгаген)/i },
  { code: 'IE', regex: /(?:\uD83C\uDDEE\uD83C\uDDEA|\bIE\b|ireland|ирланди|дублин)/i },
  { code: 'EE', regex: /(?:\uD83C\uDDEA\uD83C\uDDEA|\bEE\b|estonia|эстони|таллин)/i },
  { code: 'LV', regex: /(?:\uD83C\uDDF1\uD83C\uDDF8|\bLV\b|latvia|латви|рига)/i },
  { code: 'LT', regex: /(?:\uD83C\uDDF1\uD83C\uDDF9|\bLT\b|lithuania|литва|вильнюс)/i },
  { code: 'RO', regex: /(?:\uD83C\uDDF7\uD83C\uDDF4|\bRO\b|romania|румыни|бухарест)/i },
  { code: 'RS', regex: /(?:\uD83C\uDDF7\uD83C\uDDF8|\bRS\b|serbia|серби|белград)/i },
  { code: 'BG', regex: /(?:\uD83C\uDDE7\uD83C\uDDEC|\bBG\b|bulgaria|болгари|софия)/i },
  { code: 'HU', regex: /(?:\uD83C\uDDE8\uD83C\uDDFA|\bHU\b|hungary|венгри|будапешт)/i },
  { code: 'BR', regex: /(?:\uD83C\uDDE7\uD83C\uDDF7|\bBR\b|brazil|бразили)/i },
  { code: 'AU', regex: /(?:\uD83C\uDDE6\uD83C\uDDFA|\bAU\b|australia|австрали|сидней)/i },
  { code: 'IN', regex: /(?:\uD83C\uDDEE\uD83C\uDDF3|\bIN\b|india|инди|мумбаи)/i },
  { code: 'HK', regex: /(?:\uD83C\uDDED\uD83C\uDDF0|\bHK\b|hong kong|гонконг)/i },
  { code: 'TW', regex: /(?:\uD83C\uDDF9\uD83C\uDDFC|\bTW\b|taiwan|тайвань)/i },
  { code: 'KR', regex: /(?:\uD83C\uDDF0\uD83C\uDDF7|\bKR\b|korea|корея|сеул)/i },
  { code: 'AE', regex: /(?:\uD83C\uDDE6\uD83C\uDDEA|\bAE\b|uae|оаэ|дубай|dubai)/i }
]

export function extractCodeFromEmoji(str?: string): string {
  if (!str) return ''
  const matches = str.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/g)
  if (matches && matches.length > 0) {
    const pair = matches[0]
    const c1 = pair.codePointAt(0)! - 0x1f1e6 + 65
    const c2 = pair.codePointAt(2)! - 0x1f1e6 + 65
    return String.fromCharCode(c1, c2).toUpperCase()
  }
  return ''
}

export function detectCountryCode(text?: string): string {
  if (!text) return ''
  const emojiCode = extractCodeFromEmoji(text)
  if (emojiCode) return emojiCode
  for (const { code, regex } of COUNTRY_PATTERNS) {
    if (regex.test(text)) return code
  }
  return ''
}

export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  className = 'w-5 h-3.5 object-cover',
  fallback
}) => {
  const cleanCode = (code || '').trim().toUpperCase()
  if (!cleanCode || cleanCode.length !== 2) {
    return <>{fallback ?? <Server className="size-3.5 text-primary" />}</>
  }

  const Flag = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[cleanCode]

  if (!Flag) {
    return <>{fallback ?? <Server className="size-3.5 text-primary" />}</>
  }

  return (
    <span className="inline-flex items-center justify-center shrink-0 overflow-hidden rounded-[2px] shadow-xs">
      <Flag className={className} />
    </span>
  )
}
