import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";

const dataUrlOf = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error("Foto non leggibile"));
  reader.readAsDataURL(file);
});

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Foto non decodificabile"));
  };
  image.src = url;
});

/** Riduce le foto del telefono prima di salvarle e inviarle all'AI. */
async function optimizedDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.size <= 1_500_000) return dataUrlOf(file);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return dataUrlOf(file);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export class VinzImageAttachmentAdapter implements AttachmentAdapter {
  accept = "image/*";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      type: "image",
      name: file.name,
      contentType: file.type,
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    let image: string;
    try {
      image = await optimizedDataUrl(attachment.file);
    } catch {
      image = await dataUrlOf(attachment.file);
    }
    return {
      ...attachment,
      contentType: image.slice(5, image.indexOf(";")) || attachment.contentType,
      status: { type: "complete" },
      content: [{ type: "image", image }],
    };
  }

  async remove() {}
}
