/**
 * Vditor IR treats bare `---` lines as thematic breaks. When those appear
 * inside fenced code (e.g. YAML frontmatter examples), setValue can stall
 * for seconds. Prefix them with ZWSP while the editor holds the text.
 */

const ZWSP = '\u200B';

/** Prefix bare `---` lines that sit inside fenced code blocks. */
export function protectHrInFences(markdown: string): string {
  return mapFenceLines(markdown, (line) =>
    /^---\s*$/.test(line) ? ZWSP + line : line
  );
}

/** Strip ZWSP prefixes we added before persisting to disk. */
export function unprotectHrInFences(markdown: string): string {
  return markdown.replace(new RegExp(`^${ZWSP}---\\s*$`, 'gm'), '---');
}

function mapFenceLines(
  markdown: string,
  mapInside: (line: string) => string
): string {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = line.match(/^(`{3,}|~{3,})(.*)$/);
    if (open) {
      const marker = open[1][0];
      const len = open[1].length;
      if (!inFence) {
        inFence = true;
        fenceMarker = marker.repeat(len);
      } else if (
        line.startsWith(fenceMarker) &&
        /^[`~]+$/.test(line.trim())
      ) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }
    if (inFence) {
      lines[i] = mapInside(line);
    }
  }
  return lines.join('\n');
}
