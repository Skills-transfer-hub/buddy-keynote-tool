import PptxGenJS from 'pptxgenjs';
import {
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  type Unzipped,
  type Zippable,
} from 'fflate';

import {
  STUDIO_SCHEMA_VERSION,
  createId,
  makeElement,
  type AspectRatio,
  type ChartElement,
  type Deck,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type TextElement,
} from './studio.ts';
import { buddyText } from './buddy.ts';

const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_ENTRY_BYTES = 24 * 1024 * 1024;
const MAX_XML_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;
const MAX_IMAGE_BYTES = 5_900_000;
const MAX_ZIP_ENTRIES = 2_048;
const MAX_SLIDES = 250;
const MAX_ELEMENTS_PER_SLIDE = 300;
const MAX_TOTAL_ELEMENTS = MAX_SLIDES * MAX_ELEMENTS_PER_SLIDE;
const EMU_PER_INCH = 914_400;
const CM_PER_INCH = 2.54;
const CSS_PIXEL_TO_POINT = 0.75;

type OfficeImportResult = { deck: Deck; warnings: string[] };
type SlideSize = { width: number; height: number };
type Rect = { x: number; y: number; w: number; h: number; rotation: number };
type Relationship = { target: string; type: string };

const TONE_COLORS = {
  paper: '#FFFFFF',
  mist: '#F0F0EC',
  ink: '#111111',
} as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function cleanHex(value: string, fallback = '111111') {
  const normalized = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(normalized)) {
    return normalized
      .split('')
      .map((character) => character + character)
      .join('')
      .toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(normalized)) return normalized.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(normalized))
    return normalized.slice(0, 6).toUpperCase();
  return fallback;
}

function hashColor(value: string, fallback = '#111111') {
  return `#${cleanHex(value, cleanHex(fallback))}`;
}

function transparency(opacity: number) {
  return Math.round((1 - clamp(finite(opacity, 1), 0, 1)) * 100);
}

function slideSize(aspectRatio: AspectRatio): SlideSize {
  return aspectRatio === '4:3'
    ? { width: 10, height: 7.5 }
    : { width: 13.333333, height: 7.5 };
}

