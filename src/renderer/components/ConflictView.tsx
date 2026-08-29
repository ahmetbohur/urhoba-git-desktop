import { useMemo, useState } from 'react';
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { errorMessage, invoke } from '../lib/ipc';
import { keys, useConflict, useInvalidateRepo, useMutation, useQueryClient } from '../lib/queries';
import { useUi } from '../stores/ui';
import { Badge, Button, EmptyState, SectionLabel, Spinner } from './primitives';
import type { ConflictChoice, ConflictSection } from '@shared/types';

/**
 * Çakışma çözüm ekranı.
 *
 * Kapsamı bilinçli olarak dar: her çakışma bloğu için üç seçenek var — bizimki,
 * onlarki, ikisi arka arkaya. Satır satır elle düzenleme sunmuyoruz; onu isteyen
 * için "editörde aç" düğmesi duruyor. Yarım yamalak bir birleştirme editörü,
 * kullanıcının kodunu sessizce bozmanın en kolay yolu.
 */

const CHOICE_LABELS: Record<ConflictChoice, string> = {
  ours: 'Bizimki',
  theirs: 'Onlarki',
  both: 'İkisi',
};

function SectionLines({ lines, tone }: { lines: string[]; tone: 'ours' | 'theirs' | 'stable' }) {
  if (lines.length === 0) {
    return <p className="px-3 py-1.5 font-mono text-[11px] text-ink-3 italic">(boş)</p>;
  }
  return (
    <div
      className={cn(
        'font-mono text-[12px] leading-[1.5]',
        tone === 'ours' && 'bg-diff-add',
        tone === 'theirs' && 'bg-diff-del',
      )}
    >
      {lines.map((line, index) => (
        <div key={index} className="selectable px-3 break-all whitespace-pre-wrap">
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

function ConflictBlock({
  section,
  choice,
  onChoose,
}: {
  section: Extract<ConflictSection, { kind: 'conflict' }>;
  choice: ConflictChoice;
  onChoose: (choice: ConflictChoice) => void;
}) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-crit">
      <div className="flex items-center gap-2 border-b border-line-soft bg-crit-tint px-3 py-1.5">
        <TriangleAlert className="size-3.5 shrink-0 text-crit" />
        <span className="text-[11px] text-ink-2">
          <span className="font-medium text-ink">{section.oursLabel}</span> ile{' '}
          <span className="font-medium text-ink">{section.theirsLabel}</span> arasında çakışma
        </span>
        <div className="ml-auto flex gap-1">
          {(['ours', 'theirs', 'both'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChoose(option)}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-medium',
                choice === option
                  ? 'bg-accent text-white'
                  : 'border border-line bg-surface text-ink-2 hover:bg-surface-2',
              )}
            >
              {CHOICE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className={cn(choice === 'theirs' && 'opacity-40')}>
        <SectionLabel className="block bg-surface-2 px-3 py-0.5">
          {section.oursLabel}
        </SectionLabel>
        <SectionLines lines={section.ours} tone="ours" />
      </div>
      <div className={cn('border-t border-line-soft', choice === 'ours' && 'opacity-40')}>
        <SectionLabel className="block bg-surface-2 px-3 py-0.5">
          {section.theirsLabel}
        </SectionLabel>
        <SectionLines lines={section.theirs} tone="theirs" />
      </div>
    </div>
  );
}

export function ConflictView({ repoId, path }: { repoId: string; path: string }) {
  const { data: conflict, isLoading } = useConflict(repoId, path);
  /*
   * Seçimler blok sırasına göre bir sözlükte: dosya yeniden okunduğunda dizinin
   * boyutunu senkronize tutmak için effect yazmaya gerek kalmıyor, seçilmemiş
   * her blok varsayılan olarak "bizimki" sayılıyor. Dosya değişince bileşen
   * `key` ile yeniden kuruluyor.
   */
  const [choices, setChoices] = useState<Record<number, ConflictChoice>>({});
  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);
  const select = useUi((s) => s.select);

  /**
   * Her bölümün kaçıncı çakışma olduğunu önceden hesaplıyoruz; render sırasında
   * sayaç artırmak React'in yeniden çalıştırabildiği kodda güvenilir değil.
   */
  const conflictOrdinals = useMemo(() => {
    const ordinals: number[] = [];
    let seen = 0;
    for (const section of conflict?.sections ?? []) {
      ordinals.push(section.kind === 'conflict' ? seen++ : -1);
    }
    return ordinals;
  }, [conflict]);

  const conflictCount = conflictOrdinals.filter((ordinal) => ordinal >= 0).length;
  const orderedChoices = useMemo(
    () => Array.from({ length: conflictCount }, (_, index) => choices[index] ?? 'ours'),
    [conflictCount, choices],
  );

  const resolve = useMutation({
    mutationFn: () => invoke('git:conflict-resolve', { repoId, path, choices: orderedChoices }),
    onSuccess: () => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: keys.conflict(repoId, path) });
      select({ kind: 'none' });
      toast({ kind: 'success', title: `${path} çözüldü ve hazırlandı` });
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'Çözülemedi', description: errorMessage(error) }),
  });

  const openExternal = useMutation({
    mutationFn: () => invoke('git:open-external', { repoId, path }),
    onError: (error) =>
      toast({ kind: 'error', title: 'Dosya açılamadı', description: errorMessage(error) }),
  });

  if (isLoading || !conflict) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (conflict.isBinary) {
    return (
      <EmptyState
        icon={<FileIcon />}
        title="İkili dosyada çakışma"
        description="Bu dosya metin olarak birleştirilemiyor. Hangi sürümü tutacağına karar verip dosyayı elle düzenle."
        action={
          <Button variant="secondary" onClick={() => openExternal.mutate()}>
            <ExternalLink className="size-3.5" />
            Sistemde aç
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px] text-ink">{path}</p>
          <p className="text-[11px] text-ink-3">
            {conflictCount > 0
              ? `${conflictCount} çakışma bloğu — her biri için bir taraf seç`
              : 'Bu dosyada çakışma işareti kalmamış'}
          </p>
        </div>
        <Badge tone="crit">Çakışma</Badge>
        <Button size="sm" variant="ghost" onClick={() => openExternal.mutate()}>
          <ExternalLink className="size-3.5" />
          Editörde aç
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={resolve.isPending}
          onClick={() => resolve.mutate()}
        >
          Çözüldü olarak işaretle
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-surface py-2">
        {conflict.sections.map((section, index) => {
          if (section.kind === 'stable') {
            return (
              <div key={index}>
                <SectionLines lines={section.lines} tone="stable" />
              </div>
            );
          }
          const ordinal = conflictOrdinals[index];
          return (
            <ConflictBlock
              key={index}
              section={section}
              choice={choices[ordinal] ?? 'ours'}
              onChoose={(choice) =>
                setChoices((previous) => ({ ...previous, [ordinal]: choice }))
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function FileIcon() {
  return <TriangleAlert className="size-5" />;
}
