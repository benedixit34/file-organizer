const TEXT: Record<string, string> = {
  ENOENT: 'It wasn’t found. It may have been moved or deleted.',
  EEXIST: 'A file with this name already exists there.',
  EBUSY: 'The file is in use by another program.',
  EPERM: 'Windows blocked access. The file may be in use or protected.',
  EACCES: 'You don’t have permission to access it.',
  EXDEV: 'The destination is on a different drive.',
}

export function friendly(e: unknown): string {
  const code = (e as NodeJS.ErrnoException | undefined)?.code
  return (code && TEXT[code]) || (e instanceof Error ? e.message : String(e))
}
