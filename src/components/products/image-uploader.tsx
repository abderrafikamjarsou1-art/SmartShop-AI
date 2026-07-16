"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { GripVertical, ImagePlus, Loader2, Star, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export interface UploadedImage { url: string; path: string }

const MAX_IMAGES = 5;
const MAX_SIZE_MB = 5;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Compress client-side before upload: downscale to max 1600px and
 * re-encode as WebP (~0.82 quality). A 4MB phone photo becomes ~150KB —
 * faster uploads, cheaper storage, faster product lists.
 */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/webp",
      0.82
    );
  });
}

/**
 * Product image manager — drag & drop or click, previews, reorder
 * (first image = primary), remove. Uploads land in Supabase Storage
 * immediately; the form only carries {url, path} references, and the
 * service syncs ProductImage rows atomically on save.
 */
export function ImageUploader({
  value, onChange, disabled,
}: {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const room = MAX_IMAGES - value.length;
    if (room <= 0) { toast.error(`Maximum ${MAX_IMAGES} images per product.`); return; }
    if (list.length > room) toast.warning(`Only ${room} more image${room > 1 ? "s" : ""} can be added.`);

    const valid = list.slice(0, room).filter((f) => {
      if (!ACCEPTED.includes(f.type)) { toast.error(`${f.name}: only JPG, PNG or WebP.`); return false; }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) { toast.error(`${f.name}: larger than ${MAX_SIZE_MB} MB.`); return false; }
      return true;
    });
    if (valid.length === 0) return;

    setUploading(true);
    const supabase = createClient();
    const uploaded: UploadedImage[] = [];

    for (const file of valid) {
      try {
        const blob = await compressImage(file);
        const path = `${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from("products").upload(path, blob, { contentType: "image/webp" });
        if (error) throw error;
        uploaded.push({ path, url: supabase.storage.from("products").getPublicUrl(path).data.publicUrl });
      } catch {
        toast.error(`${file.name}: upload failed.`);
      }
    }

    if (uploaded.length) onChange([...value, ...uploaded]);
    setUploading(false);
  }, [value, onChange]);

  const remove = async (index: number) => {
    const img = value[index];
    onChange(value.filter((_, i) => i !== index));
    // Best-effort storage cleanup; DB rows are synced by the service on save
    createClient().storage.from("products").remove([img.path]);
  };

  const reorder = (from: number, to: number) => {
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {value.map((img, i) => (
          <div
            key={img.path}
            draggable={!disabled}
            onDragStart={() => (dragIndex.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIndex.current !== null) reorder(dragIndex.current, i); dragIndex.current = null; }}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-secondary"
          >
            <Image src={img.url} alt={`Product image ${i + 1}`} fill className="object-cover" sizes="120px" />
            {i === 0 && (
              <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                <Star className="size-2.5 fill-current text-warning" aria-hidden /> Primary
              </span>
            )}
            <div className="absolute inset-0 hidden items-center justify-center gap-1 bg-black/40 group-hover:flex">
              <GripVertical className="size-4 text-white/80" aria-hidden />
              <Button type="button" variant="destructive" size="icon" className="size-7"
                aria-label={`Remove image ${i + 1}`} onClick={() => remove(i)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {value.length < MAX_IMAGES && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            aria-label="Add product images"
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors
              ${dragging ? "border-primary bg-accent/50 text-accent-foreground" : "hover:border-primary/50 hover:bg-accent/30"}`}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            <span className="text-[10px]">{uploading ? "Uploading…" : "Add"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef} type="file" multiple accept={ACCEPTED.join(",")} className="sr-only"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Up to {MAX_IMAGES} images · JPG, PNG or WebP · drag to reorder · first image is the primary
      </p>
    </div>
  );
}