function elementRect(element: SlideElement, size: SlideSize) {
  return {
    x: (finite(element.x) / 100) * size.width,
    y: (finite(element.y) / 100) * size.height,
    w: (Math.max(finite(element.w), 0.1) / 100) * size.width,
    h: (Math.max(finite(element.h), 0.1) / 100) * size.height,
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function parseDataUrl(source: string) {
  if (source.length > MAX_IMAGE_DATA_URL_LENGTH) return null;
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(source);
  if (!match) return null;
  const mime = (match[1] || 'application/octet-stream').toLowerCase();
  try {
    if (match[2]) {
      const binary = atob(match[3]);
      if (binary.length > MAX_IMAGE_BYTES) return null;
      return {
        mime,
        bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      };
    }
    const decoded = decodeURIComponent(match[3]);
    const bytes = strToU8(decoded);
    return bytes.length <= MAX_IMAGE_BYTES ? { mime, bytes } : null;
  } catch {
    return null;
  }
}

function dataUrl(mime: string, bytes: Uint8Array) {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function embeddableImageSource(source: string) {
  const inline = parseDataUrl(source);
  if (inline?.mime.startsWith('image/'))
    return dataUrl(inline.mime, inline.bytes);

  let url: URL;
  try {
    url = new URL(source, globalThis.location?.href);
  } catch {
    return null;
  }

  const sameOrigin =
    url.protocol === 'blob:' ||
    (globalThis.location !== undefined &&
      url.origin === globalThis.location.origin);
  if (!sameOrigin) return null;

  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const mime = (response.headers.get('content-type') || '')
      .split(';')[0]
      .toLowerCase();
    const announcedSize = Number(response.headers.get('content-length') || 0);
    if (!mime.startsWith('image/') || announcedSize > MAX_IMAGE_BYTES)
      return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return null;
    return dataUrl(mime, bytes);
  } catch {
    return null;
  }
}

function pptxShape(pptx: PptxGenJS, shape: ShapeElement['shape']) {
  switch (shape) {
    case 'ellipse':
      return pptx.ShapeType.ellipse;
    case 'triangle':
      return pptx.ShapeType.triangle;
    case 'line':
      return pptx.ShapeType.line;
    case 'arrow':
      return pptx.ShapeType.rightArrow;
    case 'star':
      return pptx.ShapeType.star5;
    case 'rectangle':
    default:
      return pptx.ShapeType.rect;
  }
}

function pptxChart(pptx: PptxGenJS, chart: ChartElement['chartType']) {
  switch (chart) {
    case 'line':
      return pptx.ChartType.line;
    case 'pie':
      return pptx.ChartType.pie;
    case 'bar':
    default:
      return pptx.ChartType.bar;
  }
}

function addPptxPlaceholder(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  element: SlideElement,
  size: SlideSize,
  message: string,
) {
  const rect = elementRect(element, size);
  slide.addShape(pptx.ShapeType.rect, {
    ...rect,
    fill: { color: 'F4F4F1', transparency: transparency(element.opacity) },
    line: { color: 'B8B8B2', dashType: 'dash', width: 1 },
    rotate: element.rotation,
  });
  slide.addText(message, {
    ...rect,
    align: 'center',
    breakLine: false,
    color: '5C5C57',
    fontFace: 'Inter',
    fontSize: 12,
    margin: 8,
    rotate: element.rotation,
    valign: 'middle',
  });
}

async function addPptxElement(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  element: SlideElement,
  size: SlideSize,
) {
  if (element.hidden) return;
  const rect = elementRect(element, size);
  const common = {
    ...rect,
    rotate: clamp(finite(element.rotation), -360, 360),
  };

  switch (element.kind) {
    case 'text': {
      const background = element.style.background;
      slide.addText(element.text, {
        ...common,
        align: element.style.align,
        bold: element.style.fontWeight >= 600,
        breakLine: false,
        charSpacing:
          finite(element.style.letterSpacing) *
          finite(element.style.fontSize) *
          CSS_PIXEL_TO_POINT,
        color: cleanHex(element.style.color),
        fill:
          background && background !== 'transparent'
            ? {
                color: cleanHex(background, 'FFFFFF'),
                transparency: transparency(element.opacity),
              }
            : undefined,
        fit: 'shrink',
        fontFace: element.style.fontFamily || 'Inter',
        fontSize: clamp(
          finite(element.style.fontSize, 18) * CSS_PIXEL_TO_POINT,
          5,
          300,
        ),
        italic: element.style.fontStyle === 'italic',
        lineSpacingMultiple: clamp(
          finite(element.style.lineHeight, 1.2),
          0.5,
          5,
        ),
        margin: 0,
        strike: element.style.textDecoration === 'line-through',
        transparency: transparency(element.opacity),
        underline:
          element.style.textDecoration === 'underline'
            ? { style: 'sng' }
            : undefined,
        valign: 'top',
      });
      return;
    }
    case 'shape':
      slide.addShape(
        element.shape === 'rectangle' && element.radius > 0
          ? pptx.ShapeType.roundRect
          : pptxShape(pptx, element.shape),
        {
          ...common,
          fill: {
            color: cleanHex(element.fill, 'F0F0EC'),
            transparency: transparency(element.opacity),
          },
          line: {
            color: cleanHex(element.stroke),
            transparency: transparency(element.opacity),
            width: Math.max(0, finite(element.strokeWidth, 1)),
          },
          rectRadius: clamp(finite(element.radius) / 100, 0, 1),
        },
      );
      return;
    case 'image': {
      const image = await embeddableImageSource(element.src);
      if (!image) {
        addPptxPlaceholder(
          pptx,
          slide,
          element,
          size,
          `Image non embarquée\n${element.alt || 'Source indisponible'}`,
        );
        return;
      }
      slide.addImage({
        ...common,
        altText: element.alt || 'Image de la présentation',
        data: image,
        rounding: element.borderRadius >= 999,
        sizing:
          element.fit === 'fill'
            ? undefined
            : { type: element.fit, w: rect.w, h: rect.h },
        transparency: transparency(element.opacity),
      });
      return;
    }
    case 'table': {
      const rows = element.cells.map((row, rowIndex) =>
        row.map((cell) => ({
          text: cell,
          options: {
            bold: element.headerRow && rowIndex === 0,
            color: cleanHex(element.textColor),
            fill: {
              color: cleanHex(element.fill, 'FFFFFF'),
              transparency: transparency(element.opacity),
            },
          },
        })),
      );
      slide.addTable(rows, {
        ...rect,
        border: { color: cleanHex(element.stroke, 'D6D6D0'), pt: 1 },
        fontFace: 'Inter',
        fontSize: 12,
        margin: 4,
        valign: 'middle',
      });
      return;
    }
    case 'chart':
      slide.addChart(
        pptxChart(pptx, element.chartType),
        element.datasets.map((dataset) => ({
          labels: element.labels,
          name: dataset.label,
          values: dataset.values,
        })),
        {
          ...rect,
          chartColors: element.datasets.map((dataset) =>
            cleanHex(dataset.color),
          ),
          showLegend: element.showLegend,
          showTitle: false,
          showValue: false,
        },
      );
      return;
    case 'code': {
      const code = element.showLines
        ? element.code
            .split('\n')
            .map(
              (line, index) => `${String(index + 1).padStart(2, ' ')}  ${line}`,
            )
            .join('\n')
        : element.code;
      const dark = element.theme === 'dark';
      slide.addText(code, {
        ...common,
        color: dark ? 'F5F5F2' : '111111',
        fill: {
          color: dark ? '171719' : 'F4F4F1',
          transparency: transparency(element.opacity),
        },
        fit: 'shrink',
        fontFace: 'JetBrains Mono',
        fontSize: 13,
        isTextBox: true,
        margin: 10,
        valign: 'top',
      });
      return;
    }
    case 'buddy':
      slide.addText(
        `${buddyText(element.state)}${element.caption ? `\n${element.caption}` : ''}`,
        {
          ...common,
          align: 'center',
          color: '111111',
          fit: 'shrink',
          fontFace: 'JetBrains Mono',
          fontSize: 18,
          margin: 3,
          transparency: transparency(element.opacity),
          valign: 'middle',
        },
      );
      return;
    case 'media':
      addPptxPlaceholder(
        pptx,
        slide,
        element,
        size,
        `${element.mediaType === 'audio' ? 'Audio' : 'Vidéo'} : ${element.title}\nMédia à reconnecter`,
      );
      return;
    default:
      return;
  }
}

export async function exportPptx(deck: Deck): Promise<Blob> {
  const pptx = new PptxGenJS();
  const size = slideSize(deck.aspectRatio);
  pptx.layout = deck.aspectRatio === '4:3' ? 'LAYOUT_4X3' : 'LAYOUT_WIDE';
  pptx.author = 'Buddy Keynote';
  pptx.company = 'STH';
  pptx.subject = 'Présentation exportée depuis Buddy Keynote';
  pptx.title = deck.title;
  pptx.theme = {
    headFontFace: 'Inter',
    bodyFontFace: 'Inter',
  };

  for (const sourceSlide of deck.slides) {
    const slide = pptx.addSlide();
    slide.background = {
      color: cleanHex(TONE_COLORS[sourceSlide.tone], 'FFFFFF'),
    };
    slide.hidden = sourceSlide.hidden;
    if (sourceSlide.notes.trim()) slide.addNotes(sourceSlide.notes);

    for (const element of [...sourceSlide.elements].sort(
      (left, right) => left.z - right.z,
    )) {
      await addPptxElement(pptx, slide, element, size);
    }
  }

  const output = await pptx.write({ compression: true, outputType: 'blob' });
  if (output instanceof Blob) {
    return new Blob([await output.arrayBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
  if (output instanceof ArrayBuffer) {
    return new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
  if (output instanceof Uint8Array) {
    const copy = new Uint8Array(output.byteLength);
    copy.set(output);
    return new Blob([copy], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  }
  throw new Error('PptxGenJS n’a pas renvoyé un fichier binaire exploitable.');
}

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cm(value: number) {
  return `${Math.max(0, finite(value)).toFixed(4)}cm`;
}

function percentToCm(value: number, total: number) {
  return cm((finite(value) / 100) * total);
}

function textParagraphs(value: string, styleName: string) {
  const lines = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n');
  return lines
    .map((line) => {
      const content = line
        .split(/(\t| {2,})/)
        .map((part) => {
          if (part === '\t') return '<text:tab/>';
          if (/^ {2,}$/.test(part)) return `<text:s text:c="${part.length}"/>`;
          if (part === ' ') return '<text:s/>';
          return xmlEscape(part);
        })
        .join('');
      return `<text:p text:style-name="${styleName}">${content}</text:p>`;
    })
    .join('');
}

function imageExtension(mime: string) {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

function odfGraphicStyle(
  name: string,
  options: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    radius?: number;
  },
) {
  const fill =
    options.fill && options.fill !== 'transparent'
      ? hashColor(options.fill)
      : null;
  const stroke =
    options.stroke && options.stroke !== 'transparent'
      ? hashColor(options.stroke)
      : null;
  return `<style:style style:name="${name}" style:family="graphic"><style:graphic-properties draw:fill="${
    fill ? 'solid' : 'none'
  }"${fill ? ` draw:fill-color="${fill}"` : ''} draw:opacity="${Math.round(
    clamp(options.opacity ?? 1, 0, 1) * 100,
  )}%" draw:stroke="${stroke ? 'solid' : 'none'}"${
    stroke
      ? ` svg:stroke-color="${stroke}" svg:stroke-width="${Math.max(options.strokeWidth ?? 1, 0)}pt"`
      : ''
  } style:wrap="none"/></style:style>`;
}

function odfParagraphStyle(
  name: string,
  element?: TextElement,
  code = false,
  overrideColor?: string,
) {
  const style = element?.style;
  const fontSize = code
    ? 13
    : clamp(finite(style?.fontSize ?? 18, 18) * CSS_PIXEL_TO_POINT, 5, 300);
  const fontFamily = code ? 'JetBrains Mono' : style?.fontFamily || 'Inter';
  return `<style:style style:name="${name}" style:family="paragraph"><style:paragraph-properties fo:text-align="${
    style?.align ?? 'left'
  }"/><style:text-properties fo:font-family="${xmlEscape(fontFamily)}" fo:font-size="${fontSize}pt" fo:font-weight="${
    (style?.fontWeight ?? (code ? 400 : 400)) >= 600 ? 'bold' : 'normal'
  }" fo:font-style="${style?.fontStyle ?? 'normal'}" fo:color="${hashColor(
    overrideColor || (code ? '#F5F5F2' : style?.color || '#111111'),
  )}"${style?.textDecoration === 'underline' ? ' style:text-underline-style="solid"' : ''}${
    style?.textDecoration === 'line-through'
      ? ' style:text-line-through-style="solid"'
      : ''
  }/></style:style>`;
}

function odfFrameAttributes(
  element: SlideElement,
  pageWidthCm: number,
  pageHeightCm: number,
  styleName: string,
) {
  return `draw:style-name="${styleName}" draw:layer="layout" draw:z-index="${Math.max(
    0,
    Math.round(finite(element.z)),
  )}" svg:x="${percentToCm(element.x, pageWidthCm)}" svg:y="${percentToCm(
    element.y,
    pageHeightCm,
  )}" svg:width="${percentToCm(element.w, pageWidthCm)}" svg:height="${percentToCm(
    element.h,
    pageHeightCm,
  )}"`;
}

function buildOdpElement(
  element: SlideElement,
  index: number,
  pageWidthCm: number,
  pageHeightCm: number,
  styles: string[],
  files: Zippable,
  manifestEntries: string[],
) {
  if (element.hidden) return '';
  const graphicStyle = `gr${index}`;
  const paragraphStyle = `p${index}`;
  const attributes = odfFrameAttributes(
    element,
    pageWidthCm,
    pageHeightCm,
    graphicStyle,
  );

  switch (element.kind) {
    case 'text':
      styles.push(
        odfGraphicStyle(graphicStyle, {
          fill: element.style.background,
          opacity: element.opacity,
        }),
        odfParagraphStyle(paragraphStyle, element),
      );
      return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
        element.text,
        paragraphStyle,
      )}</draw:text-box></draw:frame>`;
    case 'shape': {
      styles.push(
        odfGraphicStyle(graphicStyle, {
          fill: element.fill,
          opacity: element.opacity,
          radius: element.radius,
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
        }),
      );
      if (element.shape === 'line') {
        const x1 = percentToCm(element.x, pageWidthCm);
        const y1 = percentToCm(element.y, pageHeightCm);
        const x2 = percentToCm(element.x + element.w, pageWidthCm);
        const y2 = percentToCm(element.y + element.h, pageHeightCm);
        return `<draw:line draw:style-name="${graphicStyle}" draw:layer="layout" draw:z-index="${Math.max(
          0,
          Math.round(element.z),
        )}" svg:x1="${x1}" svg:y1="${y1}" svg:x2="${x2}" svg:y2="${y2}"/>`;
      }
      if (element.shape === 'rectangle' || element.shape === 'ellipse') {
        const tag = element.shape === 'ellipse' ? 'draw:ellipse' : 'draw:rect';
        const radius =
          element.shape === 'rectangle' && element.radius > 0
            ? ` draw:corner-radius="${cm((element.radius / 100) * Math.min(pageWidthCm, pageHeightCm))}"`
            : '';
        return `<${tag} ${attributes}${radius}/>`;
      }
      const enhancedType =
        element.shape === 'arrow'
          ? 'right-arrow'
          : element.shape === 'star'
            ? 'star5'
            : 'triangle';
      return `<draw:custom-shape ${attributes}><draw:enhanced-geometry draw:type="${enhancedType}"/></draw:custom-shape>`;
    }
    case 'image': {
      const image = parseDataUrl(element.src);
      if (!image?.mime.startsWith('image/')) {
        styles.push(
          odfGraphicStyle(graphicStyle, { fill: '#F4F4F1', stroke: '#B8B8B2' }),
        );
        styles.push(odfParagraphStyle(paragraphStyle));
        return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
          `Image non embarquée\n${element.alt || 'Source indisponible'}`,
          paragraphStyle,
        )}</draw:text-box></draw:frame>`;
      }
      const path = `Pictures/image-${index}.${imageExtension(image.mime)}`;
      files[path] = image.bytes;
      manifestEntries.push(
        `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="${xmlEscape(
          image.mime,
        )}"/>`,
      );
      styles.push(odfGraphicStyle(graphicStyle, { opacity: element.opacity }));
      return `<draw:frame ${attributes}><draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
    }
    case 'table': {
      styles.push(odfGraphicStyle(graphicStyle, { opacity: element.opacity }));
      const cellStyle = `cell${index}`;
      const headStyle = `head${index}`;
      const cellParagraph = `cellp${index}`;
      styles.push(
        `<style:style style:name="${cellStyle}" style:family="table-cell"><style:table-cell-properties fo:background-color="${hashColor(
          element.fill,
          '#FFFFFF',
        )}" fo:border="0.75pt solid ${hashColor(element.stroke, '#D6D6D0')}" fo:padding="0.08cm"/></style:style>`,
        `<style:style style:name="${headStyle}" style:family="table-cell" style:parent-style-name="${cellStyle}"><style:text-properties fo:font-weight="bold"/></style:style>`,
        `<style:style style:name="${cellParagraph}" style:family="paragraph"><style:text-properties fo:font-family="Inter" fo:font-size="11pt" fo:color="${hashColor(
          element.textColor,
        )}"/></style:style>`,
      );
      const columnCount = Math.max(
        1,
        ...element.cells.map((row) => row.length),
      );
      const rows = element.cells
        .map(
          (row, rowIndex) =>
            `<table:table-row>${Array.from(
              { length: columnCount },
              (_, columnIndex) => {
                const value = row[columnIndex] ?? '';
                const style =
                  element.headerRow && rowIndex === 0 ? headStyle : cellStyle;
                return `<table:table-cell table:style-name="${style}" office:value-type="string"><text:p text:style-name="${cellParagraph}">${xmlEscape(
                  value,
                )}</text:p></table:table-cell>`;
              },
            ).join('')}</table:table-row>`,
        )
        .join('');
      return `<draw:frame ${attributes}><table:table table:name="Tableau ${index}"><table:table-column table:number-columns-repeated="${columnCount}"/>${rows}</table:table></draw:frame>`;
    }
    case 'chart': {
      const rows = [
        element.labels,
        ...element.datasets.map((dataset) => [
          dataset.label,
          ...dataset.values,
        ]),
      ];
      styles.push(
        odfGraphicStyle(graphicStyle, { fill: '#F7F7F4', stroke: '#D6D6D0' }),
      );
      styles.push(odfParagraphStyle(paragraphStyle));
      return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
        `Graphique ${element.chartType}\n${rows.map((row) => row.join(' · ')).join('\n')}`,
        paragraphStyle,
      )}</draw:text-box></draw:frame>`;
    }
    case 'code': {
      styles.push(
        odfGraphicStyle(graphicStyle, {
          fill: element.theme === 'dark' ? '#171719' : '#F4F4F1',
          opacity: element.opacity,
          stroke: '#D6D6D0',
        }),
        odfParagraphStyle(
          paragraphStyle,
          undefined,
          true,
          element.theme === 'dark' ? '#F5F5F2' : '#111111',
        ),
      );
      const code = element.showLines
        ? element.code
            .split('\n')
            .map((line, lineIndex) => `${lineIndex + 1}  ${line}`)
            .join('\n')
        : element.code;
      return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
        code,
        paragraphStyle,
      )}</draw:text-box></draw:frame>`;
    }
    case 'buddy':
      styles.push(
        odfGraphicStyle(graphicStyle, { opacity: element.opacity }),
        odfParagraphStyle(paragraphStyle, undefined, true, '#111111'),
      );
      return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
        `${buddyText(element.state)}${element.caption ? `\n${element.caption}` : ''}`,
        paragraphStyle,
      )}</draw:text-box></draw:frame>`;
    case 'media':
      styles.push(
        odfGraphicStyle(graphicStyle, { fill: '#F4F4F1', stroke: '#B8B8B2' }),
        odfParagraphStyle(paragraphStyle),
      );
      return `<draw:frame ${attributes}><draw:text-box>${textParagraphs(
        `${element.mediaType === 'audio' ? 'Audio' : 'Vidéo'} : ${element.title}\nMédia à reconnecter`,
        paragraphStyle,
      )}</draw:text-box></draw:frame>`;
    default:
      return '';
  }
}

function officeNamespaces() {
  return `xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"`;
}

