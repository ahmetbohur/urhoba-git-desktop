import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { CornerDownLeft, Search } from 'lucide-react';
import { useT } from '../i18n';
import { cn } from '../lib/cn';
import { formatShortcut, type Command } from '../lib/commands';

/**
 * Komut paleti.
 *
 * Eşleştirme basit alt dizge araması: kullanıcı "pus" yazınca "Push" bulunsun
 * diye Türkçe'ye duyarlı küçültme kullanıyoruz (`toLocaleLowerCase('tr')`),
 * çünkü varsayılan küçültme "I" harfini yanlış çeviriyor ve "PUSH" ile "push"
 * eşleşmesi bozulabiliyor.
 */
export function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        {/* İçerik yalnızca açıkken kuruluyor: arama metni ve seçili satır
            kapanışta effect'le temizlenmek yerine kendiliğinden sıfırlanıyor. */}
        <PaletteContent commands={commands} onOpenChange={onOpenChange} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteContent({
  commands,
  onOpenChange,
}: {
  commands: Command[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  /*
   * Arama metni ve seçili satır tek bir durumda: metin değiştiğinde seçimin
   * başa dönmesi aynı güncellemede oluyor, arada tutarsız bir render olmuyor.
   */
  const [state, setState] = useState({ query: '', activeIndex: 0 });
  const { query, activeIndex } = state;
  const setQuery = (next: string) => setState({ query: next, activeIndex: 0 });
  const setActiveIndex = (updater: (index: number) => number) =>
    setState((previous) => ({ ...previous, activeIndex: updater(previous.activeIndex) }));
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    if (needle.length === 0) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.hint ?? ''}`
        .toLocaleLowerCase('tr')
        .includes(needle),
    );
  }, [commands, query]);

  // Klavye ile gezinirken seçili satır her zaman görünür kalsın.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runCommand = (command: Command) => {
    if (command.disabled) return;
    onOpenChange(false);
    void command.run();
  };

  // Aynı gruptaki komutları başlık altında topluyoruz; sıra korunuyor.
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ command: Command; index: number }>>();
    filtered.forEach((command, index) => {
      const list = map.get(command.group) ?? [];
      list.push({ command, index });
      map.set(command.group, list);
    });
    return [...map.entries()];
  }, [filtered]);

  return (
    <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[15vh] left-1/2 z-50 flex max-h-[60vh] w-[92vw] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const command = filtered[activeIndex];
              if (command) runCommand(command);
            }
          }}
        >
          <Dialog.Title className="sr-only">{t('Komut paleti')}</Dialog.Title>

          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-ink-3" />
            <input
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('Komut, depo veya dal ara')}
              aria-label={t('Komut ara')}
              className="selectable h-11 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-ink-3">{t('Eşleşen komut yok.')}</p>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group} className="mb-1">
                  <p className="px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-ink-3 uppercase">
                    {t(group)}
                  </p>
                  {entries.map(({ command, index }) => (
                    <button
                      key={command.id}
                      type="button"
                      data-index={index}
                      disabled={command.disabled}
                      onMouseMove={() => setActiveIndex(() => index)}
                      onClick={() => runCommand(command)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                        index === activeIndex ? 'bg-accent-tint' : 'hover:bg-surface-2',
                        command.disabled && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-[13px]',
                            index === activeIndex ? 'text-accent-ink' : 'text-ink',
                          )}
                        >
                          {t(command.label)}
                        </span>
                        {command.hint && (
                          <span className="block truncate text-[11px] text-ink-3">
                            {command.hint}
                          </span>
                        )}
                      </span>
                      {command.shortcut && (
                        <kbd className="shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                          {formatShortcut(command.shortcut)}
                        </kbd>
                      )}
                      {index === activeIndex && !command.shortcut && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-ink-3" />
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
    </Dialog.Content>
  );
}
