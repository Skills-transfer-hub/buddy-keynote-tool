'use client';
import { useState } from 'react';
import { Users, Copy, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invitation, type SharedState } from '@/lib/shared/client';
export function SharedProjectDialog({
  open,
  onOpenChange,
  state,
  name,
  onName,
  onCreate,
  onRotate,
  onLeave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SharedState | null;
  name: string;
  onName: (name: string) => void;
  onCreate: (createKey: string) => Promise<void>;
  onRotate: () => Promise<void>;
  onLeave: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [createKey, setCreateKey] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Action indisponible.',
      );
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Lien copié.');
    } catch {
      setMessage('Sélectionnez puis copiez le lien ci-dessous.');
    }
  };
  const local =
    typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(location.hostname);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setCreateKey('');
          onOpenChange(value);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogTitle className="flex items-center gap-2">
          <Users size={20} />
          Travailler ensemble
        </DialogTitle>
        <DialogDescription>
          Un projet commun, enregistré automatiquement. Chacun voit les
          modifications des autres.
        </DialogDescription>
        <label htmlFor="collaborator-name" className="grid gap-2 text-sm">
          Votre prénom
          <Input
            id="collaborator-name"
            aria-label="Votre prénom"
            value={name}
            maxLength={40}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
        {!state ? (
          <>
            <p className="text-sm text-muted-foreground">
              Créer une version partagée de cette présentation. Votre original
              reste dans « Mes présentations ».
            </p>
            <label htmlFor="shared-create-key" className="grid gap-2 text-sm">
              Code de création
              <Input
                id="shared-create-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                maxLength={256}
                value={createKey}
                onChange={(event) => setCreateKey(event.target.value)}
                aria-describedby="shared-create-key-help"
              />
            </label>
            <p
              id="shared-create-key-help"
              className="text-sm text-muted-foreground"
            >
              Fourni par la personne qui héberge Buddy. Ce code est nécessaire
              pour créer un projet partagé. Un lien d’invitation suffit pour le
              rejoindre.
            </p>
            <Button
              disabled={busy || !createKey.trim()}
              onClick={() =>
                void run(async () => {
                  const key = createKey.trim();
                  setCreateKey('');
                  await onCreate(key);
                })
              }
            >
              <Link2 size={16} />
              {busy ? 'Création…' : 'Créer le projet partagé'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">
              {state.message} ·{' '}
              {state.role === 'owner'
                ? 'Propriétaire'
                : state.role === 'viewer'
                  ? 'Lecture seule'
                  : state.role === 'editor'
                    ? 'Éditeur'
                    : 'Connexion'}
            </p>
            {state.people.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {state.people.map((p) => (
                  <span
                    className="rounded-full bg-muted px-3 py-1 text-sm"
                    key={p.session}
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            )}
            {(
              [
                ['editor', 'Peut modifier'],
                ['viewer', 'Peut consulter'],
              ] as const
            ).map(([key, label]) => {
              const token = state.connection[key];
              if (!token) return null;
              const url = invitation(state.connection, token);
              return (
                <label
                  key={key}
                  htmlFor={`share-${key}`}
                  className="grid gap-2 text-sm"
                >
                  {label}
                  <div className="flex gap-2">
                    <Input
                      id={`share-${key}`}
                      aria-label={`Lien ${label.toLowerCase()}`}
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      aria-label={`Copier le lien ${label.toLowerCase()}`}
                      variant="outline"
                      onClick={() => void copy(url)}
                    >
                      <Copy size={16} />
                    </Button>
                  </div>
                </label>
              );
            })}
            {state.role !== 'owner' && (
              <p className="text-sm text-muted-foreground">
                Le propriétaire gère les invitations et les droits d’accès.
              </p>
            )}
            {state.role === 'owner' && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(onRotate)}
              >
                Révoquer les anciens liens et en créer de nouveaux
              </Button>
            )}
            <Button variant="ghost" onClick={onLeave}>
              Revenir aux présentations locales
            </Button>
          </>
        )}
        {local && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            Vous êtes sur le serveur local. Pour inviter quelqu’un sur un autre
            ordinateur, ce projet doit être accessible sur une adresse en ligne
            commune.
          </p>
        )}
        <output className="text-sm text-muted-foreground">
          {message ||
            state?.error ||
            'Toute personne possédant un lien dispose du droit indiqué. Gardez ces liens privés.'}
        </output>
      </DialogContent>
    </Dialog>
  );
}
