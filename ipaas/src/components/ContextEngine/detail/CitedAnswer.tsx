/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Box, ButtonBase } from '@wso2/oxygen-ui';
import { Children, cloneElement, createContext, isValidElement, useContext, type JSX, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citationLinks, endsSentence, splitSentences } from '../../../utils/contextEngine';
import { answerMarkdownSx, citationMarkSx, litSentenceSx } from '../styles';

/** A citation someone is pointing at: its evidence number and, from the answer, the sentence it sits in. */
export interface CitationFocus {
  n: number;
  /** The sentence's id in the answer; absent when the passage itself is pointed at, which lights every sentence citing it. */
  sentence?: string;
}

interface LinkState {
  active: CitationFocus | null;
  pinned: CitationFocus | null;
  onHover: (focus: CitationFocus | null) => void;
  onPin: (focus: CitationFocus) => void;
}

const LinkContext = createContext<LinkState>({ active: null, pinned: null, onHover: () => undefined, onPin: () => undefined });

const matches = (focus: CitationFocus | null, n: number, sentence: string): boolean => !!focus && focus.n === n && (focus.sentence === undefined || focus.sentence === sentence);

/** A `[n]` citation drawn as a small numbered mark; the sentence it sits in is filled in by the block that groups sentences. */
function Mark({ n, sentence = '' }: { n: number; sentence?: string }): JSX.Element {
  const { active, pinned, onHover, onPin } = useContext(LinkContext);
  const isPinned = matches(pinned, n, sentence);
  return (
    <ButtonBase
      aria-label={`Evidence ${n}`}
      aria-pressed={isPinned}
      onMouseEnter={() => onHover({ n, sentence })}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover({ n, sentence })}
      onBlur={() => onHover(null)}
      onClick={() => onPin({ n, sentence })}
      sx={citationMarkSx(matches(active, n, sentence) || isPinned, isPinned)}>
      {n}
    </ButtonBase>
  );
}

const CITE_HREF = /^#cite-(\d+)$/;

/** The Markdown renderer's link: a `#cite-n` link becomes a mark, anything else opens in a new tab. The grouping block fills in `sentence`. */
function CiteLink({ href, children, sentence, node: _node, ...props }: JSX.IntrinsicElements['a'] & ExtraProps & { sentence?: string }): JSX.Element {
  const cite = href ? CITE_HREF.exec(href) : null;
  if (cite) return <Mark n={Number(cite[1])} sentence={sentence} />;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/** The citation number a child of a block stands for, or null when it is text or something else. */
function citeOf(node: ReactNode): number | null {
  if (!isValidElement(node) || node.type !== CiteLink) return null;
  const m = CITE_HREF.exec((node as ReactElement<{ href?: string }>).props.href ?? '');
  return m ? Number(m[1]) : null;
}

interface Group {
  nodes: ReactNode[];
  cites: number[];
  hasText: boolean;
}

/** Add a mark to a sentence, before the space or line break that ends it, so it sits with the words. */
function appendMark(group: Group, mark: ReactNode, n: number): void {
  if (!group.cites.includes(n)) group.cites.push(n);
  const last = group.nodes[group.nodes.length - 1];
  const m = typeof last === 'string' ? /^([\s\S]*?)( ?)(\s*)$/.exec(last) : null;
  if (m && (m[2] || m[3])) {
    group.nodes[group.nodes.length - 1] = m[1];
    group.nodes.push(mark, m[3]);
  } else group.nodes.push(mark);
}

/**
 * The inline content of one block, grouped into sentences so each can light
 * up with its citations. A mark belongs to the sentence before it, even after
 * that sentence's closing space or line break.
 */
function Sentences({ id, children }: { id: string; children: ReactNode }): JSX.Element {
  const { active, pinned } = useContext(LinkContext);
  const groups: Group[] = [];
  let current: Group = { nodes: [], cites: [], hasText: false };
  const close = () => {
    if (current.nodes.length) groups.push(current);
    current = { nodes: [], cites: [], hasText: false };
  };
  Children.toArray(children).forEach((child) => {
    const n = citeOf(child);
    if (n !== null) {
      appendMark(!current.hasText && groups.length ? groups[groups.length - 1] : current, child, n);
    } else if (typeof child === 'string') {
      splitSentences(child).forEach((piece) => {
        current.nodes.push(piece);
        if (piece.trim()) current.hasText = true;
        if (endsSentence(piece)) close();
      });
    } else {
      current.nodes.push(child);
      current.hasText = true;
    }
  });
  close();
  return (
    <>
      {groups.map((g, gi) => {
        const sentence = `${id}:${gi}`;
        const lit = g.cites.some((n) => matches(active, n, sentence) || matches(pinned, n, sentence));
        return (
          <Box key={sentence} component="span" sx={lit ? litSentenceSx : undefined}>
            {g.nodes.map((node, ni) => (citeOf(node) !== null ? cloneElement(node as ReactElement<{ sentence?: string }>, { key: ni, sentence }) : node))}
          </Box>
        );
      })}
    </>
  );
}

type BlockTag = 'p' | 'li' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
const BLOCK_CHILDREN = new Set(['p', 'ul', 'ol', 'pre', 'blockquote', 'table']);

/** A block whose inline content is grouped into sentences; a list item holding other blocks leaves them to group themselves. */
function block(tag: BlockTag) {
  const Block = ({ node, children }: JSX.IntrinsicElements[BlockTag] & ExtraProps): JSX.Element => {
    const id = `${tag}@${node?.position?.start.offset ?? 0}`;
    const Tag = tag;
    const nested = Children.toArray(children).some((c) => isValidElement(c) && (c.type === Paragraph || (typeof c.type === 'string' && BLOCK_CHILDREN.has(c.type))));
    return <Tag>{nested ? children : <Sentences id={id}>{children}</Sentences>}</Tag>;
  };
  Block.displayName = `Answer${tag}`;
  return Block;
}

const Paragraph = block('p');

const components: Components = {
  p: Paragraph,
  li: block('li'),
  h1: block('h1'),
  h2: block('h2'),
  h3: block('h3'),
  h4: block('h4'),
  h5: block('h5'),
  h6: block('h6'),
  a: CiteLink,
};

interface CitedAnswerProps {
  answer: string;
  /** How many passages the model was given; markers naming other numbers stay as text. */
  passages: number;
  active: CitationFocus | null;
  pinned: CitationFocus | null;
  onHover: (focus: CitationFocus | null) => void;
  onPin: (focus: CitationFocus) => void;
}

/**
 * An answer rendered from the model's Markdown, with its `[n]` citations as
 * small numbered marks. Pointing at a mark lights the sentence it supports;
 * the matching passage lights in the evidence rail beside the answer. Clicking
 * a mark pins it. Nothing pops up over the text.
 */
export default function CitedAnswer({ answer, passages, active, pinned, onHover, onPin }: CitedAnswerProps): JSX.Element {
  return (
    <LinkContext.Provider value={{ active, pinned, onHover, onPin }}>
      <Box sx={answerMarkdownSx}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {citationLinks(answer, passages)}
        </ReactMarkdown>
      </Box>
    </LinkContext.Provider>
  );
}