export function exportOdp(deck: Deck): Blob {
  const pageHeightCm = 19.05;
  const pageWidthCm = deck.aspectRatio === '4:3' ? 25.4 : 33.8667;
  const files: Zippable = {};
  const manifestEntries: string[] = [];
  const automaticStyles: string[] = [];
  let elementIndex = 0;

  const pages = deck.slides
    .map((slide, slideIndex) => {
      const pageStyle = `dp${slideIndex}`;
      automaticStyles.push(
        `<style:style style:name="${pageStyle}" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="${TONE_COLORS[slide.tone]}"/></style:style>`,
      );
      const elements = [...slide.elements]
        .sort((left, right) => left.z - right.z)
        .map((element) => {
          elementIndex += 1;
          return buildOdpElement(
            element,
            elementIndex,
            pageWidthCm,
            pageHeightCm,
            automaticStyles,
            files,
            manifestEntries,
          );
        })
        .join('');
      const notes = slide.notes.trim()
        ? `<presentation:notes><draw:page draw:name="Notes ${slideIndex + 1}" draw:master-page-name="Default"><draw:frame presentation:class="notes" draw:layer="layout" svg:x="2cm" svg:y="2cm" svg:width="${cm(
            pageWidthCm - 4,
          )}" svg:height="${cm(pageHeightCm - 4)}"><draw:text-box>${textParagraphs(
            slide.notes,
            'DefaultParagraph',
          )}</draw:text-box></draw:frame></draw:page></presentation:notes>`
        : '';
      return `<draw:page draw:name="${xmlEscape(slide.name || `Slide ${slideIndex + 1}`)}" draw:style-name="${pageStyle}" draw:master-page-name="Default"${
        slide.hidden ? ' presentation:visibility="hidden"' : ''
      }>${elements}${notes}</draw:page>`;
    })
    .join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${officeNamespaces()} office:version="1.3"><office:automatic-styles><style:style style:name="DefaultParagraph" style:family="paragraph"><style:text-properties fo:font-family="Inter" fo:font-size="14pt" fo:color="#111111"/></style:style>${automaticStyles.join(
    '',
  )}</office:automatic-styles><office:body><office:presentation>${pages}</office:presentation></office:body></office:document-content>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${officeNamespaces()} office:version="1.3"><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm"/><style:text-properties fo:font-family="Inter" fo:font-size="14pt"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="${cm(
    pageWidthCm,
  )}" fo:page-height="${cm(
    pageHeightCm,
  )}" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta ${officeNamespaces()} office:version="1.3"><office:meta><dc:title>${xmlEscape(
    deck.title,
  )}</dc:title><meta:generator>Buddy Keynote</meta:generator><dc:date>${xmlEscape(
    deck.updatedAt,
  )}</dc:date></office:meta></office:document-meta>`;
  const settings = `<?xml version="1.0" encoding="UTF-8"?><office:document-settings ${officeNamespaces()} office:version="1.3"><office:settings/></office:document-settings>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="settings.xml" manifest:media-type="text/xml"/>${manifestEntries.join(
    '',
  )}</manifest:manifest>`;

  const archive: Zippable = {
    mimetype: [
      strToU8('application/vnd.oasis.opendocument.presentation'),
      { level: 0 },
    ],
    'META-INF/manifest.xml': strToU8(manifest),
    'content.xml': strToU8(content),
    'styles.xml': strToU8(styles),
    'meta.xml': strToU8(meta),
    'settings.xml': strToU8(settings),
    ...files,
  };
  const output = zipSync(archive, { level: 6 });
  return new Blob(
    [
      output.buffer.slice(
        output.byteOffset,
        output.byteOffset + output.byteLength,
      ),
    ],
    {
      type: 'application/vnd.oasis.opendocument.presentation',
    },
  );
}

function safeArchivePath(name: string) {
  if (
    !name ||
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/')
  )
    return false;
  const segments = name.split('/');
  return !segments.some((segment) => segment === '..' || segment === '.');
}

function relevantArchiveEntry(name: string) {
  if (
    name === '[Content_Types].xml' ||
    name === 'mimetype' ||
    name === 'content.xml' ||
    name === 'styles.xml' ||
    name === 'meta.xml'
  ) {
    return true;
  }
  const supportedImage = /\.(?:png|jpe?g|gif|svg|webp|bmp|tiff?)$/i.test(name);
  return (
    (name.startsWith('Pictures/') && supportedImage) ||
    (name.startsWith('ppt/') &&
      (name.endsWith('.xml') ||
        name.endsWith('.rels') ||
        (name.startsWith('ppt/media/') && supportedImage)))
  );
}

function unzipOfficeArchive(bytes: Uint8Array) {
  let entries = 0;
  let totalSize = 0;
  const seen = new Set<string>();

  return unzipSync(bytes, {
    filter(info) {
      entries += 1;
      if (entries > MAX_ZIP_ENTRIES) {
        throw new Error(
          `Archive refusée : plus de ${MAX_ZIP_ENTRIES} entrées.`,
        );
      }
      if (!safeArchivePath(info.name)) {
        throw new Error(
          `Archive refusée : chemin ZIP dangereux (${info.name}).`,
        );
      }
      if (seen.has(info.name)) {
        throw new Error(
          `Archive refusée : entrée ZIP dupliquée (${info.name}).`,
        );
      }
      seen.add(info.name);
      if (!relevantArchiveEntry(info.name)) return false;
      const imageEntry =
        info.name.startsWith('Pictures/') || info.name.startsWith('ppt/media/');
      if (
        info.originalSize > (imageEntry ? MAX_IMAGE_BYTES : MAX_ENTRY_BYTES)
      ) {
        throw new Error(
          `Archive refusée : entrée trop volumineuse (${info.name}).`,
        );
      }
      if (
        info.size > 0 &&
        info.originalSize > 2 * 1024 * 1024 &&
        info.originalSize / info.size > 1_000
      ) {
        throw new Error(
          `Archive refusée : taux de compression suspect (${info.name}).`,
        );
      }
      totalSize += info.originalSize;
      if (totalSize > MAX_UNCOMPRESSED_BYTES) {
        throw new Error(
          'Archive refusée : contenu décompressé trop volumineux.',
        );
      }
      return true;
    },
  });
}

function parseXml(entries: Unzipped, path: string, required = true) {
  const bytes = entries[path];
  if (!bytes) {
    if (required)
      throw new Error(`Fichier Office incomplet : ${path} est absent.`);
    return null;
  }
  if (bytes.length > MAX_XML_BYTES)
    throw new Error(`XML trop volumineux : ${path}.`);
  const source = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error(
      `XML refusé : déclaration d’entité interdite dans ${path}.`,
    );
  }
  if (typeof DOMParser === 'undefined') {
    throw new Error('L’import Office nécessite DOMParser dans le navigateur.');
  }
  const document = new DOMParser().parseFromString(source, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`XML Office invalide : ${path}.`);
  }
  return document;
}

function descendants(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

function firstDescendant(root: Document | Element, localName: string) {
  return descendants(root, localName)[0] ?? null;
}

function directChildren(root: Element, localName?: string) {
  return Array.from(root.children).filter(
    (child) => localName === undefined || child.localName === localName,
  );
}

function directChild(root: Element, localName: string) {
  return directChildren(root, localName)[0] ?? null;
}

function localAttribute(element: Element | null, localName: string) {
  if (!element) return null;
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) return attribute.value;
  }
  return null;
}

function relationshipAttribute(element: Element | null) {
  if (!element) return null;
  for (const attribute of Array.from(element.attributes)) {
    if (
      attribute.localName === 'id' &&
      (attribute.prefix === 'r' ||
        attribute.namespaceURI?.includes('/relationships'))
    ) {
      return attribute.value;
    }
  }
  return null;
}

function numericAttribute(
  element: Element | null,
  localName: string,
  fallback = 0,
) {
  const value = Number(localAttribute(element, localName));
  return Number.isFinite(value) ? value : fallback;
}

function normalizePartPath(sourcePart: string, target: string) {
  const cleaned = target.trim().replaceAll('\\', '/');
  if (
    !cleaned ||
    cleaned.startsWith('/') ||
    /^[a-z][a-z0-9+.-]*:/i.test(cleaned)
  )
    return null;
  const output = sourcePart.split('/');
  output.pop();
  for (const segment of cleaned.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (output.length === 0) return null;
      output.pop();
    } else {
      output.push(segment);
    }
  }
  const path = output.join('/');
  return safeArchivePath(path) ? path : null;
}

function relationshipPart(sourcePart: string) {
  const pieces = sourcePart.split('/');
  const fileName = pieces.pop();
  return [...pieces, '_rels', `${fileName}.rels`].join('/');
}

function relationships(
  entries: Unzipped,
  sourcePart: string,
  warnings: Set<string>,
) {
  const path = relationshipPart(sourcePart);
  const document = parseXml(entries, path, false);
  const result = new Map<string, Relationship>();
  if (!document) return result;
  for (const relation of descendants(document, 'Relationship')) {
    const id = localAttribute(relation, 'Id');
    const target = localAttribute(relation, 'Target');
    const type = localAttribute(relation, 'Type') || '';
    if (!id || !target) continue;
    if (
      (localAttribute(relation, 'TargetMode') || '').toLowerCase() ===
      'external'
    ) {
      warnings.add(
        'Les relations externes ont été ignorées et aucun contenu distant n’a été chargé.',
      );
      continue;
    }
    const resolved = normalizePartPath(sourcePart, target);
    if (!resolved) {
      warnings.add('Une relation Office interne invalide a été ignorée.');
      continue;
    }
    result.set(id, { target: resolved, type });
  }
  return result;
}

function imageMime(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'png':
    default:
      return 'image/png';
  }
}

function isPptx(entries: Unzipped) {
  return Boolean(
    entries['[Content_Types].xml'] && entries['ppt/presentation.xml'],
  );
}

function isOdp(entries: Unzipped) {
  const mime = entries.mimetype ? strFromU8(entries.mimetype).trim() : '';
  return (
    mime === 'application/vnd.oasis.opendocument.presentation' ||
    Boolean(entries['content.xml'])
  );
}

export async function importOffice(file: File): Promise<OfficeImportResult> {
  if (file.size <= 0) throw new Error('Le fichier Office est vide.');
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error(
      `Le fichier dépasse la limite de ${MAX_ARCHIVE_BYTES / 1024 / 1024} Mo.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('Ce fichier n’est pas une archive PPTX ou ODP valide.');
  }
  const entries = unzipOfficeArchive(bytes);
  if (isPptx(entries)) return importPptx(entries, file.name);
  if (isOdp(entries)) return importOdp(entries, file.name);
  throw new Error(
    'Format non reconnu : seuls les fichiers .pptx et .odp sont acceptés.',
  );
}

