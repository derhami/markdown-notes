/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clipboard, Check } from 'lucide-react';
import { useToastStore } from '../stores/useToastStore';
import { titleFromHref, wikiLinkToMarkdown } from '../utils/links';
import { attachmentIdFromMarkdown, getAttachmentObjectUrl } from '../utils/attachments';
import { getTextDirection } from '../utils/notesHelper';
import { useVaultStore } from '../stores/useVaultStore';

interface MarkdownPreviewProps {
  content: string;
  onContentChange?: (newContent: string) => void;
  /** Called when the reader follows a [[wiki link]] to another note. */
  onOpenNote?: (title: string) => void;
}

// Images pasted into a note live in IndexedDB, not at a URL. They are read
// (and decrypted when needed) on demand and rendered from an object URL.
function AttachmentImage({ id, alt }: { id: string; alt?: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getAttachmentObjectUrl(id, useVaultStore.getState().derivedKey)
      .then((resolved) => {
        if (cancelled) return;
        if (resolved) setUrl(resolved);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!url) {
    return (
      <span className="block my-4 mx-auto max-w-full rounded border border-dashed border-stone-300 dark:border-stone-800 px-3 py-6 text-center text-[11px] text-stone-400">
        {failed ? 'Image unavailable — unlock the vault or re-attach it' : 'Loading image…'}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={alt || 'attachment'}
      className="max-w-full rounded border border-stone-200 dark:border-stone-800 mx-auto my-5"
    />
  );
}

// A highly interactive copy button showing a "Copied" checkmark state for 2 seconds
function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = React.useState(false);
  const { showToast } = useToastStore();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    showToast('Code copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-2.5 right-2.5 px-2 py-1 rounded bg-stone-100/90 hover:bg-stone-200/90 dark:bg-stone-900/80 dark:hover:bg-stone-800/80 text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 opacity-0 group-hover/code:opacity-100 transition-all duration-150 cursor-pointer z-10 flex items-center gap-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider select-none shadow-xs border border-stone-200/40 dark:border-stone-800/60"
      title="Copy Code"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Clipboard className="w-3.5 h-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// Helper to recursively extract text nodes from React children
const getTextFromChildren = (nodes: any): string => {
  if (!nodes) return '';
  if (typeof nodes === 'string') return nodes;
  if (Array.isArray(nodes)) return nodes.map(getTextFromChildren).join('');
  if (nodes.props?.children) return getTextFromChildren(nodes.props.children);
  return '';
};

// Direction of one block, decided by its first strong character so a Persian
// paragraph that contains English words (or the reverse) keeps one clean
// reading direction instead of flipping in the middle.
const directionOf = (text: string): 'rtl' | 'ltr' => getTextDirection(text);

export default function MarkdownPreview({ content, onContentChange, onOpenNote }: MarkdownPreviewProps) {
  const { showToast } = useToastStore();
  const renderedContent = React.useMemo(() => wikiLinkToMarkdown(content), [content]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('Code copied to clipboard', 'success');
  };

  const handleTaskCheckToggle = (index: number, checked: boolean) => {
    if (!onContentChange) return;

    let currentTaskIdx = 0;
    const lines = content.split('\n');
    
    const updatedLines = lines.map((line) => {
      const match = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/);
      if (match) {
        if (currentTaskIdx === index) {
          const replacementSymbol = checked ? 'x' : ' ';
          currentTaskIdx++;
          return `${match[1]}${replacementSymbol}${match[3]}`;
        }
        currentTaskIdx++;
      }
      return line;
    });

    onContentChange(updatedLines.join('\n'));
  };

  // Content-aware class constructor for paragraph/heading elements
  const blockDirection = (children: any) => directionOf(getTextFromChildren(children));
  const blockClass = (children: any, baseClasses: string) => {
    const dir = blockDirection(children);
    return `${baseClasses} text-start ${
      dir === 'rtl' ? 'font-vazir tracking-tight' : 'font-serif'
    }`;
  };

  const components = {
    // Custom list item mapping (Supports check state)
    li: ({ node, children, ...props }: any) => {
      const isTask = node?.children?.some(
        (c: any) => c.type === 'element' && c.tagName === 'input' && c.properties?.type === 'checkbox'
      );
      
      const dir = blockDirection(children);

      return (
        <li 
          dir={dir}
          className={`${isTask ? 'list-none flex items-start gap-2 -ms-6 my-1' : 'list-disc my-1.5'} 
            text-start ${dir === 'rtl' ? 'font-vazir' : 'font-serif'}`} 
          {...props}
        >
          {children}
        </li>
      );
    },
    input: ({ node, ...props }: any) => {
      if (props.type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={props.checked}
            className="w-4 h-4 rounded text-[var(--accent)] focus:ring-[var(--accent)] border-stone-300 dark:border-stone-800 bg-white dark:bg-[#1A1B1E] cursor-pointer transition-colors shrink-0 mt-1"
            onChange={(e) => {
              const taskCheckboxes = document.querySelectorAll('.markdown-body input[type="checkbox"]');
              const idx = Array.from(taskCheckboxes).indexOf(e.target as HTMLInputElement);
              if (idx !== -1) {
                handleTaskCheckToggle(idx, e.target.checked);
              }
            }}
          />
        );
      }
      return <input {...props} />;
    },
    h1: ({ children }: any) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/\s+/g, '-');
      return (
        <h1 
          id={id} 
          dir={blockDirection(children)}
          className={blockClass(children, "text-2xl font-bold text-stone-900 dark:text-stone-100 border-b border-stone-100 dark:border-[#2E3039] pb-2 mt-8 mb-4 leading-snug")}
        >
          {children}
        </h1>
      );
    },
    h2: ({ children }: any) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/\s+/g, '-');
      return (
        <h2 
          id={id} 
          dir={blockDirection(children)}
          className={blockClass(children, "text-xl font-bold text-stone-900 dark:text-stone-100 mt-7 mb-3 pb-0.5 leading-snug")}
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }: any) => {
      const text = children?.toString() || '';
      const id = text.toLowerCase().replace(/\s+/g, '-');
      return (
        <h3 
          id={id} 
          dir={blockDirection(children)}
          className={blockClass(children, "text-lg font-bold text-stone-900 dark:text-stone-100 mt-6 mb-2 leading-snug")}
        >
          {children}
        </h3>
      );
    },
    p: ({ children }: any) => {
      return (
        <p dir={blockDirection(children)} className={blockClass(children, "text-sm text-stone-700 dark:text-stone-300 my-4 leading-relaxed")}>
          {children}
        </p>
      );
    },
    pre: ({ children }: any) => {
      const codeElement = React.isValidElement(children) ? children : null;
      if (codeElement && codeElement.type === 'code') {
        const className = (codeElement.props as any)?.className || '';
        const match = /language-(\w+)/.exec(className);
        const codeString = String((codeElement.props as any)?.children || '').replace(/\n$/, '');
        const lang = match ? match[1] : '';

        return (
          <div className="relative group/code my-4 rounded border border-stone-300/50 dark:border-stone-800 overflow-hidden bg-[#F2F3F8]/40 dark:bg-[#222328]/20 text-xs select-text">
            {lang && (
              <span className="absolute top-2.5 left-3.5 text-[9px] font-mono uppercase tracking-widest text-stone-400 dark:text-stone-500 select-none pointer-events-none opacity-60">
                {lang}
              </span>
            )}
            <CodeBlockCopyButton code={codeString} />
            <pre className={`p-4 ${lang ? 'pt-8' : 'pt-4'} overflow-x-auto text-stone-800 dark:text-stone-300 font-mono text-[12px] leading-relaxed [direction:ltr] text-left`}>
              <code>{codeString}</code>
            </pre>
          </div>
        );
      }

      return (
        <pre className="p-4 rounded my-4 overflow-x-auto bg-[#F2F3F8]/40 dark:bg-[#222328]/20 border border-stone-300/50 dark:border-stone-800 text-left [direction:ltr] select-text font-mono text-xs">
          {children}
        </pre>
      );
    },
    code: ({ node, inline, className, children, ...props }: any) => {
      return (
        <code className="px-1 py-0.5 rounded bg-stone-100/60 dark:bg-[#222328] border border-stone-200/50 dark:border-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[11px]" {...props}>
          {children}
        </code>
      );
    },
    blockquote: ({ children }: any) => {
      const dir = blockDirection(children);
      return (
        <blockquote 
          dir={dir}
          className={`my-5 py-1 text-stone-500 bg-stone-50/40 dark:bg-stone-900/10 italic text-sm border-stone-200 dark:border-stone-800
            border-s-2 ps-4 pe-2 text-start ${dir === 'rtl' ? 'font-vazir' : 'font-serif'}`}
        >
          {children}
        </blockquote>
      );
    },
    table: ({ children }: any) => {
      return (
        <div className="overflow-x-auto my-6 max-w-full">
          <table className="min-w-full border-collapse text-left text-xs text-stone-700 dark:text-stone-300 select-text border-hidden">
            {children}
          </table>
        </div>
      );
    },
    thead: ({ children }: any) => (
      <thead className="border-t border-b-2 border-stone-200 dark:border-[#2E3039] font-semibold bg-transparent text-stone-800 dark:text-stone-200">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-stone-100/30 dark:divide-stone-900/10 border-b border-stone-200 dark:border-[#2E3039]">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="even:bg-stone-100/30 dark:even:bg-[#222328]/30 hover:bg-stone-100/50 dark:hover:bg-stone-800/20 transition-colors">
        {children}
      </tr>
    ),
    th: ({ children, node, ...props }: any) => (
      <th className="py-2.5 px-4 font-semibold text-stone-800 dark:text-stone-100 uppercase tracking-wider text-[11px] border-none" {...props}>
        {children}
      </th>
    ),
    td: ({ children, node, ...props }: any) => (
      <td className="py-3 px-4 leading-relaxed text-stone-600 dark:text-stone-300 text-xs border-none" {...props}>
        {children}
      </td>
    ),
    a: ({ href, children, ...props }: any) => {
      const linkedTitle = href ? titleFromHref(href) : null;
      if (linkedTitle) {
        return (
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault();
              onOpenNote?.(linkedTitle);
            }}
            className="text-[var(--accent)] dark:text-[var(--accent-dark)] underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
          >
            {children}
          </a>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[var(--accent)] dark:text-[var(--accent-dark)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
          {...props}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt }: any) => {
      const attachmentId = typeof src === 'string' ? attachmentIdFromMarkdown(src) : null;
      if (attachmentId) return <AttachmentImage id={attachmentId} alt={alt} />;
      return (
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="max-w-full rounded border border-stone-200 dark:border-stone-800 mx-auto my-5"
        />
      );
    },
    ul: ({ children }: any) => {
      const text = getTextFromChildren(children);
      const dir = directionOf(text);
      return (
        <ul dir={dir} className="list-disc my-3 ps-6 text-start">
          {children}
        </ul>
      );
    },
    ol: ({ children }: any) => {
      const text = getTextFromChildren(children);
      const dir = directionOf(text);
      return (
        <ol dir={dir} className="list-decimal my-3 ps-6 text-start">
          {children}
        </ol>
      );
    }
  };

  return (
    <div className="markdown-body select-text text-stone-800 dark:text-stone-200 pb-16 max-w-3xl mx-auto break-words font-serif">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as any}>
        {renderedContent || '*No content available. Click to write in the editor...*'}
      </ReactMarkdown>
    </div>
  );
}
