import { create } from 'zustand'
import { api } from '@/lib/api'
import type {
  AddKnowledgeUrlInput,
  ApiSuccessResponse,
  KnowledgeDocument,
  KnowledgeDocumentListPayload,
  KnowledgeDocumentPayload,
  UpdateKnowledgeDocumentInput,
} from '@/types/api'

interface KnowledgeState {
  documents: KnowledgeDocument[]
  loading: boolean
  loaded: boolean
  saving: boolean
  fetchDocuments: () => Promise<void>
  uploadFile: (file: File, title?: string) => Promise<void>
  uploadVideo: (file: File, title?: string) => Promise<void>
  addUrl: (input: AddKnowledgeUrlInput) => Promise<void>
  updateDocument: (documentId: string, input: UpdateKnowledgeDocumentInput) => Promise<void>
  replaceFile: (documentId: string, file: File) => Promise<void>
  reprocess: (documentId: string) => Promise<void>
  deleteDocument: (documentId: string) => Promise<void>
  download: (document: KnowledgeDocument) => Promise<void>
  reset: () => void
}

function withReplaced(documents: KnowledgeDocument[], next: KnowledgeDocument): KnowledgeDocument[] {
  return documents.map((document) => (document.id === next.id ? next : document))
}

/**
 * The shared instance defaults to JSON, and axios turns a FormData body into JSON
 * under that header. Saying multipart keeps it a real upload; the browser then
 * replaces the header with one that carries the boundary.
 */
const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } }

function fileForm(file: File, title?: string): FormData {
  const form = new FormData()
  form.append('file', file)
  if (title) {
    form.append('title', title)
  }
  return form
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  documents: [],
  loading: false,
  loaded: false,
  saving: false,

  fetchDocuments: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get<ApiSuccessResponse<KnowledgeDocumentListPayload>>('/admin/knowledge')
      set({ documents: data.data.documents, loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  uploadFile: async (file, title) => {
    set({ saving: true })
    try {
      const { data } = await api.post<ApiSuccessResponse<KnowledgeDocumentPayload>>(
        '/admin/knowledge/files',
        fileForm(file, title),
        MULTIPART,
      )
      set((state) => ({ documents: [data.data.document, ...state.documents] }))
    } finally {
      set({ saving: false })
    }
  },

  uploadVideo: async (file, title) => {
    set({ saving: true })
    try {
      const { data } = await api.post<ApiSuccessResponse<KnowledgeDocumentPayload>>(
        '/admin/knowledge/videos',
        fileForm(file, title),
        MULTIPART,
      )
      set((state) => ({ documents: [data.data.document, ...state.documents] }))
    } finally {
      set({ saving: false })
    }
  },

  addUrl: async (input) => {
    set({ saving: true })
    try {
      const { data } = await api.post<ApiSuccessResponse<KnowledgeDocumentPayload>>(
        '/admin/knowledge/urls',
        input,
      )
      set((state) => ({ documents: [data.data.document, ...state.documents] }))
    } finally {
      set({ saving: false })
    }
  },

  updateDocument: async (documentId, input) => {
    set({ saving: true })
    try {
      const { data } = await api.patch<ApiSuccessResponse<KnowledgeDocumentPayload>>(
        `/admin/knowledge/${documentId}`,
        input,
      )
      set((state) => ({ documents: withReplaced(state.documents, data.data.document) }))
    } finally {
      set({ saving: false })
    }
  },

  replaceFile: async (documentId, file) => {
    set({ saving: true })
    try {
      const { data } = await api.put<ApiSuccessResponse<KnowledgeDocumentPayload>>(
        `/admin/knowledge/${documentId}/file`,
        fileForm(file),
        MULTIPART,
      )
      set((state) => ({ documents: withReplaced(state.documents, data.data.document) }))
    } finally {
      set({ saving: false })
    }
  },

  reprocess: async (documentId) => {
    const { data } = await api.post<ApiSuccessResponse<KnowledgeDocumentPayload>>(
      `/admin/knowledge/${documentId}/reprocess`,
    )
    set((state) => ({ documents: withReplaced(state.documents, data.data.document) }))
  },

  deleteDocument: async (documentId) => {
    await api.delete(`/admin/knowledge/${documentId}`)
    set((state) => ({ documents: state.documents.filter((document) => document.id !== documentId) }))
  },

  /** Fetched with the access token, then handed to the browser as a normal download. */
  download: async (document) => {
    const { data } = await api.get<Blob>(`/admin/knowledge/${document.id}/download`, { responseType: 'blob' })
    const href = URL.createObjectURL(data)
    const link = window.document.createElement('a')
    link.href = href
    link.download = document.fileName ?? document.title
    link.click()
    URL.revokeObjectURL(href)
  },

  reset: () => {
    set({ documents: [], loaded: false })
  },
}))
