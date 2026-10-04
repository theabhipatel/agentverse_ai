import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import type { KnowledgeDocument, KnowledgeSourceType, UpdateKnowledgeDocumentInput } from '@/types/api'

export const ACCEPTED_FILES = '.pdf,.docx,.txt,.md'
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export const ACCEPTED_VIDEO_FILES = '.mp4,.mov,.webm'
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/** A video is a 'file' document on the backend. This third kind only steers which upload button opened the dialog. */
export type DialogKind = KnowledgeSourceType | 'video'

export interface KnowledgeDocumentSubmit {
  file: File | null
  url: string | null
  title: string | null
  changes: UpdateKnowledgeDocumentInput
}

interface KnowledgeDocumentDialogProps {
  open: boolean
  kind: DialogKind
  document: KnowledgeDocument | null
  saving: boolean
  onClose: () => void
  onSubmit: (submit: KnowledgeDocumentSubmit) => Promise<void>
}

const COPY = {
  file: {
    createTitle: 'Upload a file',
    createDescription: 'PDF, DOCX, TXT or MD, up to 20 MB. It is read and indexed in the background.',
    editTitle: 'Edit document',
    editDescription: 'Rename it, or replace the file. A new file is indexed again.',
  },
  video: {
    createTitle: 'Upload a video',
    createDescription:
      'MP4, MOV or WEBM, up to 200 MB. Its audio is transcribed in the background, which can take a few minutes.',
    editTitle: 'Edit video',
    editDescription: 'Rename it. To use a different video, delete this one and upload again.',
  },
  url: {
    createTitle: 'Add a link',
    createDescription:
      'The page is fetched once and its text is indexed. Pages behind a login cannot be read.',
    editTitle: 'Edit link',
    editDescription: 'Rename it, or point it at a new URL. A new URL is fetched again.',
  },
} as const

/**
 * One dialog for adding and editing both files and links. The parent remounts it
 * with a key, so initial state comes straight from props.
 */
export function KnowledgeDocumentDialog({
  open,
  kind,
  document,
  saving,
  onClose,
  onSubmit,
}: KnowledgeDocumentDialogProps) {
  const isEdit = document !== null
  const copy = COPY[kind]
  const isVideo = kind === 'video'
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_FILE_BYTES
  const maxLabel = isVideo ? '200 MB' : '20 MB'
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState(document?.url ?? '')
  const [title, setTitle] = useState(isEdit && document.title !== document.url ? document.title : '')
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(selected: File | null) {
    setError(selected && selected.size > maxBytes ? `Files can be at most ${maxLabel}` : null)
    setFile(selected)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (error) {
      return
    }
    const trimmedTitle = title.trim()
    const trimmedUrl = url.trim()

    const changes: UpdateKnowledgeDocumentInput = {}
    if (isEdit) {
      if (trimmedTitle && trimmedTitle !== document.title) changes.title = trimmedTitle
      if (kind === 'url' && trimmedUrl !== document.url) changes.url = trimmedUrl
      if (Object.keys(changes).length === 0 && !file) {
        onClose()
        return
      }
    }

    await onSubmit({
      file,
      url: kind === 'url' ? trimmedUrl : null,
      title: trimmedTitle || null,
      changes,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? copy.editTitle : copy.createTitle}</DialogTitle>
            <DialogDescription>{isEdit ? copy.editDescription : copy.createDescription}</DialogDescription>
          </DialogHeader>

          {kind === 'url' ? (
            <Field>
              <FieldLabel htmlFor="knowledge-url">URL</FieldLabel>
              <Input
                id="knowledge-url"
                type="url"
                placeholder="https://example.com/handbook"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
            </Field>
          ) : isVideo && isEdit ? null : (
            <Field>
              <FieldLabel htmlFor="knowledge-file">
                {isVideo ? 'Video' : isEdit ? 'Replace file' : 'File'}
              </FieldLabel>
              <Input
                id="knowledge-file"
                type="file"
                accept={isVideo ? ACCEPTED_VIDEO_FILES : ACCEPTED_FILES}
                required={!isEdit}
                onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
              />
              <FieldDescription>
                {error ??
                  (isVideo
                    ? 'MP4, MOV or WEBM.'
                    : isEdit
                      ? `Current file: ${document.fileName ?? 'unknown'}. Leave empty to keep it.`
                      : 'PDF, DOCX, TXT or MD.')}
              </FieldDescription>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="knowledge-title">Title</FieldLabel>
            <Input
              id="knowledge-title"
              value={title}
              maxLength={200}
              placeholder={kind === 'url' ? 'Defaults to the page title' : 'Defaults to the file name'}
              onChange={(event) => setTitle(event.target.value)}
            />
            <FieldDescription>
              Shown under the AI Coach's answers when it uses this document.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || error !== null}>
              {saving ? <Spinner /> : null}
              {isEdit ? 'Save changes' : kind === 'url' ? 'Add link' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