function pptxCanvas(document: Document): { width: number; height: number } {
  const size = firstDescendant(document, 'sldSz');
  const width = numericAttribute(size, 'cx', 13.333333 * EMU_PER_INCH);
  const height = numericAttribute(size, 'cy', 7.5 * EMU_PER_INCH);
  return width > 0 && height > 0
    ? { width, height }
    : { width: 13.333333 * EMU_PER_INCH, height: 7.5 * EMU_PER_INCH };
}

function aspectRatioFromCanvas(canvas: {
  width: number;
  height: number;
}): AspectRatio {
  return canvas.width / canvas.height < 1.55 ? '4:3' : '16:9';
}

function rectFromPptxElement(
  element: Element,
  canvas: { width: number; height: number },
) {
  const transform = firstDescendant(element, 'xfrm');
  if (!transform) return null;
  const offset = directChild(transform, 'off');
  const extent = directChild(transform, 'ext');
  if (!offset || !extent) return null;
  const x = numericAttribute(offset, 'x');
  const y = numericAttribute(offset, 'y');
  const width = numericAttribute(extent, 'cx');
  const height = numericAttribute(extent, 'cy');
  if (width <= 0 || height <= 0) return null;
  return {
    x: clamp((x / canvas.width) * 100, 0, 100),
    y: clamp((y / canvas.height) * 100, 0, 100),
    w: clamp((width / canvas.width) * 100, 0.1, 100),
    h: clamp((height / canvas.height) * 100, 0.1, 100),
    rotation: finite(numericAttribute(transform, 'rot') / 60_000),
  } satisfies Rect;
}

