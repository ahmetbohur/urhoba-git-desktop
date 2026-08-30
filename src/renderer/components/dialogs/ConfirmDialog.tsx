import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { Button } from '../primitives';
import { DialogShell } from './DialogShell';

/** Geri dönüşü olmayan işlemler için ortak onay kutusu. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('Vazgeç')}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? <p className="text-[13px] text-ink-2">{t('Bu işlem geri alınamaz.')}</p>}
    </DialogShell>
  );
}
