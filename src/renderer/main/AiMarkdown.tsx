import { useMemo, type ReactNode } from 'react';
import { parseAiMarkdown, type AiInline } from '../../shared/ai-markdown';

function Inline({ inline }: { inline: readonly AiInline[] }) {
  return (
    <>
      {inline.map((piece, i) => {
        let node: ReactNode = piece.text;
        if (piece.italic) node = <i>{node}</i>;
        if (piece.bold) node = <b>{node}</b>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

/**
 * Ответ модели с оформлением: заголовки разделов, списки, жирный, курсив (shared/ai-markdown.ts). Ссылки и HTML —
 * простым текстом: React выводит их как текст. caret — курсор в конце, пока модель пишет.
 */
export function AiMarkdown({ text, caret = false }: { text: string; caret?: boolean }) {
  const blocks = useMemo(() => parseAiMarkdown(text), [text]);
  const cursor = caret ? <span className="caret" aria-hidden="true" /> : null;
  if (blocks.length === 0) return cursor && <p>{cursor}</p>;
  return (
    <div className="ai-md">
      {blocks.map((block, i) => {
        const end = i === blocks.length - 1 ? cursor : null;
        if (block.kind === 'heading') {
          return (
            <h4 key={i}>
              <Inline inline={block.inline} />
              {end}
            </h4>
          );
        }
        if (block.kind === 'paragraph') {
          return (
            <p key={i}>
              <Inline inline={block.inline} />
              {end}
            </p>
          );
        }
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Inline inline={item} />
                {j === block.items.length - 1 ? end : null}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