function placeholderIdentity(element: Element) {
  const placeholder = firstDescendant(element, 'ph');
  if (!placeholder) return null;
  return {
    index: localAttribute(placeholder, 'idx'),
    type: localAttribute(placeholder, 'type') || 'body',
  };
}

function matchingPlaceholder(
  document: Document | null,
  identity: ReturnType<typeof placeholderIdentity>,
) {
  if (!document || !identity) return null;
  for (const shape of descendants(document, 'sp')) {
    const candidate = placeholderIdentity(shape);
    if (!candidate) continue;
    if (identity.index && candidate.index === identity.index) return shape;
    if (!identity.index && candidate.type === identity.type) return shape;
  }
  return null;
}

function fallbackPlaceholderRect(
  identity: ReturnType<typeof placeholderIdentity>,
): Rect {
  if (identity?.type === 'title' || identity?.type === 'ctrTitle') {
    return { x: 8, y: 8, w: 84, h: 20, rotation: 0 };
  }
  if (identity?.type === 'subTitle') {
    return { x: 14, y: 56, w: 72, h: 18, rotation: 0 };
  }
  return { x: 8, y: 32, w: 84, h: 55, rotation: 0 };
}

function resolvedPptxRect(
  element: Element,
  canvas: { width: number; height: number },
  layout: Document | null,
  master: Document | null,
) {
  const identity = placeholderIdentity(element);
  return (
    rectFromPptxElement(element, canvas) ||
    (matchingPlaceholder(layout, identity)
      ? rectFromPptxElement(matchingPlaceholder(layout, identity)!, canvas)
      : null) ||
    (matchingPlaceholder(master, identity)
      ? rectFromPptxElement(matchingPlaceholder(master, identity)!, canvas)
      : null) ||
    fallbackPlaceholderRect(identity)
  );
}

function pptxText(element: Element) {
  const body = firstDescendant(element, 'txBody') || element;
  const paragraphs = descendants(body, 'p');
  if (paragraphs.length === 0) {
    return descendants(body, 't')
      .map((node) => node.textContent || '')
      .join('');
  }
  return paragraphs
    .map((paragraph) =>
      descendants(paragraph, 't')
        .map((node) => node.textContent || '')
        .join(''),
    )
    .join('\n');
}

function pptxColor(root: Element | null, fallback = '#111111') {
  if (!root) return fallback;
  const srgb = firstDescendant(root, 'srgbClr');
  const system = firstDescendant(root, 'sysClr');
  const preset = firstDescendant(root, 'prstClr');
  const scheme = firstDescendant(root, 'schemeClr');
  const direct =
    localAttribute(srgb, 'val') ||
    localAttribute(system, 'lastClr') ||
    localAttribute(preset, 'val');
  if (direct && /^[0-9a-f]{6}$/i.test(direct))
    return `#${direct.toUpperCase()}`;
  const schemeName = localAttribute(scheme, 'val');
  const schemeColors: Record<string, string> = {
    accent1: '#4472C4',
    accent2: '#ED7D31',
    accent3: '#A5A5A5',
    bg1: '#FFFFFF',
    bg2: '#F0F0EC',
    dk1: '#111111',
    dk2: '#3A3A37',
    lt1: '#FFFFFF',
    lt2: '#F0F0EC',
    tx1: '#111111',
    tx2: '#3A3A37',
  };
  return (schemeName && schemeColors[schemeName]) || fallback;
}

function pptxOpacity(root: Element | null) {
  const alpha = root ? firstDescendant(root, 'alpha') : null;
  return clamp(numericAttribute(alpha, 'val', 100_000) / 100_000, 0, 1);
}

function pptxTextStyle(shape: Element) {
  const runProperties =
    firstDescendant(shape, 'rPr') ||
    firstDescendant(shape, 'defRPr') ||
    firstDescendant(shape, 'endParaRPr');
  const paragraphProperties = firstDescendant(shape, 'pPr');
  const latin = runProperties ? firstDescendant(runProperties, 'latin') : null;
  const alignment = localAttribute(paragraphProperties, 'algn');
  return {
    fontFamily: localAttribute(latin, 'typeface') || 'Inter',
    fontSize: clamp(numericAttribute(runProperties, 'sz', 1_800) / 100, 5, 300),
    fontWeight: localAttribute(runProperties, 'b') === '1' ? 700 : 400,
    fontStyle:
      localAttribute(runProperties, 'i') === '1'
        ? ('italic' as const)
        : ('normal' as const),
    textDecoration:
      localAttribute(runProperties, 'strike') &&
      localAttribute(runProperties, 'strike') !== 'noStrike'
        ? ('line-through' as const)
        : localAttribute(runProperties, 'u') &&
            localAttribute(runProperties, 'u') !== 'none'
          ? ('underline' as const)
          : ('none' as const),
    align:
      alignment === 'ctr'
        ? ('center' as const)
        : alignment === 'r'
          ? ('right' as const)
          : ('left' as const),
    color: pptxColor(runProperties),
    background: 'transparent',
    lineHeight: 1.2,
    letterSpacing: numericAttribute(runProperties, 'spc') / 100_000,
  };
}

function shapeFromPreset(preset: string | null): ShapeElement['shape'] {
  if (preset === 'ellipse') return 'ellipse';
  if (preset?.includes('triangle')) return 'triangle';
  if (preset?.includes('star')) return 'star';
  if (preset?.toLowerCase().includes('arrow')) return 'arrow';
  if (preset === 'line' || preset === 'lineInv') return 'line';
  return 'rectangle';
}

function applyRect<T extends SlideElement>(element: T, rect: Rect, z: number) {
  element.x = rect.x;
  element.y = rect.y;
  element.w = rect.w;
  element.h = rect.h;
  element.rotation = rect.rotation;
  element.z = z;
  return element;
}

function pptxTextElement(shape: Element, rect: Rect, z: number) {
  const element = applyRect(makeElement('text'), rect, z);
  element.text = pptxText(shape);
  element.style = pptxTextStyle(shape);
  element.opacity = pptxOpacity(firstDescendant(shape, 'solidFill'));
  return element;
}

function pptxShapeElement(shape: Element, rect: Rect, z: number) {
  const element = applyRect(makeElement('shape'), rect, z);
  const properties = firstDescendant(shape, 'spPr');
  const preset = properties ? firstDescendant(properties, 'prstGeom') : null;
  const fill = properties ? directChild(properties, 'solidFill') : null;
  const noFill = properties ? directChild(properties, 'noFill') : null;
  const line = properties ? directChild(properties, 'ln') : null;
  element.shape =
    shape.localName === 'cxnSp'
      ? 'line'
      : shapeFromPreset(localAttribute(preset, 'prst'));
  element.fill = noFill ? 'transparent' : pptxColor(fill, '#F0F0EC');
  element.stroke = line ? pptxColor(line, '#111111') : 'transparent';
  element.strokeWidth = line ? numericAttribute(line, 'w', 12_700) / 12_700 : 0;
  element.opacity = pptxOpacity(fill || line);
  return element;
}

