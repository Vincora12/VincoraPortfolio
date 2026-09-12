import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";
import { savedToken } from "../brain/stream";
import { getCurrentProjectScope } from "../state/currentProject";
import { uploadWorkspaceFile } from "../connectors/vinzWorkspace";
import { GLOBAL_PROJECT_ID } from "../engine/projects";

/* 🔷 «Quando gli mando foto e pdf bisogna che si carichino automaticamente
   nella cartella del progetto.» Prima restavano solo nella chat — un
   allegato del genere spariva quando il thread invecchiava, mentre la
   cartella di lavoro (FILES/`vedi_cartella_lavoro`, la STESSA per Generale
   con `GLOBAL_PROJECT_ID`) resta per sempre. Un salvataggio in più, non al
   posto di quello in chat: se fallisce (rete assente, server non locale) il
   messaggio parte comunque — non è mai motivo per bloccare l'invio. */
function saveToProjectWorkspace(name: string, dataUrl: string): void {
  const token = savedToken();
  if (!token) return;
  const scope = getCurrentProjectScope();
  const workspaceId = scope.projectId ?? GLOBAL_PROJECT_ID;
  const workspaceTitle = scope.projectId ? scope.projectTitle : "Generale";
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  void uploadWorkspaceFile(token, workspaceId, workspaceTitle, name, base64).catch(() => {});
}

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
export async function optimizedImageDataUrl(file: File): Promise<string> {
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
      image = await optimizedImageDataUrl(attachment.file);
    } catch {
      image = await dataUrlOf(attachment.file);
    }
    /* Mai tenere il `File` nell'allegato "complete": non è serializzabile
       (JSON.stringify lo riduce a `{}`), e quel `{}` sopravvive nella cronologia
       salvata — al riavvio torna truthy e manda `URL.createObjectURL({})` a
       schiantare tutta l'app in fase di render (vedi useAttachmentSrc). */
    const { file: _file, ...rest } = attachment;
    saveToProjectWorkspace(attachment.name, image);
    return {
      ...rest,
      contentType: image.slice(5, image.indexOf(";")) || attachment.contentType,
      status: { type: "complete" },
      content: [{ type: "image", image }],
    };
  }

  async remove() {}
}

/** PDF nativo: resta binario e viene letto dal modello, senza OCR fragile nel browser. */
export class VinzPdfAttachmentAdapter implements AttachmentAdapter {
  accept = "application/pdf";

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > 10 * 1024 * 1024) throw new Error("PDF troppo grande: massimo 10 MB");
    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      type: "document",
      name: file.name,
      contentType: "application/pdf",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const url = await dataUrlOf(attachment.file);
    const { file: _file, ...rest } = attachment;
    saveToProjectWorkspace(attachment.name, url);
    return {
      ...rest,
      status: { type: "complete" },
      content: [{
        type: "file",
        filename: attachment.name,
        mimeType: "application/pdf",
        data: url.slice(url.indexOf(",") + 1),
      }],
    };
  }

  async remove() {}
}
