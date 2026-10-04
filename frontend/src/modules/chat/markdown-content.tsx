import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * The agent answers in markdown, so it is rendered rather than printed raw.
 * Styling stays on theme tokens, no hardcoded colours.
 */
export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed break-words', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => <h1 className="text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children }) => {
            const isBlock = Boolean(codeClassName)
            return isBlock ? (
              <code className="block overflow-x-auto rounded-md bg-background/60 p-3 font-mono text-xs">
                {children}
              </code>
            ) : (
              <code className="rounded bg-background/60 px-1 py-0.5 font-mono text-xs">{children}</code>
            )
          },
          pre: ({ children }) => <pre className="overflow-x-auto">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-border" />,
          // Tables scroll inside themselves so a wide result never stretches the bubble.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