function pptxImageElement(
  picture: Element,
  rect: Rect,
  z: number,
  relationMap: Map<string, Relationship>,
  entries: Unzipped,
  warnings: Set<string>,
) {
  const blip = firstDescendant(picture, 'blip');
  const relationId = localAttribute(blip, 'embed');
  const relation = relationId ? relationMap.get(relationId) : null;
  if (!relation || !relation.target.startsWith('ppt/media/')) {
    warnings.add('Une image liée ou externe n’a pas été importée.');
    return null;
  }
  const bytes = entries[relation.target];
  if (!bytes || bytes.length > MAX_IMAGE_BYTES) {
    warnings.add('Une image absente ou trop volumineuse n’a pas été importée.');
    return null;
  }
  const element = applyRect(makeElement('image'), rect, z);
  element.src = dataUrl(imageMime(relation.target), bytes);
  const description = firstDescendant(picture, 'cNvPr');
  element.alt =
    localAttribute(description, 'descr') ||
    localAttribute(description, 'name') ||
    '';
  element.fit = 'contain';
  element.opacity = pptxOpacity(firstDescendant(picture, 'blipFill'));
  return element;
}

function pptxTableElement(frame: Element, rect: Rect, z: number) {
  const table = firstDescendant(frame, 'tbl');
  if (!table) return null;
  const rows = directChildren(table, 'tr').map((row) =>
    directChildren(row, 'tc').map((cell) => pptxText(cell)),
  );
  const element = applyRect(makeElement('table'), rect, z);
  element.cells = rows;
  element.headerRow = rows.length > 1;
  const firstCell = directChildren(table, 'tr')[0]
    ? directChildren(directChildren(table, 'tr')[0], 'tc')[0]
    : null;
  element.fill = pptxColor(
    firstCell ? firstDescendant(firstCell, 'solidFill') : null,
    '#FFFFFF',
  );
  element.textColor = pptxColor(
    firstCell ? firstDescendant(firstCell, 'rPr') : null,
    '#111111',
  );
  return element;
}

function pptxChartElement(
  frame: Element,
  rect: Rect,
  z: number,
  relationMap: Map<string, Relationship>,
  entries: Unzipped,
) {
  const chartReference = firstDescendant(frame, 'chart');
  const relationId = localAttribute(chartReference, 'id');
  const relation = relationId ? relationMap.get(relationId) : null;
  if (!relation) return null;
  const document = parseXml(entries, relation.target, false);
  if (!document) return null;
  const element = applyRect(makeElement('chart'), rect, z);
  element.chartType = firstDescendant(document, 'pieChart')
    ? 'pie'
    : firstDescendant(document, 'lineChart')
      ? 'line'
      : 'bar';
  const series = descendants(document, 'ser');
  const palette = ['#111111', '#5C5C57', '#8A8A84', '#B8B8B2'];
  element.datasets = series.map((item, index) => {
    const valuesRoot = firstDescendant(item, 'val');
    const values = valuesRoot
      ? descendants(valuesRoot, 'pt').map((point) =>
          Number(firstDescendant(point, 'v')?.textContent || 0),
        )
      : [];
    const label = firstDescendant(item, 'tx');
    return {
      color: palette[index % palette.length],
      label:
        firstDescendant(label || item, 'v')?.textContent ||
        `Série ${index + 1}`,
      values: values.map((value) => (Number.isFinite(value) ? value : 0)),
    };
  });
  const categories = firstDescendant(
    series[0] || document.documentElement,
    'cat',
  );
  element.labels = categories
    ? descendants(categories, 'pt').map(
        (point) => firstDescendant(point, 'v')?.textContent || '',
      )
    : [];
  element.showLegend = Boolean(firstDescendant(document, 'legend'));
  return element;
}

function noteText(entries: Unzipped, relationMap: Map<string, Relationship>) {
  const relation = [...relationMap.values()].find((item) =>
    item.type.endsWith('/notesSlide'),
  );
  if (!relation) return '';
  const document = parseXml(entries, relation.target, false);
  if (!document) return '';
  const bodies = descendants(document, 'sp').filter((shape) => {
    const type = localAttribute(firstDescendant(shape, 'ph'), 'type');
    return type === 'body' || !type;
  });
  return bodies
    .map((shape) => pptxText(shape).trim())
    .filter(Boolean)
    .join('\n');
}

function slideTransition(document: Document) {
  const transition = firstDescendant(document, 'transition');
  if (!transition)
    return {
      type: 'cut' as const,
      duration: 0,
      autoAdvance: null as number | null,
    };
  const kind = directChildren(transition)[0]?.localName;
  const type =
    kind === 'fade'
      ? ('dissolve' as const)
      : kind === 'push'
        ? ('push' as const)
        : kind === 'wipe'
          ? ('wipe' as const)
          : kind === 'zoom'
            ? ('zoom' as const)
            : ('cut' as const);
  const speed = localAttribute(transition, 'spd');
  const duration = speed === 'slow' ? 1_000 : speed === 'fast' ? 350 : 650;
  const advanceValue = localAttribute(transition, 'advTm');
  const advance = advanceValue === null ? Number.NaN : Number(advanceValue);
  return {
    type,
    duration,
    autoAdvance: Number.isFinite(advance) && advance >= 0 ? advance : null,
  };
}

function toneFromColor(color: string) {
  const hex = cleanHex(color);
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  if (luminance < 0.35) return 'ink' as const;
  if (luminance < 0.94) return 'mist' as const;
  return 'paper' as const;
}

function slideLayoutDocuments(
  entries: Unzipped,
  relationMap: Map<string, Relationship>,
  warnings: Set<string>,
) {
  const layoutRelation = [...relationMap.values()].find((item) =>
    item.type.endsWith('/slideLayout'),
  );
  const layout = layoutRelation
    ? parseXml(entries, layoutRelation.target, false)
    : null;
  const layoutRelations = layoutRelation
    ? relationships(entries, layoutRelation.target, warnings)
    : new Map<string, Relationship>();
  const masterRelation = [...layoutRelations.values()].find((item) =>
    item.type.endsWith('/slideMaster'),
  );
  const master = masterRelation
    ? parseXml(entries, masterRelation.target, false)
    : null;
  return { layout, master };
}

function pptxSlide(
  entries: Unzipped,
  part: string,
  index: number,
  canvas: { width: number; height: number },
  warnings: Set<string>,
  counters: { elements: number },
) {
  const document = parseXml(entries, part)!;
  const relationMap = relationships(entries, part, warnings);
  const { layout, master } = slideLayoutDocuments(
    entries,
    relationMap,
    warnings,
  );
  const transition = slideTransition(document);
  const elements: SlideElement[] = [];
  let z = 0;

  const add = (element: SlideElement | null) => {
    if (!element) return;
    if (
      elements.length >= MAX_ELEMENTS_PER_SLIDE ||
      counters.elements >= MAX_TOTAL_ELEMENTS
    ) {
      warnings.add(
        'Certains objets ont été ignorés car la présentation dépasse les limites de sécurité.',
      );
      return;
    }
    elements.push(element);
    counters.elements += 1;
  };

  const parseObject = (node: Element) => {
    z += 1;
    const rect = resolvedPptxRect(node, canvas, layout, master);
    if (node.localName === 'pic') {
      add(pptxImageElement(node, rect, z, relationMap, entries, warnings));
      return;
    }
    if (node.localName === 'graphicFrame') {
      const table = pptxTableElement(node, rect, z);
      if (table) add(table);
      else {
        const chart = pptxChartElement(node, rect, z, relationMap, entries);
        if (chart) add(chart);
        else
          warnings.add(
            'Certains objets PowerPoint complexes n’ont pas été importés.',
          );
      }
      return;
    }
    if (node.localName === 'grpSp') {
      warnings.add(
        'Les groupes PowerPoint ont été aplatis ; leur position peut nécessiter un ajustement.',
      );
      for (const child of directChildren(node)) {
        if (
          ['sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp'].includes(
            child.localName,
          )
        )
          parseObject(child);
      }
      return;
    }
    if (node.localName !== 'sp' && node.localName !== 'cxnSp') return;

    const text = pptxText(node).trim();
    const preset = localAttribute(firstDescendant(node, 'prstGeom'), 'prst');
    const shapeProperties = directChild(node, 'spPr');
    const hasVisibleGeometry =
      node.localName === 'cxnSp' ||
      Boolean(shapeProperties && directChild(shapeProperties, 'solidFill')) ||
      Boolean(shapeProperties && directChild(shapeProperties, 'ln')) ||
      (preset !== null && preset !== 'rect');
    if (hasVisibleGeometry) add(pptxShapeElement(node, rect, z));
    if (text) add(pptxTextElement(node, rect, hasVisibleGeometry ? z + 1 : z));
  };

  const shapeTree = firstDescendant(document, 'spTree');
  if (shapeTree) {
    for (const object of directChildren(shapeTree)) parseObject(object);
  }
  if (firstDescendant(document, 'timing')) {
    warnings.add(
      'Les animations PowerPoint ne sont pas converties ; les objets restent éditables.',
    );
  }

  const background = firstDescendant(document, 'bg');
  const nameSource = elements.find(
    (element): element is TextElement =>
      element.kind === 'text' && Boolean(element.text.trim()),
  );
  return {
    id: createId('slide'),
    name:
      nameSource?.text.replace(/\s+/g, ' ').trim().slice(0, 60) ||
      `Slide ${index + 1}`,
    tone: toneFromColor(pptxColor(background, '#FFFFFF')),
    transition: transition.type,
    transitionDuration: transition.duration,
    autoAdvance: transition.autoAdvance,
    hidden: localAttribute(document.documentElement, 'show') === '0',
    notes: noteText(entries, relationMap),
    elements,
  } satisfies Slide;
}

