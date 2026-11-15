import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Every source file under the given folders, for tests that check a rule across the codebase.
export function sourceFiles(dirs: string[], pattern = /\.tsx?$/): string[] {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : pattern.test(name) ? [path] : []
  })
  return dirs.flatMap(walk)
}
