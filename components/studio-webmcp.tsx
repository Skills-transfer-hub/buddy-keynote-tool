'use client';

import { useEffect, useRef } from 'react';
import type { Deck } from '@/lib/studio';

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};

export function StudioWebMcp({
  deck,
  onCreate,
}: {
  deck: Deck;
  onCreate: (title: string, body: string) => string;
}) {
  const actions = useRef({ deck, onCreate });
  useEffect(() => {
    actions.current = { deck, onCreate };
  }, [deck, onCreate]);
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        /* Experimental API is optional. */
      }
    };
    register({
      name: 'get_buddy_keynote',
      title: 'Lire la présentation Buddy',
      description:
        'Lit le titre, l’ordre des diapositives et les objets de la présentation ouverte.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        const current = actions.current.deck;
        return {
          title: current.title,
          slideCount: current.slides.length,
          slides: current.slides.map((slide, index) => ({
            id: slide.id,
            index: index + 1,
            title: slide.name,
            hidden: slide.hidden,
            objectCount: slide.elements.length,
            transition: slide.transition,
          })),
        };
      },
    });
    register({
      name: 'create_buddy_slide',
      title: 'Créer une diapositive Buddy',
      description:
        'Crée une diapositive titre et texte puis la sélectionne dans le studio.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 120 },
          body: { type: 'string', maxLength: 320 },
        },
        required: ['title'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw new Error('Un titre est requis.');
        const value = input as Record<string, unknown>;
        if (
          Object.keys(value).some((key) => key !== 'title' && key !== 'body') ||
          typeof value.title !== 'string' ||
          !value.title.trim() ||
          value.title.length > 120 ||
          (value.body !== undefined &&
            (typeof value.body !== 'string' || value.body.length > 320))
        )
          throw new Error('Titre ou texte invalide.');
        const id = actions.current.onCreate(
          value.title,
          typeof value.body === 'string' ? value.body : '',
        );
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        return { id, status: 'created' };
      },
    });
    return () => lifecycle.abort();
  }, []);
  return null;
}
