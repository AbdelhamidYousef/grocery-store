import ReactMarkdown from 'react-markdown';

import { cn } from '../../lib/cn';

// Renders Markdown WITHOUT raw HTML. react-markdown builds React elements from the Markdown syntax
// tree and, by default, ignores any HTML written inside the text, so an editor (or an attacker who
// reached the admin) cannot put a <script> or an onerror handler into a guide. No `rehype-raw`
// plugin is installed on purpose. Links keep the library's default URL filter (no `javascript:`).
// Headings start at h2 in the content because the page already has its own h1.
export function MarkdownBody({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={cn(
        'max-w-prose space-y-4 text-lg leading-relaxed',
        '[&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold',
        '[&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-bold',
        '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1',
        '[&_a]:font-semibold [&_a]:text-primary-strong [&_a]:underline',
        className,
      )}
    >
      <ReactMarkdown>{source}</ReactMarkdown>
    </div>
  );
}
