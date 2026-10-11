type AppTheme = 'light' | 'dark' | 'oled' | 'night'
type AccentColor =
  | 'default'
  | 'emerald'
  | 'violet'
  | 'blue'
  | 'cyan'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'teal'
  | 'orange'
type CoreSource = 'tgws' | 'zapret' | 'dns' | 'app' | 'psiphon'

// Unified log line shown in the Logs page. Type is the severity-ish level,
// payload is the text, source distinguishes which subsystem produced it.
interface ControllerLog {
  time: number
  type: 'info' | 'warn' | 'error' | 'debug'
  source: CoreSource
  payload: string
}
