import "server-only";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

/** Convierte Markdown (con tablas y listas GFM) a HTML saneado, seguro para insertar. */
export function renderMarkdown(src: string): string {
  const withMentions = src.replace(/@\[([^\]]{1,80})\]\([0-9a-f-]{36}\)/g, (_, n) => `<span class="mention">@${n}</span>`);
  const html = marked.parse(withMentions, { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags: ["h1", "h2", "h3", "h4", "p", "br", "hr", "ul", "ol", "li", "strong", "em", "del", "s", "a", "blockquote", "code", "pre",
      "table", "thead", "tbody", "tr", "th", "td", "input", "span", "img"],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"], span: ["class"], input: ["type", "checked", "disabled"],
      th: ["align"], td: ["align"], img: ["src", "alt", "title"], code: ["class"],
    },
    allowedClasses: { span: ["mention"], code: ["language-*"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https", "data"] },
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }) },
    exclusiveFilter: (frame) => frame.tag === "input" && frame.attribs.type !== "checkbox",
  });
}
