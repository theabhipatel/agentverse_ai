import { useEffect, useState } from 'react'
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  VideoIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getApiErrorMessage } from '@/lib/api'
import { useKnowledgeStore } from '@/stores/knowledge-store'
import type { KnowledgeDocument } from '@/types/api'
import { AdminLayout } from './admin-layout'
import {
  KnowledgeDocumentDialog,
  type DialogKind,
  type KnowledgeDocumentSubmit,
} from './knowledge-document-dialog'

const POLL_INTERVAL_MS = 3000
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm'])

/** A video is a 'file' document underneath; this is the only place that tells one from a plain document. */
function isVideoDocument(document: KnowledgeDocument): boolean {
  const extension = document.fileName?.split('.').pop()?.toLowerCase()
  return extension !== undefined && VIDEO_EXTENSIONS.has(extension)
}

function typeLabel(document: KnowledgeDocument): string {
  if (document.sourceType === 'url') {
    return 'Link'
  }
  return document.fileName?.split('.').pop()?.toUpperCase() ?? 'File'
}

function sizeLabel(bytes: number | null): string {
  if (bytes === null) {
    return ''
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ document }: { document: KnowledgeDocument }) {
  if (document.status === 'processing') {
    return (
      <Badge variant="secondary">
        <Spinner />
        {isVideoDocument(document) ? 'Transcribing' : 'Processing'}
      </Badge>
    )
  }
  if (document.status === 'failed') {
    return <Badge variant="destructive">Failed</Badge>
  }
  return <Badge>Ready</Badge>
}

interface DialogState {
  kind: DialogKind
  document: KnowledgeDocument | null
}

