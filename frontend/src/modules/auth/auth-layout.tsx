import type { ReactNode } from 'react'
import { ThemeToggle } from '@/components/theme/theme-toggle'

/**
 * Split shell for the auth screens: brand panel on the left, form on the right.
 * The panel keeps the navy in both themes because it is brand surface.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-navy-deep lg:flex lg:flex-col lg:p-12">
        <div
          className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--brand-orange)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-20 size-[24rem] rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--brand-orange-bright)' }}
        />

        <div className="relative">
          <p className="font-heading text-xl font-semibold tracking-[0.28em] text-white">AGENTVERSE</p>
          <p className="mt-1 text-sm text-brand-slate">Build Your AI Workforce</p>
        </div>

        <div className="relative my-auto space-y-6">
          <h2 className="font-heading text-4xl leading-tight font-bold text-white">
            Make your company smarter
            <br />
            with <span className="text-brand-orange-glow">every interaction.</span>
          </h2>
          <p className="max-w-md text-brand-ink">
            Connect the tools you already use and let the agent do the work inside them.
          </p>
        </div>
      </div>

      <div className="relative flex flex-col">
        <div className="flex justify-end p-4">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2 lg:hidden">
              <p className="font-heading text-lg font-semibold tracking-[0.28em]">AGENTVERSE</p>
            </div>
            <div className="space-y-2">
              <h1 className="font-heading text-3xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
