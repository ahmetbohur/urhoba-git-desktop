import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useT } from '../../i18n';
import { errorMessage, invoke } from '../../lib/ipc';
import { useInvalidateRepo, useMutation } from '../../lib/queries';
import { useUi } from '../../stores/ui';
import { Button } from '../primitives';
import { DialogShell, Field, TextInput } from './DialogShell';
import type { Branch } from '@shared/types';

/**
 * Dal yeniden adlandırma.
 *
 * Yerel yeniden adlandırma tek komut ama uzak dal kendiliğinden takip etmiyor:
 * sunucuda eski ad kalıyor ve upstream kopuyor. Bunu sessizce geçmek yerine
 * kullanıcıya soruyoruz. Uzağa yansıtma varsayılan olarak kapalı çünkü geri
 * dönüşü zor: başkası eski dalı takip ediyorsa onun upstream'i de kopar.
 */
export function RenameBranchDialog({
  repoId,
  branch,
  open,
  onOpenChange,
}: {
  repoId: string;
  branch: Branch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [name, setName] = useState(branch?.fullName ?? '');
  const [updateRemote, setUpdateRemote] = useState(false);
  const invalidate = useInvalidateRepo();
  const toast = useUi((s) => s.toast);

  const rename = useMutation({
    mutationFn: () =>
      invoke('git:branch-rename', {
        repoId,
        from: branch?.fullName ?? '',
        to: name.trim(),
        updateRemote,
      }),
    onSuccess: (result) => {
      invalidate(repoId);
      toast({
        kind: result.outcome === 'renamed' ? 'success' : 'error',
        title: t('Dal yeniden adlandırma'),
        description: result.message,
      });
      if (result.outcome === 'renamed') onOpenChange(false);
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('Dal yeniden adlandırılamadı'),
        description: errorMessage(error),
      }),
  });

  const hasUpstream = !!branch?.upstream;
  const changed = name.trim().length > 0 && name.trim() !== branch?.fullName;

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('Dalı yeniden adlandır')}
      description={branch?.fullName}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant="primary"
            loading={rename.isPending}
            disabled={!changed}
            onClick={() => rename.mutate()}
          >
            <Pencil className="size-3.5" />
            {t('Yeniden adlandır')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('Yeni ad')}>
          <TextInput value={name} onChange={setName} mono data-autofocus />
        </Field>

        {hasUpstream && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground p-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-[12px] text-ink">
              <input
                type="checkbox"
                checked={updateRemote}
                onChange={(event) => setUpdateRemote(event.target.checked)}
                className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent)]"
              />
              <span>
                {t('Uzak sunucudaki dalı da taşı')}
                <span className="mt-0.5 block text-[11px] text-ink-2">
                  {t('Yeni ad gönderilir, eski dal silinir. Bu dalı takip eden başkaları varsa onların bağlantısı kopar.')}
                </span>
              </span>
            </label>
          </div>
        )}

        {hasUpstream && !updateRemote && (
          <p className="text-[11px] text-ink-2">
            {t('Uzak sunucuda dal eski adıyla kalacak; istediğinde push ederek yeni adı gönderebilirsin.')}
          </p>
        )}
      </div>
    </DialogShell>
  );
}
