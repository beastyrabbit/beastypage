"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Link as LinkIcon, Loader2, ImageIcon, Shuffle } from "lucide-react";
import { toast } from "sonner";

import {
  fetchRandomWikimediaImage,
  IMAGE_CATEGORIES,
  type ImageCategory,
} from "@/lib/color-extraction/wikimedia-random";

interface ImageUploaderProps {
  onImageLoad: (source: File | string) => void;
  isLoading: boolean;
  error: string | null;
}

const VALID_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function ImageUploader({
  onImageLoad,
  isLoading,
  error,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [loadingCategory, setLoadingCategory] = useState<ImageCategory | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRandomImage = useCallback(
    async (category: ImageCategory) => {
      setLoadingCategory(category);
      try {
        const url = await fetchRandomWikimediaImage(category);
        onImageLoad(url);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to fetch random image"
        );
      } finally {
        setLoadingCategory(null);
      }
    },
    [onImageLoad]
  );

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
        const file = files[0];
        if (!VALID_IMAGE_TYPES.includes(file.type)) {
          toast.error("Invalid image format. Use PNG, JPEG, WebP, or GIF.");
          return;
        }
        onImageLoad(file);
      }
    },
    [onImageLoad]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (!VALID_IMAGE_TYPES.includes(file.type)) {
          toast.error("Invalid image format. Use PNG, JPEG, WebP, or GIF.");
          return;
        }
        onImageLoad(file);
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
              disabled={isLoading || loadingCategory !== null}
            />
          </div>
          <button
            type="submit"
            disabled={!urlInput.trim() || isLoading || loadingCategory !== null}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Load URL
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Note: Some URLs may be blocked due to CORS. Try downloading the image first if loading fails.
        </p>
      </div>

      {/* Random image buttons */}
      <div className="glass-card p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Shuffle className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              Or try a random image from Wikimedia Commons
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {IMAGE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => handleRandomImage(category.id)}
                disabled={isLoading || loadingCategory !== null}
                className="flex items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingCategory === category.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {category.label}
              </button>
            ))}
          </div>
        </div>
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