export function IntelligenceHubPage() {
  const documents = useKnowledgeStore((state) => state.documents)
  const loading = useKnowledgeStore((state) => state.loading)
  const loaded = useKnowledgeStore((state) => state.loaded)
  const saving = useKnowledgeStore((state) => state.saving)
  const fetchDocuments = useKnowledgeStore((state) => state.fetchDocuments)
  const uploadFile = useKnowledgeStore((state) => state.uploadFile)
  const uploadVideo = useKnowledgeStore((state) => state.uploadVideo)
  const addUrl = useKnowledgeStore((state) => state.addUrl)
  const updateDocument = useKnowledgeStore((state) => state.updateDocument)
  const replaceFile = useKnowledgeStore((state) => state.replaceFile)
  const reprocess = useKnowledgeStore((state) => state.reprocess)
  const deleteDocument = useKnowledgeStore((state) => state.deleteDocument)
  const download = useKnowledgeStore((state) => state.download)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<KnowledgeDocument | null>(null)

  const processing = documents.some((document) => document.status === 'processing')

  useEffect(() => {
    void fetchDocuments().catch((error: unknown) => {
      toast.error(getApiErrorMessage(error, 'Could not load the Intelligence Hub'))
    })
  }, [fetchDocuments])

  // Processing happens in the background, so the list refreshes itself until it settles.
  useEffect(() => {
    if (!processing) {
      return
    }
    const timer = window.setInterval(() => {
      void fetchDocuments().catch(() => undefined)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [processing, fetchDocuments])

  async function handleSubmit(submit: KnowledgeDocumentSubmit) {
    if (!dialog) {
      return
    }
    const { kind, document } = dialog
    try {
      if (!document) {
        if (kind === 'file' && submit.file) {
          await uploadFile(submit.file, submit.title ?? undefined)
        } else if (kind === 'video' && submit.file) {
          await uploadVideo(submit.file, submit.title ?? undefined)
        } else if (kind === 'url' && submit.url) {
          await addUrl({ url: submit.url, ...(submit.title ? { title: submit.title } : {}) })
        }
        toast.success(
          kind === 'file'
            ? 'File uploaded. Indexing has started.'
            : kind === 'video'
              ? 'Video uploaded. Transcribing has started.'
              : 'Link added. Fetching has started.',
        )
      } else {
        if (Object.keys(submit.changes).length > 0) {
          await updateDocument(document.id, submit.changes)
        }
        if (submit.file) {
          await replaceFile(document.id, submit.file)
        }
        toast.success('Document updated')
      }
      setDialog(null)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not save the document'))
    }
  }

  async function handleReprocess(document: KnowledgeDocument) {
    try {
      await reprocess(document.id)
      toast.success(document.sourceType === 'url' ? 'Fetching the page again' : 'Indexing again')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not restart processing'))
    }
  }

  async function handleDownload(document: KnowledgeDocument) {
    try {
      await download(document)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not download the file'))
    }
  }

  async function handleDelete() {
    if (!pendingDelete) {
      return
    }
    try {
      await deleteDocument(pendingDelete.id)
      toast.success('Document deleted')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not delete the document'))
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <AdminLayout title="Intelligence Hub">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-heading text-2xl font-bold">Intelligence Hub</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The knowledge base behind the AI Coach. It answers questions only from what is here and names
              the documents it used.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDialog({ kind: 'url', document: null })}>
              <LinkIcon />
              Add link
            </Button>
            <Button variant="outline" onClick={() => setDialog({ kind: 'video', document: null })}>
              <VideoIcon />
              Upload video
            </Button>
            <Button onClick={() => setDialog({ kind: 'file', document: null })}>
              <UploadIcon />
              Upload file
            </Button>
          </div>
        </div>

        {loading && !loaded ? (
          <div className="space-y-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-12 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <p className="font-medium">Nothing in the Intelligence Hub yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a PDF, DOCX, TXT or MD file, add a link, or upload a video, and the AI Coach can answer
              from it.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Chunks</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => {
                  const Icon =
                    document.sourceType === 'url'
                      ? LinkIcon
                      : isVideoDocument(document)
                        ? VideoIcon
                        : FileTextIcon
                  return (
                    <TableRow key={document.id}>
                      <TableCell className="max-w-md">
                        <div className="flex items-start gap-3">
                          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 space-y-0.5">
                            <p className="truncate font-medium">{document.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {document.sourceType === 'url'
                                ? document.url
                                : [document.fileName, sizeLabel(document.fileSize)]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                            {document.status === 'failed' && document.error ? (
                              <p className="text-xs whitespace-normal text-destructive">{document.error}</p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{typeLabel(document)}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge document={document} />
                      </TableCell>
                      <TableCell className="text-right">
                        {document.status === 'ready' ? document.chunkCount : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(document.updatedAt))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Actions for ${document.title}`}
                                >
                                  <MoreHorizontalIcon />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem
                                onClick={() =>
                                  setDialog({
                                    kind: isVideoDocument(document) ? 'video' : document.sourceType,
                                    document,
                                  })
                                }
                              >
                                <PencilIcon />
                                Edit
                              </DropdownMenuItem>
                              {document.sourceType === 'file' ? (
                                <DropdownMenuItem onClick={() => void handleDownload(document)}>
                                  <DownloadIcon />
                                  Download
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    window.open(document.url ?? '', '_blank', 'noopener,noreferrer')
                                  }
                                >
                                  <ExternalLinkIcon />
                                  Open link
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                disabled={document.status === 'processing'}
                                onClick={() => void handleReprocess(document)}
                              >
                                <RefreshCwIcon />
                                {document.status === 'failed'
                                  ? 'Retry'
                                  : document.sourceType === 'url'
                                    ? 'Fetch again'
                                    : 'Index again'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setPendingDelete(document)}
                              >
                                <Trash2Icon />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialog ? (
        <KnowledgeDocumentDialog
          key={`${dialog.kind}-${dialog.document?.id ?? 'new'}`}
          open
          kind={dialog.kind}
          document={dialog.document}
          saving={saving}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI Coach stops answering from it straight away. The file and its index are removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  )
}