function importPptx(entries: Unzipped, fileName: string): OfficeImportResult {
  const warnings = new Set<string>();
  const presentation = parseXml(entries, 'ppt/presentation.xml')!;
  const relationMap = relationships(entries, 'ppt/presentation.xml', warnings);
  const canvas = pptxCanvas(presentation);
  const orderedParts = descendants(presentation, 'sldId')
    .map((slideId) => {
      const relationId = relationshipAttribute(slideId);
      return relationId ? relationMap.get(relationId)?.target : undefined;
    })
    .filter((part): part is string => Boolean(part && entries[part]));
  const fallbackParts = Object.keys(entries)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => {
      const leftNumber = Number(left.match(/slide(\d+)/)?.[1] || 0);
      const rightNumber = Number(right.match(/slide(\d+)/)?.[1] || 0);
      return leftNumber - rightNumber;
    });
  const parts = (orderedParts.length > 0 ? orderedParts : fallbackParts).slice(
    0,
    MAX_SLIDES,
  );
  if (parts.length === 0)
    throw new Error('Ce fichier PowerPoint ne contient aucune slide lisible.');
  if ((orderedParts.length || fallbackParts.length) > MAX_SLIDES) {
    warnings.add(
      `Seules les ${MAX_SLIDES} premières slides ont été importées.`,
    );
  }
  warnings.add(
    'Les masques, polices incorporées et effets avancés PowerPoint sont approximés.',
  );
  const counters = { elements: 0 };
  const slides = parts.map((part, index) =>
    pptxSlide(entries, part, index, canvas, warnings, counters),
  );
  return {
    deck: {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      id: createId('deck'),
      title: fileName.replace(/\.pptx$/i, '') || 'Présentation importée',
      theme: 'studio',
      aspectRatio: aspectRatioFromCanvas(canvas),
      slides,
      updatedAt: new Date().toISOString(),
    },
    warnings: [...warnings],
  };
}

function odfLengthCm(value: string | null, fallback = 0) {
  if (!value) return fallback;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*(cm|mm|in|pt|pc|px)?\s*$/i.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  switch ((match[2] || 'cm').toLowerCase()) {
    case 'mm':
      return amount / 10;
    case 'in':
      return amount * CM_PER_INCH;
    case 'pt':
      return (amount / 72) * CM_PER_INCH;
    case 'pc':
      return (amount / 6) * CM_PER_INCH;
    case 'px':
      return (amount / 96) * CM_PER_INCH;
    case 'cm':
    default:
      return amount;
  }
}

function odfFontPoints(value: string | null, fallback = 18) {
  if (!value) return fallback;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px|cm|mm|in)?\s*$/i.exec(value);
  if (!match) return fallback;
  const amount = Number(match[1]);
  switch ((match[2] || 'pt').toLowerCase()) {
    case 'px':
      return amount * 0.75;
    case 'cm':
      return (amount / CM_PER_INCH) * 72;
    case 'mm':
      return (amount / 10 / CM_PER_INCH) * 72;
    case 'in':
      return amount * 72;
    case 'pt':
    default:
      return amount;
  }
}

function collectOdfStyles(documents: Array<Document | null>) {
  const styles = new Map<string, Element>();
  for (const document of documents) {
    if (!document) continue;
    for (const style of descendants(document, 'style')) {
      const name = localAttribute(style, 'name');
      if (name) styles.set(name, style);
    }
  }
  return styles;
}

function odfStyleProperty(
  styles: Map<string, Element>,
  styleName: string | null,
  propertyName: string,
) {
  let currentName = styleName;
  const visited = new Set<string>();
  while (currentName && !visited.has(currentName)) {
    visited.add(currentName);
    const style = styles.get(currentName);
    if (!style) return null;
    for (const child of Array.from(style.children)) {
      const value = localAttribute(child, propertyName);
      if (value !== null) return value;
    }
    currentName = localAttribute(style, 'parent-style-name');
  }
  return null;
}

function odfPageSize(stylesDocument: Document | null) {
  const properties = stylesDocument
    ? firstDescendant(stylesDocument, 'page-layout-properties')
    : null;
  const width = odfLengthCm(localAttribute(properties, 'page-width'), 33.8667);
  const height = odfLengthCm(localAttribute(properties, 'page-height'), 19.05);
  return width > 0 && height > 0
    ? { width, height }
    : { width: 33.8667, height: 19.05 };
}

function odfRect(
  element: Element,
  pageSize: { width: number; height: number },
) {
  const x = odfLengthCm(localAttribute(element, 'x'));
  const y = odfLengthCm(localAttribute(element, 'y'));
  let width = odfLengthCm(localAttribute(element, 'width'));
  let height = odfLengthCm(localAttribute(element, 'height'));
  if (element.localName === 'line') {
    const x2 = odfLengthCm(localAttribute(element, 'x2'), x);
    const y2 = odfLengthCm(localAttribute(element, 'y2'), y);
    width = Math.abs(x2 - x);
    height = Math.max(Math.abs(y2 - y), 0.1);
  }
  return {
    x: clamp((x / pageSize.width) * 100, 0, 100),
    y: clamp((y / pageSize.height) * 100, 0, 100),
    w: clamp((Math.max(width, 0.1) / pageSize.width) * 100, 0.1, 100),
    h: clamp((Math.max(height, 0.1) / pageSize.height) * 100, 0.1, 100),
    rotation: 0,
  } satisfies Rect;
}

function odfOpacity(value: string | null) {
  if (!value) return 1;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed)
    ? clamp(value.includes('%') ? parsed / 100 : parsed, 0, 1)
    : 1;
}

function odfText(root: Element) {
  const paragraphs = descendants(root, 'p');
  return paragraphs
    .map((paragraph) => paragraph.textContent || '')
    .join('\n')
    .trimEnd();
}

function odfTextElement(
  frame: Element,
  rect: Rect,
  z: number,
  styles: Map<string, Element>,
) {
  const element = applyRect(makeElement('text'), rect, z);
  const paragraph = firstDescendant(frame, 'p');
  const paragraphStyle = localAttribute(paragraph, 'style-name');
  const frameStyle = localAttribute(frame, 'style-name');
  const fontWeight = odfStyleProperty(styles, paragraphStyle, 'font-weight');
  const fontStyle = odfStyleProperty(styles, paragraphStyle, 'font-style');
  const decoration = odfStyleProperty(
    styles,
    paragraphStyle,
    'text-underline-style',
  );
  const strike = odfStyleProperty(
    styles,
    paragraphStyle,
    'text-line-through-style',
  );
  const align = odfStyleProperty(styles, paragraphStyle, 'text-align');
  element.text = odfText(frame);
  element.style = {
    fontFamily:
      odfStyleProperty(styles, paragraphStyle, 'font-family') || 'Inter',
    fontSize: clamp(
      odfFontPoints(odfStyleProperty(styles, paragraphStyle, 'font-size')),
      5,
      300,
    ),
    fontWeight: fontWeight === 'bold' || Number(fontWeight) >= 600 ? 700 : 400,
    fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
    textDecoration:
      strike && strike !== 'none'
        ? 'line-through'
        : decoration && decoration !== 'none'
          ? 'underline'
          : 'none',
    align:
      align === 'center'
        ? 'center'
        : align === 'right' || align === 'end'
          ? 'right'
          : 'left',
    color: hashColor(
      odfStyleProperty(styles, paragraphStyle, 'color') || '#111111',
    ),
    background:
      odfStyleProperty(styles, frameStyle, 'fill-color') || 'transparent',
    lineHeight: 1.2,
    letterSpacing: 0,
  };
  element.opacity = odfOpacity(odfStyleProperty(styles, frameStyle, 'opacity'));
  return element;
}

