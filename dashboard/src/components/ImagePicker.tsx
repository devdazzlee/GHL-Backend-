import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { uploadSiteImage } from '../api/blog';
import { searchStockPhotos, type StockPhoto } from '../api/siteEditor';
import { Button } from './ui/button';

interface Props {
  siteId: string;
  title: string;
  currentUrl: string | null;
  initialQuery?: string;
  onChoose: (image: { url: string; source: 'PICKED' | 'UPLOAD' }) => Promise<void>;
  onClose: () => void;
}

const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white';

/** Upload an image, paste a link, or pick a stock photo. The choice is stored and stays until changed. */
export function ImagePicker({ siteId, title, currentUrl, initialQuery = '', onChoose, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [photos, setPhotos] = useState<StockPhoto[] | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  const choose = (url: string, source: 'PICKED' | 'UPLOAD') =>
    act('save', async () => {
      await onChoose({ url, source });
      onClose();
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">Change image: {title}</h3>
        {currentUrl ? <img src={currentUrl} alt="" className="mt-3 h-32 w-56 rounded object-cover" /> : null}

        <div className="mt-5 space-y-5">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Upload your own</p>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void act('upload', async () => {
                    const url = await uploadSiteImage(siteId, file, 'pages');
                    await onChoose({ url, source: 'UPLOAD' });
                    onClose();
                  });
                }
              }}
            />
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
              {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Upload image
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Or use an image link (https://…)</p>
            <div className="flex gap-2">
              <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} placeholder="https://…" />
              <Button type="button" variant="outline" disabled={busy !== null || !link.trim()} onClick={() => void choose(link.trim(), 'PICKED')}>
                Use link
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Or choose a stock photo</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void act('search', async () => setPhotos(await searchStockPhotos(siteId, query)));
              }}
            >
              <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} placeholder="e.g. dog boarding kennel" />
              <Button type="submit" variant="outline" disabled={busy !== null || !query.trim()}>
                {busy === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Search
              </Button>
            </form>
            {photos ? (
              photos.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No photos found. Try other words.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((photo) => (
                    <button
                      key={photo.url}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void choose(photo.url, 'PICKED')}
                      className="group relative overflow-hidden rounded border border-slate-800 text-left"
                      title={photo.alt}
                    >
                      <img src={photo.thumb} alt={photo.alt} className="h-28 w-full object-cover transition group-hover:opacity-80" />
                      <span className="block truncate px-2 py-1 text-[10px] text-slate-500">Photo: {photo.photographer} (Pexels)</span>
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
