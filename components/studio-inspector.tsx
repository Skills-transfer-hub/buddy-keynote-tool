'use client';

import { useId, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Plus,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { SlideElement } from '@/lib/studio';

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="studio-field">
      <span id={id}>{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue>{options[value] ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([v, title]) => (
            <SelectItem key={v} value={v}>
              {title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function NumberField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onBegin,
  onEnd,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
  onBegin?: () => void;
  onEnd?: () => void;
}) {
  const id = useId();
  return (
    <div className="studio-field">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onFocus={onBegin}
        onBlur={onEnd}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </div>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="studio-toggle">
      <label htmlFor={id}>{label}</label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="studio-color">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#171717'}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange('transparent')}
        aria-label={`${label} transparent`}
      >
        Ø
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="inspector-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function StudioInspector({
  element,
  onChange,
  onBegin,
  onEnd,
  onReplaceImage,
}: {
  element: SlideElement;
  onChange: (patch: Partial<SlideElement>) => void;
  onBegin: () => void;
  onEnd: () => void;
  onReplaceImage: () => void;
}) {
  const textStyle = element.kind === 'text' ? element.style : null;
  const editTextStyle = (patch: Record<string, unknown>) => {
    if (textStyle)
      onChange({ style: { ...textStyle, ...patch } } as Partial<SlideElement>);
  };
  return (
    <>
      {element.kind === 'text' && (
        <Section title="Texte">
          <Textarea
            aria-label="Contenu du texte"
            value={element.text}
            rows={5}
            maxLength={10000}
            onFocus={onBegin}
            onBlur={onEnd}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          <Choice
            label="Police"
            value={element.style.fontFamily}
            options={{
              Inter: 'Inter',
              'JetBrains Mono': 'JetBrains Mono',
              Georgia: 'Georgia',
              Arial: 'Arial',
            }}
            onChange={(fontFamily) => editTextStyle({ fontFamily })}
          />
          <div className="inspector-row">
            <NumberField
              label="Taille"
              value={element.style.fontSize}
              min={8}
              max={160}
              onBegin={onBegin}
              onEnd={onEnd}
              onChange={(fontSize) => editTextStyle({ fontSize })}
            />
            <NumberField
              label="Interligne"
              value={element.style.lineHeight}
              min={0.8}
              max={3}
              step={0.05}
              onBegin={onBegin}
              onEnd={onEnd}
              onChange={(lineHeight) => editTextStyle({ lineHeight })}
            />
          </div>
          <div className="format-buttons">
            <Button
              size="icon-sm"
              variant={element.style.fontWeight >= 600 ? 'secondary' : 'ghost'}
              aria-label="Gras"
              aria-pressed={element.style.fontWeight >= 600}
              onClick={() =>
                editTextStyle({
                  fontWeight: element.style.fontWeight >= 600 ? 400 : 700,
                })
              }
            >
              <Bold />
            </Button>
            <Button
              size="icon-sm"
              variant={
                element.style.fontStyle === 'italic' ? 'secondary' : 'ghost'
              }
              aria-label="Italique"
              aria-pressed={element.style.fontStyle === 'italic'}
              onClick={() =>
                editTextStyle({
                  fontStyle:
                    element.style.fontStyle === 'italic' ? 'normal' : 'italic',
                })
              }
            >
              <Italic />
            </Button>
            <Button
              size="icon-sm"
              variant={
                element.style.textDecoration === 'underline'
                  ? 'secondary'
                  : 'ghost'
              }
              aria-label="Souligné"
              aria-pressed={element.style.textDecoration === 'underline'}
              onClick={() =>
                editTextStyle({
                  textDecoration:
                    element.style.textDecoration === 'underline'
                      ? 'none'
                      : 'underline',
                })
              }
            >
              <Underline />
            </Button>
            {(
              [
                ['left', AlignLeft],
                ['center', AlignCenter],
                ['right', AlignRight],
              ] as const
            ).map(([align, Icon]) => (
              <Button
                key={align}
                size="icon-sm"
                variant={element.style.align === align ? 'secondary' : 'ghost'}
                aria-label={`Aligner ${align === 'left' ? 'à gauche' : align === 'right' ? 'à droite' : 'au centre'}`}
                onClick={() => editTextStyle({ align })}
              >
                <Icon />
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                text: element.text
                  .split('\n')
                  .map((line) =>
                    line.startsWith('• ') ? line.slice(2) : `• ${line}`,
                  )
                  .join('\n'),
              })
            }
          >
            Liste à puces
          </Button>
          <ColorField
            label="Couleur du texte"
            value={element.style.color}
            onChange={(color) => editTextStyle({ color })}
          />
          <ColorField
            label="Surlignage"
            value={element.style.background}
            onChange={(background) => editTextStyle({ background })}
          />
        </Section>
      )}
      {element.kind === 'shape' && (
        <Section title="Forme">
          <Choice
            label="Figure"
            value={element.shape}
            options={{
              rectangle: 'Rectangle',
              ellipse: 'Ellipse',
              triangle: 'Triangle',
              line: 'Ligne',
              arrow: 'Flèche',
            }}
            onChange={(shape) => onChange({ shape } as Partial<SlideElement>)}
          />
          <ColorField
            label="Remplissage"
            value={element.fill}
            onChange={(fill) => onChange({ fill })}
          />
          <ColorField
            label="Contour"
            value={element.stroke}
            onChange={(stroke) => onChange({ stroke })}
          />
          <div className="inspector-row">
            <NumberField
              label="Épaisseur"
              value={element.strokeWidth}
              max={20}
              onChange={(strokeWidth) => onChange({ strokeWidth })}
            />
            <NumberField
              label="Arrondi"
              value={element.radius}
              max={80}
              onChange={(radius) => onChange({ radius })}
            />
          </div>
        </Section>
      )}
      {element.kind === 'image' && (
        <Section title="Image">
          <Button variant="outline" onClick={onReplaceImage}>
            Remplacer l’image
          </Button>
          <Choice
            label="Cadrage"
            value={element.fit}
            options={{ contain: 'Image entière', cover: 'Remplir le cadre' }}
            onChange={(fit) => onChange({ fit } as Partial<SlideElement>)}
          />
          <label className="studio-field" htmlFor="image-alt">
            Description alternative
            <Input
              id="image-alt"
              value={element.alt}
              onFocus={onBegin}
              onBlur={onEnd}
              maxLength={500}
              onChange={(e) => onChange({ alt: e.target.value })}
            />
          </label>
        </Section>
      )}
      {element.kind === 'code' && (
        <Section title="Bloc de code">
          <Choice
            label="Langage"
            value={element.language}
            options={{
              typescript: 'TypeScript',
              javascript: 'JavaScript',
              python: 'Python',
              bash: 'Terminal',
              json: 'JSON',
              go: 'Go',
              sql: 'SQL',
              html: 'HTML',
              css: 'CSS',
              plaintext: 'Texte brut',
            }}
            onChange={(language) => onChange({ language })}
          />
          <Textarea
            className="code-input"
            aria-label="Code source"
            spellCheck={false}
            value={element.code}
            rows={10}
            maxLength={20000}
            onFocus={onBegin}
            onBlur={onEnd}
            onChange={(e) => onChange({ code: e.target.value })}
          />
          <Choice
            label="Apparence"
            value={element.theme}
            options={{ dark: 'Terminal sombre', light: 'Code clair' }}
            onChange={(theme) => onChange({ theme } as Partial<SlideElement>)}
          />
          <ToggleField
            label="Numéros de lignes"
            checked={element.showLines}
            onChange={(showLines) => onChange({ showLines })}
          />
        </Section>
      )}
      {element.kind === 'table' && (
        <Section title="Tableau">
          <div className="table-editor">
            <table>
              <tbody>
                {element.cells.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <Input
                          aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
                          value={cell}
                          maxLength={500}
                          onFocus={onBegin}
                          onBlur={onEnd}
                          onChange={(e) =>
                            onChange({
                              cells: element.cells.map((line, ri) =>
                                ri === r
                                  ? line.map((v, ci) =>
                                      ci === c ? e.target.value : v,
                                    )
                                  : line,
                              ),
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="format-buttons">
            <Button
              size="sm"
              variant="outline"
              disabled={element.cells.length >= 20}
              onClick={() =>
                onChange({
                  cells: [...element.cells, element.cells[0].map(() => '')],
                })
              }
            >
              <Plus />
              Ligne
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Supprimer la dernière ligne"
              disabled={element.cells.length <= 1}
              onClick={() => onChange({ cells: element.cells.slice(0, -1) })}
            >
              <Minus />
            </Button>
          </div>
          <div className="format-buttons">
            <Button
              size="sm"
              variant="outline"
              disabled={element.cells[0].length >= 10}
              onClick={() =>
                onChange({ cells: element.cells.map((row) => [...row, '']) })
              }
            >
              <Plus />
              Colonne
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Supprimer la dernière colonne"
              disabled={element.cells[0].length <= 1}
              onClick={() =>
                onChange({
                  cells: element.cells.map((row) => row.slice(0, -1)),
                })
              }
            >
              <Minus />
            </Button>
          </div>
          <ToggleField
            label="Ligne d’en-tête"
            checked={element.headerRow}
            onChange={(headerRow) => onChange({ headerRow })}
          />
          <ColorField
            label="Fond"
            value={element.fill}
            onChange={(fill) => onChange({ fill })}
          />
          <ColorField
            label="Texte"
            value={element.textColor}
            onChange={(textColor) => onChange({ textColor })}
          />
        </Section>
      )}
      {element.kind === 'chart' && (
        <Section title="Graphique">
          <Choice
            label="Type"
            value={element.chartType}
            options={{ bar: 'Barres', line: 'Courbes', pie: 'Secteurs' }}
            onChange={(chartType) =>
              onChange({ chartType } as Partial<SlideElement>)
            }
          />
          <div className="chart-data-editor">
            {element.labels.map((label, i) => (
              <div key={i}>
                <Input
                  aria-label={`Catégorie ${i + 1}`}
                  value={label}
                  maxLength={80}
                  onFocus={onBegin}
                  onBlur={onEnd}
                  onChange={(e) =>
                    onChange({
                      labels: element.labels.map((v, j) =>
                        i === j ? e.target.value : v,
                      ),
                    })
                  }
                />
                {element.datasets.map((series, si) => (
                  <Input
                    key={si}
                    type="number"
                    aria-label={`${series.label}, ${label}`}
                    value={series.values[i] ?? 0}
                    onFocus={onBegin}
                    onBlur={onEnd}
                    onChange={(e) => {
                      if (Number.isFinite(e.target.valueAsNumber))
                        onChange({
                          datasets: element.datasets.map((s, sj) =>
                            si === sj
                              ? {
                                  ...s,
                                  values: s.values.map((v, j) =>
                                    i === j ? e.target.valueAsNumber : v,
                                  ),
                                }
                              : s,
                          ),
                        });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="format-buttons">
            <Button
              size="sm"
              variant="outline"
              disabled={element.labels.length >= 20}
              onClick={() =>
                onChange({
                  labels: [...element.labels, 'Catégorie'],
                  datasets: element.datasets.map((s) => ({
                    ...s,
                    values: [...s.values, 50],
                  })),
                })
              }
            >
              <Plus />
              Valeur
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Supprimer la dernière valeur"
              disabled={element.labels.length <= 1}
              onClick={() =>
                onChange({
                  labels: element.labels.slice(0, -1),
                  datasets: element.datasets.map((s) => ({
                    ...s,
                    values: s.values.slice(0, -1),
                  })),
                })
              }
            >
              <Minus />
            </Button>
          </div>
          {element.datasets.map((series, i) => (
            <div key={i} className="series-editor">
              <Input
                aria-label={`Nom de la série ${i + 1}`}
                value={series.label}
                maxLength={80}
                onFocus={onBegin}
                onBlur={onEnd}
                onChange={(e) =>
                  onChange({
                    datasets: element.datasets.map((s, j) =>
                      i === j ? { ...s, label: e.target.value } : s,
                    ),
                  })
                }
              />
              <ColorField
                label="Série"
                value={series.color}
                onChange={(color) =>
                  onChange({
                    datasets: element.datasets.map((s, j) =>
                      i === j ? { ...s, color } : s,
                    ),
                  })
                }
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={element.datasets.length >= 5}
            onClick={() =>
              onChange({
                datasets: [
                  ...element.datasets,
                  {
                    label: `Série ${element.datasets.length + 1}`,
                    color: '#737373',
                    values: element.labels.map(() => 30),
                  },
                ],
              })
            }
          >
            Ajouter une série
          </Button>
        </Section>
      )}
      {element.kind === 'media' && (
        <Section title="Média">
          <Choice
            label="Type"
            value={element.mediaType}
            options={{ video: 'Vidéo', audio: 'Audio' }}
            onChange={(mediaType) =>
              onChange({ mediaType } as Partial<SlideElement>)
            }
          />
          <label className="studio-field" htmlFor="media-url">
            Adresse du média
            <Input
              id="media-url"
              type="url"
              defaultValue={element.src}
              placeholder="https://…/video.mp4"
              maxLength={2000}
              onFocus={onBegin}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim();
                if (!value || /^https:\/\//i.test(value)) {
                  onChange({ src: value });
                  e.currentTarget.setCustomValidity('');
                } else {
                  e.currentTarget.setCustomValidity(
                    'Utilisez une adresse HTTPS complète.',
                  );
                  e.currentTarget.reportValidity();
                }
                onEnd();
              }}
            />
          </label>
          <label className="studio-field" htmlFor="media-title">
            Titre
            <Input
              id="media-title"
              value={element.title}
              maxLength={200}
              onFocus={onBegin}
              onBlur={onEnd}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          <ToggleField
            label="Lecture automatique"
            checked={element.autoplay}
            onChange={(autoplay) => onChange({ autoplay })}
          />
          <ToggleField
            label="En boucle"
            checked={element.loop}
            onChange={(loop) => onChange({ loop })}
          />
          <ToggleField
            label="Contrôles de lecture"
            checked={element.controls}
            onChange={(controls) => onChange({ controls })}
          />
          <p className="field-help">
            Une adresse directe HTTPS est nécessaire. Le navigateur peut
            demander un clic pour démarrer le son.
          </p>
        </Section>
      )}
      {element.kind === 'buddy' && (
        <Section title="Buddy">
          <Choice
            label="Expression"
            value={element.state}
            options={{
              done: 'Souriant',
              work: 'Concentré',
              update: 'Curieux',
              ok: 'Satisfait',
              noConfig: 'En attente',
              error: 'Surpris',
            }}
            onChange={(state) => onChange({ state } as Partial<SlideElement>)}
          />
          <label className="studio-field" htmlFor="buddy-caption">
            Légende
            <Input
              id="buddy-caption"
              value={element.caption}
              maxLength={200}
              onFocus={onBegin}
              onBlur={onEnd}
              onChange={(e) => onChange({ caption: e.target.value })}
            />
          </label>
        </Section>
      )}
      <Section title="Position et dimensions">
        <div className="inspector-row">
          <NumberField
            label="X (%)"
            value={element.x}
            max={100 - element.w}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(x) => onChange({ x })}
          />
          <NumberField
            label="Y (%)"
            value={element.y}
            max={100 - element.h}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(y) => onChange({ y })}
          />
        </div>
        <div className="inspector-row">
          <NumberField
            label="Largeur (%)"
            value={element.w}
            min={2}
            max={100 - element.x}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(w) => onChange({ w })}
          />
          <NumberField
            label="Hauteur (%)"
            value={element.h}
            min={2}
            max={100 - element.y}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(h) => onChange({ h })}
          />
        </div>
        <div className="inspector-row">
          <NumberField
            label="Rotation (°)"
            value={element.rotation}
            min={-180}
            max={180}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(rotation) => onChange({ rotation })}
          />
          <NumberField
            label="Opacité (%)"
            value={element.opacity * 100}
            onBegin={onBegin}
            onEnd={onEnd}
            onChange={(opacity) => onChange({ opacity: opacity / 100 })}
          />
        </div>
        <ToggleField
          label="Verrouiller l’objet"
          checked={element.locked}
          onChange={(locked) => onChange({ locked })}
        />
      </Section>
    </>
  );
}
