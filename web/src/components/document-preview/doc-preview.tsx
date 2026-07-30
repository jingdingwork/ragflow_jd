import message from '@/components/ui/message';
import { Spin } from '@/components/ui/spin';
import request from '@/utils/request';
import classNames from 'classnames';
import { renderAsync } from 'docx-preview';
import { useEffect, useRef, useState } from 'react';
import './doc-preview.css';

interface DocPreviewerProps {
  className?: string;
  url: string;
}

// Word document preview component. Behavior:
// 1) Fetches the document as a Blob.
// 2) Detects .docx input via a ZIP header probe.
// 3) Renders .docx with docx-preview, which reproduces the original Word page
//    layout (page size/margins, fonts, tables & merged cells, list numbering,
//    inline images, headers/footers) instead of the flattened semantic HTML
//    that Mammoth produced. Non-.docx (legacy binary .doc) shows a notice.
export const DocPreviewer: React.FC<DocPreviewerProps> = ({
  className,
  url,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  // Determines whether the Blob represents a .docx document by checking for the ZIP
  // file signature ("PK") in the initial bytes. A valid .docx file is a ZIP container
  // and always begins with:
  //     50 4B 03 04  ("PK..")
  //
  // Legacy .doc files use the CFBF binary format, commonly starting with:
  //     D0 CF 11 E0 A1 B1 1A E1
  //
  // Note that some files distributed with a ".doc" extension may internally be .docx
  // documents (e.g., renamed files or files produced by systems that export .docx
  // content under a .doc filename). These files will still present the ZIP signature
  // and are therefore treated as supported .docx payloads. The header inspection
  // ensures correct routing regardless of filename or reported extension.
  const isZipLikeBlob = async (blob: Blob): Promise<boolean> => {
    try {
      const headerSlice = blob.slice(0, 4);
      const buf = await headerSlice.arrayBuffer();
      const bytes = new Uint8Array(buf);

      // ZIP files start with "PK" (0x50, 0x4B)
      return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    } catch (e) {
      console.error('Failed to inspect blob header', e);
      return false;
    }
  };

  const fetchDocument = async () => {
    if (!url) return;

    setLoading(true);
    setUnsupported(false);

    const res = await request(url, {
      method: 'GET',
      responseType: 'blob',
      onError: () => {
        message.error('Document parsing failed');
        console.error('Error loading document:', url);
      },
    });

    try {
      const blob: Blob = res.data;

      // Execution path selection: ZIP-like payloads are treated as .docx and
      // rendered via docx-preview; non-ZIP payloads get an explicit notice.
      const looksLikeZip = await isZipLikeBlob(blob);

      if (!looksLikeZip) {
        // Non-ZIP payload (likely legacy .doc or another format).
        setUnsupported(true);
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = '';

      await renderAsync(blob, container, undefined, {
        className: 'docx',
        inWrapper: true, // wrap pages so each renders as a distinct Word page
        breakPages: true,
        ignoreLastRenderedPageBreak: true,
        experimental: true, // enables tab-stop / some table width handling
        useBase64URL: true, // inline images so they survive the auth'd origin
      });
    } catch (err) {
      message.error('Failed to parse document.');
      console.error('Error parsing document:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (url) {
      fetchDocument();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div
      className={classNames(
        'relative w-full h-full bg-background-paper border border-border-normal rounded-md overflow-auto',
        className,
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Spin />
        </div>
      )}

      {unsupported ? (
        <div className="flex h-full items-center justify-center p-4">
          <div className="border border-dashed border-border-normal rounded-xl p-8 max-w-2xl text-center">
            <p className="text-2xl font-bold mb-4">
              Preview is not available for this Word document
            </p>
            <p className="italic text-sm text-muted-foreground leading-relaxed">
              Only modern <code>.docx</code> files can be previewed.
              <br />
              The file header does not indicate a <code>.docx</code> ZIP
              archive.
            </p>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="docx-preview-root" />
      )}
    </div>
  );
};
