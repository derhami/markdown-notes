/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clipboard, Check } from 'lucide-react';
import { useToastStore } from '../stores/useToastStore';

interface MarkdownPreviewProps {
  content: string;
  onContentChange?: (newContent: string) => void;
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

// Check if content contains Persian/Arabic characters
const isRtlText = (text: string): boolean => {
  return /[\u0600-\u06FF]/.test(text);
};

export default function MarkdownPreview({ content, onContentChange }: MarkdownPreviewProps) {
  const { showToast } = useToastStore();

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
  const blockClass = (children: any, baseClasses: string) => {
    const text = getTextFromChildren(children);
    const rtl = isRtlText(text);
    return `${baseClasses} ${
      rtl 
        ? 'text-right font-vazir tracking-tight leading-relaxed [direction:rtl]' 
        : 'text-left font-serif leading-relaxed [direction:ltr]'
    }`;
  };

  const components = {
    // Custom list item mapping (Supports check state)
    li: ({ node, children, ...props }: any) => {
      const isTask = node?.children?.some(
        (c: any) => c.type === 'element' && c.tagName === 'input' && c.properties?.type === 'checkbox'
      );
      
      const rtl = isRtlText(getTextFromChildren(children));

      return (
        <li 
          className={`${isTask ? 'list-none flex items-start gap-2 -ms-6 my-1' : 'list-disc my-1.5'} 
            ${rtl ? 'font-vazir text-right [direction:rtl]' : 'font-serif text-left [direction:ltr]'}`} 
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
            className="w-4 h-4 rounded text-[#3E5A80] focus:ring-[#3E5A80] border-stone-300 dark:border-stone-800 bg-white dark:bg-[#141519] cursor-pointer transition-colors shrink-0 mt-1"
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
          className={blockClass(children, "text-2xl font-bold text-stone-900 dark:text-stone-100 border-b border-stone-100 dark:border-[#20222B] pb-2 mt-8 mb-4 leading-snug")}
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
          className={blockClass(children, "text-lg font-bold text-stone-900 dark:text-stone-100 mt-6 mb-2 leading-snug")}
        >
          {children}
        </h3>
      );
    },
    p: ({ children }: any) => {
      return (
        <p className={blockClass(children, "text-sm text-stone-700 dark:text-stone-300 my-4 leading-relaxed")}>
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
          <div className="relative group/code my-4 rounded border border-stone-250/50 dark:border-stone-850 overflow-hidden bg-[#FAF9F6]/40 dark:bg-[#101114]/20 text-xs select-text">
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
        <pre className="p-4 rounded my-4 overflow-x-auto bg-[#FAF9F6]/40 dark:bg-[#101114]/20 border border-stone-250/50 dark:border-stone-850 text-left [direction:ltr] select-text font-mono text-xs">
          {children}
        </pre>
      );
    },
    code: ({ node, inline, className, children, ...props }: any) => {
      return (
        <code className="px-1 py-0.5 rounded bg-stone-100/60 dark:bg-[#1C1D24] border border-stone-200/50 dark:border-stone-800 text-stone-700 dark:text-stone-300 font-mono text-[11px]" {...props}>
          {children}
        </code>
      );
    },
    blockquote: ({ children }: any) => {
      const text = getTextFromChildren(children);
      const rtl = isRtlText(text);
      return (
        <blockquote 
          className={`my-5 py-1 text-stone-500 bg-stone-50/40 dark:bg-stone-900/10 italic text-sm border-stone-200 dark:border-stone-800
            ${rtl 
              ? 'border-r-2 pr-4 pl-2 text-right font-vazir [direction:rtl]' 
              : 'border-l-2 pl-4 pr-2 text-left font-serif [direction:ltr]'}`}
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
      <thead className="border-t border-b-2 border-stone-200 dark:border-[#20222B] font-semibold bg-transparent text-stone-800 dark:text-stone-200">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-stone-100/30 dark:divide-stone-900/10 border-b border-stone-200 dark:border-[#20222B]">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="even:bg-stone-100/30 dark:even:bg-[#1C1D24]/30 hover:bg-stone-100/50 dark:hover:bg-stone-850/20 transition-colors">
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
    img: ({ src, alt }: any) => (
      <img 
        src={src} 
        alt={alt} 
        referrerPolicy="no-referrer"
        className="max-w-full rounded border border-stone-200 dark:border-stone-800 mx-auto my-5" 
      />
    ),
    ul: ({ children }: any) => {
      const text = getTextFromChildren(children);
      const rtl = isRtlText(text);
      return (
        <ul className={`list-disc my-3 ${rtl ? 'pr-6 text-right [direction:rtl]' : 'pl-6 text-left [direction:ltr]'}`}>
          {children}
        </ul>
      );
    },
    ol: ({ children }: any) => {
      const text = getTextFromChildren(children);
      const rtl = isRtlText(text);
      return (
        <ol className={`list-decimal my-3 ${rtl ? 'pr-6 text-right [direction:rtl]' : 'pl-6 text-left [direction:ltr]'}`}>
          {children}
        </ol>
      );
    }
  };

  return (
    <div className="markdown-body select-text text-stone-800 dark:text-stone-200 pb-16 max-w-3xl mx-auto break-words font-serif">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as any}>
        {content || '*No content available. Click to write in the editor...*'}
      </ReactMarkdown>
    </div>
  );
}
