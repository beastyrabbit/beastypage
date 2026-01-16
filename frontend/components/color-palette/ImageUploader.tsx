"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Link as LinkIcon, Loader2, ImageIcon } from "lucide-react";

interface ImageUploaderProps {
  onImageLoad: (source: File | string) => void;
  isLoading: boolean;
  error: string | null;
}

/**
 * Render a UI for uploading or loading an image via drag-and-drop, file picker, or URL.
 *
 * @param onImageLoad - Callback invoked with a File or a trimmed URL string when the user provides an image.
 * @param isLoading - When true, shows a loading state and disables file/URL inputs.
 * @param error - An error message to display below the controls, or `null` to show no error.
 * @returns The rendered ImageUploader JSX element.
 */
export function ImageUploader({
  onImageLoad,
  isLoading,
  error,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        onImageLoad(files[0]);
      }
    },
    [onImageLoad]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onImageLoad(files[0]);
      }
    },
    [onImageLoad]
  );

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (urlInput.trim()) {
        onImageLoad(urlInput.trim());
      }
    },
    [urlInput, onImageLoad]
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      <div
        className={`glass-card relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-4 p-8 transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "hover:border-primary/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        aria-label="Upload image"
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading image...</p>
          </div>
        ) : (
          <>
            <div
              className={`rounded-2xl bg-primary/10 p-4 transition-transform duration-300 ${
                isDragging ? "scale-110" : ""
              }`}
            >
              {isDragging ? (
                <Upload className="size-10 text-primary" />
              ) : (
                <ImageIcon className="size-10 text-primary" />
              )}
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                {isDragging ? "Drop your image here" : "Drop an image or click to upload"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                PNG, JPEG, WebP, GIF (max 10MB)
              </p>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleFileSelect}
          disabled={isLoading}
        />
      </div>

      {/* URL input */}
      <div className="glass-card p-6">
        <form onSubmit={handleUrlSubmit} className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-border/50 bg-background/50 px-4 py-3">
            <LinkIcon className="size-5 text-muted-foreground" />
            <input
              type="url"
              placeholder="Or paste an image URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={!urlInput.trim() || isLoading}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load URL
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Note: Some URLs may be blocked due to CORS. Try downloading the image first if loading fails.
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}