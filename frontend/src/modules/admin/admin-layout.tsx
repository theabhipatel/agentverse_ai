import type { ReactNode } from 'react'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AdminSidebar } from './admin-sidebar'

/** Admin shell: its own sidebar, mirroring the chat layout so the app feels like one product. */
export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar />
      <SidebarInset>
        <div className="flex h-svh flex-col">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <SidebarTrigger />
            <h1 className="truncate text-sm font-medium">{title}</h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Every admin page's content sits at this one width, changed here rather than per page. */}
            <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
