import { useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { cn } from '../../lib/cn';
import { errorMessage, invoke } from '../../lib/ipc';
import {
  keys,
  useBranches,
  useInvalidateRepo,
  useMutation,
  useQueryClient,
  useStatus,
} from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button, SectionLabel } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';

/**
 * Pull request oluşturma.
 *
 * Hedef dal listesi uzak dallardan geliyor: PR ancak sunucuda var olan bir dala
 * açılabilir. Kaynak dal her zaman geçerli dal — "hangi daldan" sorusunu sormak
 * yerine kullanıcının zaten üzerinde olduğu dalı kullanmak hem daha az adım hem
 * daha az hata.
 *
 * Ana süreç, dal uzakta yoksa ya da yerel commit'ler gönderilmemişse PR açmadan
 * önce push ediyor; kullanıcı GitHub'ın "head sha not found" hatasıyla
 * karşılaşmıyor.
 */
export function CreatePullDialog({
  repoId,
  open,
  onOpenChange,
  currentBranch,
}: {
  repoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBranch: string | null;
}) {
  const { data: branches } = useBranches(repoId);
  const { data: status } = useStatus(repoId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [base, setBase] = useState('');
  const [draft, setDraft] = useState(false);

  const client = useQueryClient();
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);

  // Uzak dalların yerel karşılıkları; kendi dalımız hedef olamaz.
  const baseOptions = [
    ...new Set(
      (branches?.remote ?? [])
        .map((branch) => branch.name)
        .filter((name) => name !== currentBranch),
    ),
  ];
  const effectiveBase = base || baseOptions.find((name) => name === 'main' || name === 'master') || baseOptions[0] || '';

  const create = useMutation({
    mutationFn: () =>
      invoke('github:pull-create', {
        repoId,
        title: title.trim(),
        body: body.trim() || undefined,
        base: effectiveBase,
        draft,
      }),
    onSuccess: (pull) => {
      invalidate(repoId);
      void client.invalidateQueries({ queryKey: keys.pulls(repoId) });
      toast({
        kind: 'success',
        title: `#${pull.number} açıldı`,
        description: pull.title,
      });
      setTitle('');
      setBody('');
      onOpenChange(false);
    },
    onError: (error) =>
      toast({ kind: 'error', title: 'PR açılamadı', description: errorMessage(error) }),
  });

  const unpushed = (status?.ahead ?? 0) > 0 || !status?.upstream;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Pull request oluştur"
      description={
        currentBranch
          ? `${currentBranch} dalındaki değişiklikler için.`
          : 'Önce bir dala geçmen gerekiyor.'
      }
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={title.trim().length === 0 || !effectiveBase || !currentBranch}
            onClick={() => create.mutate()}
          >
            <GitPullRequest className="size-3.5" />
            {draft ? 'Taslak olarak aç' : 'Aç'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-ground p-2.5 font-mono text-[12px]">
          <span className="truncate text-accent-ink">{currentBranch ?? '—'}</span>
          <span className="text-ink-3">→</span>
          <span className="truncate text-ink">{effectiveBase || '—'}</span>
        </div>

        {unpushed && currentBranch && (
          <p className="rounded-md bg-warn-tint px-2.5 py-2 text-[11px] text-ink">
            Bu dalda gönderilmemiş commit’ler var. PR açılmadan önce dal otomatik olarak
            gönderilecek.
          </p>
        )}

        <Field label="Başlık">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="Neyi değiştiriyor?"
            autoFocus
          />
        </Field>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink">Açıklama</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            placeholder="Ne yaptığını ve neden yaptığını anlat."
            className="selectable w-full resize-none rounded-md border border-line bg-ground px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-3 focus-visible:border-accent"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <SectionLabel>Hedef dal</SectionLabel>
          {baseOptions.length === 0 ? (
            <p className="rounded-md bg-surface-2 px-2.5 py-2 text-[11px] text-ink-2">
              Uzak sunucuda başka dal görünmüyor. Önce fetch etmeyi dene.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {baseOptions.slice(0, 12).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setBase(name)}
                  className={cn(
                    'h-7 rounded-md border px-2 font-mono text-[11px]',
                    effectiveBase === name
                      ? 'border-transparent bg-accent text-white'
                      : 'border-line bg-surface text-ink-2 hover:bg-surface-2',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={draft}
            onChange={(event) => setDraft(event.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Taslak olarak aç — henüz incelenmeye hazır değil
        </label>
      </div>
    </DialogShell>
  );
}