function odfShapeElement(
  shape: Element,
  rect: Rect,
  z: number,
  styles: Map<string, Element>,
) {
  const element = applyRect(makeElement('shape'), rect, z);
  const styleName = localAttribute(shape, 'style-name');
  const enhancedType =
    localAttribute(firstDescendant(shape, 'enhanced-geometry'), 'type') || '';
  if (shape.localName === 'ellipse' || shape.localName === 'circle')
    element.shape = 'ellipse';
  else if (shape.localName === 'line') element.shape = 'line';
  else if (enhancedType.includes('arrow')) element.shape = 'arrow';
  else if (enhancedType.includes('star')) element.shape = 'star';
  else if (enhancedType.includes('triangle') || shape.localName === 'polygon')
    element.shape = 'triangle';
  else element.shape = 'rectangle';
  element.fill =
    odfStyleProperty(styles, styleName, 'fill') === 'none'
      ? 'transparent'
      : hashColor(
          odfStyleProperty(styles, styleName, 'fill-color') || '#F0F0EC',
        );
  element.stroke =
    odfStyleProperty(styles, styleName, 'stroke') === 'none'
      ? 'transparent'
      : hashColor(
          odfStyleProperty(styles, styleName, 'stroke-color') || '#111111',
        );
  const strokeWidth = odfStyleProperty(styles, styleName, 'stroke-width');
  element.strokeWidth = strokeWidth
    ? (odfLengthCm(strokeWidth) / CM_PER_INCH) * 72
    : 1;
  element.opacity = odfOpacity(odfStyleProperty(styles, styleName, 'opacity'));
  return element;
}

function repeatedCount(element: Element, attribute: string) {
  return clamp(Math.floor(numericAttribute(element, attribute, 1)), 1, 100);
}

function odfTableElement(frame: Element, rect: Rect, z: number) {
  const table = firstDescendant(frame, 'table');
  if (!table) return null;
  const cells: string[][] = [];
  for (const row of descendants(table, 'table-row')) {
    const values: string[] = [];
    for (const cell of directChildren(row).filter(
      (child) =>
        child.localName === 'table-cell' ||
        child.localName === 'covered-table-cell',
    )) {
      const repeat = repeatedCount(cell, 'number-columns-repeated');
      const value = odfText(cell);
      for (let count = 0; count < repeat && values.length < 100; count += 1)
        values.push(value);
    }
    const repeat = repeatedCount(row, 'number-rows-repeated');
    for (let count = 0; count < repeat && cells.length < 200; count += 1)
      cells.push([...values]);
  }
  const element = applyRect(makeElement('table'), rect, z);
  element.cells = cells;
  element.headerRow = cells.length > 1;
  return element;
}

function odfImageElement(
  entries: Unzipped,
  frame: Element,
  rect: Rect,
  z: number,
  warnings: Set<string>,
) {
  const image = firstDescendant(frame, 'image');
  const href = localAttribute(image, 'href');
  const path = href
    ? normalizePartPath('content.xml', href.replace(/^\.\//, ''))
    : null;
  if (!path || !path.startsWith('Pictures/')) {
    warnings.add('Une image ODP externe ou liée n’a pas été importée.');
    return null;
  }
  const bytes = entries[path];
  if (!bytes || bytes.length > MAX_IMAGE_BYTES) {
    warnings.add(
      'Une image ODP absente ou trop volumineuse n’a pas été importée.',
    );
    return null;
  }
  const element = applyRect(makeElement('image'), rect, z);
  element.src = dataUrl(imageMime(path), bytes);
  element.alt = localAttribute(frame, 'name') || '';
  element.fit = 'contain';
  return element;
}

function odfSlide(
  page: Element,
  index: number,
  entries: Unzipped,
  pageSize: { width: number; height: number },
  styles: Map<string, Element>,
  warnings: Set<string>,
  counters: { elements: number },
) {
  const elements: SlideElement[] = [];
  let z = 0;
  const add = (element: SlideElement | null) => {
    if (!element) return;
    if (
      elements.length >= MAX_ELEMENTS_PER_SLIDE ||
      counters.elements >= MAX_TOTAL_ELEMENTS
    ) {
      warnings.add(
        'Certains objets ont été ignorés car la présentation dépasse les limites de sécurité.',
      );
      return;
    }
    elements.push(element);
    counters.elements += 1;
  };
  const parseObject = (object: Element) => {
    z += 1;
    if (localAttribute(object, 'transform')) {
      warnings.add(
        'Certaines rotations ou transformations ODP ont été simplifiées.',
      );
    }
    if (object.localName === 'g') {
      warnings.add(
        'Les groupes ODP ont été aplatis ; leur position peut nécessiter un ajustement.',
      );
      for (const child of Array.from(object.children)) parseObject(child);
      return;
    }
    const rect = odfRect(object, pageSize);
    if (object.localName === 'frame') {
      if (firstDescendant(object, 'image')) {
        add(odfImageElement(entries, object, rect, z, warnings));
        return;
      }
      const table = odfTableElement(object, rect, z);
      if (table) {
        add(table);
        return;
      }
      if (firstDescendant(object, 'text-box')) {
        add(odfTextElement(object, rect, z, styles));
        return;
      }
      warnings.add('Un objet ODP complexe n’a pas été importé.');
      return;
    }
    if (
      ['rect', 'ellipse', 'circle', 'line', 'polygon', 'custom-shape'].includes(
        object.localName,
      )
    ) {
      add(odfShapeElement(object, rect, z, styles));
      const text = odfText(object).trim();
      if (text) add(odfTextElement(object, rect, z + 1, styles));
    }
  };

  for (const object of Array.from(page.children)) {
    if (object.localName !== 'notes') parseObject(object);
  }
  const notes = directChildren(page, 'notes')[0];
  const pageStyle = localAttribute(page, 'style-name');
  const background =
    odfStyleProperty(styles, pageStyle, 'fill-color') || '#FFFFFF';
  const transitionType = odfStyleProperty(styles, pageStyle, 'transition-type');
  if (transitionType)
    warnings.add('Les transitions ODP complexes ont été simplifiées.');

  return {
    id: createId('slide'),
    name: localAttribute(page, 'name') || `Slide ${index + 1}`,
    tone: toneFromColor(background),
    transition: transitionType === 'fade' ? 'dissolve' : 'cut',
    transitionDuration: transitionType ? 650 : 0,
    autoAdvance: null,
    hidden: localAttribute(page, 'visibility') === 'hidden',
    notes: notes ? odfText(notes).trim() : '',
    elements,
  } satisfies Slide;
}

function importOdp(entries: Unzipped, fileName: string): OfficeImportResult {
  const warnings = new Set<string>();
  const content = parseXml(entries, 'content.xml')!;
  const stylesDocument = parseXml(entries, 'styles.xml', false);
  const meta = parseXml(entries, 'meta.xml', false);
  const styles = collectOdfStyles([stylesDocument, content]);
  const pageSize = odfPageSize(stylesDocument);
  const allPages = descendants(content, 'page').filter(
    (page) => page.parentElement?.localName === 'presentation',
  );
  if (allPages.length === 0)
    throw new Error('Ce fichier ODP ne contient aucune slide lisible.');
  if (allPages.length > MAX_SLIDES) {
    warnings.add(
      `Seules les ${MAX_SLIDES} premières slides ont été importées.`,
    );
  }
  if (
    descendants(content, 'animation').length > 0 ||
    descendants(content, 'par').length > 0
  ) {
    warnings.add(
      'Les animations ODP ne sont pas converties ; les objets restent éditables.',
    );
  }
  warnings.add(
    'Les masques, styles hérités et effets avancés ODP sont approximés.',
  );
  const counters = { elements: 0 };
  const slides = allPages
    .slice(0, MAX_SLIDES)
    .map((page, index) =>
      odfSlide(page, index, entries, pageSize, styles, warnings, counters),
    );
  const title = meta ? firstDescendant(meta, 'title')?.textContent?.trim() : '';
  return {
    deck: {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      id: createId('deck'),
      title:
        title || fileName.replace(/\.odp$/i, '') || 'Présentation importée',
      theme: 'studio',
      aspectRatio: pageSize.width / pageSize.height < 1.55 ? '4:3' : '16:9',
      slides,
      updatedAt: new Date().toISOString(),
    },
    warnings: [...warnings],
  };
}
